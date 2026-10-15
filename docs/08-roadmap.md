# Foldwork — Roadmap (beyond Phase 9)

Where the project goes after the build plan (`06-build-plan.md`). Nothing
here is built yet, and nothing here overrides `CLAUDE.md` or the locked
decisions in `01-overview.md` until it is moved into the build plan.
Decisions this roadmap needs are logged in `OPEN-QUESTIONS.md`
("Roadmap").

## Why this direction
The game's strongest asset is the systems under the content, not the
content itself:
- **Deterministic rules** (seeded RNG, pure logic modules).
- **A solver** that proves a floor solvable.
- **Action logs that replay exactly** (`core/replay.js`, telemetry
  `floor.end`).
- **Runs that travel as text** (save codes, Challenge-a-friend links).

Most puzzle games would have to build all of that before they could offer
player-made levels or trustworthy leaderboards. Foldwork already has it,
so the roadmap leans on those systems.

## Stage 0 — Finish Phase 9 and ship 1.0
Work that doesn't wait on playtest data, in order (PR chunks in
`PROGRESS.md`, 9g onward):

1. **Diagonal shortcuts decision.** The Frog / Diagonal Crease cut
   `f5-press` from 10 turns to 3, `f3-ferry` 17 to 7, `f4-gatehouse` 20 to
   11. Decide before authoring more templates: the answer changes how
   every template is proven. (OPEN-QUESTIONS.)
2. **Template depth.** 15 floor templates across 8 floors (F1 and F7 have
   one each, F5–F8 two at most). Runs repeat by the third or fourth.
   Target: 3+ per floor, F7 first. The solver keeps each one cheap to
   prove.
3. **Offline play** (requirement, see below): the game opens and plays
   with no connection, and everything recorded meanwhile (play data,
   feedback) is sent once the device is back online.
4. **Send Feedback / Report a Bug**, through the same collector and the
   same offline queue, with a privacy note for free text.
5. **1.0 checklist.** Written down so Phase 9 has an end: telemetry
   consent at launch, feedback live, minimum templates per floor, device
   sign-off (phone, tablet, installed app, offline), balance pass from
   telemetry (9c).

### Offline play (requirement)
A player must be able to open the game, play full runs, send feedback
and change settings with no connection, for as long as they like. When
the device is back online, everything queued in that time is delivered,
oldest first, without the player doing anything.

Already in place (`src/telemetry/`): the event queue persists in
`localStorage`; a failed send keeps events for later; the queue flushes on
the browser's `online` event, on page hide, and on the next launch's first
event. Saves and meta progress are local.

Gaps to close (all but feedback closed in 9i, 0.9.6: docs/07-telemetry.md
"Offline play"):
- **The game can't start offline.** No service worker caches the app
  shell (`index.html`, CSS, JS modules, manifest), so a home-screen
  install opens to a browser error without a connection. Add a service
  worker: cache on install, serve cache first, update in the background,
  and version the cache from `APP_VERSION` so a new release replaces it
  (the What's New flow already tells the player). Still no build step: a
  hand-written file list, checked by a test that every module imported
  from `src/main.js` is in it.
- **Page-hide beacons can drop events offline.** `navigator.sendBeacon`
  returns true when the browser accepts the request, not when it arrives,
  so events sent that way leave the queue even if the device is offline.
  Fix: skip the beacon (keep the queue) when `navigator.onLine` is false,
  and dedupe by event id on the collector (it already dedupes retries for
  6 h; make re-sends safe beyond that).
- **Long offline stretches lose their oldest events.** `maxQueue` is 500
  and drops the oldest. Size it for days of offline play (measure a real
  run's event count and bytes first), and when trimming, drop low-value
  events (`session.hide`, input noise) before `floor.end` and `run.end`.
  Feedback is never trimmed.
- **Flush on regaining focus**, not only on `online` (some browsers miss
  that event after sleep), with backoff so a dead endpoint isn't hammered.
- **Feedback** goes in the same persisted queue as its own event type,
  so it obeys the same offline rules. Ask: does feedback follow the
  "Share play data" switch, or is it always sent because the player
  wrote it on purpose? (OPEN-QUESTIONS.)

## Stage 1 — 1.x content (the existing backlog)
- Ink hazards and mirror tiles, with templates and relic interactions.
- Two more spirits (Rabbit, Koi; names and perks still open).
- More relics and enemies; a second boss.
- Optional endless mode (better after Stage 3's generator).

## Stage 2 — Level editor and shareable puzzles (2.0)
The recommended big step: it turns existing systems into a feature and
makes content the game doesn't have to author.
- **In-game editor:** place tiles, creatures, keys, plates, exits; set
  charges and the spirit. Same input rules (mouse, touch, keyboard).
- **Solver-gated sharing:** a level can't be shared until the solver
  proves it, so every shared level is beatable. The proof's line is
  stored as the par and the hint source.
- **Levels as URLs**, like challenge links: compact encoding, no server,
  no accounts. Versioned by `LOGIC_VERSION`.
- **Puzzle mode:** a hand-made campaign outside the roguelike, with par
  fold counts and stars, and a "Puzzle of the Day" beside the daily seed.
- Editor-made levels can feed the template pool (with review), which
  ends the template-depth problem.

## Stage 3 — Materials and acts
A run becomes three acts, each on a material that changes the fold
rules. Data-driven: material rules are entries like tile defs and the
fold `AXES` table.
- **Paper:** today's rules.
- **Card:** folds only along pre-scored lines.
- **Foil:** creases are permanent (no lifting, no undo).
- **Washi:** translucent; buried layers stay readable.
- **Silk:** folds slide, carrying creatures further.

Each act ends in its own boss. The 10–15 minute run stays as **Short
Run**; the full descent is a longer mode.

**Solver-driven generation:** generate, solve, keep. Starts as an
offline tool that proposes templates for review, later live for endless
mode.

## Stage 4 — Origami fold verbs
New ways to fold, taken from real origami, unlocked with scraps the way
spirits are (variety, not power, per the meta-progression rule):
- Reverse fold, squash fold, petal fold.
- One-off verbs: scissors (cut a strip away), crumple.
Each is a fold-rule entry with its own preview, so it fits the "the fold
is everything" pillar better than more relic stat tweaks.

## Stage 5 — Fair competition
- Daily-seed leaderboards and ghost replays.
- **Verified by replay:** every score arrives with its action log, and
  the server replays it through the real rules before accepting it, so
  cheating is caught for free.
- Needs a real backend (the Sheets collector won't do) and lifts the
  "no leaderboards" line in `01-overview.md`.
- Same offline rule: a run finished offline is submitted when back
  online, and still verifies because the log replays.

## Further out
- A bestiary / fold book drawn in code.
- App-store and Steam builds via a thin wrapper (TWA, Capacitor, Tauri).
  The browser game itself keeps needing no build step (rule 2).
- Same-device two-player: fold each other's floors.

## What has to change along the way
- **Scope lines** in `01-overview.md` ("Out of scope for v1") and
  `06-build-plan.md` move as each stage is adopted.
- **A real backend** (Stage 5 only; Stages 0–4 work without one).
- **`LOGIC_VERSION` becomes a public promise.** Shared levels and
  leaderboards depend on old logs replaying. Policy needed: keep old
  rule versions runnable, migrate levels, or expire them.
- **Storage budget.** Saves, queue, editor levels and replays share
  `localStorage` (~5 MB). Consider IndexedDB for levels and replays.

## Suggested order
1.0 → 1.x backlog → 2.0 editor and puzzle mode → materials and acts →
fold verbs → leaderboards.
