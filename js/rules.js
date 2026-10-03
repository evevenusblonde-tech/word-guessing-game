// Game rules shared by solo runs and online rooms: letters, scoring, bonuses.

export const LANGUAGE_NAMES = { en: "English", it: "Italiano" };
export const RUN_LENGTHS = [60, 120, 180];
export const MIN_LETTERS = 3;
export const MAX_LETTERS = 10;
export const MAX_PLAYERS = 8;
export const BONUS = 15;

const LETTER_POOLS = {
  en: {
    vowels: "aaeeeiioou".split(""),
    consonants: "nnnnrrrrttttllllsssscccddppmmbbggffhhvvwwyy".split(""),
    rare: "jkqxz".split(""),
    vowelPlan: { 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 3, 9: 3, 10: 3 }
  },
  it: {
    vowels: "aaaeeeiiioou".split(""),
    consonants: "nnnnrrrrttttllllssssccccddddpppmmmvvvbbbffgghh".split(""),
    rare: "qz".split(""),
    vowelPlan: { 3: 1, 4: 2, 5: 2, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5 }
  }
};

const LETTER_VALUES = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5,
  l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4,
  w: 4, x: 8, y: 4, z: 10
};

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function randomLetters(count, language) {
  const pool = LETTER_POOLS[language] || LETTER_POOLS.en;
  const vowelCount = pool.vowelPlan[count] || Math.round(count * 0.4);
  const rareCount = count >= 7 && Math.random() < 0.4 ? 1 : 0;
  const set = [];
  while (set.length < vowelCount) set.push(pick(pool.vowels));
  while (set.length < vowelCount + rareCount) set.push(pick(pool.rare));
  while (set.length < count) set.push(pick(pool.consonants));
  return shuffle(set);
}

export function cleanWord(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 20);
}

export function clampLetterCount(value) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) return 9;
  return Math.min(MAX_LETTERS, Math.max(MIN_LETTERS, count));
}

export function countLetters(word) {
  const counts = {};
  for (const letter of word) counts[letter] = (counts[letter] || 0) + 1;
  return counts;
}

export function canBuild(word, letters) {
  const available = countLetters(letters.join(""));
  return Object.entries(countLetters(word)).every(([letter, count]) => (available[letter] || 0) >= count);
}

export function rarity(word) {
  const value = [...word].reduce((sum, letter) => sum + (LETTER_VALUES[letter] || 0), 0);
  return value + Math.max(0, new Set(word).size - 4) * 2;
}

export function scoreWord(word) {
  return word.length * 2 + Math.floor(rarity(word) / 3);
}

// Turns a player's accepted words into scored entries with the end-of-run
// bonuses: +15 for their longest word and +15 for their most unusual word.
export function scoreRun(words) {
  const items = words.map((word) => ({
    word,
    rarity: rarity(word),
    basePoints: scoreWord(word),
    points: scoreWord(word),
    longestBonus: false,
    unusualBonus: false
  }));
  let longest = null;
  let unusual = null;
  for (const item of items) {
    if (!longest || item.word.length > longest.word.length) longest = item;
    if (!unusual || item.rarity > unusual.rarity) unusual = item;
  }
  if (longest) {
    longest.longestBonus = true;
    longest.points += BONUS;
  }
  if (unusual) {
    unusual.unusualBonus = true;
    unusual.points += BONUS;
  }
  return {
    items,
    score: items.reduce((sum, item) => sum + item.points, 0),
    longestLength: longest ? longest.word.length : 0
  };
}

// Final standings for a room: each player's own bonuses, plus +15 for
// everyone tied on the longest word in the room.
export function scoreRoom(players) {
  const runs = players.map((player) => ({ ...player, ...scoreRun(player.words) }));
  const roomLongest = Math.max(0, ...runs.map((run) => run.longestLength));
  for (const run of runs) {
    run.roomLongestBonus = runs.length > 1 && roomLongest > 0 && run.longestLength === roomLongest;
    if (run.roomLongestBonus) run.score += BONUS;
  }
  return runs.sort((a, b) => b.score - a.score || b.items.length - a.items.length || a.name.localeCompare(b.name));
}

// Live score during a run (no end bonuses yet).
export function liveScore(words) {
  return words.reduce((sum, word) => sum + scoreWord(word), 0);
}
