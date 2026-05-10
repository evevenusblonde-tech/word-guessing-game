const setupForm = document.querySelector("#setupForm");
const playerNameInput = document.querySelector("#playerNameInput");
const letterCountInput = document.querySelector("#letterCountInput");
const letterCountMinus = document.querySelector("#letterCountMinus");
const letterCountPlus = document.querySelector("#letterCountPlus");
const timerValue = document.querySelector("#timerValue");
const letterTray = document.querySelector("#letterTray");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const submitButton = document.querySelector("#submitButton");
const message = document.querySelector("#message");
const scoreValue = document.querySelector("#scoreValue");
const wordCountValue = document.querySelector("#wordCountValue");
const letterCountValue = document.querySelector("#letterCountValue");
const languageValue = document.querySelector("#languageValue");
const longestValue = document.querySelector("#longestValue");
const unusualValue = document.querySelector("#unusualValue");
const wordList = document.querySelector("#wordList");
const emptyState = document.querySelector("#emptyState");
const leaderboardList = document.querySelector("#leaderboardList");
const leaderboardEmptyState = document.querySelector("#leaderboardEmptyState");
const leaderboardScope = document.querySelector("#leaderboardScope");
const leaderboardPanel = document.querySelector(".leaderboard-panel");
const leaderboardTabs = document.querySelectorAll("[data-leaderboard-duration]");
const visitorCounter = document.querySelector("#visitorCounter");
const backButton = document.querySelector("#backButton");
const shuffleButton = document.querySelector("#shuffleButton");
const clearButton = document.querySelector("#clearButton");
const newRoundButton = document.querySelector("#newRoundButton");
const howToPlayButton = document.querySelector("#howToPlayButton");
const howToPlayModal = document.querySelector("#howToPlayModal");
const closeRulesButton = document.querySelector("#closeRulesButton");
const createRoomButton = document.querySelector("#createRoomButton");
const joinRoomButton = document.querySelector("#joinRoomButton");
const startRoomButton = document.querySelector("#startRoomButton");
const onlineStartPanel = document.querySelector("#onlineStartPanel");
const onlineStartText = document.querySelector("#onlineStartText");
const startPlayerButton = document.querySelector("#startPlayerButton");
const roomCodeInput = document.querySelector("#roomCodeInput");
const roomStatus = document.querySelector("#roomStatus");
const playerCountBadge = document.querySelector("#playerCountBadge");
const inviteBox = document.querySelector("#inviteBox");
const inviteLinkInput = document.querySelector("#inviteLinkInput");
const copyInviteButton = document.querySelector("#copyInviteButton");
const shareInviteButton = document.querySelector("#shareInviteButton");
const onlineScoreboard = document.querySelector("#onlineScoreboard");
const timeUpBanner = document.querySelector("#timeUpBanner");
const startCountdownBanner = document.querySelector("#startCountdownBanner");
const startCountdownText = document.querySelector("#startCountdownText");
const timeUpSummary = document.querySelector("#timeUpSummary");
const recordBadge = document.querySelector("#recordBadge");
const winnerBanner = document.querySelector("#winnerBanner");
const bestPossibleWord = document.querySelector("#bestPossibleWord");
const finalPlayerRecap = document.querySelector("#finalPlayerRecap");
const playAgainStatus = document.querySelector("#playAgainStatus");
const viewScoresButton = document.querySelector("#viewScoresButton");
const playAgainRequestButton = document.querySelector("#playAgainRequestButton");
const playAgainButton = document.querySelector("#playAgainButton");

const languageNames = {
  en: "English",
  it: "Italiano"
};
const letterPools = {
  en: {
    vowels: ["a", "e", "i", "o", "u"],
    commonConsonants: "nnnnrrrrttttllllsssscccddppmmbbggffhhvvwwyy".split(""),
    rareLetters: "jkqxz".split(""),
    vowelPlan: { 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 3, 9: 3, 10: 3 }
  },
  it: {
    vowels: ["a", "e", "i", "o", "u"],
    commonConsonants: "nnnnrrrrttttllllssssccccddddpppmmmvvvbbbffgghh".split(""),
    rareLetters: "qz".split(""),
    vowelPlan: { 3: 1, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4 }
  }
};
const letterValues = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5,
  l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4,
  w: 4, x: 8, y: 4, z: 10
};

const dictionaryCache = JSON.parse(localStorage.getItem("letterRunDictionaryCache") || "{}");
const dictionaryCacheVersion = "v6";
const browserWordSetCache = {};
const leaderboardKey = "letterRunLeaderboard";
const visitorKey = "letterRunVisitorId";
const maxOnlinePlayers = 4;
let leaderboard = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
let letters = [];
let foundWords = [];
let playerName = "";
let runLength = 60;
let letterCount = 9;
let gameLanguage = "en";
let selectedLeaderboardDuration = 60;
let secondsLeft = 0;
let timerId = null;
let gameState = "setup";
let hasSavedCurrentRun = false;
let currentRunId = "";
let audioContext = null;
let currentRunIsRecord = false;
let bestPossibleText = "";
let onlineRoom = null;
let onlinePlayers = [];
let playAgainState = { count: 0, total: 0, requested: false };
let onlineRunNumber = 0;
let feedbackTimer = null;
let timeUpDismissed = false;
let lastCountdownBeepSecond = null;
let lastLetterRenderKey = "";
let startCountdownMessage = "";
let startCountdownClearTimer = null;
const touchLetterMedia = window.matchMedia("(pointer: coarse), (max-width: 760px)");

