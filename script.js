// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getDatabase, ref, set, get, update } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";

// Turn this on only during local testing (kept false for safety)
const DEV_MODE = false;

// ---------- crypto helpers ----------
function generateSalt(len = 16) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hashWithSalt(secret, salt) {
  return sha256Hex(`${salt}|${secret}`);
}

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM
const setupSection = document.getElementById('setupSection');
const gameSection = document.getElementById('gameSection');
const playerInputs = document.getElementById('playerInputs');
const savePlayersBtn = document.getElementById('savePlayers');
const loserColorSelect = document.getElementById('loserColor');
const addLossBtn = document.getElementById('addLoss');
const openResetBtn = document.getElementById('openReset');
const resetScoresBtn = document.getElementById('resetScores');
const scoreboardBody = document.querySelector('#scoreboard tbody');

// Admin setup inputs (first time only)
const adminSetupNote = document.getElementById('adminSetupNote');
const adminPw1Setup = document.getElementById('adminPw1');
const adminPw2Setup = document.getElementById('adminPw2');

// Modals: user pw for adding loss
const pwModal = document.getElementById('pwModal');
const pwModalTitle = document.getElementById('pwModalTitle');
const pwModalDesc = document.getElementById('pwModalDesc');
const pwInput = document.getElementById('pwInput');
const pwCancel = document.getElementById('pwCancel');
const pwSubmit = document.getElementById('pwSubmit');

// Admin auth modal (generic)
const adminAuthModal = document.getElementById('adminAuthModal');
const adminAuthDesc = document.getElementById('adminAuthDesc');
const adminAuthPw = document.getElementById('adminAuthPw');
const adminAuthCancel = document.getElementById('adminAuthCancel');
const adminAuthSubmit = document.getElementById('adminAuthSubmit');

// Reset password (admin protected)
const resetModal = document.getElementById('resetModal');
const resetPlayerSel = document.getElementById('resetPlayer');
const adminPwForReset = document.getElementById('adminPwForReset');
const newPw1 = document.getElementById('newPw1');
const newPw2 = document.getElementById('newPw2');
const resetCancel = document.getElementById('resetCancel');
const resetSubmitAdmin = document.getElementById('resetSubmitAdmin');

let players = [];
let adminCreds = null; // {salt, hash}

// ---------- utility ----------
function now() { return Date.now(); }

// ------------------- UI helpers -------------------
function showSetup() {
  setupSection.classList.remove('hidden');
  gameSection.classList.add('hidden');
  playerInputs.innerHTML = '';

  const colors = ["red", "blue", "green", "yellow", "orange"];
  const existingByColor = new Map(players.map(p => [p.color, p]));

  for (let i = 0; i < 5; i++) {
    const existing = players[i] || existingByColor.get(colors[i]) || null;

    const nameVal  = existing?.name  ?? "";
    const teamVal  = existing?.team  ?? "";
    const colorVal = existing?.color ?? "";
    const hasPass  = !!(existing?.passHash && existing?.passSalt);

    playerInputs.innerHTML += `
      <div>
        <input type="text" id="name${i}" placeholder="Player ${i + 1} Name" value="${nameVal}" required>
        <input type="text" id="team${i}" placeholder="Team Name (optional)" value="${teamVal}">
        <select id="color${i}">
          <option value="">Select Color</option>
          <option value="red" ${colorVal==="red"?"selected":""}>Red</option>
          <option value="blue" ${colorVal==="blue"?"selected":""}>Blue</option>
          <option value="green" ${colorVal==="green"?"selected":""}>Green</option>
          <option value="yellow" ${colorVal==="yellow"?"selected":""}>Yellow</option>
          <option value="orange" ${colorVal==="orange"?"selected":""}>Orange</option>
        </select>
        <input type="password" id="pass${i}" placeholder="${hasPass ? "Leave blank to keep password" : "Set password (required first time)"}">
      </div>`;
  }

  // Toggle admin setup box visibility
  adminSetupNote.classList.toggle('hidden', !!adminCreds);
}

function updateUI() {
  if (!players || !players.length) { showSetup(); return; }
  setupSection.classList.add('hidden');
  gameSection.classList.remove('hidden');

  loserColorSelect.innerHTML = players.map(
    p => `<option value="${p.color}">${p.name} (${p.color})</option>`
  ).join('');

  resetPlayerSel.innerHTML = players.map(
    (p, idx) => `<option value="${idx}">${p.name} (${p.color})</option>`
  ).join('');

  renderTable();
}

function renderTable() {
  scoreboardBody.innerHTML = players.map(p => `
    <tr>
      <td>${p.name}${p.team ? `<br><small>(${p.team})</small>` : ''}</td>
      <td style="color:${p.color}">${p.color}</td>
      <td>${p.losses ?? 0}</td>
      <td>${Array.isArray(p.dates) && p.dates.length ? p.dates.join(', ') : '-'}</td>
    </tr>`).join('');
}

