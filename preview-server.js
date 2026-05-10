const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT || 8123);
const host = process.env.HOST || "0.0.0.0";
const root = __dirname;
const rooms = new Map();
const wordListCache = new Map();
const wordSetCache = new Map();
const maxPlayersPerRoom = 4;
const startCountdownSeconds = 5;
const leaderboardPath = path.join(root, "data", "leaderboard.json");
const visitorsPath = path.join(root, "data", "visitors.json");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
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

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateLetters(count, language = "en") {
  const pool = letterPools[language] || letterPools.en;
  const set = [];
  const vowelCount = pool.vowelPlan[count] || Math.max(1, Math.round(count * 0.36));
  const rareCount = count >= 7 && Math.random() < 0.55 ? 1 : 0;

  while (set.length < vowelCount) set.push(pick(pool.vowels));
  while (set.length < vowelCount + rareCount) set.push(pick(pool.rareLetters));
  while (set.length < count) {
    set.push(pick(pool.commonConsonants));
  }
  return shuffle(set);
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function cleanLetterCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 9;
  return Math.min(10, Math.max(3, Math.round(count)));
}

function cleanRunLength(value) {
  const length = Number(value);
  return [60, 120, 180].includes(length) ? length : 60;
}

function cleanLanguage(value) {
  return value === "it" ? "it" : "en";
}

function cleanScore(value) {
  const score = Math.round(Number(value) || 0);
  return Math.max(0, score);
}

