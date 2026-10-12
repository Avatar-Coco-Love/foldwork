# Foldwork — Phased Build Plan

Build one phase at a time. Finish, test, and summarize before moving on. Each phase should leave the game in a runnable state.

## Phase 0 — Scaffolding
- Repo structure, `index.html`, canvas setup, responsive scaling, screen router stub, seeded RNG, test harness.
- **Done when:** a blank board renders correctly on desktop, phone, and tablet viewports.

## Phase 1 — Board and folding core
- Board, layers, tile types (floor, wall, void), fold validation and application, undo snapshot.
- Drag-to-fold input with live preview (mouse, touch, keyboard).
- Fold animation.
- **Done when:** you can fold and unfold a test board, stacks respect the 3-layer limit, and tests pass.

## Phase 2 — Player, turns, combat
- Player movement, bump attack, wait, HP.
- Turn engine and event playback.
- Scrap Mite and basic enemy AI. Pin, strand, and void-drop rules.
- **Done when:** a floor is completable by combining movement and folds, with enemies behaving per the spec.

## Phase 3 — Puzzle tiles
- Keys, locks, pressure plates, exits.
- Floor templates for floors 1–3 and the guided tutorial hints.
- Solver v1 and floor validation.
- Telemetry foundation (`07-telemetry.md`): fixed envelope, offline queue, action-log replay, reference collector. Later phases only add `track()` calls.
- **Done when:** floors 1–3 are playable, validated solvable, and teach the mechanics.

## Phase 4 — Run structure
- Run state, floor progression, relic offers, relic hooks, spirits.
- Telemetry: relic offers and picks, spirit chosen, run end (won / lost, floor reached).
- Relic implementation in groups: fold relics first, then defense, then utility.
- **Done when:** a full run through floors 1–8 works end to end with at least 12 relics.

## Phase 5 — Full enemy roster and floors 4–8
- Paper Wasp, Card Brute, Creaseling, Lockjaw, Spore Bloom.
- Templates for floors 4–8 with seeded variation.
- **Done when:** all eight floors are playable, validated, and balanced for a 10–15 minute run.

## Phase 6 — Boss
- The Great Crane arena, telegraphed creases, three phases.
- Run summary and win/lose flow.
- **Done when:** a full run from floor 1 through the boss is possible.

## Phase 7 — Meta-progression and modes
- Paper scraps, unlocks shop, remaining relics (24 total), spirit unlocks, palettes.
- Daily seed mode.
- Persistence for meta, settings, and in-progress runs.
- Settings screen includes the "Share play data" toggle; telemetry for unlocks and daily runs.
- **Done when:** progress persists across sessions and the daily seed is identical across devices.

## Phase 8 — Audio and polish
- Synthesized SFX, ambient loop, volume controls.
- Paper grain, shadows, fold polish, screen shake, palettes, reduced-motion handling.
- **Done when:** the game feels cohesive and passes the accessibility checklist in `CLAUDE.md`.

## Phase 9 — Playtesting and balance
- Tune fold charges, enemy stats, boss, and relic power, using replayed telemetry (`tools/replay-check.js` as the base).
- Cross-device testing and performance pass.
- Home-screen manifest and optional offline caching.
- **Done when:** runs are consistently completable but not trivial, and framerate is stable on a mid-range phone.

## Later (post-launch backlog)
- Ink hazards and mirror tiles (new floor templates and relic interactions).
- Two more spirits (Rabbit, Koi).
- Additional relics, enemies, and a second boss.
- Optional endless mode.
- Service worker offline mode.

## Open questions log
Keep `docs/OPEN-QUESTIONS.md` updated. Current open items:
- Exact scrap costs and earn rates.
- Relic rarity assignments.
- Great Crane balance and arena templates.
- Names and mechanics for the two later spirits.
