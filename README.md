# Letter Run

A timed word game for the browser. You get a set of letters and race the clock to make as many real words as you can, in English or Italian. Play alone, or with up to 8 people on their own phones, tablets or computers.

**Play:** https://evevenusblonde-tech.github.io/word-guessing-game/

No accounts, no app to install, no server to run.

## How to play

- Pick a language, a run length (1, 2 or 3 minutes) and how many letters to use (3 to 10).
- Make words from the letters. Words need 2 or more letters, and each tile can be used once per word.
- Each word scores 2 points per letter plus a bonus for rare letters.
- At the end: +15 for your longest word and +15 for your rarest word. In a room, +15 also goes to whoever found the longest word overall.
- On a phone, tap the letters. On a computer, type (Space shuffles, Enter submits).

## Playing together

1. One person taps **Create a room** and shares the invite link (or the 5-character code).
2. Everyone else opens the link and types their name.
3. The host chooses the settings and taps **Start game**. Everyone gets the same letters and starts at the same moment.
4. Scores update live during the round. Words are revealed at the end.
5. **Next round** starts again with everyone still in the room.

The host's device keeps the room running, so the host should keep the game open. If anyone reloads or briefly loses signal, they reconnect automatically and keep their words.

## How it works

It's a static site (HTML, CSS, JavaScript) hosted on GitHub Pages.

- **Dictionaries** are bundled in `words/`. They are downloaded once and checked on the device, so guesses are instant. Italian has about 790,000 words and forms, English about 190,000.
- **Rooms** are peer-to-peer. The host's browser holds the game state, and the other players connect to it directly over WebRTC using [PeerJS](https://peerjs.com/). PeerJS's free public server only introduces the browsers to each other.
- **Best runs** are saved on each device (top 10 per run length and language).

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Page layout and styling |
| `js/rules.js` | Letters, scoring and bonuses |
| `js/dictionary.js` | Loads the word lists, checks words, finds all possible words for a set of letters |
| `js/net.js` | Rooms: the host's game state and the player connections |
| `js/app.js` | Screens and controls |
| `words/` | Built word lists (see `tools/build-words.js`) |
| `vendor/peerjs.min.js` | PeerJS 1.5.5 |

## Running locally

```bash
npm start            # serves the folder at http://localhost:8123
```

To rebuild the word lists (needs Node.js 18+ and internet access):

```bash
npm install
npm run build-words
```

To test rooms without the public PeerJS server, run your own (`npx peerjs --port 9000`) and open the game with `?peer=localhost:9000`.

See [CREDITS.md](CREDITS.md) for word-list sources and licenses.