// ------------------- DB fetch -------------------
async function fetchAdminCreds() {
  try {
    const snap = await get(ref(db, "admin"));
    if (snap.exists()) {
      const val = snap.val();
      if (val?.salt && val?.hash) adminCreds = { salt: val.salt, hash: val.hash };
      else adminCreds = null;
    } else {
      adminCreds = null;
    }
  } catch (e) {
    console.error("Failed to fetch admin creds", e);
    adminCreds = null;
  }
}

async function fetchPlayers() {
  try {
    const snapshot = await get(ref(db, "ludoPlayers"));
    if (snapshot.exists()) {
      const data = snapshot.val();
      players = Array.isArray(data) ? data : Object.values(data);

      const needsPasswords = players.some(p => !p.passHash || !p.passSalt);
      if (needsPasswords) {
        showSetup();
      } else {
        updateUI();
      }
    } else {
      showSetup();
    }
  } catch (err) {
    console.error("Error fetching data:", err);
    showSetup();
  }
}

// ------------------- Save players (+ first-time admin set) -------------------
async function savePlayers() {
  // Build next players
  const snapshot = await get(ref(db, "ludoPlayers")).catch(() => null);
  const existing = snapshot?.exists() ? (Array.isArray(snapshot.val()) ? snapshot.val() : Object.values(snapshot.val())) : [];
  const existingByColor = new Map(existing.map(p => [p.color, p]));

  const nextPlayers = [];
  for (let i = 0; i < 5; i++) {
    const name = document.getElementById(`name${i}`).value.trim();
    const team = document.getElementById(`team${i}`).value.trim();
    const color = document.getElementById(`color${i}`).value;
    const passInput = document.getElementById(`pass${i}`).value;

    if (!name || !color) {
      alert("Please fill all names and colors!");
      return;
    }

    const prev = existingByColor.get(color);
    let passSalt = prev?.passSalt || null;
    let passHash = prev?.passHash || null;

    if (!passHash || !passSalt) {
      if (!passInput) {
        alert(`Please set a password for ${name} (${color}).`);
        return;
      }
      passSalt = generateSalt();
      passHash = await hashWithSalt(passInput, passSalt);
    } else if (passInput) {
      passSalt = generateSalt();
      passHash = await hashWithSalt(passInput, passSalt);
    }

    nextPlayers.push({
      name, team, color,
      losses: prev?.losses ?? 0,
      dates: Array.isArray(prev?.dates) ? prev.dates : [],
      passSalt, passHash
    });
  }

  // First-time admin setup
  await fetchAdminCreds();
  if (!adminCreds) {
    const a1 = (adminPw1Setup.value || "").trim();
    const a2 = (adminPw2Setup.value || "").trim();
    if (!a1 || !a2) {
      alert("Please set the Admin password (first time only).");
      return;
    }
    if (a1 !== a2) {
      alert("Admin passwords do not match.");
      return;
    }
    const salt = generateSalt();
    const hash = await hashWithSalt(a1, salt);
    await set(ref(db, "admin"), { salt, hash });
    adminCreds = { salt, hash };
  }

  await set(ref(db, "ludoPlayers"), nextPlayers);
  players = nextPlayers;
  updateUI();
}

// ------------------- Password Modal for Add Loss (per-player) -------------------
let pwResolve = null;
function openPwModal(title, desc) {
  pwModalTitle.textContent = title || "Enter Password";
  pwModalDesc.textContent = desc || "";
  pwInput.value = "";
  pwModal.classList.remove('hidden');
  setTimeout(() => pwInput.focus(), 0);

  return new Promise(resolve => { pwResolve = resolve; });
}
function closePwModal() {
  pwModal.classList.add('hidden');
  if (pwResolve) { pwResolve(null); pwResolve = null; }
}
pwCancel.addEventListener('click', closePwModal);
pwSubmit.addEventListener('click', () => {
  if (pwResolve) { pwResolve(pwInput.value); pwResolve = null; }
  pwModal.classList.add('hidden');
});
pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') pwSubmit.click(); });

// ------------------- Admin Auth Modal (generic use) -------------------
let adminAuthResolver = null;
function openAdminAuth(desc = "Enter admin password to continue.") {
  adminAuthDesc.textContent = desc;
  adminAuthPw.value = "";
  adminAuthModal.classList.remove('hidden');
  setTimeout(() => adminAuthPw.focus(), 0);
  return new Promise(resolve => { adminAuthResolver = resolve; });
}
function closeAdminAuth() {
  adminAuthModal.classList.add('hidden');
  if (adminAuthResolver) { adminAuthResolver(null); adminAuthResolver = null; }
}
adminAuthCancel.addEventListener('click', closeAdminAuth);

