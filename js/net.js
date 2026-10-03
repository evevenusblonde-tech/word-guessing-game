// Rooms without a game server.
//
// One player's browser hosts the room and keeps the authoritative state; the
// other players connect to it directly with WebRTC data channels (PeerJS).
// PeerJS's free public server is only used to introduce the browsers to each
// other. Solo runs use the same HostRoom with nobody else connected.
//
// Host -> guest messages: welcome, state, pong, rejected
// Guest -> host messages: hello, word, ping, leave

import { generateRack } from "./dictionary.js";
import { MAX_PLAYERS, canBuild, cleanName, cleanWord, liveScore, scoreRoom } from "./rules.js";

const PEER_PREFIX = "letterrun-v2-";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUNTDOWN_MS = 4000;
const LATE_WORD_GRACE_MS = 1500;
const HOSTING_KEY = "letterRunHosting";

export function makeCode() {
  let code = "";
  for (let i = 0; i < 5; i += 1) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

export function cleanCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

// ?peer=localhost:9000 points at a self-hosted PeerJS server (used for testing).
function peerOptions() {
  const custom = new URLSearchParams(location.search).get("peer");
  const options = { debug: 0 };
  if (custom) {
    const [host, port] = custom.split(":");
    Object.assign(options, { host, port: Number(port) || 9000, path: "/", secure: location.protocol === "https:" && host !== "localhost" });
  }
  return options;
}

function friendlyPeerError(error) {
  const messages = {
    "browser-incompatible": "This browser cannot make direct connections. Try Chrome, Safari or Firefox.",
    "network": "Could not reach the matchmaking server. Check the internet connection.",
    "server-error": "The matchmaking server is not responding. Try again in a moment.",
    "peer-unavailable": "No room with that code is open. Check the code, or ask the host to keep the game open.",
    "webrtc": "The direct connection failed. Try again, or switch Wi-Fi/mobile data."
  };
  return messages[error?.type] || error?.message || "Connection problem.";
}

class Emitter {
  constructor() {
    this.handlers = {};
  }

  on(event, handler) {
    (this.handlers[event] ||= []).push(handler);
    return this;
  }

  emit(event, ...args) {
    (this.handlers[event] || []).forEach((handler) => handler(...args));
  }
}

// Authoritative room state. Lives in the host's browser.
export class HostRoom extends Emitter {
  constructor({ name, playerId, settings, online, code, saved }) {
    super();
    this.online = online;
    this.code = code || null;
    this.playerId = playerId;
    this.connections = new Map();
    this.timers = [];
    this.state = saved || {
      phase: "lobby",
      settings,
      round: 0,
      letters: [],
      startAt: 0,
      endAt: 0,
      players: [],
      results: null
    };
    if (!saved) this.addPlayer(playerId, name, true);
    else this.state.players.forEach((player) => { player.connected = player.id === playerId; });
    this.resumeTimers();
  }

  get isHost() {
    return true;
  }

  now() {
    return Date.now();
  }

  // Opens the room to other players. Resolves with the room code.
  async open() {
    if (!this.online) return null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = this.code || makeCode();
      try {
        this.peer = await this.createPeer(PEER_PREFIX + code);
        this.code = code;
        this.persist();
        this.emit("status", { kind: "open" });
        return code;
      } catch (error) {
        // A reloaded host can briefly find its old code still registered.
        if (error.type === "unavailable-id" && this.code) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          continue;
        }
        if (error.type === "unavailable-id") continue;
        throw new Error(friendlyPeerError(error));
      }
    }
    throw new Error("Could not open a room right now. Try again.");
  }

  createPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(id, peerOptions());
      peer.once("open", () => resolve(peer));
      peer.once("error", reject);
      peer.on("connection", (conn) => this.acceptConnection(conn));
      peer.on("disconnected", () => {
        // Lost the matchmaking server; existing players stay connected.
        if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
      });
    });
  }

  acceptConnection(conn) {
    let playerId = null;
    conn.on("data", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "hello") {
        playerId = String(message.playerId || "").slice(0, 40);
        const error = this.join(playerId, message.name, message);
        if (error) {
          conn.send({ type: "rejected", message: error });
          setTimeout(() => conn.close(), 500);
          return;
        }
        const previous = this.connections.get(playerId);
        if (previous && previous !== conn) previous.close();
        this.connections.set(playerId, conn);
        conn.send({ type: "welcome", playerId, code: this.code });
        this.broadcast();
      } else if (message.type === "ping") {
        conn.send({ type: "pong", sent: message.sent, hostTime: Date.now() });
      } else if (playerId && message.type === "word") {
        this.addWord(playerId, message.round, message.word);
      } else if (playerId && message.type === "leave") {
        this.removePlayer(playerId);
      }
    });
    conn.on("close", () => {
      if (playerId && this.connections.get(playerId) === conn) {
        this.connections.delete(playerId);
        const player = this.findPlayer(playerId);
        if (player) player.connected = false;
        this.broadcast();
      }
    });
  }

  findPlayer(id) {
    return this.state.players.find((player) => player.id === id);
  }

  addPlayer(id, name, isHost = false) {
    const player = { id, name: cleanName(name) || "Player", isHost, connected: true, words: [], round: this.state.round };
    this.state.players.push(player);
    return player;
  }

  join(id, name, { round, words } = {}) {
    if (!id) return "Could not join.";
    const existing = this.findPlayer(id);
    if (existing) {
      existing.connected = true;
      existing.name = cleanName(name) || existing.name;
      // Words found while the connection was down.
      if (round === this.state.round && Array.isArray(words)) {
        words.forEach((word) => this.addWord(id, round, word, false));
      }
      return null;
    }
    const activePlayers = this.state.players.filter((player) => player.connected).length;
    if (activePlayers >= MAX_PLAYERS) return `This room is full (${MAX_PLAYERS} players).`;
    // Drop a disconnected player to make room, oldest first.
    if (this.state.players.length >= MAX_PLAYERS) {
      const gone = this.state.players.findIndex((player) => !player.connected && !player.isHost);
      if (gone >= 0) this.state.players.splice(gone, 1);
    }
    this.addPlayer(id, name);
    return null;
  }

  removePlayer(id) {
    const index = this.state.players.findIndex((player) => player.id === id && !player.isHost);
    if (index >= 0) this.state.players.splice(index, 1);
    this.connections.get(id)?.close();
    this.connections.delete(id);
    this.broadcast();
  }

  addWord(playerId, round, rawWord, notify = true) {
    const { phase, letters, endAt } = this.state;
    const word = cleanWord(rawWord);
    const player = this.findPlayer(playerId);
    if (!player || round !== this.state.round) return;
    if (phase !== "playing" && phase !== "countdown") return;
    if (Date.now() > endAt + LATE_WORD_GRACE_MS) return;
    if (word.length < 2 || !canBuild(word, letters) || player.words.includes(word)) return;
    player.words.push(word);
    if (notify) this.broadcast();
  }

  updateSettings(settings) {
    if (this.state.phase !== "lobby" && this.state.phase !== "results") return;
    this.state.settings = { ...this.state.settings, ...settings };
    this.broadcast();
  }

  async startRound() {
    if (this.state.phase === "countdown" || this.state.phase === "playing") return;
    const { letterCount, language, runLength } = this.state.settings;
    const previousPhase = this.state.phase;
    this.state.phase = "preparing";
    this.broadcast();
    let letters;
    try {
      letters = await generateRack(letterCount, language);
    } catch {
      this.state.phase = previousPhase;
      this.broadcast();
      this.emit("status", { kind: "problem", message: "Couldn't load the word list. Check the connection and try again." });
      return;
    }
    // Players who left during the last round are cleared out between rounds.
    this.state.players = this.state.players.filter((player) => player.connected || player.isHost);
    this.state.players.forEach((player) => {
      player.words = [];
      player.round = this.state.round + 1;
    });
    Object.assign(this.state, {
      phase: "countdown",
      round: this.state.round + 1,
      letters,
      startAt: Date.now() + COUNTDOWN_MS,
      endAt: Date.now() + COUNTDOWN_MS + runLength * 1000,
      results: null
    });
    this.resumeTimers();
    this.broadcast();
  }

  resumeTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const { phase, startAt, endAt } = this.state;
    if (phase === "countdown") {
      this.timers.push(setTimeout(() => this.setPhase("playing"), Math.max(0, startAt - Date.now())));
    }
    if (phase === "countdown" || phase === "playing") {
      this.timers.push(setTimeout(() => this.finishRound(), Math.max(0, endAt + LATE_WORD_GRACE_MS - Date.now())));
    }
  }

  setPhase(phase) {
    this.state.phase = phase;
    this.broadcast();
  }

  finishRound() {
    if (this.state.phase !== "playing" && this.state.phase !== "countdown") return;
    const players = this.state.players.filter((player) => player.round === this.state.round);
    this.state.results = scoreRoom(players.map(({ id, name, words }) => ({ id, name, words })));
    this.state.phase = "results";
    this.broadcast();
  }

  backToLobby() {
    if (this.state.phase !== "results") return;
    this.state.phase = "lobby";
    this.state.players = this.state.players.filter((player) => player.connected || player.isHost);
    this.broadcast();
  }

  // What each player sees. Other players' words stay hidden until results.
  snapshot(forId) {
    const { phase, settings, round, letters, startAt, endAt, players, results } = this.state;
    const me = this.findPlayer(forId);
    return {
      code: this.code,
      online: this.online,
      phase,
      settings,
      round,
      letters,
      startAt,
      endAt,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        connected: player.connected,
        inRound: player.round === round,
        score: liveScore(player.words),
        wordCount: player.words.length
      })),
      myWords: me ? me.words : [],
      results
    };
  }

  broadcast() {
    this.persist();
    for (const [id, conn] of this.connections) {
      if (conn.open) conn.send({ type: "state", state: this.snapshot(id) });
    }
    this.emit("state", this.snapshot(this.playerId));
  }

  // Lets the host reload the page without ending the room.
  persist() {
    if (!this.online || !this.code) return;
    try {
      sessionStorage.setItem(HOSTING_KEY, JSON.stringify({ code: this.code, savedAt: Date.now(), state: this.state }));
    } catch {
      // Storage can be unavailable (private mode); the room still works.
    }
  }

  // Local player's actions.
  submitWord(word) {
    this.addWord(this.playerId, this.state.round, word);
  }

  leave() {
    this.timers.forEach(clearTimeout);
    try {
      sessionStorage.removeItem(HOSTING_KEY);
    } catch {
      // Ignore unavailable storage.
    }
    this.connections.forEach((conn) => conn.close());
    this.peer?.destroy();
  }
}

