const setupForm = document.querySelector("#setupForm");
const playerNameInput = document.querySelector("#playerNameInput");
const letterCountInput = document.querySelector("#letterCountInput");
const timerValue = document.querySelector("#timerValue");
const letterTray = document.querySelector("#letterTray");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const submitButton = document.querySelector("#submitButton");
const message = document.querySelector("#message");
const scoreValue = document.querySelector("#scoreValue");
const wordCountValue = document.querySelector("#wordCountValue");
const letterCountValue = document.querySelector("#letterCountValue");
const longestValue = document.querySelector("#longestValue");
const unusualValue = document.querySelector("#unusualValue");
const wordList = document.querySelector("#wordList");
const emptyState = document.querySelector("#emptyState");
const leaderboardList = document.querySelector("#leaderboardList");
const leaderboardEmptyState = document.querySelector("#leaderboardEmptyState");
const leaderboardScope = document.querySelector("#leaderboardScope");
const leaderboardTabs = document.querySelectorAll("[data-leaderboard-duration]");
const shuffleButton = document.querySelector("#shuffleButton");
const clearButton = document.querySelector("#clearButton");
const newRoundButton = document.querySelector("#newRoundButton");
const createRoomButton = document.querySelector("#createRoomButton");
const joinRoomButton = document.querySelector("#joinRoomButton");
const startRoomButton = document.querySelector("#startRoomButton");
const roomCodeInput = document.querySelector("#roomCodeInput");
const roomStatus = document.querySelector("#roomStatus");
const onlineScoreboard = document.querySelector("#onlineScoreboard");
const timeUpBanner = document.querySelector("#timeUpBanner");
const timeUpSummary = document.querySelector("#timeUpSummary");
const recordBadge = document.querySelector("#recordBadge");
const bestPossibleWord = document.querySelector("#bestPossibleWord");
const finalPlayerRecap = document.querySelector("#finalPlayerRecap");
const viewScoresButton = document.querySelector("#viewScoresButton");
const playAgainButton = document.querySelector("#playAgainButton");

const vowels = ["a", "e", "i", "o", "u"];
const commonConsonants = "nnnnrrrrttttllllsssscccddppmmbbggfhvwy".split("");
const rareLetters = "jkqxz".split("");
const letterValues = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5,
  l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4,
  w: 4, x: 8, y: 4, z: 10
};

const dictionaryCache = JSON.parse(localStorage.getItem("letterRunDictionaryCache") || "{}");
const leaderboardKey = "letterRunLeaderboard";
let leaderboard = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
let letters = [];
let foundWords = [];
let playerName = "";
let runLength = 60;
let letterCount = 9;
let selectedLeaderboardDuration = 60;
let secondsLeft = 0;
let timerId = null;
let gameState = "setup";
let hasSavedCurrentRun = false;
let audioContext = null;
let currentRunIsRecord = false;
let bestPossibleText = "";
let onlineRoom = null;
let onlinePlayers = [];
let feedbackTimer = null;
let timeUpDismissed = false;

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function generateLetters(count) {
  const set = [];
  const guaranteedVowels = count >= 7 ? 3 : count >= 5 ? 2 : 1;

  while (set.length < guaranteedVowels) {
    set.push(pick(vowels));
  }

  if (count >= 7) {
    set.push(pick(rareLetters));
  }

  while (set.length < count) {
    set.push(Math.random() < 0.25 ? pick(vowels) : pick(commonConsonants));
  }
  return shuffle(set);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function countLetters(value) {
  return [...value].reduce((counts, letter) => {
    counts[letter] = (counts[letter] || 0) + 1;
    return counts;
  }, {});
}

function canBuildWord(word) {
  const available = countLetters(letters.join(""));
  return canBuildFromCounts(word, available);
}

function canBuildFromCounts(word, available) {
  const needed = countLetters(word);
  return Object.entries(needed).every(([letter, count]) => available[letter] >= count);
}

function cleanGuess(value) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

function cleanLetterCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 9;
  return Math.min(10, Math.max(3, Math.round(count)));
}

function rarityScore(word) {
  const uniqueLetters = new Set(word).size;
  const value = [...word].reduce((sum, letter) => sum + (letterValues[letter] || 0), 0);
  return value + Math.max(0, uniqueLetters - 4) * 2;
}

