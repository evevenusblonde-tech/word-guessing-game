# Letter Run

A timed word game for the browser. You get a set of letters and race the clock to make as many valid words as you can, in English or Italian, alone or against up to three friends in an online room.

## How to play

- Pick a run length (1, 2 or 3 minutes), how many letters to use (3 to 10) and a language.
- Make words from the available letters. Words can be 2 letters or longer, and each tile can be used only as many times as it appears.
- Each word scores 2 points per letter plus a bonus for rare letters.
- At the end of the run you get +15 for your longest word and +15 for your most unusual word. In online rooms, +15 also goes to whoever found the longest word in the room.
- Completed runs go on a top-10 leaderboard, kept separately for each run length and language.

## Running locally

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

Then open <http://localhost:8123>.

The server listens on port `8123` and host `0.0.0.0` by default. You can change these with the `PORT` and `HOST` environment variables.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page layout and the "How to Play" rules |
| `styles.css` | Styling |
| `app.js` | Game logic in the browser: letters, guesses, scoring, timer, leaderboard |
| `preview-server.js` | Node server that serves the game and provides the API for word checks, leaderboards and online rooms |
| `data/italian-words.txt` | Local Italian word list, used before the npm dictionaries |

Online rooms, the shared leaderboard and the visitor counter all need the server. The server saves leaderboard and visitor data to `data/leaderboard.json` and `data/visitors.json`.
