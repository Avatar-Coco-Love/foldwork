# foldwork
A paper-folding roguelike puzzle game for the browser.

```sh
npm start   # dev server at http://localhost:8080/
npm test    # run all tests (plain Node, no dependencies; ~2.5 min)
npm run test:fast  # everything but the floor proofs (~15 s)
```

Specs live in [`docs/`](docs/); progress in [`docs/PROGRESS.md`](docs/PROGRESS.md)
(older entries in [`docs/PROGRESS-LOG.md`](docs/PROGRESS-LOG.md)).
Telemetry (anonymous play data) and its backend contract:
[`docs/07-telemetry.md`](docs/07-telemetry.md).

The game plays offline through a service worker (`sw.js`). It stays off on
localhost so the dev server always serves fresh files; `?sw=1` turns it on
there for testing, `?nosw=1` turns it off anywhere. A new module must be
added to `sw.js` `SHELL` (`node tools/shell-files.js` prints the list;
`npm test` checks it).
