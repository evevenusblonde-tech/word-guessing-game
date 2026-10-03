// Bundled word lists (words/en.txt, words/it.txt), loaded once per language.
//
// The Italian list has ~800k entries, so it is kept as the raw text plus two
// typed arrays (line offsets and a letter bitmask per word) instead of a Set
// of strings. That keeps memory low on phones, lookups are a binary search,
// and scanning for every word buildable from a rack takes a few milliseconds.

import { MAX_LETTERS, randomLetters, rarity } from "./rules.js";

const loaded = {};

function letterMask(text, start, end) {
  let mask = 0;
  for (let i = start; i < end; i += 1) mask |= 1 << (text.charCodeAt(i) - 97);
  return mask;
}

class WordList {
  constructor(text) {
    this.text = text;
    const starts = [];
    const ends = [];
    for (let start = 0; start < text.length;) {
      let end = text.indexOf("\n", start);
      if (end === -1) end = text.length;
      if (end > start) {
        starts.push(start);
        ends.push(end);
      }
      start = end + 1;
    }
    this.count = starts.length;
    this.starts = Uint32Array.from(starts);
    this.ends = Uint32Array.from(ends);
    this.masks = new Uint32Array(this.count);
    for (let n = 0; n < this.count; n += 1) {
      this.masks[n] = letterMask(text, starts[n], ends[n]);
    }
  }

  wordAt(n) {
    return this.text.slice(this.starts[n], this.ends[n]);
  }

  has(word) {
    let low = 0;
    let high = this.count - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = this.wordAt(mid);
      if (candidate === word) return true;
      if (candidate < word) low = mid + 1;
      else high = mid - 1;
    }
    return false;
  }

  // Every word (2+ letters) that can be built from the rack.
  wordsFrom(letters) {
    const rack = new Int8Array(26);
    for (const letter of letters) rack[letter.charCodeAt(0) - 97] += 1;
    const rackMask = letterMask(letters.join(""), 0, letters.length);
    const counts = new Int8Array(26);
    const found = [];
    for (let n = 0; n < this.count; n += 1) {
      if (this.masks[n] & ~rackMask) continue;
      const start = this.starts[n];
      const end = this.ends[n];
      if (end - start > letters.length) continue;
      counts.fill(0);
      let fits = true;
      for (let i = start; i < end; i += 1) {
        const code = this.text.charCodeAt(i) - 97;
        counts[code] += 1;
        if (counts[code] > rack[code]) {
          fits = false;
          break;
        }
      }
      if (fits) found.push(this.wordAt(n));
    }
    return found;
  }
}

export function loadDictionary(language) {
  if (!loaded[language]) {
    loaded[language] = fetch(`words/${language}.txt`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the word list.");
        return response.text();
      })
      .then((text) => new WordList(text))
      .catch((error) => {
        delete loaded[language];
        throw error;
      });
  }
  return loaded[language];
}

export async function isWord(word, language) {
  const list = await loadDictionary(language);
  return list.has(word);
}

export function bestWords(words, limit = 5) {
  return words
    .slice()
    .sort((a, b) => b.length - a.length || rarity(b) - rarity(a) || a.localeCompare(b))
    .slice(0, limit);
}

// Picks a rack that gives everyone something to find: a long word near the
// rack size and a healthy number of shorter words.
export async function generateRack(count, language) {
  const list = await loadDictionary(language);
  const wantLongest = Math.max(3, Math.min(count, count - 2));
  const wantWords = Math.min(60, count * 4);
  let best = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const letters = randomLetters(count, language);
    const words = list.wordsFrom(letters);
    const longest = Math.max(0, ...words.map((word) => word.length));
    const quality = words.length + longest * 10;
    if (!best || quality > best.quality) best = { letters, quality };
    if (longest >= wantLongest && words.length >= wantWords) return letters;
  }
  return best.letters;
}

export async function possibleWords(letters, language) {
  const list = await loadDictionary(language);
  return list.wordsFrom(letters.slice(0, MAX_LETTERS));
}