function cleanGuess(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function countLetters(value) {
  return [...value].reduce((counts, letter) => {
    counts[letter] = (counts[letter] || 0) + 1;
    return counts;
  }, {});
}

function canBuildFromCounts(word, available) {
  const needed = countLetters(word);
  return Object.entries(needed).every(([letter, count]) => available[letter] >= count);
}

function rarityScore(word) {
  const values = {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5,
    l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4,
    w: 4, x: 8, y: 4, z: 10
  };
  const uniqueLetters = new Set(word).size;
  return [...word].reduce((sum, letter) => sum + (values[letter] || 0), 0) + Math.max(0, uniqueLetters - 4) * 2;
}

async function fetchFirstAvailable(urls) {
  let lastError = new Error("No dictionary source available.");
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Dictionary source failed: ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function flattenWords(source) {
  if (Array.isArray(source)) {
    return source.flatMap((item) => {
      if (typeof item === "string") return item;
      if (Array.isArray(item)) return flattenWords(item);
      if (item && typeof item === "object") return Object.values(item).flatMap(flattenWords);
      return [];
    });
  }

  if (source && typeof source === "object") {
    return Object.values(source).flatMap(flattenWords);
  }

  if (typeof source === "string") {
    return source.split(/\r?\n/);
  }

  return [];
}

async function getWordList(language) {
  if (wordListCache.has(language)) return wordListCache.get(language);

  if (language === "it") {
    const localItalianPath = path.join(root, "data", "italian-words.txt");
    if (fs.existsSync(localItalianPath)) {
      const words = fs.readFileSync(localItalianPath, "utf8").split(/\r?\n/).map(cleanGuess).filter(Boolean);
      wordListCache.set(language, words);
      return words;
    }
  }

  try {
    if (language === "it") {
      let italianWords;
      try {
        italianWords = require("italian-words-dict/dist/words.json");
      } catch {
        italianWords = require("an-array-of-italian-words");
      }
      const words = flattenWords(italianWords).map(cleanGuess).filter(Boolean);
      wordListCache.set(language, words);
      return words;
    }

    const wordListPath = require("word-list");
    const words = fs.readFileSync(wordListPath, "utf8").split(/\r?\n/).map(cleanGuess).filter(Boolean);
    wordListCache.set(language, words);
    return words;
  } catch {
    // Hosted installs use local packages; direct file use can still fall back to CDNs.
  }

  const response = await fetchFirstAvailable(language === "it"
    ? [
      "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/660000_parole_italiane.txt",
      "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/280000_parole_italiane.txt",
      "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/60000_parole_italiane.txt",
      "https://cdn.jsdelivr.net/npm/italian-words-dict@3.4.0/dist/words.json",
      "https://unpkg.com/italian-words-dict@3.4.0/dist/words.json"
    ]
    : [
      "https://cdn.jsdelivr.net/gh/dwyl/english-words@master/words_alpha.txt",
      "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"
    ]);
  const type = response.headers.get("content-type") || "";
  const source = type.includes("json") ? await response.json() : await response.text();
  const words = flattenWords(source).map(cleanGuess).filter(Boolean);
  wordListCache.set(language, words);
  return words;
}

async function isValidDictionaryWord(word, language) {
  const cleanWord = cleanGuess(word);
  if (cleanWord.length < 2) return false;

  if (!wordSetCache.has(language)) {
    let words = [];
    try {
      words = await getWordList(language);
    } catch {
      words = [];
    }
    wordSetCache.set(language, new Set(words));
  }

  if (wordSetCache.get(language).has(cleanWord)) return true;
  if (language === "it") return validateItalianWithWiktionarySection(cleanWord);
  return false;
}

function italianAccentCandidates(word) {
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

async function validateItalianWithWiktionarySection(word) {
  for (const candidate of italianAccentCandidates(word)) {
    try {
      const response = await fetch(`https://en.wiktionary.org/w/api.php?action=parse&format=json&origin=*&page=${encodeURIComponent(candidate)}&prop=sections`);
      if (!response.ok) continue;
      const data = await response.json();
      const sections = data.parse?.sections || [];
      if (sections.some((section) => section.line === "Italian")) return true;
    } catch {
      // Try the next candidate.
    }
  }
  return false;
}

async function findBestPossibleWord(letters, language, foundWords = []) {
  let words = [];
  try {
    words = await getWordList(language);
  } catch {
    words = [];
  }
  const available = countLetters(letters.join(""));
  const maxLength = letters.length;
  let best = "";
  let bestRarity = -1;

  [...words, ...foundWords.map(cleanGuess)].forEach((word) => {
    if (word.length < 2 || word.length > maxLength || word.length < best.length) return;
    if (!canBuildFromCounts(word, available)) return;

    const rarity = rarityScore(word);
    if (word.length > best.length || rarity > bestRarity) {
      best = word;
      bestRarity = rarity;
    }
  });

  return best ? { word: best, length: best.length } : { word: "", length: 0 };
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function publicRoom(room, playerId) {
  updateRoomClock(room);
  const currentPlayer = room.players.find((player) => player.id === playerId);
  const playerStatus = currentPlayer ? currentPlayer.status || "waiting" : "waiting";
  const canSeeLetters = room.state === "finished" || playerStatus === "playing" || playerStatus === "done";
  return {
    code: room.code,
    playerId,
    state: room.state,
    runNumber: room.runNumber || 0,
    runLength: room.runLength,
    letterCount: room.letterCount,
    language: room.language,
    letters: canSeeLetters ? room.letters : [],
    secondsLeft: currentPlayer ? currentPlayer.secondsLeft || 0 : room.secondsLeft,
    endsAt: currentPlayer ? currentPlayer.endsAt || 0 : room.endsAt,
    playerStatus,
    serverNow: Date.now(),
    countdownLeft: room.state === "countdown" ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000)) : 0,
    playAgain: {
      count: room.playAgainRequests ? room.playAgainRequests.size : 0,
      total: room.players.length,
      requested: room.playAgainRequests ? room.playAgainRequests.has(playerId) : false
    },
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      words: player.words,
      status: player.status || "waiting",
      secondsLeft: player.secondsLeft || 0,
      roomLongestBonus: Boolean(player.roomLongestBonus),
      roomLongestWord: player.roomLongestWord || "",
      foundWords: Array.from(player.wordSet)
    }))
  };
}