export function savedHosting() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HOSTING_KEY) || "null");
    if (saved && Date.now() - saved.savedAt < 3 * 60 * 60 * 1000) return saved;
  } catch {
    // Ignore unreadable storage.
  }
  return null;
}

// A player's connection to someone else's room.
export class GuestLink extends Emitter {
  constructor({ code, name, playerId }) {
    super();
    this.code = code;
    this.name = name;
    this.playerId = playerId;
    this.offset = 0;
    this.bestRtt = Infinity;
    this.state = null;
    this.closed = false;
    this.retries = 0;
  }

  get isHost() {
    return false;
  }

  now() {
    return Date.now() + this.offset;
  }

  open() {
    return new Promise((resolve, reject) => {
      this.peer = new window.Peer(peerOptions());
      this.peer.once("open", () => this.connect(resolve, reject));
      this.peer.on("error", (error) => {
        if (error.type === "peer-unavailable" && this.state) {
          this.scheduleReconnect();
          return;
        }
        if (!this.state) reject(new Error(friendlyPeerError(error)));
        else this.emit("status", { kind: "problem", message: friendlyPeerError(error) });
      });
      this.peer.on("disconnected", () => {
        if (!this.closed && !this.peer.destroyed) setTimeout(() => !this.peer.destroyed && this.peer.reconnect(), 1500);
      });
    });
  }