function usesTouchLetterEntry() {
  return touchLetterMedia.matches;
}

function focusGuessInput() {
  if (!usesTouchLetterEntry()) {
    guessInput.focus();
  }
}

function focusPlayerNameInput() {
  if (!usesTouchLetterEntry()) {
    playerNameInput.focus();
  }
}

function updateGuessInputMode() {
  const touchEntry = usesTouchLetterEntry();
  guessInput.readOnly = touchEntry;
  guessInput.inputMode = touchEntry ? "none" : "text";
  guessInput.setAttribute("inputmode", touchEntry ? "none" : "text");
  guessInput.setAttribute("aria-readonly", String(touchEntry));
  guessInput.placeholder = touchEntry ? "Tap letters below" : "Type a word";
  document.body.classList.toggle("touch-letter-entry", touchEntry);
  if (touchEntry && document.activeElement === guessInput) {
    guessInput.blur();
  }
}

function getInviteLink(code) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  return url.toString();
}

function getVisitorId() {
  let id = localStorage.getItem(visitorKey);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(visitorKey, id);
  }
  return id;
}

function renderVisitorCounter(count) {
  const safeCount = Math.max(0, Math.round(Number(count) || 0));
  visitorCounter.textContent = `Visitors: ${safeCount}`;
}

async function registerVisitor() {
  try {
    const result = await api("/api/visitors", {
      method: "POST",
      body: JSON.stringify({ visitorId: getVisitorId() })
    });
    renderVisitorCounter(result.uniqueVisitors);
  } catch {
    renderVisitorCounter(1);
  }
}

function showInviteLink(code) {
  inviteLinkInput.value = getInviteLink(code);
  inviteBox.hidden = false;
}

function updatePlayerCountBadge() {
  playerCountBadge.hidden = !onlineRoom;
  if (!onlineRoom) return;
  const count = onlinePlayers.length;
  const label = count === 1 ? "player" : "players";
  playerCountBadge.textContent = `${count}/${maxOnlinePlayers} ${label} joined`;
}

function getCurrentOnlinePlayer() {
  if (!onlineRoom) return null;
  return onlinePlayers.find((player) => player.id === onlineRoom.playerId) || null;
}

function updateOnlineStartPanel() {
  const currentPlayer = getCurrentOnlinePlayer();
  const showStart = Boolean(onlineRoom && currentPlayer && gameState === "ready");
  onlineStartPanel.hidden = !showStart;
  startPlayerButton.disabled = !showStart;
  if (!showStart) return;

  const readyPlayers = onlinePlayers.filter((player) => player.status === "ready").length;
  const playingPlayers = onlinePlayers.filter((player) => player.status === "playing").length;
  const donePlayers = onlinePlayers.filter((player) => player.status === "done").length;
  onlineStartText.textContent = playingPlayers || donePlayers
    ? `${playingPlayers} playing, ${donePlayers} finished. Start your own timer when you are ready.`
    : `${readyPlayers} players are ready. Tap when you want your timer to begin.`;
}

function openRules() {
  howToPlayModal.hidden = false;
  closeRulesButton.focus();
}

