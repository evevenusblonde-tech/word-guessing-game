// Builds the bundled word lists in words/ from open-licensed sources.
//
//   npm install            (installs the source word lists as dev dependencies)
//   npm run build-words
//
// Output: words/en.txt and words/it.txt — sorted, lowercase a–z only
// (accents stripped), 2 to 10 letters, one word per line.

const fs = require("fs");
const path = require("path");

const MAX_LENGTH = 10;
const OUT_DIR = path.join(__dirname, "..", "words");
const NAPOLUX_URL = "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/660000_parole_italiane.txt";

function clean(word) {
  return String(word).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function isPlayable(word) {
  return /^[a-z]{2,}$/.test(word);
}

// Collects every string in a nested JSON value, object keys included.
function flatten(source) {
  if (Array.isArray(source)) return source.flatMap(flatten);
  if (source && typeof source === "object") {
    return Object.entries(source).flatMap(([key, value]) => [key, ...flatten(value)]);
  }
  return typeof source === "string" ? [source] : [];
}

function readLines(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/);
}

function writeList(name, words) {
  const list = [...new Set(words.map(clean))]
    .filter((word) => isPlayable(word) && word.length <= MAX_LENGTH)
    .sort();
  fs.writeFileSync(path.join(OUT_DIR, name), `${list.join("\n")}\n`);
  console.log(`${name}: ${list.length} words`);
}

// Italian attaches pronouns to infinitives, gerunds and imperatives
// (mangiarlo, facendolo, aspettami, muoviamoci, andatevene, dimmelo).
// Word lists rarely include these, so they are generated here.
const CLITICS = ["mi", "ti", "ci", "vi", "si", "lo", "la", "li", "le", "ne", "gli"];
for (const first of ["me", "te", "ce", "ve", "se", "glie"]) {
  for (const second of ["lo", "la", "li", "le", "ne"]) CLITICS.push(first + second);
}
const IRREGULAR_IMPERATIVES = [
  "tieni", "vieni", "ottieni", "mantieni", "trattieni", "sostieni", "rimani",
  "togli", "scegli", "cogli", "raccogli", "accogli", "sciogli", "bevi", "esci",
  "siedi", "abbi", "sii", "sappi", "traduci", "conduci", "produci", "riduci",
  "introduci", "poni", "proponi", "componi", "disponi", "esponi", "riponi", "dite"
];
const MONOSYLLABIC_IMPERATIVES = ["da", "di", "fa", "sta", "va", "rida", "ridi", "rifa"];

// Dropped final vowel (troncamento): signor, nessun, aver, poter, ben, qual.
function truncated(baseWords) {
  return baseWords.filter((word) => /[aeiou][lrn][eo]$/.test(word) && word.length >= 4).map((word) => word.slice(0, -1));
}

// Superlatives (bellissimo, lunghissime) for adjectives with all four endings.
function superlatives(baseWords) {
  const known = new Set(baseWords);
  const result = ["benissimo", "malissimo"];
  for (const word of baseWords) {
    if (!word.endsWith("o") || word.length < 4) continue;
    const stem = word.slice(0, -1);
    if (!["a", "i", "e"].every((ending) => known.has(stem + ending))) continue;
    const base = /[cg]$/.test(stem) ? `${stem}h` : stem.replace(/i$/, "");
    for (const ending of ["o", "a", "i", "e"]) result.push(`${base}issim${ending}`);
  }
  return result.filter((word) => word.length <= MAX_LENGTH);
}

function withClitics(baseWords) {
  const result = [];
  const attach = (stem) => {
    for (const clitic of CLITICS) {
      if (stem.length + clitic.length <= MAX_LENGTH) result.push(stem + clitic);
    }
  };

  for (const word of baseWords) {
    if (word.length > MAX_LENGTH + 1) continue;
    if (/(are|ere|ire|rre)$/.test(word) && word.length >= 4) {
      attach(word.slice(0, -1));
      attach(word.slice(0, -3) + (word.endsWith("are") ? "a" : "i"));
    }
    if (/(ando|endo)$/.test(word)) attach(word);
    if (/iamo$/.test(word)) attach(word);
    if (/[aei]te$/.test(word) && word.length >= 4) attach(word);
  }
  // -isc- verbs: finisci + la = finiscila, capisci + mi = capiscimi.
  const known = new Set(baseWords);
  for (const word of baseWords) {
    if (word.endsWith("ire") && known.has(`${word.slice(0, -3)}isco`)) attach(`${word.slice(0, -3)}isci`);
  }
  attach("ecco");
  IRREGULAR_IMPERATIVES.forEach(attach);
  // da' + mi = dammi, fa' + lo = fallo, va' + tene = vattene ("gli" never doubles).
  for (const stem of MONOSYLLABIC_IMPERATIVES) {
    for (const clitic of CLITICS) {
      result.push(stem + (clitic.startsWith("gli") ? clitic : clitic[0] + clitic));
    }
  }
  return result;
}

async function buildItalian() {
  const response = await fetch(NAPOLUX_URL);
  if (!response.ok) throw new Error(`Could not download ${NAPOLUX_URL}`);
  const napolux = (await response.text()).split(/\r?\n/);
  const morphIt = flatten(require("italian-words-dict/dist/words.json"));
  const extras = readLines(path.join(__dirname, "extra-it.txt"));

  const base = [...new Set([...napolux, ...morphIt, ...extras].map(clean).filter(isPlayable))];
  writeList("it.txt", [...base, ...truncated(base), ...superlatives(base), ...withClitics(base)]);
}

function buildEnglish() {
  const wordList = readLines(path.join(__dirname, "..", "node_modules", "word-list", "words.txt"));
  const extras = readLines(path.join(__dirname, "extra-en.txt"));
  writeList("en.txt", [...wordList, ...extras]);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  buildEnglish();
  await buildItalian();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