function scoreWord(word) {
  return word.length * 2 + Math.floor(rarityScore(word) / 3);
}

function getTotalScore() {
  return foundWords.reduce((sum, item) => sum + item.points, 0);
}

function isLongest(word) {
  const maxLength = Math.max(...foundWords.map((item) => item.word.length), 0);
  return word.length >= maxLength;
}

function isMostUnusual(rarity) {
  const maxRarity = Math.max(...foundWords.map((item) => item.rarity), 0);
  return rarity >= maxRarity;
}

async function validateWord(word) {
  if (dictionaryCache[word] !== undefined) {
    return dictionaryCache[word];
  }

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const valid = response.ok;
    dictionaryCache[word] = valid;
    localStorage.setItem("letterRunDictionaryCache", JSON.stringify(dictionaryCache));
    return valid;
  } catch {
    throw new Error("Dictionary check needs an internet connection.");
  }
}

function setMessage(text, tone = "") {
  message.textContent = text;
  message.className = `message ${tone}`.trim();
}

function flashGameFeedback(kind) {
  clearTimeout(feedbackTimer);
  document.body.classList.remove("game-feedback-good", "game-feedback-bad");
  document.body.classList.add(`game-feedback-${kind}`);
  feedbackTimer = setTimeout(() => {
    document.body.classList.remove(`game-feedback-${kind}`);
  }, 620);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Online room request failed.");
  }
  return data;
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function unlockAudio() {
  try {
    const context = getAudioContext();
    if (context.state === "suspended") {
      context.resume();
    }
  } catch {
    // Sound is optional; gameplay should not depend on audio support.
  }
}

function playTone(sequence) {
  try {
    const context = getAudioContext();
    if (context.state === "suspended") {
      context.resume();
    }
    const now = context.currentTime;

    sequence.forEach((note) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type || "sine";
      oscillator.frequency.setValueAtTime(note.frequency, now + note.delay);
      gain.gain.setValueAtTime(0.0001, now + note.delay);
      gain.gain.exponentialRampToValueAtTime(note.volume, now + note.delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + note.delay);
      oscillator.stop(now + note.delay + note.duration + 0.02);
    });
  } catch {
    // Audio is optional; the game should keep playing if a browser blocks sound.
  }
}

function playCorrectSound() {
  playTone([
    { frequency: 523.25, delay: 0, duration: 0.08, volume: 0.18 },
    { frequency: 659.25, delay: 0.08, duration: 0.09, volume: 0.18 },
    { frequency: 783.99, delay: 0.17, duration: 0.12, volume: 0.16 }
  ]);
}