function closeRules() {
  howToPlayModal.hidden = true;
  howToPlayButton.focus();
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function generateLetters(count, language = gameLanguage) {
  const pool = letterPools[language] || letterPools.en;
  const set = [];
  const vowelCount = pool.vowelPlan[count] || Math.max(1, Math.round(count * 0.36));
  const rareCount = count >= 7 && Math.random() < 0.55 ? 1 : 0;

  while (set.length < vowelCount) {
    set.push(pick(pool.vowels));
  }

  while (set.length < vowelCount + rareCount) {
    set.push(pick(pool.rareLetters));
  }

  while (set.length < count) {
    set.push(pick(pool.commonConsonants));
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
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

function cleanLetterCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 9;
  return Math.min(10, Math.max(3, Math.round(count)));
}

function updateLetterCount(value) {
  letterCount = cleanLetterCount(value);
  letterCountInput.value = letterCount;
  render();
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

function getCurrentScore() {
  const currentPlayer = getCurrentOnlinePlayer();
  return currentPlayer ? currentPlayer.score : getTotalScore();
}

function getCurrentWordCount() {
  const currentPlayer = getCurrentOnlinePlayer();
  return currentPlayer ? currentPlayer.words : foundWords.length;
}

function isLongest(word) {
  const maxLength = Math.max(...foundWords.map((item) => item.word.length), 0);
  return word.length >= maxLength;
}

function isMostUnusual(rarity) {
  const maxRarity = Math.max(...foundWords.map((item) => item.rarity), 0);
  return rarity >= maxRarity;
}

function applyEndRunBonuses() {
  let longestWord = null;
  let unusualWord = null;

  foundWords.forEach((item) => {
    item.longestBonus = false;
    item.unusualBonus = false;
    item.points = item.basePoints;

    if (!longestWord || item.word.length > longestWord.word.length) {
      longestWord = item;
    }

    if (!unusualWord || item.rarity > unusualWord.rarity) {
      unusualWord = item;
    }
  });

  if (longestWord) {
    longestWord.longestBonus = true;
    longestWord.points += 15;
  }

  if (unusualWord) {
    unusualWord.unusualBonus = true;
    unusualWord.points += 15;
  }
}

function bestFromFoundWords() {
  return foundWords.reduce((best, item) => {
    if (!best) return item;
    if (item.word.length > best.word.length) return item;
    if (item.word.length === best.word.length && item.rarity > best.rarity) return item;
    return best;
  }, null);
}

function chooseBetterBestWord(candidateWord, candidateLength) {
  const foundBest = bestFromFoundWords();
  if (!foundBest) {
    return candidateWord ? { word: candidateWord, length: candidateLength } : null;
  }

  if (!candidateWord || foundBest.word.length > candidateLength) {
    return { word: foundBest.word, length: foundBest.word.length };
  }

  if (foundBest.word.length === candidateLength && foundBest.rarity > rarityScore(candidateWord)) {
    return { word: foundBest.word, length: foundBest.word.length };
  }

  return { word: candidateWord, length: candidateLength };
}

async function validateWord(word) {
  const cacheKey = `${dictionaryCacheVersion}:${gameLanguage}:${word}`;
  if (dictionaryCache[cacheKey] !== undefined) {
    return dictionaryCache[cacheKey];
  }

  if (gameLanguage === "it") {
    try {
      const serverResult = await api("/api/validate-word", {
        method: "POST",
        body: JSON.stringify({
          word,
          language: gameLanguage
        })
      });
      dictionaryCache[cacheKey] = Boolean(serverResult.valid);
      localStorage.setItem("letterRunDictionaryCache", JSON.stringify(dictionaryCache));
      return dictionaryCache[cacheKey];
    } catch {
      const valid = await validateItalianWithWordList(word);
      dictionaryCache[cacheKey] = valid;
      localStorage.setItem("letterRunDictionaryCache", JSON.stringify(dictionaryCache));
      return valid;
    }
  }

  try {
    const candidates = gameLanguage === "it" ? italianDictionaryCandidates(word) : [word];
    let valid = false;

    for (const candidate of candidates) {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/${gameLanguage}/${encodeURIComponent(candidate)}`);
      if (response.ok) {
        valid = true;
        break;
      }
    }

    dictionaryCache[cacheKey] = valid;
    localStorage.setItem("letterRunDictionaryCache", JSON.stringify(dictionaryCache));
    return valid;
  } catch {
    throw new Error("Dictionary check needs an internet connection.");
  }
}

async function validateItalianWithWordList(word) {
  const cleanWord = cleanGuess(word);
  if (!browserWordSetCache.it) {
    try {
      const response = await fetchFirstDictionarySource([
        "data/italian-words.txt",
        "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/660000_parole_italiane.txt",
        "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/280000_parole_italiane.txt",
        "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/60000_parole_italiane.txt",
        "https://cdn.jsdelivr.net/npm/italian-words-dict@3.4.0/dist/words.json",
        "https://unpkg.com/italian-words-dict@3.4.0/dist/words.json"
      ]);
      const type = response.headers.get("content-type") || "";
      const source = type.includes("json") ? await response.json() : await response.text();
      browserWordSetCache.it = new Set(flattenWordSource(source).map(cleanGuess).filter(Boolean));
    } catch {
      browserWordSetCache.it = new Set();
    }
  }

  if (browserWordSetCache.it.has(cleanWord)) return true;
  return validateItalianWithWiktionarySection(cleanWord);
}

async function validateItalianWithWiktionarySection(word) {
  for (const candidate of italianDictionaryCandidates(word)) {
    const response = await fetch(`https://en.wiktionary.org/w/api.php?action=parse&format=json&origin=*&page=${encodeURIComponent(candidate)}&prop=sections`);
    if (!response.ok) continue;
    const data = await response.json();
    const sections = data.parse?.sections || [];
    if (sections.some((section) => section.line === "Italian")) return true;
  }
  return false;
}

function italianDictionaryCandidates(word) {
  const candidates = new Set([word]);
  const accents = {
    a: ["\u00e0"],
    e: ["\u00e8", "\u00e9"],
    i: ["\u00ec"],
    o: ["\u00f2"],
    u: ["\u00f9"]
  };
  const lastVowelIndex = Math.max(...Object.keys(accents).map((vowel) => word.lastIndexOf(vowel)));

  if (lastVowelIndex >= 0) {
    const letter = word[lastVowelIndex];
    accents[letter].forEach((accented) => {
      candidates.add(`${word.slice(0, lastVowelIndex)}${accented}${word.slice(lastVowelIndex + 1)}`);
    });
  }

  return Array.from(candidates);
}

async function fetchFirstDictionarySource(urls) {
  let lastError = new Error("Dictionary unavailable");
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Dictionary source failed");
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function flattenWordSource(source) {
  if (Array.isArray(source)) {
    return source.flatMap((item) => {
      if (typeof item === "string") return item;
      if (Array.isArray(item)) return flattenWordSource(item);
      if (item && typeof item === "object") return Object.values(item).flatMap(flattenWordSource);
      return [];
    });
  }

  if (source && typeof source === "object") {
    return Object.values(source).flatMap(flattenWordSource);
  }

  if (typeof source === "string") {
    return source.split(/\r?\n/);
  }

  return [];
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

function playCountdownSound(seconds) {
  const isFinal = seconds <= 0;
  playTone([{
    frequency: isFinal ? 220 : 880,
    delay: 0,
    duration: isFinal ? 0.22 : 0.075,
    volume: isFinal ? 0.18 : 0.12,
    type: isFinal ? "square" : "sine"
  }]);
}

function maybePlayCountdownSound() {
  if (gameState !== "playing") return;
  if (secondsLeft > 10 || secondsLeft < 0) return;
  if (lastCountdownBeepSecond === secondsLeft) return;
  lastCountdownBeepSecond = secondsLeft;
  playCountdownSound(secondsLeft);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function setPlayEnabled(enabled) {
  guessInput.disabled = !enabled;
  submitButton.disabled = !enabled;
  backButton.disabled = !enabled;
  shuffleButton.disabled = !enabled;
  clearButton.disabled = !enabled;
  letterTray.querySelectorAll("button").forEach((button) => {
    button.disabled = !enabled;
  });
}

function renderLetters() {
  const renderKey = `${letters.join("")}|${cleanGuess(guessInput.value)}|${gameState}`;
  if (renderKey === lastLetterRenderKey) return;
  const shouldAnimateTiles = !lastLetterRenderKey || !usesTouchLetterEntry();
  lastLetterRenderKey = renderKey;

  const typedCounts = countLetters(cleanGuess(guessInput.value));
  const usedCounts = {};
  letterTray.innerHTML = "";

  letters.forEach((letter) => {
    usedCounts[letter] = usedCounts[letter] || 0;
    const tile = document.createElement("button");
    tile.className = "letter-tile";
    if (!shouldAnimateTiles) tile.classList.add("no-enter-animation");
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
      const currentCounts = countLetters(cleanGuess(guessInput.value));
      const availableCounts = countLetters(letters.join(""));
      if ((currentCounts[letter] || 0) >= (availableCounts[letter] || 0)) return;
      guessInput.value = `${guessInput.value}${letter}`;
      focusGuessInput();
      renderLetters();
    });

    letterTray.appendChild(tile);
  });
}

function renderScore() {
  const longest = foundWords.reduce((best, item) => item.word.length > best.word.length ? item : best, { word: "-", rarity: 0 });
  const unusual = foundWords.reduce((best, item) => item.rarity > best.rarity ? item : best, { word: "-", rarity: 0 });

  timerValue.textContent = gameState === "setup" || gameState === "waiting" ? "-:--" : formatTime(secondsLeft);
  maybePlayCountdownSound();
  scoreValue.textContent = getCurrentScore();
  wordCountValue.textContent = getCurrentWordCount();
  letterCountValue.textContent = gameState === "setup" ? "-" : letterCount;
  languageValue.textContent = gameState === "setup" ? "-" : languageNames[gameLanguage];
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
    .filter((entry) => entry.seconds === selectedLeaderboardDuration && (entry.language || "en") === gameLanguage)
    .sort((a, b) => b.score - a.score || b.words - a.words || a.seconds - b.seconds || b.createdAt - a.createdAt);
  const hasEntries = entries.length > 0;
  leaderboardScope.textContent = `${languageNames[gameLanguage]} ${selectedLeaderboardDuration / 60} min runs`;
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

function sortLeaderboardEntries(entries) {
  return entries
    .filter((entry) => entry && entry.name)
    .sort((a, b) => b.score - a.score || b.words - a.words || a.seconds - b.seconds || b.createdAt - a.createdAt);
}

function saveLocalLeaderboard() {
  localStorage.setItem(leaderboardKey, JSON.stringify(sortLeaderboardEntries(leaderboard)));
}

async function loadSharedLeaderboard() {
  try {
    const result = await api("/api/leaderboard");
    leaderboard = sortLeaderboardEntries(result.entries || []);
    saveLocalLeaderboard();
    renderLeaderboard();
  } catch {
    leaderboard = sortLeaderboardEntries(leaderboard);
    renderLeaderboard();
  }
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
    const statusLabels = {
      waiting: "Waiting",
      ready: "Ready",
      playing: "Playing",
      done: "Timer ended"
    };
    const status = gameState === "finished" ? "Final" : statusLabels[player.status] || "Waiting";
    score.textContent = `${player.score} points, ${player.words} words · ${status}`;
    const list = document.createElement("ul");
    list.className = "online-word-list";

    if (gameState === "playing" || gameState === "waiting" || gameState === "countdown" || gameState === "ready" || gameState === "waiting-results") {
      const item = document.createElement("li");
      item.textContent = "Words hidden until time is up";
      item.className = "empty-online-word";
      list.appendChild(item);
    } else {
      (player.foundWords || []).slice().reverse().forEach((word) => {
        const item = document.createElement("li");
        item.textContent = word;
        list.appendChild(item);
      });

      if (!list.children.length) {
        const item = document.createElement("li");
        item.textContent = "No words found";
        item.className = "empty-online-word";
        list.appendChild(item);
      }
    }

    card.append(name, score, list);
    onlineScoreboard.appendChild(card);
  });
}

function renderFinalPlayerRecap() {
  finalPlayerRecap.innerHTML = "";
  finalPlayerRecap.hidden = !onlineRoom || gameState !== "finished";
  if (finalPlayerRecap.hidden) return;

  const rankedPlayers = onlinePlayers
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.words || 0) - (a.words || 0) || a.name.localeCompare(b.name));

  let previousScore = null;
  let previousRank = 0;
  rankedPlayers.forEach((player, index) => {
    const rank = player.score === previousScore ? previousRank : index + 1;
    previousScore = player.score;
    previousRank = rank;

    const words = player.foundWords || [];
    const longest = words.reduce((best, word) => word.length > best.length ? word : best, "-");
    const row = document.createElement("div");
    row.className = "final-player-row";
    if (rank === 1) row.classList.add("winner-row");

    const name = document.createElement("strong");
    name.textContent = `#${rank} ${player.name}`;
    const details = document.createElement("span");
    const roomBonus = player.roomLongestBonus ? ", +15 room longest" : "";
    details.textContent = `${player.score} points, ${player.words} words, longest: ${longest}${roomBonus}`;

    row.append(name, details);
    finalPlayerRecap.appendChild(row);
  });
}

function renderWinnerBanner() {
  winnerBanner.hidden = true;
  winnerBanner.textContent = "";
  if (!onlineRoom || gameState !== "finished" || onlinePlayers.length < 2) return;

  const bestScore = Math.max(...onlinePlayers.map((player) => player.score || 0));
  const winners = onlinePlayers.filter((player) => (player.score || 0) === bestScore);
  if (!winners.length) return;

  const names = winners.map((player) => player.name).join(", ");
  winnerBanner.hidden = false;
  winnerBanner.textContent = winners.length === 1
    ? `Winner: ${names}`
    : `Winners: ${names}`;
}

function renderPlayAgainRequest() {
  const showRequest = Boolean(onlineRoom && gameState === "finished");
  playAgainStatus.hidden = !showRequest;
  playAgainRequestButton.hidden = !showRequest;
  if (!showRequest) return;

  playAgainStatus.textContent = `${playAgainState.count || 0}/2 players ready for rematch.`;
  playAgainRequestButton.disabled = Boolean(playAgainState.requested);
  playAgainRequestButton.textContent = playAgainState.requested ? "Requested" : "Play Again";
}

function tag(text, isGold = false) {
  const item = document.createElement("span");
  item.className = isGold ? "tag gold" : "tag";
  item.textContent = text;
  return item;
}

function render() {
  setupForm.classList.toggle("hidden", ["playing", "countdown", "ready", "waiting-results"].includes(gameState));
  timeUpBanner.hidden = gameState !== "finished" || timeUpDismissed;
  startCountdownBanner.hidden = !startCountdownMessage;
  startCountdownText.textContent = startCountdownMessage;
  recordBadge.hidden = !currentRunIsRecord;
  timeUpSummary.textContent = `${playerName} scored ${getCurrentScore()} points with ${getCurrentWordCount()} words.`;
  bestPossibleWord.textContent = bestPossibleText;
  letterTray.style.setProperty("--letter-count", letterCount || 9);
  renderLetters();
  renderScore();
  renderWords();
  renderLeaderboard();
  renderOnlineScoreboard();
  renderWinnerBanner();
  renderFinalPlayerRecap();
  renderPlayAgainRequest();
  updatePlayerCountBadge();
  updateOnlineStartPanel();
  setPlayEnabled(gameState === "playing");
}

function getSelectedDuration() {
  const selectedDuration = setupForm.querySelector("input[name='duration']:checked");
  return Number(selectedDuration.value);
}

function getSelectedLanguage() {
  const selectedLanguage = setupForm.querySelector("input[name='language']:checked");
  return selectedLanguage ? selectedLanguage.value : "en";
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
      setMessage("The dictionary did not recognize that one.", "bad");
      renderLetters();
      return;
    }

    const rarity = rarityScore(word);
    const points = scoreWord(word);

    const foundItem = {
      word,
      rarity,
      points,
      basePoints: points,
      longestBonus: false,
      unusualBonus: false,
      createdAt: Date.now()
    };

    const onlineRoomState = onlineRoom ? await submitOnlineWord(word, points) : null;

    foundWords.push(foundItem);
    guessInput.value = "";
    playCorrectSound();
    flashGameFeedback("good");
    setMessage(`Accepted: ${word} scored ${points} points. Bonuses are awarded at the end.`, "good");
    if (onlineRoomState) {
      applyRoomState(onlineRoomState);
    } else {
      render();
    }
  } catch (error) {
    setMessage(error.message, "bad");
  } finally {
    if (gameState === "playing") {
      submitButton.disabled = false;
      focusGuessInput();
    }
  }
}

