# Foldwork — Overview

## Pitch
You are a paper spirit descending through a living origami dungeon. The floor is a sheet of folded paper, and you can fold it. Folding stacks tiles into layers, bridges gaps, drops keys onto locks, and crushes or strands enemies. Each floor is a small tactical puzzle; each run is a short roguelike descent built from fold-changing relics.

## Pillars
1. **The fold is everything.** Movement and combat are deliberately simple so folding carries all the depth.
2. **Every floor is a readable puzzle.** Small boards, clear rules, no hidden information. Failure should feel like "I misread the fold," never "I got unlucky."
3. **Short, complete runs.** 10–15 minutes, about 8 floors plus a boss. Playable in one commute.
4. **Zero-asset charm.** Everything is drawn and synthesized in code, so the style leans into clean geometry, soft palettes, and paper textures made from procedural shading.

## Locked decisions
| Area | Decision |
|---|---|
| Name | Foldwork |
| Pacing | Turn-based, grid |
| Run length | 10–15 min (~8 floors + boss) |
| Run structure | Linear floors, short relic choice between floors, boss at the end |
| Theme | Origami spirits, paper-craft look |
| Overlap rule | Layered stacking (top layer active; unfolding restores) |
| Fold limit | Fold charges per floor |
| Enemies | Fold with their tiles (crush, stack, strand) |
| Fold input | Drag a crease line with preview, release to confirm |
| Player verbs | Move + bump attack |
| Upgrades | Fold-modifying relics |
| Meta-progression | Unlock relics, fold types, and starting spirits using "paper scraps" earned per run; no raw power creep |
| Puzzle tiles (core) | Void gaps, keys and locks, pressure plates |
| Puzzle tiles (later) | Ink hazards, mirror tiles |
| Platforms | Browser on PC, phone, tablet |
| Enemies | 6 core fold-themed enemies |
| Boss | The Great Crane (refolds the arena, 3 phases) |
| Relics | 24 at launch (12 unlocked from start) |
| Spirits | Fox, Frog, Turtle (2 more later) |
| Tutorial | Guided floors 1–2, no separate mode |
| Audio | Synthesized SFX + soft generative ambient loop |
| Generation | Handcrafted templates + seeded variation, solver-validated |
| Modes | Standard run + daily seed |

## Doc index
- `CLAUDE.md` — project rules
- `01-overview.md` — this file
- `02-core-mechanics.md` — board, folding, turns
- `03-content.md` — enemies, boss, relics, spirits, progression
- `04-ui-input-visuals.md` — screens, input, rendering, audio
- `05-tech-architecture.md` — structure, data model, solver, persistence
- `06-build-plan.md` — phased build plan
- `07-telemetry.md` — play data: event envelope, backend contract, events
- `08-roadmap.md` — beyond Phase 9: 1.0, offline play, editor, materials, leaderboards

## Player experience loop
1. Enter a floor, read the layout, see enemies and goals.
2. Plan: preview crease lines, spend fold charges, move and bump.
3. Reach the exit tile (a folded-paper stairway).
4. Choose 1 of 3 relics (or a rare alternative).
5. Repeat until the boss floor, then win or fail.
6. Earn paper scraps, unlock content, start another run.

## Out of scope for v1
Multiplayer, online leaderboards, ink and mirror tiles (planned as a later phase), user accounts, external art or audio. (Anonymous telemetry is in scope: see `07-telemetry.md`. Later stages that lift some of these lines: `08-roadmap.md`.)