function playWrongSound() {
  playTone([
    { frequency: 155.56, delay: 0, duration: 0.16, volume: 0.14, type: "sawtooth" },
    { frequency: 116.54, delay: 0.11, duration: 0.18, volume: 0.12, type: "sawtooth" }
  ]);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function setPlayEnabled(enabled) {
  guessInput.disabled = !enabled;
  submitButton.disabled = !enabled;
  shuffleButton.disabled = !enabled;
  clearButton.disabled = !enabled;
  letterTray.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
}

function renderLetters() {
  const typedCounts = countLetters(cleanGuess(guessInput.value));
  const usedCounts = {};
  letterTray.innerHTML = "";

  letters.forEach((letter) => {
    usedCounts[letter] = usedCounts[letter] || 0;
    const tile = document.createElement("button");
    tile.className = "letter-tile";
    tile.type = "button";
    tile.textContent = letter;
    tile.disabled = gameState !== "playing";
    tile.setAttribute("aria-label", `Add ${letter}`);

    if (usedCounts[letter] < (typedCounts[letter] || 0)) {
      tile.classList.add("used");
      usedCounts[letter] += 1;
    }

    tile.addEventListener("click", () => {
      if (gameState !== "playing") return;
      guessInput.value = `${guessInput.value}${letter}`;
      guessInput.focus();
      renderLetters();
    });

    letterTray.appendChild(tile);
  });
}

function renderScore() {
  const longest = foundWords.reduce((best, item) => item.word.length > best.word.length ? item : best, { word: "-", rarity: 0 });
  const unusual = foundWords.reduce((best, item) => item.rarity > best.rarity ? item : best, { word: "-", rarity: 0 });

  timerValue.textContent = gameState === "setup" || gameState === "waiting" ? "-:--" : formatTime(secondsLeft);
  scoreValue.textContent = getTotalScore();
  wordCountValue.textContent = foundWords.length;
  letterCountValue.textContent = gameState === "setup" ? "-" : letterCount;
  longestValue.textContent = longest.word;
  unusualValue.textContent = unusual.word;
}

function renderWords() {
  wordList.innerHTML = "";
  emptyState.hidden = foundWords.length > 0;

  foundWords
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((item) => {
      const li = document.createElement("li");
      li.className = "word-card";

      const text = document.createElement("div");
      const word = document.createElement("strong");
      word.textContent = item.word;
      text.appendChild(word);

      const meta = document.createElement("div");
      meta.className = "word-meta";
      meta.append(tag(`${item.word.length} letters`));
      meta.append(tag(`rarity ${item.rarity}`));
      if (item.longestBonus) meta.append(tag("+15 longest", true));
      if (item.unusualBonus) meta.append(tag("+15 unusual", true));
      text.appendChild(meta);

      const points = document.createElement("span");
      points.className = "points";
      points.textContent = `+${item.points}`;

      li.append(text, points);
      wordList.appendChild(li);
    });
}

function renderLeaderboard() {
  leaderboardList.innerHTML = "";
  const entries = leaderboard
    .filter((entry) => entry.seconds === selectedLeaderboardDuration)
    .sort((a, b) => b.score - a.score || b.words - a.words || a.seconds - b.seconds || b.createdAt - a.createdAt);
  const hasEntries = entries.length > 0;
  leaderboardScope.textContent = `${selectedLeaderboardDuration / 60} min runs`;
  leaderboardEmptyState.hidden = hasEntries;

  leaderboardTabs.forEach((button) => {
    const isActive = Number(button.dataset.leaderboardDuration) === selectedLeaderboardDuration;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (!hasEntries) return;

  const list = document.createElement("ol");
  list.className = "leaderboard-run-list";

  entries.slice(0, 10).forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = "leaderboard-row";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = index + 1;

    const name = document.createElement("div");
    name.className = "leaderboard-name";
    const strong = document.createElement("strong");
    strong.textContent = entry.name;
    const details = document.createElement("span");
    details.textContent = `${entry.words} words, ${entry.letters || 9} letters`;
    name.append(strong, details);

    const score = document.createElement("span");
    score.className = "points";
    score.textContent = entry.score;

    li.append(rank, name, score);
    list.appendChild(li);
  });

  leaderboardList.appendChild(list);
}

function renderOnlineScoreboard() {
  onlineScoreboard.hidden = !onlineRoom;
  onlineScoreboard.innerHTML = "";
  if (!onlineRoom) return;

  onlinePlayers.forEach((player) => {
    const card = document.createElement("div");
    card.className = "online-player-card";
    const name = document.createElement("strong");
    name.textContent = player.name;
    const score = document.createElement("span");
    score.textContent = `${player.score} points, ${player.words} words`;
    const list = document.createElement("ul");
    list.className = "online-word-list";

    (player.foundWords || []).slice().reverse().forEach((word) => {
      const item = document.createElement("li");
      item.textContent = word;
      list.appendChild(item);
    });

    if (!list.children.length) {
      const item = document.createElement("li");
      item.textContent = "No words yet";
      item.className = "empty-online-word";
      list.appendChild(item);
    }

    card.append(name, score, list);
    onlineScoreboard.appendChild(card);
  });
}

function renderFinalPlayerRecap() {
  finalPlayerRecap.innerHTML = "";
  finalPlayerRecap.hidden = !onlineRoom || gameState !== "finished";
  if (finalPlayerRecap.hidden) return;

  onlinePlayers.forEach((player) => {
    const words = player.foundWords || [];
    const longest = words.reduce((best, word) => word.length > best.length ? word : best, "-");
    const row = document.createElement("div");
    row.className = "final-player-row";

    const name = document.createElement("strong");
    name.textContent = player.name;
    const details = document.createElement("span");
    details.textContent = `${player.score} points, ${player.words} words, longest: ${longest}`;

    row.append(name, details);
    finalPlayerRecap.appendChild(row);
  });
}

function tag(text, isGold = false) {
  const item = document.createElement("span");
  item.className = isGold ? "tag gold" : "tag";
  item.textContent = text;
  return item;
}

function render() {
  setupForm.classList.toggle("hidden", gameState === "playing");
  timeUpBanner.hidden = gameState !== "finished" || timeUpDismissed;
  recordBadge.hidden = !currentRunIsRecord;
  timeUpSummary.textContent = `${playerName} scored ${getTotalScore()} points with ${foundWords.length} words.`;
  bestPossibleWord.textContent = bestPossibleText;
  letterTray.style.setProperty("--letter-count", letterCount || 9);
  renderLetters();
  renderScore();
  renderWords();
  renderLeaderboard();
  renderOnlineScoreboard();
  renderFinalPlayerRecap();
  setPlayEnabled(gameState === "playing");
}

function getSelectedDuration() {
  const selectedDuration = setupForm.querySelector("input[name='duration']:checked");
  return Number(selectedDuration.value);
}

async function submitGuess(event) {
  event.preventDefault();
  unlockAudio();

  if (gameState !== "playing") {
    setMessage("Start a run before guessing.", "bad");
    return;
  }

  const word = cleanGuess(guessInput.value);

  if (word.length < 2) {
    guessInput.value = "";
    playWrongSound();
    flashGameFeedback("bad");
    setMessage("Try at least 2 letters.", "bad");
    renderLetters();
    return;
  }

  if (foundWords.some((item) => item.word === word)) {
    guessInput.value = "";
    playWrongSound();
    flashGameFeedback("bad");
    setMessage("Already found. Nice memory, though.", "bad");
    renderLetters();
    return;
  }

  if (!canBuildWord(word)) {
    guessInput.value = "";
    playWrongSound();
    flashGameFeedback("bad");
    setMessage("That word uses letters outside this run.", "bad");
    renderLetters();
    return;
  }

  submitButton.disabled = true;
  setMessage("Checking the dictionary...");

  try {
    const valid = await validateWord(word);
    if (gameState !== "playing") return;

    if (!valid) {
      guessInput.value = "";
      playWrongSound();
      flashGameFeedback("bad");
      setMessage("The live dictionary did not recognize that one.", "bad");
      renderLetters();
      return;
    }

    const rarity = rarityScore(word);
    const longestBonus = isLongest(word);
    const unusualBonus = isMostUnusual(rarity);
    const points = scoreWord(word) + (longestBonus ? 15 : 0) + (unusualBonus ? 15 : 0);

    foundWords.push({
      word,
      rarity,
      points,
      longestBonus,
      unusualBonus,
      createdAt: Date.now()
    });

    if (onlineRoom) {
      await submitOnlineWord(word, points);
    }

    guessInput.value = "";
    playCorrectSound();
    flashGameFeedback("good");
    setMessage(`Accepted: ${word} scored ${points} points.`, "good");
    render();
  } catch (error) {
    setMessage(error.message, "bad");
  } finally {
    if (gameState === "playing") {
      submitButton.disabled = false;
      guessInput.focus();
    }
  }
}

async function submitOnlineWord(word, points) {
  try {
    await api(`/api/rooms/${onlineRoom.code}/word`, {
      method: "POST",
      body: JSON.stringify({
        playerId: onlineRoom.playerId,
        word,
        points
      })
    });
    await syncRoomState();
  } catch (error) {
    setMessage(error.message, "bad");
  }
}

function saveLeaderboardEntry() {
  if (hasSavedCurrentRun) return;
  hasSavedCurrentRun = true;

  leaderboard.push({
    name: playerName,
    score: getTotalScore(),
    words: foundWords.length,
    seconds: runLength,
    letters: letterCount,
    createdAt: Date.now()
  });

  leaderboard = [60, 120, 180].flatMap((duration) => leaderboard
    .filter((entry) => entry.seconds === duration)
    .sort((a, b) => b.score - a.score || b.words - a.words || a.seconds - b.seconds || b.createdAt - a.createdAt)
    .slice(0, 10));

  localStorage.setItem(leaderboardKey, JSON.stringify(leaderboard));
}

function isNewRecord() {
  const previousBest = leaderboard
    .filter((entry) => entry.seconds === runLength)
    .reduce((best, entry) => Math.max(best, entry.score), -1);
  return getTotalScore() > previousBest;
}

async function findBestPossibleWord() {
  const snapshotLetters = [...letters];
  const available = countLetters(snapshotLetters.join(""));
  const maxLength = snapshotLetters.length;
  bestPossibleText = "Best possible word: checking...";
  render();

  try {
    const response = await fetch("https://cdn.jsdelivr.net/gh/dwyl/english-words@master/words_alpha.txt");
    if (!response.ok) throw new Error("Dictionary unavailable");

    const text = await response.text();
    const words = text.split(/\r?\n/);
    let best = "";
    let bestRarity = -1;

    words.forEach((rawWord) => {
      const word = cleanGuess(rawWord);
      if (word.length < 2 || word.length > maxLength || word.length < best.length) return;
      if (!canBuildFromCounts(word, available)) return;

      const rarity = rarityScore(word);
      if (word.length > best.length || rarity > bestRarity) {
        best = word;
        bestRarity = rarity;
      }
    });

    bestPossibleText = best
      ? `Best possible word: ${best} (${best.length} letters)`
      : "Best possible word: none found";
  } catch {
    bestPossibleText = "Best possible word: could not check dictionary";
  }

  if (gameState === "finished") {
    render();
  }
}

function endRun() {
  if (gameState !== "playing") return;

  clearInterval(timerId);
  timerId = null;
  gameState = "finished";
  secondsLeft = 0;
  timeUpDismissed = false;
  currentRunIsRecord = isNewRecord();
  bestPossibleText = "Best possible word: checking...";
  saveLeaderboardEntry();
  setMessage(`Time. ${playerName} scored ${getTotalScore()} points with ${foundWords.length} words.`, "good");
  render();
  findBestPossibleWord();
  playerNameInput.focus();
}

function endOnlineRun() {
  if (gameState === "finished") return;

  clearInterval(timerId);
  timerId = null;
  gameState = "finished";
  secondsLeft = 0;
  timeUpDismissed = false;
  currentRunIsRecord = isNewRecord();
  bestPossibleText = "Best possible word: checking...";
  saveLeaderboardEntry();
  setMessage(`Time. ${playerName} scored ${getTotalScore()} points with ${foundWords.length} words.`, "good");
  render();
  findBestPossibleWord();
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    secondsLeft -= 1;
    renderScore();

    if (secondsLeft <= 0) {
      endRun();
    }
  }, 1000);
}

