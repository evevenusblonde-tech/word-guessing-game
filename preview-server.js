const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT || 8123);
const host = process.env.HOST || "0.0.0.0";
const root = __dirname;
const rooms = new Map();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};
const vowels = ["a", "e", "i", "o", "u"];
const commonConsonants = "nnnnrrrrttttllllsssscccddppmmbbggfhvwy".split("");
const rareLetters = "jkqxz".split("");

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

function generateLetters(count) {
  const set = [];
  const guaranteedVowels = count >= 7 ? 3 : count >= 5 ? 2 : 1;
  while (set.length < guaranteedVowels) set.push(pick(vowels));
  if (count >= 7) set.push(pick(rareLetters));
  while (set.length < count) {
    set.push(Math.random() < 0.25 ? pick(vowels) : pick(commonConsonants));
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
  return {
    code: room.code,
    playerId,
    state: room.state,
    runLength: room.runLength,
    letterCount: room.letterCount,
    letters: room.letters,
    secondsLeft: room.secondsLeft,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      words: player.words,
      foundWords: Array.from(player.wordSet)
    }))
  };
}

function updateRoomClock(room) {
  if (room.state !== "playing") return;
  room.secondsLeft = Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000));
  if (room.secondsLeft <= 0) {
    room.state = "finished";
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
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
    if (request.method === "POST" && pathname === "/api/rooms") {
      const body = await readBody(request);
      const name = cleanName(body.name);
      if (!name) return sendJson(response, 400, { error: "Name is required." });

      const code = makeCode();
      const playerId = crypto.randomUUID();
      const letterCount = cleanLetterCount(body.letterCount);
      const room = {
        code,
        hostId: playerId,
        state: "waiting",
        runLength: cleanRunLength(body.runLength),
        letterCount,
        letters: generateLetters(letterCount),
        secondsLeft: 0,
        endsAt: 0,
        players: [{
          id: playerId,
          name,
          score: 0,
          words: 0,
          wordSet: new Set()
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
      if (room.players.length >= 2) return sendJson(response, 409, { error: "That room already has two players." });

      const body = await readBody(request);
      const name = cleanName(body.name);
      if (!name) return sendJson(response, 400, { error: "Name is required." });

      const playerId = crypto.randomUUID();
      room.players.push({
        id: playerId,
        name,
        score: 0,
        words: 0,
        wordSet: new Set()
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
      if (room.players.length < 2) return sendJson(response, 409, { error: "Wait for the second player to join." });

      room.state = "playing";
      room.secondsLeft = room.runLength;
      room.endsAt = Date.now() + room.runLength * 1000;
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

      const word = String(body.word || "").toLowerCase().replace(/[^a-z]/g, "");
      const points = Math.max(0, Math.round(Number(body.points) || 0));
      if (word && !player.wordSet.has(word)) {
        player.wordSet.add(word);
        player.score += points;
        player.words += 1;
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