async function submitOnlineWord(word, points) {
  try {
    const room = await api(`/api/rooms/${onlineRoom.code}/word`, {
      method: "POST",
      body: JSON.stringify({
        playerId: onlineRoom.playerId,
        word,
        points
      })
    });
    return room;
  } catch (error) {
    setMessage(error.message, "bad");
    throw error;
  }
}

async function submitOnlineFinalScore() {
  if (!onlineRoom) return;
  try {
    const room = await api(`/api/rooms/${onlineRoom.code}/finish`, {
      method: "POST",
      body: JSON.stringify({
        playerId: onlineRoom.playerId,
        score: getTotalScore(),
        words: foundWords.length
      })
    });
    onlinePlayers = room.players;
    await loadSharedLeaderboard();
  } catch {
    // Final local score still saves even if the room has already closed.
  }
}

async function saveLeaderboardEntry() {
  if (hasSavedCurrentRun) return;
  hasSavedCurrentRun = true;
  if (onlineRoom) return;

  const entry = {
    id: currentRunId || `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    name: playerName,
    score: getTotalScore(),
    words: foundWords.length,
    seconds: runLength,
    letters: letterCount,
    language: gameLanguage,
    mode: onlineRoom ? "online" : "solo",
    createdAt: Date.now()
  };

  leaderboard = sortLeaderboardEntries([...leaderboard.filter((item) => item.id !== entry.id), entry]);
  saveLocalLeaderboard();
  renderLeaderboard();

  try {
    const result = await api("/api/leaderboard", {
      method: "POST",
      body: JSON.stringify(entry)
    });
    leaderboard = sortLeaderboardEntries(result.entries || leaderboard);
    saveLocalLeaderboard();
    renderLeaderboard();
  } catch {
    // Local storage remains as a fallback when the server is not available.
  }
}

function isNewRecord() {
  const previousBest = leaderboard
    .filter((entry) => entry.seconds === runLength && (entry.language || "en") === gameLanguage)
    .reduce((best, entry) => Math.max(best, entry.score), -1);
  return getCurrentScore() > previousBest;
}

async function findBestPossibleWord() {
  const snapshotLetters = [...letters];
  const available = countLetters(snapshotLetters.join(""));
  const maxLength = snapshotLetters.length;
  bestPossibleText = "Best possible word: checking...";
  render();

  try {
    const serverBest = await api("/api/best-word", {
      method: "POST",
      body: JSON.stringify({
        letters: snapshotLetters,
        language: gameLanguage,
        foundWords: foundWords.map((item) => item.word)
      })
    });
    const bestChoice = chooseBetterBestWord(serverBest.word, serverBest.length);
    bestPossibleText = bestChoice
      ? `Best possible word: ${bestChoice.word} (${bestChoice.length} letters)`
      : "Best possible word: none found";
  } catch {
    try {
      const response = await fetchFirstDictionarySource(gameLanguage === "it"
        ? [
          "https://cdn.jsdelivr.net/npm/italian-words-dict@3.4.0/dist/words.json",
          "https://unpkg.com/italian-words-dict@3.4.0/dist/words.json"
        ]
        : [
          "https://cdn.jsdelivr.net/gh/dwyl/english-words@master/words_alpha.txt",
          "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"
        ]);
      const source = gameLanguage === "it" ? await response.json() : await response.text();
      const words = flattenWordSource(source);
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

    const bestChoice = chooseBetterBestWord(best, best.length);
    bestPossibleText = bestChoice
      ? `Best possible word: ${bestChoice.word} (${bestChoice.length} letters)`
      : "Best possible word: none found";
    } catch {
      const longestFound = foundWords.reduce((best, item) => item.word.length > best.length ? item.word : best, "");
      bestPossibleText = longestFound
        ? `Best possible word: unavailable offline. Longest found: ${longestFound}`
        : "Best possible word: unavailable offline";
    }
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
  applyEndRunBonuses();
  currentRunIsRecord = isNewRecord();
  bestPossibleText = "Best possible word: checking...";
  saveLeaderboardEntry();
  setMessage(`Time. ${playerName} scored ${getTotalScore()} points with ${foundWords.length} words.`, "good");
  render();
  findBestPossibleWord();
  focusPlayerNameInput();
}

async function endOnlineRun(room = null) {
  if (gameState === "finished") return;

  if (room) {
    onlinePlayers = room.players;
  }
  gameState = "finished";
  secondsLeft = 0;
  timeUpDismissed = false;
  applyEndRunBonuses();
  await submitOnlineFinalScore();
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
    focusPlayerNameInput();
    return;
  }

  runLength = getSelectedDuration();
  gameLanguage = getSelectedLanguage();
  selectedLeaderboardDuration = runLength;
  letterCount = cleanLetterCount(letterCountInput.value);
  letterCountInput.value = letterCount;
  secondsLeft = runLength;
  letters = generateLetters(letterCount, gameLanguage);
  lastLetterRenderKey = "";
  foundWords = [];
  hasSavedCurrentRun = false;
  currentRunId = `solo:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  currentRunIsRecord = false;
  bestPossibleText = "";
  timeUpDismissed = false;
  lastCountdownBeepSecond = null;
  guessInput.value = "";
  gameState = "playing";
  setMessage(`${playerName}, your ${languageNames[gameLanguage]} ${runLength / 60} minute run is live with ${letterCount} letters.`, "good");
  render();
  startTimer();
  focusGuessInput();
}

function applyRoomState(room) {
  const incomingLetters = room.letters.join("");
  const currentLetters = letters.join("");
  const previousState = gameState;
  const wasCountdown = previousState === "countdown";
  runLength = room.runLength;
  letterCount = room.letterCount;
  gameLanguage = room.language || "en";
  letters = room.letters;
  if (incomingLetters !== currentLetters) {
    lastLetterRenderKey = "";
  }
  secondsLeft = room.secondsLeft;
  onlinePlayers = room.players;
  playAgainState = room.playAgain || { count: 0, total: onlinePlayers.length, requested: false };
  selectedLeaderboardDuration = runLength;

  const currentPlayer = getCurrentOnlinePlayer();
  if (room.runNumber && room.runNumber !== onlineRunNumber) {
    onlineRunNumber = room.runNumber;
    foundWords = [];
    hasSavedCurrentRun = false;
    currentRunId = `${room.code}:${onlineRoom.playerId}:${room.runNumber}`;
    currentRunIsRecord = false;
    bestPossibleText = "";
    timeUpDismissed = false;
    lastCountdownBeepSecond = null;
    guessInput.value = "";
  }

  if (currentPlayer) {
    scoreValue.textContent = currentPlayer.score;
  }

  if (room.state === "waiting") {
    gameState = "waiting";
    startCountdownMessage = "";
    render();
    return;
  }

  if (room.state === "countdown") {
    gameState = "countdown";
    const countdownLeft = Math.max(1, room.countdownLeft || 1);
    startCountdownMessage = `Room opens in ${countdownLeft}`;
    setMessage(startCountdownMessage, "good");
    render();
    return;
  }

  if (room.state === "ready" || room.state === "playing") {
    const playerStatus = currentPlayer ? currentPlayer.status : room.playerStatus;
    if (playerStatus === "playing") {
      gameState = "playing";
      if (previousState !== "playing") {
        startCountdownMessage = wasCountdown || previousState === "ready" ? "GO!" : "";
        clearTimeout(startCountdownClearTimer);
        startCountdownClearTimer = setTimeout(() => {
          if (gameState === "playing") {
            startCountdownMessage = "";
            render();
          }
        }, 800);
        setMessage(`Your ${languageNames[gameLanguage]} timer is running.`, "good");
      }
    } else if (playerStatus === "done") {
      gameState = "waiting-results";
      secondsLeft = 0;
      startCountdownMessage = "";
      if (previousState !== "waiting-results") {
        setMessage("Your timer is done. Waiting for the other players to finish.", "good");
      }
    } else {
      gameState = "ready";
      startCountdownMessage = "";
      if (previousState !== "ready") {
        setMessage("The room is ready. Tap Start My Timer when you are ready.", "good");
      }
    }
    render();
    return;
  }

  if (room.state === "finished") {
    if (previousState !== "finished") {
      endOnlineRun(room);
      return;
    }
    gameState = "finished";
    render();
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
  }, 500);
}

