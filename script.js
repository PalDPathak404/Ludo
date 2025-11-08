// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCcxXIY0qcWE8mRwZm9G6wUtDfULgpVa94",
  authDomain: "ludo-tracker-911.firebaseapp.com",
  databaseURL: "https://ludo-tracker-911-default-rtdb.firebaseio.com",
  projectId: "ludo-tracker-911",
  storageBucket: "ludo-tracker-911.firebasestorage.app",
  messagingSenderId: "805075380365",
  appId: "1:805075380365:web:f0d02ab342c11804c75ac4",
  measurementId: "G-48QVQ89260"
};

// Initialize Firebase and Database
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM elements
const setupSection = document.getElementById('setupSection');
const gameSection = document.getElementById('gameSection');
const playerInputs = document.getElementById('playerInputs');
const savePlayersBtn = document.getElementById('savePlayers');
const loserColorSelect = document.getElementById('loserColor');
const addLossBtn = document.getElementById('addLoss');
const scoreboardBody = document.querySelector('#scoreboard tbody');

let players = [];

// ------------------- SETUP -------------------
function showSetup() {
  setupSection.classList.remove('hidden');
  gameSection.classList.add('hidden');
  playerInputs.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    playerInputs.innerHTML += `
      <div>
        <input type="text" id="name${i}" placeholder="Player ${i + 1} Name" required>
        <input type="text" id="team${i}" placeholder="Team Name (optional)">
        <select id="color${i}">
          <option value="">Select Color</option>
          <option value="red">Red</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
          <option value="yellow">Yellow</option>
          <option value="orange">Orange</option>
        </select>
      </div>`;
  }
}

async function savePlayers() {
  players = [];
  for (let i = 0; i < 5; i++) {
    const name = document.getElementById(`name${i}`).value.trim();
    const team = document.getElementById(`team${i}`).value.trim();
    const color = document.getElementById(`color${i}`).value;

    if (!name || !color) {
      alert("Please fill all names and colors!");
      return;
    }

    players.push({ name, team, color, losses: 0, dates: [] });
  }

  await set(ref(db, "ludoPlayers"), players);
  updateUI();
}

// ------------------- FETCH PLAYERS -------------------
async function fetchPlayers() {
  try {
    const snapshot = await get(ref(db, "ludoPlayers"));
    if (snapshot.exists()) {
      const data = snapshot.val();
      // Convert object to array if needed
      players = Array.isArray(data) ? data : Object.values(data);
      updateUI();
    } else {
      showSetup();
    }
  } catch (err) {
    console.error("Error fetching data:", err);
    showSetup();
  }
}

// ------------------- UPDATE UI -------------------
function updateUI() {
  if (!players || !players.length) {
    showSetup();
    return;
  }

  setupSection.classList.add('hidden');
  gameSection.classList.remove('hidden');

  // Populate loser dropdown
  loserColorSelect.innerHTML = players.map(
    p => `<option value="${p.color}">${p.name} (${p.color})</option>`
  ).join('');

  renderTable();
}

// ------------------- RENDER TABLE -------------------
function renderTable() {
  scoreboardBody.innerHTML = players.map(p => `
    <tr>
      <td>${p.name}${p.team ? `<br><small>(${p.team})</small>` : ''}</td>
      <td style="color:${p.color}">${p.color}</td>
      <td>${p.losses}</td>
      <td>${p.dates.join(', ') || '-'}</td>
    </tr>`).join('');
}

// ------------------- ADD LOSS -------------------
async function addLoss() {
  const color = loserColorSelect.value;
  const player = players.find(p => p.color === color);
  if (!player) return alert("Select a player!");

  player.losses++;
  player.dates.push(new Date().toLocaleDateString());

  await set(ref(db, "ludoPlayers"), players);
  renderTable();

  // Update leaderboard automatically
  updateLeaderboard();
}

// ------------------- LEADERBOARD -------------------
let leaderboardBtn = document.createElement('button');
leaderboardBtn.textContent = "Monthly Leaderboard";
leaderboardBtn.style.marginTop = "10px";
leaderboardBtn.style.backgroundColor = "#28a745";
leaderboardBtn.style.color = "white";
leaderboardBtn.style.border = "none";
leaderboardBtn.style.padding = "8px 15px";
leaderboardBtn.style.borderRadius = "8px";
leaderboardBtn.style.cursor = "pointer";
gameSection.appendChild(leaderboardBtn);

function updateLeaderboard() {
  if (!players.length) return alert("No players yet!");
  const sorted = [...players].sort((a, b) => b.losses - a.losses);

  let leaderboardText = "🏆 Monthly Leaderboard:\n\n";
  sorted.forEach((p, i) => {
    leaderboardText += `${i+1}. ${p.name} (${p.color}) - Losses: ${p.losses}\n`;
  });

  alert(leaderboardText);
}

leaderboardBtn.addEventListener('click', updateLeaderboard);

// ------------------- INIT -------------------
document.addEventListener("DOMContentLoaded", async () => {
  savePlayersBtn.addEventListener('click', savePlayers);
  addLossBtn.addEventListener('click', addLoss);

  await fetchPlayers();
});
