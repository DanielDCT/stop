// Importaciones necesarias (deben estar al inicio del archivo)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, push, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// Configuración de Firebase (usando tus datos)
const firebaseConfig = {
  apiKey: "AIzaSyA2KtBUox9IiB1_jw84D6k2T3tT7Uw_7W4",
  authDomain: "stop-2aeb8.firebaseapp.com",
  databaseURL: "https://stop-2aeb8-default-rtdb.firebaseio.com",
  projectId: "stop-2aeb8",
  storageBucket: "stop-2aeb8.firebasestorage.app",
  messagingSenderId: "642332040800",
  appId: "1:642332040800:web:21ee61ebd4844ac2ba2d05",
  measurementId: "G-ZE366Z7K94"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Variables globales
window.joinRoom = joinRoom;
window.submitAnswers = submitAnswers;
window.startNewRound = startNewRound;
let playerName = "";
let roomId = "";
let currentLetter = "";
let isHost = false;
const categories = ["Nombre", "Animal", "Color", "Ciudad", "Fruta"];

// Referencias a elementos del DOM
const loginScreen = document.getElementById("login-screen");
const gameScreen = document.getElementById("game-screen");
const playerNameInput = document.getElementById("player-name");
const roomIdInput = document.getElementById("room-id");
const currentRoomSpan = document.getElementById("current-room");
const playersListSpan = document.getElementById("players-list");
const currentLetterSpan = document.getElementById("current-letter");
const categoriesBody = document.getElementById("categories-body");
const stopButton = document.getElementById("stop-button");
const resultsDiv = document.getElementById("results");
const startGameBtn = document.getElementById("start-game-btn");
const nextRoundBtn = document.getElementById("next-round-btn");

// Función para unirse/crear sala
async function joinRoom() {
  playerName = playerNameInput.value.trim();
  roomId = roomIdInput.value.trim();

  if (!playerName) {
    alert("¡Ingresa tu nombre!");
    return;
  }

  if (!roomId) {
    roomId = "room-" + Math.random().toString(36).substring(2, 8);
    isHost = true;
  }

  try {
    const playerData = {
      name: playerName,
      ready: false,
      answers: {},
      score: 0,
      isHost: isHost,
      joinedAt: serverTimestamp()
    };

    const updates = {};
    updates[`rooms/${roomId}/players/${playerName}`] = playerData;
    
    if (isHost) {
      updates[`rooms/${roomId}/metadata`] = {
        createdAt: serverTimestamp(),
        currentLetter: "?",
        gameState: "waiting"
      };
    }

    await update(ref(db), updates);
    
    showGameScreen();
    setupRoomListeners();
    
    if (isHost) {
      startGameBtn.style.display = "block";
    }
  } catch (error) {
    console.error("Error al unirse a la sala:", error);
    alert("Error al unirse a la sala. Intenta nuevamente.");
  }
}

// Configurar listeners en tiempo real
function setupRoomListeners() {
  const playersRef = ref(db, `rooms/${roomId}/players`);
  const metadataRef = ref(db, `rooms/${roomId}/metadata`);

  // Escuchar cambios en jugadores
  onValue(playersRef, (snapshot) => {
    const players = snapshot.val() || {};
    playersListSpan.textContent = Object.keys(players).join(", ");
  });

  // Escuchar cambios en metadatos
  onValue(metadataRef, (snapshot) => {
    const metadata = snapshot.val() || {};
    currentLetter = metadata.currentLetter || "?";
    currentLetterSpan.textContent = currentLetter;

    if (metadata.gameState === "playing" && currentLetter !== "?") {
      fillCategoriesTable();
      stopButton.disabled = false;
    } else if (metadata.gameState === "scoring") {
      showResults();
    }
  });
}

// Llenar tabla de categorías
function fillCategoriesTable() {
  categoriesBody.innerHTML = "";

  categories.forEach(category => {
    const row = document.createElement("tr");
    const cellCategory = document.createElement("td");
    const cellInput = document.createElement("td");

    cellCategory.textContent = category;
    cellInput.innerHTML = `<input type="text" id="${category.toLowerCase()}" 
                           placeholder="${currentLetter}..." 
                           oninput="validateInput(this, '${currentLetter}')">`;

    row.appendChild(cellCategory);
    row.appendChild(cellInput);
    categoriesBody.appendChild(row);
  });
}

// Validar respuesta
function validateInput(input, letter) {
  const value = input.value.trim();
  if (value && !value.toLowerCase().startsWith(letter.toLowerCase())) {
    input.style.border = "2px solid red";
    return false;
  } else {
    input.style.border = "";
    return true;
  }
}

// Enviar respuestas
async function submitAnswers() {
  const answers = {};
  let allValid = true;

  categories.forEach(category => {
    const input = document.getElementById(category.toLowerCase());
    const answer = input.value.trim();
    
    if (!validateInput(input, currentLetter)) {
      allValid = false;
    } else {
      answers[category] = answer;
    }
  });

  if (!allValid) {
    alert(`¡Todas las respuestas deben comenzar con "${currentLetter}"!`);
    return;
  }

  try {
    await update(ref(db, `rooms/${roomId}/players/${playerName}`), {
      answers: answers,
      ready: true
    });
    
    stopButton.disabled = true;
    checkAllPlayersReady();
  } catch (error) {
    console.error("Error al enviar respuestas:", error);
  }
}

// Verificar si todos están listos
async function checkAllPlayersReady() {
  const snapshot = await get(ref(db, `rooms/${roomId}/players`));
  const players = snapshot.val() || {};
  const allReady = Object.values(players).every(player => player.ready);
  
  if (allReady) {
    calculateScores();
  }
}

// Calcular puntajes
async function calculateScores() {
  const roomSnapshot = await get(ref(db, `rooms/${roomId}`));
  const roomData = roomSnapshot.val();
  const players = roomData.players;
  const allAnswers = {};
  const updates = {};

  // Recopilar respuestas
  Object.keys(players).forEach(name => {
    if (players[name].ready) {
      allAnswers[name] = players[name].answers;
    }
  });

  // Calcular puntajes
  Object.keys(allAnswers).forEach(playerName => {
    let roundScore = 0;
    
    categories.forEach(category => {
      const answer = allAnswers[playerName][category];
      if (isUniqueAnswer(answer, category, allAnswers)) {
        roundScore += 10;
      } else if (answer) {
        roundScore += 5;
      }
    });

    updates[`rooms/${roomId}/players/${playerName}/score`] = 
      (players[playerName].score || 0) + roundScore;
    updates[`rooms/${roomId}/players/${playerName}/roundScore`] = roundScore;
  });

  updates[`rooms/${roomId}/metadata/gameState`] = "scoring";
  
  await update(ref(db), updates);
}

function isUniqueAnswer(answer, category, allAnswers) {
  if (!answer) return false;
  
  let count = 0;
  Object.keys(allAnswers).forEach(player => {
    if (allAnswers[player][category]?.toLowerCase() === answer.toLowerCase()) {
      count++;
    }
  });
  
  return count === 1;
}

// Mostrar resultados
async function showResults() {
  const snapshot = await get(ref(db, `rooms/${roomId}/players`));
  const players = snapshot.val() || {};
  let resultsHTML = "<h3>Resultados:</h3><ul>";
  
  // Ordenar jugadores por puntaje
  const sortedPlayers = Object.keys(players).sort((a, b) => {
    return (players[b].score || 0) - (players[a].score || 0);
  });

  sortedPlayers.forEach(name => {
    resultsHTML += `
      <li>
        <strong>${name}</strong>: 
        ${players[name].roundScore || 0} puntos (Total: ${players[name].score || 0})
      </li>`;
  });

  resultsHTML += "</ul>";
  resultsDiv.innerHTML = resultsHTML;

  if (isHost) {
    nextRoundBtn.style.display = "block";
  }
}

// Iniciar nueva ronda (solo host)
async function startNewRound() {
  const newLetter = getRandomLetter();
  const updates = {
    [`rooms/${roomId}/metadata/currentLetter`]: newLetter,
    [`rooms/${roomId}/metadata/gameState`]: "playing"
  };

  const snapshot = await get(ref(db, `rooms/${roomId}/players`));
  const players = snapshot.val() || {};
  
  Object.keys(players).forEach(name => {
    updates[`rooms/${roomId}/players/${name}/ready`] = false;
    updates[`rooms/${roomId}/players/${name}/answers`] = {};
    updates[`rooms/${roomId}/players/${name}/roundScore`] = 0;
  });

  await update(ref(db), updates);
  
  resultsDiv.innerHTML = "";
  nextRoundBtn.style.display = "none";
}

function getRandomLetter() {
  const allowedLetters = 'ABCDEFGHIJKLMNOPQRSTUVYZ';
  return allowedLetters.charAt(Math.floor(Math.random() * allowedLetters.length));
}

// Mostrar pantalla de juego
function showGameScreen() {
  loginScreen.style.display = "none";
  gameScreen.style.display = "block";
  currentRoomSpan.textContent = roomId;
}

// Event listeners
document.getElementById("join-btn").addEventListener("click", joinRoom);
stopButton.addEventListener("click", submitAnswers);
startGameBtn.addEventListener("click", startNewRound);
nextRoundBtn.addEventListener("click", startNewRound);

document.getElementById("join-btn").addEventListener("click", () => {
  console.log("Botón clickeado");
  joinRoom();
});