async function createOnlineRoom() {
  unlockAudio();
  playerName = cleanName(playerNameInput.value);
  if (!playerName) {
    setMessage("Enter your name before creating a room.", "bad");
    focusPlayerNameInput();
    return;
  }

  runLength = getSelectedDuration();
  gameLanguage = getSelectedLanguage();
  letterCount = cleanLetterCount(letterCountInput.value);
  const room = await api("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: playerName,
      runLength,
      letterCount,
      language: gameLanguage
    })
  });

  onlineRoom = { code: room.code, playerId: room.playerId, isHost: true };
  playAgainState = room.playAgain || { count: 0, total: 1, requested: false };
  currentRunId = `${room.code}:${room.playerId}`;
  foundWords = [];
  onlineRunNumber = room.runNumber || 0;
  hasSavedCurrentRun = false;
  currentRunIsRecord = false;
  bestPossibleText = "";
  timeUpDismissed = false;
  lastCountdownBeepSecond = null;
  roomStatus.textContent = `Room ${room.code} ready. Share this code. Up to ${maxOnlinePlayers} players can join.`;
  showInviteLink(room.code);
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
  playAgainState = room.playAgain || { count: 0, total: room.players.length, requested: false };
  currentRunId = `${room.code}:${room.playerId}`;
  foundWords = [];
  onlineRunNumber = room.runNumber || 0;
  hasSavedCurrentRun = false;
  currentRunIsRecord = false;
  bestPossibleText = "";
  timeUpDismissed = false;
  lastCountdownBeepSecond = null;
  roomStatus.textContent = `Joined room ${room.code}. Waiting for the host to start.`;
  inviteBox.hidden = true;
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
  roomStatus.textContent = `Room ${room.code} is opening. Each player will start their own timer.`;
  startRoomButton.hidden = true;
  applyRoomState(room);
}

