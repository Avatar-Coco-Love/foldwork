# Foldwork — Progress Log

**Start every new conversation here**, then read `docs/CONVENTIONS.md`.
One PR per conversation keeps context small. At the end of each
conversation, update this file in the same PR, and add a player-facing
entry at the top of `src/core/changelog.js` (that entry is the version
bump: `0.<phase>.<n>`, see its header).

This file keeps only the last 3 log entries. When adding one, move the
oldest to the top of `docs/PROGRESS-LOG.md` (the full history, newest
first; search it, don't read it whole).

## Next up
**9j: Send Feedback / Report a Bug** (docs/08-roadmap.md, Stage 0): the
same collector and the offline queue (a `feedback` event; it is already
`NEVER_TRIM` in `telemetry/telemetry.js` TRIM_TIERS), with a privacy note
for free text. Ask first (OPEN-QUESTIONS "Offline: does feedback follow
'Share play data'?").
Still waiting on the user: the 9g diagonal decision (before 9h
templates), playtest data for 9c (export the Sheet as CSV, run
`node tools/replay-check.js events.csv`), Great Crane notes (9d), the 9f
device checks (`?fps=1` on a phone and a tablet, home-screen install), and
now an offline check on a real device (open once online, then airplane
mode, open from the home screen, play, go back online).

## Phase checklist
Larger phases are split into PR-sized chunks so each conversation stays small.

- [x] **Phase 0** — Scaffolding (PR 1)
- [x] **Phase 1** — Board and folding core
  - [x] 1a Fold logic + tests (`core/fold.js`) (PR 2)
  - [x] 1b Drag-to-fold input + live preview (pointer + keyboard, `ui/input.js`) (PR 3)
  - [x] 1c Fold animation + reduced-motion / speed setting (`render/fx.js`) (PR 4)
- [x] **Phase 2** — Player, turns, combat
  - [x] 2a Turn engine + event list, player move/bump/wait/HP (PR 5)
  - [x] 2b Scrap Mite AI, pin/strand/void-drop, event playback (PR 6)
- [x] **Phase 3** — Puzzle tiles, floors 1–3, tutorial hints, solver v1
  - [x] 3a Keys, locks, plates, exit tiles (PR 7)
  - [x] 3b Solver v1 + floor templates F1–3 + hints + telemetry (PR 8)
- [x] **Phase 4** — Run structure, relics (12+), spirits
  - [x] 4a Run state, floor progression, relic hooks + fold relics (PR 9)
  - [x] 4b Relic offers screen, defense + utility relics (PR 10)
  - [x] 4c Spirits (Fox, Frog, Turtle) + spirit select, diagonal creases (PR 11)
- [x] **Phase 5** — Full enemy roster, floors 4–8
  - [x] 5a Paper Wasp + Card Brute, Wax Coat, F2/F3 templates (PR 12)
  - [x] 5b Creaseling + F4 templates (PR 13)
  - [x] 5c Lockjaw + Spore Bloom, F6/F7 templates (PR 14)
  - [x] 5d Floors 5 and 8 (mixes) (PR 15)
- [x] **Playtest round 1** — fixes from the first playtests (user's
  priority, before 6b; decisions in OPEN-QUESTIONS "Playtest round 1")
  - [x] P1 Save and continue runs, Share button on the title (PR 19)
  - [x] P2 Restart Floor, Hint button (nudge, next step, can't-win notice) (PR 20)
  - [x] P3 Menus: title with icon corners (Share, Back to Projects),
    Settings screen (options move off the title), pause menu from the HUD,
    share-sheet fix (OPEN-QUESTIONS "Menu redesign") (PR 21)
  - [x] P3 follow-up: phone/browser Back button = in-game Back (PR 22)
  - [x] P4a Fold history: numbered crease marks, optional tap-to-confirm
    folds (a Settings row) (PR 23)
  - [x] P4b Fold history: list (pause menu) with peek and rewind (PR 24)
  - [x] P5 Lockjaw bite warning + tip rewrite; HP economy (rest heals 2,
    +1 HP for a floor cleared without damage); re-prove every floor (PR 25)
  - [x] P6 Save code (move a run between devices, in Settings > Data),
    Challenge-a-friend link (PR 26)
- [x] **Phase 6** — Great Crane boss, run summary
  - [x] 6a Great Crane phase 1, telegraphed crease, floor 9 arena
    - [x] core rules: crane def, aimed strip crease, swat, drop, flee (PR 17)
    - [x] arena template, stored-line proof, run to floor 9, telegraph render (PR 18)
  - [x] 6b Crane phases 2–3 (minions, double creases, shrinking arena) (PR 27)
  - [x] 6c Run summary and win/lose flow through the boss (PR 28)
- [x] **Phase 7** — Meta-progression, daily seed, persistence
  - [x] 7a Paper scraps: earned per run, shown on the summary, banked in
    meta (PR 29)
  - [x] 7b Unlocks shop: relics, spirits (Frog, Turtle), palettes; title
    Unlocks row (PR 30)
  - [x] 7c Remaining relics (9, to 24 total) with rarities and unlock
    flags (PR 31)
  - [x] 7d Daily seed mode (same run on every device) + title row (PR 32)
  - [x] 7e Stats & History screen; Settings > Data Reset progress;
    unlock/daily telemetry (PR 33)
- [x] **Phase 8** — Audio and polish
  - [x] 8a Audio engine, sound effects, Settings > Audio (PR 34)
  - [x] 8b Generative ambient loop (music bus) (PR 35)
  - [x] 8c Playtest round 2 fixes: lifting a flap (refolding a crease
    unfolds it), Wasp sees a player standing higher, HUD top no longer
    slides under the address bar (PR 36)
  - [x] 8d Visual polish: paper grain, shadows, fold polish, screen shake
    (PR 37)
  - [x] 8e Alignment audit (phone, tablet, desktop, both orientations)
    and the accessibility checklist (PR 38)
  - [x] 8f Version from a changelog, What's New page, audible ambient
    loop (PR 39)
  - [x] 8g Restore default settings (audio, or all) (PR 40)
- [ ] **Phase 9** — Playtesting, balance, manifest
  - [x] 9a Hint search with diagonal creases (playtest: F8 with the Frog)
    (PR 41)
  - [x] 9b Telemetry live: Google Sheets collector, collection on (PR 42)
  - [ ] 9c Balance from telemetry (`tools/replay-check.js`)
  - [x] 9d Great Crane: lift tags, fresh sheet each phase, relic row
    under the meters (PR 45; more arena templates wait on playtests)
  - [x] 9e Home-screen manifest (icons drawn in code) (PR 43)
  - [x] 9f Performance and cross-device pass (PR 44; real-device check
    open, see Next up)
  - [x] Roadmap beyond Phase 9 (`docs/08-roadmap.md`), offline play made
    a requirement (PR 46)
  - [x] Workflow housekeeping: smaller start-up docs, `test:fast`, CI
    (PR 48)
  - [ ] 9g Diagonal shortcuts decision (before more templates)
  - [ ] 9h Template depth: 3+ per floor, F7 first
  - [x] 9i Offline play: service worker for the app shell; queued play
    data sent once back online (no beacon while offline, larger queue,
    trim low-value events first, flush on focus) (PR 47)
  - [ ] 9j Send Feedback / Report a Bug (same collector and offline
    queue, privacy note)
  - [ ] 9k 1.0 checklist, then launch

## Log (last 3; older in docs/PROGRESS-LOG.md)

### PR 46: Roadmap beyond Phase 9; offline play as a requirement
- `docs/08-roadmap.md`: Stage 0 (finish Phase 9 and ship 1.0: diagonal
  decision, template depth, offline play, feedback, 1.0 checklist), 1.x
  backlog, 2.0 level editor and puzzle mode (solver-gated, levels as
  URLs), materials and acts, origami fold verbs, replay-verified
  leaderboards, and what has to change (backend, `LOGIC_VERSION` policy,
  storage).
- Offline play (user's requirement): the game opens and plays with no
  connection, and play data and feedback recorded meanwhile are sent
  once back online. Today the queue already persists and flushes on
  `online`; gaps logged in the roadmap: no service worker (an installed
  app can't start offline), page-hide `sendBeacon` can drop events
  offline, `maxQueue` 500 drops the oldest.
- Phase 9 chunks 9g–9k added. OPEN-QUESTIONS "Roadmap" lists the
  decisions it needs. Build plan and overview point to the roadmap.

### PR 47: Phase 9i, offline play
- `sw.js` (root, classic script): caches the app shell on install
  (`cache: 'reload'`) in `foldwork-<VERSION>`, serves same-origin GETs
  cache first (navigations to the game with any params get the cached
  page; `share.png`, `tools/`, `docs/` and other origins pass through),
  deletes older `foldwork-*` caches on activate, `skipWaiting` only on the
  page's 'activate' message. `VERSION` must equal `APP_VERSION` (test;
  changelog header says so).
- `src/ui/serviceWorker.js`: registration (browser layer only). Off on
  localhost (and removes a leftover worker) unless `?sw=1`; `?nosw=1`
  off anywhere. `registration.update()` when the page is visible again;
  a waiting release is taken at launch only while the title is the first
  screen (one reload), else when every window has closed.
- Hand-written `SHELL` list. `tools/shell-files.js` walks index.html and
  module imports from `src/main.js` (static, re-exports, `import()`,
  `new URL(..., import.meta.url)` for the hint worker) and prints it;
  `tests/offline.test.js` checks the list both ways, the version, and runs
  the worker's install/activate/fetch handlers in a `vm` sandbox.
- `telemetry/telemetry.js`: `online()` option (nothing sent, beacon
  included, while offline); backoff after failed sends (`flushMs` doubling
  to `maxBackoffMs`, 10 min) that every flush respects, reset by
  `reconnected()` (the `online` event); `trimQueue` with data-driven
  `TRIM_TIERS` (tier 0 noise first, `floor.end`/`run.end` last, `feedback`
  `NEVER_TRIM`), caps by count and bytes, applied on track and on load;
  full storage trims to half and saves again. `browser.js` flushes on
  visible and on focus.
- Queue sizing: `tools/queue-size.js` (scripted runs through core/): a
  full run is about 65 events / 30 KB; caps `maxQueue` 2,000 and
  `maxBytes` 1 MB (about a week and a half of 3 runs a day). OPEN-QUESTIONS
  Resolved records the choice.
- Verified in headless Chromium with `tools/offline-check.js`: shell
  cached (71 files), offline with the dev server stopped the title starts
  and floor 1 plays (moves and a fold, floor.end queued), nothing sent
  while offline, back online all 13 queued events reach the local
  collector with no duplicates; plain localhost has no worker.
- Not done: collector-side dedupe beyond the Sheets script's 6 h (the
  roadmap's beacon note); a real-device offline check (Next up).
- Changelog 0.9.6.

### PR 48: Workflow housekeeping (smaller start-up reading, fast tests, CI)
- Audit: tests green (470), changelog one entry per PR 1-47 with
  versions in order, `sw.js` VERSION matches, checklist matches the log.
  One stale note: OPEN-QUESTIONS still listed telemetry as off (on since
  PR 42); it moved to the resolved file as settled, not deleted.
- Context: this file keeps Next up, the checklist and the last 3 log
  entries (93 KB to about 11 KB). Older entries moved, newest first, to
  `docs/PROGRESS-LOG.md`; "Conventions worth remembering" (was buried
  between PR 19 and PR 20) is now `docs/CONVENTIONS.md`, read at every
  start. Resolved questions moved to `docs/OPEN-QUESTIONS-RESOLVED.md`
  (43 KB to about 3 KB of open ones); OPEN-QUESTIONS "Name" citations
  in code now mean either file. Content moved unchanged (checked line
  by line; only rewritten headers differ). CLAUDE.md: archive, never
  delete.
- Tests: `npm run test:fast` (`tests/run.js --fast`) skips
  `floors.test.js` (122 s of the 143 s run), about 17 s; full `npm test`
  before every PR.
- CI: `.github/workflows/test.yml` runs `npm test` on PRs and main.
- CLAUDE.md session workflow updated to match.
- Changelog 0.9.7.
