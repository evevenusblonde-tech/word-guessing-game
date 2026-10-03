import { bestWords, isWord, loadDictionary, possibleWords } from "./dictionary.js";
import { GuestLink, HostRoom, cleanCode, savedHosting } from "./net.js";
import {
  LANGUAGE_NAMES, MAX_PLAYERS, canBuild, clampLetterCount, cleanName, cleanWord,
  countLetters, rarity, scoreRun, scoreWord, shuffle
} from "./rules.js";

const $ = (selector) => document.querySelector(selector);

const ui = {
  banner: $("#connectionBanner"),
  screens: { home: $("#homeScreen"), lobby: $("#lobbyScreen"), play: $("#playScreen"), results: $("#resultsScreen") },
  // Home
  inviteNotice: $("#inviteNotice"),
  inviteCode: $("#inviteCode"),
  nameInput: $("#nameInput"),
  settingsBlock: $("#settingsBlock"),
  setupCard: $(".setup-card"),
  homeActions: $(".home-actions"),
  lettersValue: $("#lettersValue"),
  homeMessage: $("#homeMessage"),
  codeInput: $("#codeInput"),
  leaderboardList: $("#leaderboardList"),
  leaderboardEmpty: $("#leaderboardEmpty"),
  leaderboardScope: $("#leaderboardScope"),
  // Lobby
  roomCode: $("#roomCode"),
  inviteTools: $("#inviteTools"),
  inviteLink: $("#inviteLink"),
  lobbyMessage: $("#lobbyMessage"),
  lobbyPlayers: $("#lobbyPlayers"),
  playerCount: $("#playerCount"),
  settingsOwner: $("#settingsOwner"),
  lobbySettingsSlot: $("#lobbySettingsSlot"),
  lobbySettingsSummary: $("#lobbySettingsSummary"),
  startButton: $("#startButton"),
  waitingForHost: $("#waitingForHost"),
  // Play
  timerValue: $("#timerValue"),
  scoreValue: $("#scoreValue"),
  wordCountValue: $("#wordCountValue"),
  languageValue: $("#languageValue"),
  guessForm: $("#guessForm"),
  guessInput: $("#guessInput"),
  guessButton: $("#guessButton"),
  playMessage: $("#playMessage"),
  letterTray: $("#letterTray"),
  liveBoardCard: $("#liveBoardCard"),
  liveBoard: $("#liveBoard"),
  foundList: $("#foundList"),
  foundEmpty: $("#foundEmpty"),
  foundHint: $("#foundHint"),
  // Results
  resultsTitle: $("#resultsTitle"),
  winnerLine: $("#winnerLine"),
  recordLine: $("#recordLine"),
  standings: $("#standings"),
  possibleCount: $("#possibleCount"),
  bestWordsLine: $("#bestWordsLine"),
  missedDetails: $("#missedDetails"),
  missedWords: $("#missedWords"),
  nextRoundButton: $("#nextRoundButton"),
  changeSettingsButton: $("#changeSettingsButton"),
  waitingNextRound: $("#waitingNextRound"),
  // Overlays
  countdownOverlay: $("#countdownOverlay"),
  countdownText: $("#countdownText"),
  countdownLetters: $("#countdownLetters"),
  rulesModal: $("#rulesModal")
};

const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be unavailable; the game works without it.
    }
  },
  session(key, value) {
    try {
      if (value === undefined) return JSON.parse(sessionStorage.getItem(key) || "null");
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore unavailable storage.
    }
    return null;
  }
};

const app = {
  session: null, // HostRoom or GuestLink
  state: null, // latest room snapshot
  settings: store.get("letterRunSettings", { language: "en", runLength: 60, letterCount: 9 }),
  boardDuration: 60,
  soundOn: store.get("letterRunSound", true),
  tiles: [], // { id, letter } in display order (shuffle only changes this)
  typed: "", // current word being built
  picked: [], // ids of the tiles used by `typed`, in order
  checking: false,
  savedRounds: new Set(),
  resultsRound: 0,
  tick: null,
  wakeLock: null,
  lastBeep: null
};

// Each browser tab is one player; the id survives reloads of that tab.
function getPlayerId() {
  let id = store.session("letterRunPlayerId");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).slice(0, 36);
    store.session("letterRunPlayerId", id);
  }
  return id;
}