function updateRoomClock(room) {
  if (room.state === "countdown") {
    const countdownLeft = Math.ceil((room.countdownEndsAt - Date.now()) / 1000);
    if (countdownLeft <= 0) {
      startRoomRun(room);
    }
    return;
  }

  if (room.state !== "ready" && room.state !== "playing") return;

  const now = Date.now();
  room.players.forEach((player) => {
    if (player.status === "playing") {
      player.secondsLeft = Math.max(0, Math.ceil((player.endsAt - now) / 1000));
      if (player.secondsLeft <= 0) {
        player.status = "done";
        player.secondsLeft = 0;
      }
    } else if (player.status === "ready") {
      player.secondsLeft = room.runLength;
    } else if (player.status === "done") {
      player.secondsLeft = 0;
    }
  });

  const hasPlaying = room.players.some((player) => player.status === "playing");
  const hasStarted = room.players.some((player) => player.status === "playing" || player.status === "done");
  const allDone = room.players.length > 0 && room.players.every((player) => player.status === "done");

  room.state = hasPlaying || hasStarted ? "playing" : "ready";
  room.secondsLeft = hasPlaying
    ? Math.max(...room.players.filter((player) => player.status === "playing").map((player) => player.secondsLeft))
    : room.runLength;

  if (allDone) {
    room.state = "finished";
    finalizeRoomScores(room);
  }
}

function finalizeRoomScores(room) {
  if (room.finalized) return;
  room.finalized = true;
  let roomLongestLength = 0;

  room.players.forEach((player) => {
    const entries = player.wordEntries || [];
    entries.forEach((entry) => {
      entry.longestBonus = false;
      entry.unusualBonus = false;
      entry.roomLongestBonus = false;
      entry.points = entry.basePoints;
    });

    let longest = null;
    let unusual = null;
    entries.forEach((entry) => {
      if (!longest || entry.word.length > longest.word.length) longest = entry;
      if (!unusual || entry.rarity > unusual.rarity) unusual = entry;
    });

    if (longest) {
      longest.longestBonus = true;
      longest.points += 15;
    }
    if (unusual) {
      unusual.unusualBonus = true;
      unusual.points += 15;
    }

    player.roomLongestWord = longest ? longest.word : "";
    if (longest) {
      roomLongestLength = Math.max(roomLongestLength, longest.word.length);
    }
  });

  room.players.forEach((player) => {
    const entries = player.wordEntries || [];
    entries
      .filter((entry) => roomLongestLength > 0 && entry.word.length === roomLongestLength)
      .forEach((entry) => {
        entry.roomLongestBonus = true;
        entry.points += 15;
      });
    player.score = entries.reduce((sum, entry) => sum + entry.points, 0);
    player.words = entries.length;
    player.roomLongestBonus = entries.some((entry) => entry.roomLongestBonus);
  });

  saveRoomLeaderboardEntries(room);
}

function chooseRoomPlayers(room, playerIds = null) {
  if (playerIds) {
    const nextPlayers = room.players.filter((player) => playerIds.has(player.id));
    if (nextPlayers.length >= 2) {
      room.players = nextPlayers;
      if (!room.players.some((player) => player.id === room.hostId)) {
        room.hostId = room.players[0].id;
      }
    }
  }
}

function startRoomCountdown(room, playerIds = null) {
  chooseRoomPlayers(room, playerIds);
  room.state = "countdown";
  room.letters = [];
  room.secondsLeft = room.runLength;
  room.countdownEndsAt = Date.now() + startCountdownSeconds * 1000;
}