// *** MODIFIED: if admin not set, jump to setup instead of just alerting
adminAuthSubmit.addEventListener('click', async () => {
  if (!adminCreds) {
    closeAdminAuth();
    await fetchPlayers(); // ensure players loaded so setup renders properly
    showSetup();
    window.scrollTo({ top: 0, behavior: "smooth" });
    alert("Admin password not set. Please set it in the yellow box on the Monthly Setup screen, then click Save Players.");
    return;
  }
  const input = adminAuthPw.value || "";
  const hash = await hashWithSalt(input, adminCreds.salt);
  const ok = hash === adminCreds.hash;
  const resolver = adminAuthResolver;
  adminAuthResolver = null;
  adminAuthModal.classList.add('hidden');
  resolver && resolver(ok);
});
adminAuthPw.addEventListener('keydown', (e) => { if (e.key === 'Enter') adminAuthSubmit.click(); });

// ------------------- ADD LOSS (password-protected by player password) -------------------
async function addLoss() {
  const color = loserColorSelect.value;
  const player = players.find(p => p.color === color);
  if (!player) return alert("Select a player!");

  const inputPw = await openPwModal(
    `Password for ${player.name}`,
    `Enter password to record a loss for ${player.name} (${player.color}).`
  );
  if (inputPw === null) return; // canceled

  try {
    const hash = await hashWithSalt(inputPw, player.passSalt);
    if (hash !== player.passHash) {
      alert("Incorrect password. Loss not recorded.");
      return;
    }
  } catch {
    alert("Could not verify password. Try again.");
    return;
  }

  player.losses = (player.losses || 0) + 1;
  if (!Array.isArray(player.dates)) player.dates = [];
  player.dates.push(new Date().toLocaleDateString());

  await set(ref(db, "ludoPlayers"), players);
  renderTable();
  updateLeaderboard();
}

// ------------------- Reset Player Password (Admin-protected) -------------------
function openResetModal() {
  resetPlayerSel.value = "0";
  adminPwForReset.value = "";
  newPw1.value = "";
  newPw2.value = "";
  resetModal.classList.remove('hidden');
}
function closeResetModal() {
  resetModal.classList.add('hidden');
}
resetCancel.addEventListener('click', closeResetModal);

// *** MODIFIED: if admin not set, jump to setup here as well
resetSubmitAdmin.addEventListener('click', async () => {
  const idx = Number(resetPlayerSel.value || 0);
  const p = players[idx];
  if (!p) return;

  if (!adminCreds) {
    closeResetModal();
    await fetchPlayers();
    showSetup();
    window.scrollTo({ top: 0, behavior: "smooth" });
    alert("Admin password not set. Please set it in the yellow box on the Monthly Setup screen, then click Save Players.");
    return;
  }

  const inputAdmin = (adminPwForReset.value || "").trim();
  if (!inputAdmin) { alert("Enter the admin password."); return; }
  const adminHash = await hashWithSalt(inputAdmin, adminCreds.salt);
  if (adminHash !== adminCreds.hash) { alert("Admin password incorrect."); return; }

  if (!newPw1.value || !newPw2.value) return alert("Enter new password twice.");
  if (newPw1.value !== newPw2.value) return alert("New passwords do not match.");

  const newSalt = generateSalt();
  const newHash = await hashWithSalt(newPw1.value, newSalt);
  players[idx].passSalt = newSalt;
  players[idx].passHash = newHash;

  await set(ref(db, "ludoPlayers"), players);
  alert(`Password updated for ${p.name}.`);
  closeResetModal();
});

// ------------------- Reset Scores (Admin-protected) -------------------
async function resetScoresFlow() {
  if (!players.length) return alert("No players to reset.");
  const ok = await openAdminAuth("Enter admin password to reset ALL players' scores. This cannot be undone.");
  if (!ok) { alert("Admin authentication failed."); return; }

  if (!confirm("Are you sure you want to reset ALL scores and dates?")) return;

  players = players.map(p => ({ ...p, losses: 0, dates: [] }));
  await set(ref(db, "ludoPlayers"), players);
  renderTable();
  alert("All scores have been reset.");
}

// ------------------- Leaderboard (unchanged) -------------------
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
    leaderboardText += `${i + 1}. ${p.name} (${p.color}) - Losses: ${p.losses}\n`;
  });

  alert(leaderboardText);
}
leaderboardBtn.addEventListener('click', updateLeaderboard);

// ------------------- INIT -------------------
document.addEventListener("DOMContentLoaded", async () => {
  savePlayersBtn.addEventListener('click', savePlayers);
  addLossBtn.addEventListener('click', addLoss);
  openResetBtn.addEventListener('click', openResetModal);
  resetScoresBtn.addEventListener('click', resetScoresFlow);

  await fetchAdminCreds();
  await fetchPlayers();
});