// ---------- Sound ----------

let audioContext = null;
function playTones(notes) {
  if (!app.soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    for (const note of notes) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = note.type || "sine";
      osc.frequency.setValueAtTime(note.f, now + note.at);
      gain.gain.setValueAtTime(0.0001, now + note.at);
      gain.gain.exponentialRampToValueAtTime(note.v || 0.15, now + note.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.d);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now + note.at);
      osc.stop(now + note.at + note.d + 0.02);
    }
  } catch {
    // Sound is optional.
  }
}
const sounds = {
  good: () => playTones([{ f: 523.25, at: 0, d: 0.08 }, { f: 659.25, at: 0.08, d: 0.09 }, { f: 783.99, at: 0.17, d: 0.12 }]),
  bad: () => playTones([{ f: 155.56, at: 0, d: 0.16, v: 0.12, type: "sawtooth" }, { f: 116.54, at: 0.11, d: 0.18, v: 0.1, type: "sawtooth" }]),
  beep: () => playTones([{ f: 880, at: 0, d: 0.08, v: 0.1 }]),
  go: () => playTones([{ f: 660, at: 0, d: 0.1 }, { f: 990, at: 0.1, d: 0.18 }]),
  end: () => playTones([{ f: 392, at: 0, d: 0.15, type: "square", v: 0.1 }, { f: 262, at: 0.15, d: 0.3, type: "square", v: 0.1 }])
};

// ---------- Helpers ----------

function show(screen) {
  for (const [name, element] of Object.entries(ui.screens)) element.hidden = name !== screen;
  document.body.dataset.screen = screen;
}

function setMessage(element, text, tone = "") {
  element.textContent = text;
  element.className = `message ${tone}`.trim();
}

function setBanner(text) {
  ui.banner.hidden = !text;
  ui.banner.textContent = text || "";
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function inviteUrl(code) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  const peer = new URLSearchParams(location.search).get("peer");
  if (peer) url.searchParams.set("peer", peer);
  return url.toString();
}

function usesTouchEntry() {
  return window.matchMedia("(pointer: coarse)").matches;
}

async function keepScreenAwake(on) {
  try {
    if (on && !app.wakeLock && navigator.wakeLock) {
      app.wakeLock = await navigator.wakeLock.request("screen");
      app.wakeLock.addEventListener("release", () => { app.wakeLock = null; });
    } else if (!on && app.wakeLock) {
      await app.wakeLock.release();
      app.wakeLock = null;
    }
  } catch {
    // Not supported or not allowed; nothing to do.
  }
}

// ---------- Settings (home and lobby) ----------

function renderSettingsControls() {
  const { language, runLength, letterCount } = app.settings;
  document.querySelectorAll("input[name='language']").forEach((input) => { input.checked = input.value === language; });
  document.querySelectorAll("input[name='runLength']").forEach((input) => { input.checked = Number(input.value) === runLength; });
  ui.lettersValue.textContent = letterCount;
}

function changeSettings(patch) {
  app.settings = { ...app.settings, ...patch, letterCount: clampLetterCount(patch.letterCount ?? app.settings.letterCount) };
  store.set("letterRunSettings", app.settings);
  renderSettingsControls();
  loadDictionary(app.settings.language).catch(() => {});
  if (app.session?.isHost) app.session.updateSettings(app.settings);
  if (!app.session) {
    app.boardDuration = app.settings.runLength;
    renderLeaderboard();
  }
}

function settingsSummary(settings) {
  return `${LANGUAGE_NAMES[settings.language]} · ${settings.runLength / 60} min · ${settings.letterCount} letters`;
}

// ---------- Leaderboard (this device) ----------