  connect(resolve, reject) {
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: "json" });
    this.conn = conn;
    const failTimer = setTimeout(() => {
      if (!conn.open) {
        conn.close();
        if (reject && !this.state) reject(new Error("Could not connect to the room. Ask the host to check the game is still open, then try again."));
        else this.scheduleReconnect();
      }
    }, 15000);

    conn.on("open", () => {
      clearTimeout(failTimer);
      this.retries = 0;
      conn.send({
        type: "hello",
        playerId: this.playerId,
        name: this.name,
        round: this.state?.round,
        words: this.state?.myWords || []
      });
      this.syncClock();
    });
    conn.on("data", (message) => {
      if (message?.type === "welcome") {
        this.emit("status", { kind: "connected" });
        resolve?.();
        resolve = null;
      } else if (message?.type === "rejected") {
        this.closed = true;
        reject?.(new Error(message.message));
        this.emit("status", { kind: "closed", message: message.message });
      } else if (message?.type === "state") {
        this.state = message.state;
        this.emit("state", this.state);
      } else if (message?.type === "pong") {
        const rtt = Date.now() - message.sent;
        if (rtt < this.bestRtt) {
          this.bestRtt = rtt;
          this.offset = message.hostTime + rtt / 2 - Date.now();
          if (this.state) this.emit("state", this.state);
        }
      }
    });
    conn.on("close", () => {
      clearTimeout(failTimer);
      if (this.closed || this.conn !== conn) return;
      this.emit("status", { kind: "reconnecting" });
      this.scheduleReconnect();
    });
  }

  // Several pings; the fastest round trip gives the best clock estimate.
  syncClock() {
    this.bestRtt = Infinity;
    for (let i = 0; i < 5; i += 1) {
      setTimeout(() => {
        if (this.conn?.open) this.conn.send({ type: "ping", sent: Date.now() });
      }, i * 300);
    }
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.retries += 1;
    if (this.retries > 40) {
      this.emit("status", { kind: "closed", message: "Lost the connection to the host." });
      return;
    }
    this.emit("status", { kind: "reconnecting" });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      if (this.peer.disconnected) this.peer.reconnect();
      this.connect(null, null);
    }, Math.min(5000, 1000 + this.retries * 500));
  }

  send(message) {
    if (this.conn?.open) this.conn.send(message);
  }

  submitWord(word) {
    if (this.state) this.state.myWords = [...this.state.myWords, word];
    this.send({ type: "word", round: this.state?.round, word });
  }

  leave() {
    this.closed = true;
    this.send({ type: "leave" });
    setTimeout(() => this.peer?.destroy(), 300);
  }
}