function startRun(event) {
  event.preventDefault();
  unlockAudio();
  onlineRoom = null;
  onlinePlayers = [];

  playerName = cleanName(playerNameInput.value);
  if (!playerName) {
    setMessage("Enter your name before starting.", "bad");
    playerNameInput.focus();
    return;
  }

  runLength = getSelectedDuration();
  selectedLeaderboardDuration = runLength;
  letterCount = cleanLetterCount(letterCountInput.value);
  letterCountInput.value = letterCount;
  secondsLeft = runLength;
  letters = generateLetters(letterCount);
  foundWords = [];
  hasSavedCurrentRun = false;
  currentRunIsRecord = false;
  bestPossibleText = "";
  timeUpDismissed = false;
  guessInput.value = "";
  gameState = "playing";
  setMessage(`${playerName}, your ${runLength / 60} minute run is live with ${letterCount} letters.`, "good");
  render();
  startTimer();
  guessInput.focus();
}

function applyRoomState(room) {
  runLength = room.runLength;
  letterCount = room.letterCount;
  letters = room.letters;
  secondsLeft = room.secondsLeft;
  onlinePlayers = room.players;
  selectedLeaderboardDuration = runLength;

  const currentPlayer = room.players.find((player) => player.id === onlineRoom.playerId);
  if (currentPlayer) {
    scoreValue.textContent = currentPlayer.score;
  }

  if (room.state === "waiting") {
    gameState = "waiting";
  }

  if (room.state === "playing") {
    gameState = "playing";
  }

  if (room.state === "finished") {
    endOnlineRun();
    return;
  }

  render();
}