function renderLeaderboard() {
  const entries = store.get("letterRunBoard", [])
    .filter((entry) => entry.seconds === app.boardDuration && entry.language === app.settings.language)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, 10);
  ui.leaderboardScope.textContent = `${LANGUAGE_NAMES[app.settings.language]}, ${app.boardDuration / 60} min`;
  document.querySelectorAll("[data-board]").forEach((button) => {
    const active = Number(button.dataset.board) === app.boardDuration;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  ui.leaderboardList.replaceChildren(...entries.map((entry, index) => {
    const row = el("li", "leaderboard-row");
    const who = el("div", "who");
    who.append(el("strong", "", entry.name), el("span", "", `${entry.words} words · ${entry.letters} letters${entry.mode === "room" ? " · room" : ""}`));
    row.append(el("span", "rank", index + 1), who, el("span", "points", entry.score));
    return row;
  }));
  ui.leaderboardEmpty.hidden = entries.length > 0;
}

function saveRun(result, state) {
  const key = `${state.code || "solo"}:${state.round}:${state.startAt}`;
  if (app.savedRounds.has(key)) return false;
  app.savedRounds.add(key);
  const board = store.get("letterRunBoard", []);
  const previousBest = Math.max(-1, ...board
    .filter((entry) => entry.seconds === state.settings.runLength && entry.language === state.settings.language)
    .map((entry) => entry.score));
  board.push({
    name: result.name,
    score: result.score,
    words: result.items.length,
    seconds: state.settings.runLength,
    letters: state.letters.length,
    language: state.settings.language,
    mode: state.online ? "room" : "solo",
    createdAt: Date.now()
  });
  // Keep the file small: best 10 per run length and language.
  const kept = [];
  for (const group of new Set(board.map((entry) => `${entry.seconds}:${entry.language}`))) {
    kept.push(...board.filter((entry) => `${entry.seconds}:${entry.language}` === group)
      .sort((a, b) => b.score - a.score).slice(0, 10));
  }
  store.set("letterRunBoard", kept);
  return result.score > previousBest && result.score > 0;
}

// ---------- Starting, joining, leaving ----------

function readName() {
  const name = cleanName(ui.nameInput.value);
  if (!name) {
    setMessage(ui.homeMessage, "Type your name first.", "bad");
    ui.nameInput.focus();
    return null;
  }
  store.set("letterRunName", name);
  return name;
}

function attach(session) {
  app.session = session;
  app.resultsRound = 0;
  // Ignore anything still arriving from a room this player already left.
  session.on("state", (state) => app.session === session && onState(state));
  session.on("status", (status) => app.session === session && onStatus(status));
}

async function playSolo() {
  const name = readName();
  if (!name) return;
  primeAudio();
  const room = new HostRoom({ name, playerId: getPlayerId(), settings: { ...app.settings }, online: false });
  attach(room);
  await room.startRound();
}

async function createRoom() {
  const name = readName();
  if (!name) return;
  primeAudio();
  setMessage(ui.homeMessage, "Opening a room…");
  const room = new HostRoom({ name, playerId: getPlayerId(), settings: { ...app.settings }, online: true });
  try {
    await room.open();
  } catch (error) {
    room.leave();
    setMessage(ui.homeMessage, error.message, "bad");
    return;
  }
  setMessage(ui.homeMessage, "");
  attach(room);
  history.replaceState(null, "", inviteUrl(room.code));
  room.broadcast();
}

async function joinRoom(codeValue = ui.codeInput.value) {
  const code = cleanCode(codeValue);
  const name = readName();
  if (!name) return;
  if (code.length !== 5) {
    setMessage(ui.homeMessage, "Room codes have 5 characters.", "bad");
    ui.codeInput.focus();
    return;
  }
  primeAudio();
  setMessage(ui.homeMessage, `Connecting to room ${code}…`);
  const link = new GuestLink({ code, name, playerId: getPlayerId() });
  attach(link);
  try {
    await link.open();
    store.session("letterRunJoined", { code, name });
    history.replaceState(null, "", inviteUrl(code));
    setMessage(ui.homeMessage, "");
  } catch (error) {
    link.leave();
    app.session = null;
    setMessage(ui.homeMessage, error.message, "bad");
  }
}

function leaveRoom() {
  app.session?.leave();
  app.session = null;
  app.state = null;
  store.session("letterRunJoined", null);
  clearInterval(app.tick);
  app.tick = null;
  keepScreenAwake(false);
  setBanner("");
  ui.countdownOverlay.hidden = true;
  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
  ui.inviteNotice.hidden = true;
  goHome();
}

function goHome() {
  ui.setupCard.insertBefore(ui.settingsBlock, ui.homeActions);
  renderSettingsControls();
  renderLeaderboard();
  show("home");
}

// ---------- Room state ----------

function localPhase(state) {
  if (state.phase === "countdown" || state.phase === "playing") {
    const now = app.session.now();
    if (now < state.startAt) return "countdown";
    if (now < state.endAt) return "playing";
    return "ending";
  }
  return state.phase;
}

function onStatus(status) {
  if (status.kind === "reconnecting") setBanner("Connection lost. Reconnecting…");
  else if (status.kind === "connected" || status.kind === "open") setBanner("");
  else if (status.kind === "problem") setBanner(status.message);
  else if (status.kind === "closed") {
    leaveRoom();
    setMessage(ui.homeMessage, status.message || "The room has closed.", "bad");
  }
}

function onState(state) {
  const previous = app.state;
  app.state = state;
  const newRound = !previous || previous.round !== state.round || previous.letters.join("") !== state.letters.join("");
  if (newRound && state.letters.length) {
    app.tiles = state.letters.map((letter, id) => ({ id, letter }));
    app.typed = "";
    app.picked = [];
    app.lastBeep = null;
  }
  if (state.settings && !app.session.isHost) app.settings = { ...state.settings };
  keepScreenAwake(state.online || state.phase !== "results");
  render();
  if (!app.tick) app.tick = setInterval(renderClock, 200);
}

function render() {
  const state = app.state;
  if (!state) return goHome();
  const phase = localPhase(state);
  if (phase === "lobby" || phase === "preparing") renderLobby(state, phase);
  else if (phase === "results") renderResults(state);
  else renderPlay(state);
}

function renderLobby(state, phase) {
  show("lobby");
  ui.countdownOverlay.hidden = true;
  const isHost = app.session.isHost;
  ui.roomCode.textContent = state.code || "-----";
  ui.inviteLink.value = state.code ? inviteUrl(state.code) : "";
  const connected = state.players.filter((player) => player.connected);
  ui.playerCount.textContent = `${connected.length}/${MAX_PLAYERS}`;
  ui.lobbyPlayers.replaceChildren(...state.players.map((player) => {
    const item = el("li", `player-chip${player.connected ? "" : " offline"}`);
    item.append(el("span", "avatar", player.name.slice(0, 1).toUpperCase()), el("span", "", player.name));
    if (player.isHost) item.append(el("em", "", "host"));
    if (player.id === app.session.playerId) item.append(el("em", "", "you"));
    if (!player.connected) item.append(el("em", "", "reconnecting"));
    return item;
  }));

  if (isHost) {
    if (ui.settingsBlock.parentElement !== ui.lobbySettingsSlot) ui.lobbySettingsSlot.append(ui.settingsBlock);
    renderSettingsControls();
  }
  ui.lobbySettingsSlot.hidden = !isHost;
  ui.lobbySettingsSummary.hidden = isHost;
  ui.lobbySettingsSummary.textContent = settingsSummary(state.settings);
  ui.settingsOwner.textContent = isHost ? "you choose" : "chosen by the host";

  ui.startButton.hidden = !isHost;
  ui.startButton.disabled = phase === "preparing";
  ui.startButton.textContent = phase === "preparing" ? "Dealing letters…" : connected.length > 1 ? `Start game (${connected.length} players)` : "Start game";
  ui.waitingForHost.hidden = isHost;
  if (isHost && connected.length < 2) {
    setMessage(ui.lobbyMessage, "Share the invite so others can join. You can also start on your own.");
  } else {
    setMessage(ui.lobbyMessage, isHost ? "Everyone's in? Tap Start game." : "You're in! The host will start the game.", "good");
  }
  // Load the word list now so the first guess is instant.
  loadDictionary(state.settings.language).catch(() => {});
}

function renderPlay(state) {
  show("play");
  ui.languageValue.textContent = LANGUAGE_NAMES[state.settings.language];
  ui.liveBoardCard.hidden = !state.online;
  ui.guessInput.readOnly = usesTouchEntry();
  ui.guessInput.placeholder = usesTouchEntry() ? "Tap the letters" : "Type a word";
  renderLiveBoard(state);
  renderFound(state);
  renderTiles();
  renderClock();
}

function renderLiveBoard(state) {
  const players = state.players
    .filter((player) => player.inRound)
    .sort((a, b) => b.score - a.score || b.wordCount - a.wordCount);
  ui.liveBoard.replaceChildren(...players.map((player, index) => {
    const row = el("li", `live-row${player.id === app.session.playerId ? " me" : ""}${player.connected ? "" : " offline"}`);
    row.append(
      el("span", "rank", index + 1),
      el("span", "who", player.name + (player.connected ? "" : " (offline)")),
      el("span", "count", `${player.wordCount} ${player.wordCount === 1 ? "word" : "words"}`),
      el("span", "points", player.score)
    );
    return row;
  }));
}

function renderFound(state) {
  const words = state.myWords;
  ui.scoreValue.textContent = words.reduce((sum, word) => sum + scoreWord(word), 0);
  ui.wordCountValue.textContent = words.length;
  ui.foundEmpty.hidden = words.length > 0;
  ui.foundList.replaceChildren(...words.slice().reverse().map((word) => {
    const item = el("li", "found-item");
    item.append(el("strong", "", word), el("span", "points", `+${scoreWord(word)}`));
    return item;
  }));
}

function rackLetters() {
  return app.tiles.map((tile) => tile.letter).join("");
}

// Keeps the tapped tiles lit for the letters still in the word; letters that
// arrived by keyboard take the first free tile with that letter.
function syncPicked() {
  const picked = [];
  [...app.typed].forEach((letter, index) => {
    const previous = app.tiles.find((tile) => tile.id === app.picked[index]);
    if (previous && previous.letter === letter && !picked.includes(previous.id)) {
      picked.push(previous.id);
      return;
    }
    const free = app.tiles.find((tile) => tile.letter === letter && !picked.includes(tile.id) && !app.picked.slice(index + 1).includes(tile.id));
    const any = free || app.tiles.find((tile) => tile.letter === letter && !picked.includes(tile.id));
    if (any) picked.push(any.id);
  });
  app.picked = picked;
}

function renderTiles() {
  syncPicked();
  const playing = app.state && localPhase(app.state) === "playing";
  const count = app.tiles.length || 9;
  ui.letterTray.style.setProperty("--count", count);
  // Phones: long racks wrap onto two even rows.
  ui.letterTray.style.setProperty("--narrow-count", count > 6 ? Math.ceil(count / 2) : count);
  ui.letterTray.replaceChildren(...app.tiles.map(({ id, letter }) => {
    const tile = el("button", "tile", letter);
    tile.type = "button";
    tile.disabled = !playing;
    tile.setAttribute("aria-label", letter);
    if (app.picked.includes(id)) tile.classList.add("used");
    tile.addEventListener("click", () => addLetter(letter, id));
    return tile;
  }));
  ui.guessInput.value = app.typed;
}

function renderClock() {
  const state = app.state;
  if (!state || !app.session) return;
  const phase = localPhase(state);
  const now = app.session.now();

  if (phase === "countdown") {
    if (ui.screens.play.hidden) renderPlay(state);
    const seconds = Math.ceil((state.startAt - now) / 1000);
    ui.countdownOverlay.hidden = false;
    ui.countdownText.textContent = seconds;
    ui.countdownLetters.textContent = `${state.letters.length} letters · ${LANGUAGE_NAMES[state.settings.language]}`;
    ui.timerValue.textContent = formatTime(state.endAt - state.startAt);
    if (app.lastBeep !== `c${seconds}`) {
      app.lastBeep = `c${seconds}`;
      if (seconds <= 3) sounds.beep();
    }
    return;
  }

  ui.countdownOverlay.hidden = true;
  if (phase === "playing") {
    if (ui.screens.play.hidden || ui.letterTray.querySelector(".tile:disabled")) {
      renderPlay(state);
      if (app.lastBeep?.startsWith("c")) {
        sounds.go();
        setMessage(ui.playMessage, "Go!", "good");
        focusGuess();
      }
    }
    const left = state.endAt - now;
    ui.timerValue.textContent = formatTime(left);
    ui.timerValue.parentElement.classList.toggle("urgent", left <= 10000);
    const seconds = Math.ceil(left / 1000);
    if (seconds <= 10 && app.lastBeep !== `p${seconds}`) {
      app.lastBeep = `p${seconds}`;
      sounds.beep();
    }
    return;
  }

  if (phase === "ending" && !ui.screens.play.hidden && !ui.letterTray.querySelector(".tile:disabled")) {
    sounds.end();
    ui.timerValue.textContent = "0:00";
    app.typed = "";
    renderTiles();
    setMessage(ui.playMessage, "Time's up! Adding up the scores…", "good");
  }
}

// ---------- Guessing ----------

function focusGuess() {
  if (!usesTouchEntry()) ui.guessInput.focus();
}

function addLetter(letter, tileId) {
  if (localPhase(app.state) !== "playing") return;
  const typedCounts = countLetters(app.typed);
  const rack = countLetters(rackLetters());
  if ((typedCounts[letter] || 0) >= (rack[letter] || 0)) return;
  if (tileId !== undefined && app.picked.includes(tileId)) return;
  app.typed += letter;
  if (tileId !== undefined) app.picked.push(tileId);
  renderTiles();
  focusGuess();
}

function flash(kind) {
  document.body.classList.remove("flash-good", "flash-bad");
  void document.body.offsetWidth;
  document.body.classList.add(`flash-${kind}`);
  setTimeout(() => document.body.classList.remove(`flash-${kind}`), 600);
}

function reject(text) {
  sounds.bad();
  flash("bad");
  setMessage(ui.playMessage, text, "bad");
  app.typed = "";
  renderTiles();
}

async function submitGuess(event) {
  event.preventDefault();
  const state = app.state;
  if (!state || localPhase(state) !== "playing" || app.checking) return;
  const word = cleanWord(app.typed);
  if (word.length < 2) return reject("Words need at least 2 letters.");
  if (state.myWords.includes(word)) return reject(`You already have "${word}".`);
  if (!canBuild(word, state.letters)) return reject("That uses letters you don't have.");

  app.checking = true;
  try {
    const valid = await isWord(word, state.settings.language);
    if (localPhase(app.state) !== "playing" || app.state.round !== state.round) return;
    if (!valid) return reject(`"${word}" isn't in the ${LANGUAGE_NAMES[state.settings.language]} dictionary.`);
    app.session.submitWord(word);
    if (!app.session.isHost) onState(app.session.state);
    app.typed = "";
    renderTiles();
    sounds.good();
    flash("good");
    setMessage(ui.playMessage, `${word} +${scoreWord(word)}`, "good");
  } catch {
    setMessage(ui.playMessage, "Couldn't load the word list. Check the connection and try again.", "bad");
  } finally {
    app.checking = false;
  }
}

// ---------- Results ----------

async function renderResults(state) {
  show("results");
  ui.countdownOverlay.hidden = true;
  const results = state.results || [];
  const me = results.find((result) => result.id === app.session.playerId);
  const solo = !state.online;

  if (solo || results.length < 2) {
    ui.winnerLine.textContent = me ? `${me.score} points with ${me.items.length} words` : "";
  } else {
    const top = results[0].score;
    const winners = results.filter((result) => result.score === top).map((result) => result.name);
    ui.winnerLine.textContent = winners.length > 1 ? `It's a tie: ${winners.join(" & ")}!` : `${winners[0]} wins!`;
  }
  ui.resultsTitle.textContent = "Time's up!";

  let rank = 0;
  let lastScore = null;
  ui.standings.replaceChildren(...results.map((result, index) => {
    if (result.score !== lastScore) rank = index + 1;
    lastScore = result.score;
    const card = el("li", `standing${rank === 1 && results.length > 1 ? " winner" : ""}${result.id === app.session.playerId ? " me" : ""}`);
    const head = el("div", "standing-head");
    head.append(el("span", "rank", rank), el("strong", "who", result.name), el("span", "points", `${result.score} pts`));
    const words = el("ul", "word-chips");
    const sorted = result.items.slice().sort((a, b) => b.points - a.points);
    for (const item of sorted) {
      const chip = el("li", item.longestBonus || item.unusualBonus ? "chip gold" : "chip");
      chip.append(el("span", "", item.word), el("small", "", `+${item.points}`));
      const bonuses = [item.longestBonus && "longest", item.unusualBonus && "rarest"].filter(Boolean);
      if (bonuses.length) chip.title = `Includes +15 for ${bonuses.join(" and ")}`;
      words.append(chip);
    }
    if (!sorted.length) words.append(el("li", "chip empty", "no words"));
    const extras = [];
    if (result.roomLongestBonus) extras.push("+15 longest word in the room");
    card.append(head, words);
    if (extras.length) card.append(el("p", "bonus-note", extras.join(" · ")));
    return card;
  }));

  const isNewRound = app.resultsRound !== state.round;
  if (isNewRound) {
    app.resultsRound = state.round;
    ui.recordLine.hidden = !(me && saveRun(me, state));
    ui.bestWordsLine.textContent = "Looking up every possible word…";
    ui.possibleCount.textContent = "";
    ui.missedWords.textContent = "";
    ui.missedDetails.hidden = true;
    showPossibleWords(state, results);
  }

  const isHost = app.session.isHost;
  ui.nextRoundButton.hidden = !isHost;
  ui.changeSettingsButton.hidden = !isHost;
  ui.waitingNextRound.hidden = isHost;
  ui.nextRoundButton.textContent = solo ? "Play again" : "Next round";
  ui.nextRoundButton.disabled = false;
}

async function showPossibleWords(state, results) {
  try {
    const all = await possibleWords(state.letters, state.settings.language);
    if (app.state !== state && app.state?.round !== state.round) return;
    const foundByAnyone = new Set(results.flatMap((result) => result.items.map((item) => item.word)));
    const mine = new Set(results.find((result) => result.id === app.session?.playerId)?.items.map((item) => item.word) || []);
    const top = bestWords(all, 3);
    ui.possibleCount.textContent = `you found ${mine.size} of ${all.length}`;
    ui.bestWordsLine.textContent = top.length
      ? `Longest: ${top.map((word) => `${word} (${word.length})`).join(", ")}`
      : "No words possible with these letters.";
    const missed = bestWords(all.filter((word) => !foundByAnyone.has(word) && word.length >= 3), 40);
    ui.missedDetails.hidden = missed.length === 0;
    ui.missedWords.textContent = missed.join(" · ");
  } catch {
    ui.bestWordsLine.textContent = "Couldn't load the word list.";
  }
}

// ---------- Events ----------

function primeAudio() {
  playTones([{ f: 1, at: 0, d: 0.01, v: 0.0002 }]);
}

function bindEvents() {
  $("#soloButton").addEventListener("click", () => playSolo());
  $("#createRoomButton").addEventListener("click", () => createRoom());
  $("#joinButton").addEventListener("click", () => joinRoom());
  ui.codeInput.addEventListener("input", () => { ui.codeInput.value = cleanCode(ui.codeInput.value); });
  ui.codeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinRoom(); });
  ui.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") (cleanCode(ui.codeInput.value).length === 5 ? joinRoom() : playSolo());
  });

  document.querySelectorAll("input[name='language']").forEach((input) => {
    input.addEventListener("change", () => changeSettings({ language: input.value }));
  });
  document.querySelectorAll("input[name='runLength']").forEach((input) => {
    input.addEventListener("change", () => changeSettings({ runLength: Number(input.value) }));
  });
  $("#lettersMinus").addEventListener("click", () => changeSettings({ letterCount: app.settings.letterCount - 1 }));
  $("#lettersPlus").addEventListener("click", () => changeSettings({ letterCount: app.settings.letterCount + 1 }));
  document.querySelectorAll("[data-board]").forEach((button) => {
    button.addEventListener("click", () => {
      app.boardDuration = Number(button.dataset.board);
      renderLeaderboard();
    });
  });

  ui.startButton.addEventListener("click", () => {
    primeAudio();
    app.session?.startRound();
  });
  $("#leaveLobbyButton").addEventListener("click", () => {
    if (!app.session?.isHost || app.state.players.length < 2 || confirm("Leaving closes the room for everyone. Leave?")) leaveRoom();
  });
  ui.nextRoundButton.addEventListener("click", () => {
    ui.nextRoundButton.disabled = true;
    app.session?.startRound();
  });
  ui.changeSettingsButton.addEventListener("click", () => {
    if (!app.state.online) {
      leaveRoom();
      return;
    }
    app.session.backToLobby();
  });
  $("#leaveResultsButton").addEventListener("click", () => {
    if (!app.session?.isHost || !app.state.online || app.state.players.length < 2 || confirm("Leaving closes the room for everyone. Leave?")) leaveRoom();
  });

  $("#copyButton").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ui.inviteLink.value);
      setMessage(ui.lobbyMessage, "Link copied. Paste it in a message to your family.", "good");
    } catch {
      ui.inviteLink.select();
      setMessage(ui.lobbyMessage, "Select and copy the link above.");
    }
  });
  $("#shareButton").addEventListener("click", async () => {
    const url = ui.inviteLink.value;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Letter Run", text: `Come play Letter Run with me! Room ${app.state.code}`, url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    $("#copyButton").click();
  });

  ui.guessForm.addEventListener("submit", submitGuess);
  ui.guessInput.addEventListener("input", () => {
    // Typing on a keyboard: keep only letters that are on the rack.
    const rack = countLetters(rackLetters());
    const counts = {};
    app.typed = [...cleanWord(ui.guessInput.value)].filter((letter) => {
      counts[letter] = (counts[letter] || 0) + 1;
      return counts[letter] <= (rack[letter] || 0);
    }).join("");
    renderTiles();
  });
  $("#backspaceButton").addEventListener("click", () => {
    app.typed = app.typed.slice(0, -1);
    renderTiles();
  });
  $("#clearButton").addEventListener("click", () => {
    app.typed = "";
    renderTiles();
    focusGuess();
  });
  $("#shuffleButton").addEventListener("click", () => {
    app.tiles = shuffle(app.tiles);
    renderTiles();
    focusGuess();
  });
  document.addEventListener("keydown", (event) => {
    if (ui.screens.play.hidden || document.activeElement === ui.guessInput) return;
    if (event.key === " ") {
      event.preventDefault();
      $("#shuffleButton").click();
    } else if (event.key === "Backspace") {
      $("#backspaceButton").click();
    } else if (event.key === "Enter") {
      ui.guessForm.requestSubmit();
    } else if (/^[a-z]$/i.test(event.key)) {
      addLetter(event.key.toLowerCase());
    }
  });

  $("#howToPlayButton").addEventListener("click", () => {
    ui.rulesModal.hidden = false;
    $("#closeRulesButton").focus();
  });
  $("#closeRulesButton").addEventListener("click", () => { ui.rulesModal.hidden = true; });
  ui.rulesModal.addEventListener("click", (event) => { if (event.target === ui.rulesModal) ui.rulesModal.hidden = true; });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") ui.rulesModal.hidden = true; });

  const soundButton = $("#soundButton");
  const renderSound = () => {
    soundButton.textContent = app.soundOn ? "Sound on" : "Sound off";
    soundButton.setAttribute("aria-pressed", String(app.soundOn));
  };
  soundButton.addEventListener("click", () => {
    app.soundOn = !app.soundOn;
    store.set("letterRunSound", app.soundOn);
    renderSound();
  });
  renderSound();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && app.session) {
      keepScreenAwake(true);
      render();
    }
  });
}

// ---------- Start up ----------

async function init() {
  bindEvents();
  ui.nameInput.value = store.get("letterRunName", "");
  app.boardDuration = app.settings.runLength;
  goHome();
  loadDictionary(app.settings.language).catch(() => {});

  const params = new URLSearchParams(location.search);
  const code = cleanCode(params.get("room"));
  const hosting = savedHosting();
  const joined = store.session("letterRunJoined");

  if (hosting && hosting.code === code) {
    // The host reloaded the page: reopen the same room.
    const room = new HostRoom({ playerId: getPlayerId(), online: true, code: hosting.code, saved: hosting.state });
    attach(room);
    setBanner("Reopening your room…");
    try {
      await room.open();
      setBanner("");
      room.broadcast();
    } catch (error) {
      leaveRoom();
      setMessage(ui.homeMessage, error.message, "bad");
    }
    return;
  }

  if (code) {
    ui.codeInput.value = code;
    ui.inviteCode.textContent = code;
    ui.inviteNotice.hidden = false;
    ui.setupCard.classList.add("invited");
    if (joined?.code === code && ui.nameInput.value) {
      joinRoom(code);
      return;
    }
    (ui.nameInput.value ? $("#joinButton") : ui.nameInput).focus();
  }
}

init();
