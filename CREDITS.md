# Credits

Letter Run is built on these open-source projects. Thank you to their authors.

## Word lists

The game's dictionaries (`words/en.txt`, `words/it.txt`) are built by `tools/build-words.js` from:

| Source | Used for | License |
| --- | --- | --- |
| [paroleitaliane](https://github.com/napolux/paroleitaliane) by Francesco Napoletano | Italian words (660,000-word list) | MIT |
| [Morph-it!](https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it) by Marco Baroni and Eros Zanchetta, via the [italian-words-dict](https://www.npmjs.com/package/italian-words-dict) package | Italian nouns, adjectives and their plurals | CC BY-SA 2.0 (Morph-it!), Apache-2.0 (package) |
| [word-list](https://github.com/sindresorhus/word-list) by Sindre Sorhus, from the [atebits Words list](https://github.com/atebits/Words) | English words | MIT |
| The original Letter Run Italian list (`tools/extra-it.txt`) | Common Italian words | — |

The build script also generates regular Italian forms that the lists leave out:
verbs with attached pronouns (*dimmelo*, *mangiarlo*, *aspettami*), shortened
forms (*signor*, *aver*) and superlatives (*bellissimo*). Accents are stripped
so players can type *perche* for *perché*.

Because Morph-it! is CC BY-SA 2.0, `words/it.txt` is shared under the same
license: you may reuse it with attribution and the same license.

## Code

- [PeerJS](https://peerjs.com/) (`vendor/peerjs.min.js`), MIT. See `vendor/peerjs-LICENSE`.
  Online rooms use PeerJS's free public matchmaking server to connect players' browsers to each other.