async function syncRoomState() {
  if (!onlineRoom) return;
  const room = await api(`/api/rooms/${onlineRoom.code}?playerId=${onlineRoom.playerId}`);
  applyRoomState(room);
}

function startRoomPolling() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    syncRoomState().catch((error) => {
      setMessage(error.message, "bad");
    });
  }, 1000);
}

async function createOnlineRoom() {
  unlockAudio();
  playerName = cleanName(playerNameInput.value);
  if (!playerName) {
    setMessage("Enter your name before creating a room.", "bad");
    playerNameInput.focus();
    return;
  }

  runLength = getSelectedDuration();
  letterCount = cleanLetterCount(letterCountInput.value);
  const room = await api("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: playerName,
      runLength,
      letterCount
    })
  });

  onlineRoom = { code: room.code, playerId: room.playerId, isHost: true };
  foundWords = [];
  hasSavedCurrentRun = false;
  currentRunIsRecord = false;
  bestPossibleText = "";
  timeUpDismissed = false;
  roomStatus.textContent = `Room ${room.code} ready. Share this code, then start when both players are in.`;
  startRoomButton.hidden = false;
  applyRoomState(room);
  startRoomPolling();
}

async function joinOnlineRoom() {
  unlockAudio();
  playerName = cleanName(playerNameInput.value);
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!playerName || !code) {
    setMessage("Enter your name and a room code.", "bad");
    return;
  }

  const room = await api(`/api/rooms/${code}/join`, {
    method: "POST",
    body: JSON.stringify({ name: playerName })
  });

  onlineRoom = { code: room.code, playerId: room.playerId, isHost: false };
  foundWords = [];
  hasSavedCurrentRun = false;
  currentRunIsRecord = false;
  bestPossibleText = "";
  roomStatus.textContent = `Joined room ${room.code}. Waiting for the host to start.`;
  startRoomButton.hidden = true;
  applyRoomState(room);
  startRoomPolling();
}

