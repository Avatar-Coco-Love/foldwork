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
**9g: Frog-proof and fair floors** (decided 2026-10-18, OPEN-QUESTIONS
"Content push"; the first content drop): `needs` proofs allow diagonal
creases; retrofit `f5-press`, `f3-ferry`, `f4-gatehouse` (thick card,
moved walls); re-prove every floor; replay the logged losses on
`f3-vault`, `f4-relay`, `f6-twin` and soften their openings (no hit
before the first real choice); a "New layout" tag on a template's first
sight and "Layouts found: n / total" in Stats & History. No tile or rule
changes. The player isn't asked to test ("surprise her").
Then 9h1-9h4, spirits (S0-S2) and endless (E0-E2), one drop per PR.
Owner step from 9j (PR 52): paste the new `tools/telemetry-sheets/Code.gs`
and redeploy (Deploy → Manage deployments → edit → New version), and set
the Script property `READ_KEY`; then sessions can fetch events with
`FOLDWORK_READ_KEY=... node tools/fetch-events.js > events.ndjson`
(the 9c data, and the losses 9g replays) instead of a CSV export.
Still waiting on the user: playtest data for 9c, Great Crane notes (9d),
the 9f device checks (`?fps=1` on a phone and a tablet, home-screen
install), and an offline check on a real device (open once online, then
airplane mode, open from the home screen, play, send a feedback note, go
back online: it should reach the Sheet's `feedback` tab).

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
  - [ ] 9g Frog-proof and fair floors (decided 2026-10-18: prove with
    diagonals): `needs` proofs allow diagonal creases; retrofit
    `f5-press`, `f3-ferry`, `f4-gatehouse`; re-prove every floor; replay
    the logged losses on `f3-vault`, `f4-relay`, `f6-twin` and soften their
    openings (no hit before the first real choice); "New layout" tag on
    first sight and "Layouts found: n / total" in Stats
  - [ ] 9h Template depth: 4 per floor on F1-8 (32 total), existing
    pieces only, each proven with diagonals
    - [ ] 9h1 F7 +3, F6 +2
    - [ ] 9h2 F1 +3, F2 +2
    - [ ] 9h3 F3 +1, F4 +2, F5 +2
    - [ ] 9h4 F8 +2, 2-3 new Great Crane arenas (stored lines)
  - [x] 9i Offline play: service worker for the app shell; queued play
    data sent once back online (no beacon while offline, larger queue,
    trim low-value events first, flush on focus) (PR 47)
  - [x] 9j Send Feedback / Report a Bug (same collector and offline
    queue, privacy note), Privacy page in Settings (PR 52)
  - [ ] 9k 1.0 checklist, then launch (where it falls relative to the
    spirits and endless drops is not decided yet; ask after 9h)
- [ ] **Content push** (2026-10-18, user's choices; OPEN-QUESTIONS
  "Content push"). Order: 9j (done, PR 52), 9g, 9h1-9h4 above, then:
  - [ ] S0 Spirits design round: Claude drafts 3-4 concepts (name, HP,
    perk, how it changes folding); the user picks two (questions, no code)
  - [ ] S1 First new spirit (unlock cost; every floor still proves with it)
  - [ ] S2 Second new spirit
  - [ ] E0 Endless design round: the twist list and the curve past floor 9
  - [ ] E1 Endless: keep going after the Crane, floors from the whole
    pool, harder each loop
  - [ ] E2 Twists: pick 1 of 3 at each loop (offer screen); deepest
    loop and floor in Stats

## Log (last 3; older in docs/PROGRESS-LOG.md)

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

### PR 50: Less device data in `session.start` (2026-10-16 data review)
- User's choice (OPEN-QUESTIONS "Offline: does feedback follow 'Share
  play data'?", same entry): `deviceInfo()` (`telemetry/browser.js`) no
  longer sends `ua` or `tzOffset`; no analysis used them. `session.start`
  is now `dv: 2`; `dv: 1` rows in the Sheet still carry both.
- docs/07 data dictionary updated; `tools/queue-size.js` sample matches
  (sizes unchanged in practice, about 30 KB a full run).
- Test: `deviceInfo()` with stubbed browser globals has neither field.
- Changelog 0.9.8.

### PR 52: Phase 9j, Send Feedback / Report a Bug, Privacy page
- User's choices (all the recommended ones; OPEN-QUESTIONS "Send
  Feedback / Report a Bug"): Settings › About row and a pause menu entry;
  kind (Bug / Idea / Something else) + one message (1,000 chars); no
  contact field; install id only with "Share play data" on; "Thanks!"
  (offline: sends later) and Back; Privacy as an in-game screen; Sheet
  `feedback` tab and the `READ_KEY` read in one paste.
- `telemetry/telemetry.js`: `ALWAYS_SEND` (`feedback`) and option
  `alwaysTypes`: a disabled client still records, keeps (reload, turning
  sharing off) and sends those, with `install: null`. `browser.js` passes
  `[]` under `?telemetry=off`; adds `feedbackDevice()` (viewport,
  orientation, pointer, standalone) and `online()`.
- `telemetry/feedback.js` (pure): kinds, `cleanMessage` (trim, emails
  removed, cap), `feedbackContext(floorTag, turn)`, `feedbackData`.
  `main.js` `ctx.sendFeedback` queues and flushes.
- `ui/feedback.js` (form, screen `feedback`; the draft survives Back and
  Privacy), `ui/privacy.js` (`PRIVACY_SECTIONS`, screen `privacy`);
  in a run both are sheets, tagged with the floor (`openFeedback` in the
  floor screen). Settings Data row `privacy`.
- `tools/telemetry-sheets/Code.gs`: feedback copied to a `feedback` tab
  (objects as JSON, formula-looking text kept as text, in both sheets);
  `doGet` with `?key=` (Script property `READ_KEY`) returns events in
  pages. `tools/fetch-events.js` pages through it to NDJSON.
- Tests: `tests/feedback.test.js` (data, sending with sharing off,
  offline, privacy text names each field, Code.gs in a `vm` sandbox with
  fake Sheets: tab, escaping, keyed read, paging). Checked in headless
  Chromium against the local collector: title Settings and pause menu
  forms, draft kept through Privacy, emails removed, an offline note sent
  once back online with its floor context.
- Changelog 0.9.9.