function startRoomRun(room) {
  room.state = "ready";
  room.finalized = false;
  room.runNumber = (room.runNumber || 0) + 1;
  room.letters = generateLetters(room.letterCount, room.language);
  room.secondsLeft = room.runLength;
  room.endsAt = 0;
  room.playAgainRequests = new Set();
  room.players.forEach((player) => {
    player.score = 0;
    player.words = 0;
    player.roomLongestBonus = false;
    player.roomLongestWord = "";
    player.wordSet = new Set();
    player.wordEntries = [];
    player.status = "ready";
    player.startedAt = 0;
    player.endsAt = 0;
    player.secondsLeft = room.runLength;
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function readLeaderboard() {
  try {
    if (!fs.existsSync(leaderboardPath)) return [];
    const entries = JSON.parse(fs.readFileSync(leaderboardPath, "utf8"));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function sortLeaderboard(entries) {
  return entries
    .filter((entry) => entry && entry.name)
    .sort((a, b) => b.score - a.score || b.words - a.words || a.seconds - b.seconds || b.createdAt - a.createdAt);
}

function writeLeaderboard(entries) {
  fs.mkdirSync(path.dirname(leaderboardPath), { recursive: true });
  fs.writeFileSync(leaderboardPath, `${JSON.stringify(sortLeaderboard(entries), null, 2)}\n`, "utf8");
}

function saveLeaderboardEntry(entry) {
  const cleaned = {
    id: String(entry.id || crypto.randomUUID()),
    name: cleanName(entry.name) || "Player",
    score: cleanScore(entry.score),
    words: cleanScore(entry.words),
    seconds: cleanRunLength(entry.seconds),
    letters: cleanLetterCount(entry.letters),
    language: cleanLanguage(entry.language),
    mode: entry.mode === "online" ? "online" : "solo",
    createdAt: Math.max(0, Math.round(Number(entry.createdAt) || Date.now()))
  };
  const entries = readLeaderboard().filter((item) => item.id !== cleaned.id);
  entries.push(cleaned);
  writeLeaderboard(entries);
  return cleaned;
}

function saveRoomLeaderboardEntries(room) {
  room.players.forEach((player) => {
    saveLeaderboardEntry({
      id: `${room.code}:${room.runNumber || 1}:${player.id}`,
      name: player.name,
      score: player.score,
      words: player.words,
      seconds: room.runLength,
      letters: room.letterCount,
      language: room.language,
      mode: "online",
      createdAt: Date.now()
    });
  });
}

function readVisitors() {
  try {
    if (!fs.existsSync(visitorsPath)) return { totalVisits: 0, visitors: {} };
    const data = JSON.parse(fs.readFileSync(visitorsPath, "utf8"));
    return {
      totalVisits: cleanScore(data.totalVisits),
      visitors: data.visitors && typeof data.visitors === "object" ? data.visitors : {}
    };
  } catch {
    return { totalVisits: 0, visitors: {} };
  }
}

function writeVisitors(data) {
  fs.mkdirSync(path.dirname(visitorsPath), { recursive: true });
  fs.writeFileSync(visitorsPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function cleanVisitorId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9:-]/g, "").slice(0, 80) || crypto.randomUUID();
}

function getVisitorStats() {
  const data = readVisitors();
  return {
    uniqueVisitors: Object.keys(data.visitors).length,
    totalVisits: data.totalVisits
  };
}

function registerVisitor(visitorId) {
  const data = readVisitors();
  const id = cleanVisitorId(visitorId);
  const now = Date.now();
  const existing = data.visitors[id] || { firstSeen: now, visits: 0 };
  data.visitors[id] = {
    firstSeen: existing.firstSeen || now,
    lastSeen: now,
    visits: cleanScore(existing.visits) + 1
  };
  data.totalVisits = cleanScore(data.totalVisits) + 1;
  writeVisitors(data);
  return getVisitorStats();
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100000) request.destroy();
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function handleApi(request, response, pathname) {
  try {
    if (request.method === "GET" && pathname === "/api/leaderboard") {
      return sendJson(response, 200, { entries: sortLeaderboard(readLeaderboard()) });
    }

    if (request.method === "POST" && pathname === "/api/leaderboard") {
      const body = await readBody(request);
      saveLeaderboardEntry(body);
      return sendJson(response, 200, { entries: sortLeaderboard(readLeaderboard()) });
    }

    if (request.method === "GET" && pathname === "/api/visitors") {
      return sendJson(response, 200, getVisitorStats());
    }

    if (request.method === "POST" && pathname === "/api/visitors") {
      const body = await readBody(request);
      return sendJson(response, 200, registerVisitor(body.visitorId));
    }

    if (request.method === "POST" && pathname === "/api/validate-word") {
      const body = await readBody(request);
      const language = cleanLanguage(body.language);
      const word = cleanGuess(body.word);
      const valid = await isValidDictionaryWord(word, language);
      return sendJson(response, 200, { valid });
    }

    if (request.method === "POST" && pathname === "/api/best-word") {
      const body = await readBody(request);
      const language = cleanLanguage(body.language);
      const letters = Array.isArray(body.letters) ? body.letters.map(cleanGuess).filter(Boolean) : [];
      const foundWords = Array.isArray(body.foundWords) ? body.foundWords.map(cleanGuess).filter(Boolean) : [];
      if (!letters.length) return sendJson(response, 400, { error: "Letters are required." });
      const best = await findBestPossibleWord(letters, language, foundWords);
      return sendJson(response, 200, best);
    }

    if (request.method === "POST" && pathname === "/api/rooms") {
      const body = await readBody(request);
      const name = cleanName(body.name);
      if (!name) return sendJson(response, 400, { error: "Name is required." });

      const code = makeCode();
      const playerId = crypto.randomUUID();
      const letterCount = cleanLetterCount(body.letterCount);
      const language = cleanLanguage(body.language);
      const room = {
        code,
        hostId: playerId,
        state: "waiting",
        runLength: cleanRunLength(body.runLength),
        letterCount,
        language,
        letters: generateLetters(letterCount, language),
        secondsLeft: 0,
        endsAt: 0,
        countdownEndsAt: 0,
        finalized: false,
        runNumber: 0,
        playAgainRequests: new Set(),
        players: [{
          id: playerId,
          name,
          score: 0,
          words: 0,
          roomLongestBonus: false,
          roomLongestWord: "",
          wordSet: new Set(),
          wordEntries: [],
          status: "waiting",
          startedAt: 0,
          endsAt: 0,
          secondsLeft: 0
        }]
      };
      rooms.set(code, room);
      return sendJson(response, 200, publicRoom(room, playerId));
    }

    const joinMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/join$/);
    if (request.method === "POST" && joinMatch) {
      const code = joinMatch[1];
      const room = rooms.get(code);
      if (!room) return sendJson(response, 404, { error: "Room not found." });
      if (room.state !== "waiting") return sendJson(response, 409, { error: "That room has already started." });
      if (room.players.length >= maxPlayersPerRoom) return sendJson(response, 409, { error: "That room already has four players." });

      const body = await readBody(request);
      const name = cleanName(body.name);
      if (!name) return sendJson(response, 400, { error: "Name is required." });

      const playerId = crypto.randomUUID();
      room.players.push({
        id: playerId,
        name,
        score: 0,
        words: 0,
        roomLongestBonus: false,
        roomLongestWord: "",
        wordSet: new Set(),
        wordEntries: [],
        status: "waiting",
        startedAt: 0,
        endsAt: 0,
        secondsLeft: 0
      });
      return sendJson(response, 200, publicRoom(room, playerId));
    }

    const startMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/start$/);
    if (request.method === "POST" && startMatch) {
      const code = startMatch[1];
      const room = rooms.get(code);
      if (!room) return sendJson(response, 404, { error: "Room not found." });

      const body = await readBody(request);
      if (body.playerId !== room.hostId) return sendJson(response, 403, { error: "Only the room creator can start." });
      if (room.players.length < 2) return sendJson(response, 409, { error: "Wait for at least one more player to join." });

      startRoomCountdown(room);
      return sendJson(response, 200, publicRoom(room, body.playerId));
    }

    const beginMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/begin$/);
    if (request.method === "POST" && beginMatch) {
      const code = beginMatch[1];
      const room = rooms.get(code);
      if (!room) return sendJson(response, 404, { error: "Room not found." });
      updateRoomClock(room);
      if (room.state !== "ready" && room.state !== "playing") {
        return sendJson(response, 409, { error: "The online run is not ready yet." });
      }

      const body = await readBody(request);
      const player = room.players.find((item) => item.id === body.playerId);
      if (!player) return sendJson(response, 404, { error: "Player not found." });
      if (player.status === "playing") return sendJson(response, 200, publicRoom(room, body.playerId));
      if (player.status === "done") return sendJson(response, 409, { error: "Your timer has already ended." });

      const now = Date.now();
      player.status = "playing";
      player.startedAt = now;
      player.endsAt = now + room.runLength * 1000;
      player.secondsLeft = room.runLength;
      room.state = "playing";
      return sendJson(response, 200, publicRoom(room, body.playerId));
    }

    const playAgainMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/play-again$/);
    if (request.method === "POST" && playAgainMatch) {
      const code = playAgainMatch[1];
      const room = rooms.get(code);
      if (!room) return sendJson(response, 404, { error: "Room not found." });
      updateRoomClock(room);
      if (room.state !== "finished") return sendJson(response, 409, { error: "Wait until this run is over." });

      const body = await readBody(request);
      const player = room.players.find((item) => item.id === body.playerId);
      if (!player) return sendJson(response, 404, { error: "Player not found." });

      room.playAgainRequests = room.playAgainRequests || new Set();
      room.playAgainRequests.add(player.id);
      if (room.playAgainRequests.size >= 2) {
        startRoomCountdown(room, room.playAgainRequests);
      }
      return sendJson(response, 200, publicRoom(room, body.playerId));
    }

    const wordMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/word$/);
    if (request.method === "POST" && wordMatch) {
      const code = wordMatch[1];
      const room = rooms.get(code);
      if (!room) return sendJson(response, 404, { error: "Room not found." });
      updateRoomClock(room);
      if (room.state !== "playing") return sendJson(response, 409, { error: "The online run is not active." });

      const body = await readBody(request);
      const player = room.players.find((item) => item.id === body.playerId);
      if (!player) return sendJson(response, 404, { error: "Player not found." });
      if (player.status !== "playing") return sendJson(response, 409, { error: "Start your timer before guessing." });

      const word = String(body.word || "").toLowerCase().replace(/[^a-z]/g, "");
      const points = Math.max(0, Math.round(Number(body.points) || 0));
      if (word && !player.wordSet.has(word)) {
        player.wordSet.add(word);
        player.wordEntries = player.wordEntries || [];
        player.wordEntries.push({
          word,
          basePoints: points,
          points,
          rarity: rarityScore(word),
          longestBonus: false,
          unusualBonus: false,
          createdAt: Date.now()
        });
        player.score += points;
        player.words += 1;
      }
      return sendJson(response, 200, publicRoom(room, body.playerId));
    }

    const finishMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/finish$/);
    if (request.method === "POST" && finishMatch) {
      const code = finishMatch[1];
      const room = rooms.get(code);
      if (!room) return sendJson(response, 404, { error: "Room not found." });

      const body = await readBody(request);
      const player = room.players.find((item) => item.id === body.playerId);
      if (!player) return sendJson(response, 404, { error: "Player not found." });

      updateRoomClock(room);
      if (player.status === "playing") {
        player.status = "done";
        player.secondsLeft = 0;
      }
      updateRoomClock(room);
      if (room.state === "finished") {
        finalizeRoomScores(room);
      }
      return sendJson(response, 200, publicRoom(room, body.playerId));
    }

    const roomMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)$/);
    if (request.method === "GET" && roomMatch) {
      const code = roomMatch[1];
      const room = rooms.get(code);
      if (!room) return sendJson(response, 404, { error: "Room not found." });
      const url = new URL(request.url, `http://${request.headers.host}`);
      return sendJson(response, 200, publicRoom(room, url.searchParams.get("playerId")));
    }

    sendJson(response, 404, { error: "Unknown API route." });
  } catch {
    sendJson(response, 400, { error: "Could not read that request." });
  }
}

function serveFile(request, response, pathname) {
  let filePath = pathname;
  if (filePath === "/") filePath = "/index.html";

  const file = path.join(root, filePath);
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream"
    });
    response.end(data);
  });
}

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/api/")) {
    handleApi(request, response, pathname);
    return;
  }

  serveFile(request, response, pathname);
}).listen(port, host, () => {
  console.log(`Letter Run server listening on http://${host}:${port}`);
});