async function startOwnOnlineTimer() {
  if (!onlineRoom) return;
  const room = await api(`/api/rooms/${onlineRoom.code}/begin`, {
    method: "POST",
    body: JSON.stringify({ playerId: onlineRoom.playerId })
  });
  roomStatus.textContent = `Your timer is running in room ${room.code}.`;
  applyRoomState(room);
  focusGuessInput();
}

async function requestOnlinePlayAgain() {
  if (!onlineRoom || gameState !== "finished") return;
  const room = await api(`/api/rooms/${onlineRoom.code}/play-again`, {
    method: "POST",
    body: JSON.stringify({ playerId: onlineRoom.playerId })
  });
  roomStatus.textContent = room.state === "ready" || room.state === "playing" || room.state === "countdown"
    ? `Room ${room.code} is opening again.`
    : `${room.playAgain.count}/2 players ready for rematch.`;
  applyRoomState(room);
}

function resetToSetup() {
  clearInterval(timerId);
  timerId = null;
  gameState = "setup";
  onlineRoom = null;
  onlinePlayers = [];
  playAgainState = { count: 0, total: 0, requested: false };
  onlineRunNumber = 0;
  letters = [];
  lastLetterRenderKey = "";
  foundWords = [];
  currentRunId = "";
  gameLanguage = getSelectedLanguage();
  letterCount = cleanLetterCount(letterCountInput.value);
  letterCountInput.value = letterCount;
  currentRunIsRecord = false;
  bestPossibleText = "";
  startCountdownMessage = "";
  timeUpDismissed = false;
  lastCountdownBeepSecond = null;
  secondsLeft = 0;
  guessInput.value = "";
  setMessage("Enter your name, choose a run length, and start.");
  roomStatus.textContent = "Online rooms need the game server running.";
  playerCountBadge.hidden = true;
  inviteBox.hidden = true;
  inviteLinkInput.value = "";
  startRoomButton.hidden = true;
  render();
  focusPlayerNameInput();
}