async function startOnlineRoom() {
  if (!onlineRoom) return;
  const room = await api(`/api/rooms/${onlineRoom.code}/start`, {
    method: "POST",
    body: JSON.stringify({ playerId: onlineRoom.playerId })
  });
  roomStatus.textContent = `Room ${room.code} is live.`;
  startRoomButton.hidden = true;
  applyRoomState(room);
}

function resetToSetup() {
  clearInterval(timerId);
  timerId = null;
  gameState = "setup";
  onlineRoom = null;
  onlinePlayers = [];
  letters = [];
  foundWords = [];
  letterCount = cleanLetterCount(letterCountInput.value);
  letterCountInput.value = letterCount;
  currentRunIsRecord = false;
  bestPossibleText = "";
  secondsLeft = 0;
  guessInput.value = "";
  setMessage("Enter your name, choose a run length, and start.");
  roomStatus.textContent = "Online rooms need the game server running.";
  startRoomButton.hidden = true;
  render();
  playerNameInput.focus();
}

setupForm.addEventListener("submit", startRun);
setupForm.addEventListener("change", () => {
  letterCount = cleanLetterCount(letterCountInput.value);
  selectedLeaderboardDuration = getSelectedDuration();
  render();
});
createRoomButton.addEventListener("click", () => {
  createOnlineRoom().catch((error) => setMessage(error.message, "bad"));
});
joinRoomButton.addEventListener("click", () => {
  joinOnlineRoom().catch((error) => setMessage(error.message, "bad"));
});
startRoomButton.addEventListener("click", () => {
  startOnlineRoom().catch((error) => setMessage(error.message, "bad"));
});
leaderboardTabs.forEach((button) => {
  button.addEventListener("click", () => {
    selectedLeaderboardDuration = Number(button.dataset.leaderboardDuration);
    renderLeaderboard();
  });
});
guessForm.addEventListener("submit", submitGuess);
guessInput.addEventListener("input", renderLetters);
shuffleButton.addEventListener("click", () => {
  if (gameState !== "playing") return;
  letters = shuffle(letters);
  renderLetters();
});
clearButton.addEventListener("click", () => {
  guessInput.value = "";
  setMessage("Cleared.");
  renderLetters();
  guessInput.focus();
});
newRoundButton.addEventListener("click", resetToSetup);
viewScoresButton.addEventListener("click", () => {
  timeUpDismissed = true;
  render();
});
playAgainButton.addEventListener("click", resetToSetup);

resetToSetup();