setupForm.addEventListener("submit", startRun);
setupForm.addEventListener("change", () => {
  updateLetterCount(letterCountInput.value);
  selectedLeaderboardDuration = getSelectedDuration();
  gameLanguage = getSelectedLanguage();
  render();
});
letterCountMinus.addEventListener("click", () => {
  updateLetterCount(Number(letterCountInput.value) - 1);
});
letterCountPlus.addEventListener("click", () => {
  updateLetterCount(Number(letterCountInput.value) + 1);
});
letterCountInput.addEventListener("blur", () => {
  updateLetterCount(letterCountInput.value);
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
startPlayerButton.addEventListener("click", () => {
  startOwnOnlineTimer().catch((error) => setMessage(error.message, "bad"));
});
playAgainRequestButton.addEventListener("click", () => {
  requestOnlinePlayAgain().catch((error) => setMessage(error.message, "bad"));
});
copyInviteButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(inviteLinkInput.value);
    roomStatus.textContent = "Invite link copied.";
  } catch {
    inviteLinkInput.select();
    roomStatus.textContent = "Invite link selected.";
  }
});
shareInviteButton.addEventListener("click", async () => {
  const url = inviteLinkInput.value;
  const text = onlineRoom ? `Join my Letter Run room ${onlineRoom.code}` : "Join my Letter Run room";

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Letter Run",
        text,
        url
      });
      roomStatus.textContent = "Invite shared.";
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    roomStatus.textContent = "Sharing is not available here, so the invite link was copied.";
  } catch {
    inviteLinkInput.select();
    roomStatus.textContent = "Sharing is not available here, so the invite link was selected.";
  }
});
leaderboardTabs.forEach((button) => {
  button.addEventListener("click", () => {
    selectedLeaderboardDuration = Number(button.dataset.leaderboardDuration);
    renderLeaderboard();
  });
});
guessForm.addEventListener("submit", submitGuess);
guessInput.addEventListener("input", renderLetters);
guessInput.addEventListener("focus", () => {
  if (usesTouchLetterEntry()) {
    guessInput.blur();
  }
});
backButton.addEventListener("click", () => {
  if (gameState !== "playing" || !usesTouchLetterEntry()) return;
  guessInput.value = cleanGuess(guessInput.value).slice(0, -1);
  setMessage(guessInput.value ? "Last letter removed." : "Cleared.");
  lastLetterRenderKey = "";
  renderLetters();
});
shuffleButton.addEventListener("click", () => {
  if (gameState !== "playing") return;
  letters = shuffle(letters);
  lastLetterRenderKey = "";
  renderLetters();
  focusGuessInput();
});
clearButton.addEventListener("click", () => {
  guessInput.value = "";
  setMessage("Cleared.");
  lastLetterRenderKey = "";
  renderLetters();
  focusGuessInput();
});
newRoundButton.addEventListener("click", resetToSetup);
howToPlayButton.addEventListener("click", openRules);
closeRulesButton.addEventListener("click", closeRules);
howToPlayModal.addEventListener("click", (event) => {
  if (event.target === howToPlayModal) {
    closeRules();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !howToPlayModal.hidden) {
    closeRules();
  }
});
viewScoresButton.addEventListener("click", () => {
  timeUpDismissed = true;
  render();
  requestAnimationFrame(() => {
    leaderboardPanel.classList.add("score-focus");
    leaderboardPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => leaderboardPanel.classList.remove("score-focus"), 1600);
  });
});
playAgainButton.addEventListener("click", resetToSetup);

const initialRoomCode = new URLSearchParams(window.location.search).get("room");
updateGuessInputMode();
if (touchLetterMedia.addEventListener) {
  touchLetterMedia.addEventListener("change", updateGuessInputMode);
} else {
  touchLetterMedia.addListener(updateGuessInputMode);
}
resetToSetup();
loadSharedLeaderboard();
registerVisitor();
if (initialRoomCode) {
  roomCodeInput.value = initialRoomCode.toUpperCase();
}
