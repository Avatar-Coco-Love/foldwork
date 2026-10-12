# CLAUDE.md — Foldwork

Project rules for Claude Code. Read this first, every session.

## What this is
Foldwork is a browser-based, turn-based roguelike puzzle game. The player folds the paper-craft dungeon floor to solve puzzles and defeat enemies. Specs live in `/docs`. Build from them in phases (see `docs/06-build-plan.md` once written).

## Hard rules
1. **No external assets.** No image files, audio files, fonts files, sprite sheets, or CDN dependencies. All visuals are drawn in code (Canvas 2D). All audio is synthesized with the Web Audio API. System font stack only.
2. **Vanilla JS (ES modules), HTML, CSS.** No frameworks, no build step required to play. Opening `index.html` through any static server must work. (A tiny dev server script is fine.)
3. **Runs on PC, phone, and tablet browsers.** Mobile-first layout, responsive canvas, works in portrait and landscape.
4. **Input parity.** Everything must be playable with mouse, touch, or keyboard. Drag-to-fold must work with touch and mouse via Pointer Events.
5. **Deterministic game logic.** All randomness goes through a seeded RNG so runs are reproducible and testable. Game logic is separate from rendering.
6. **Offline-capable.** Save run state and meta-progression in `localStorage`. Wrap storage access in try/catch.
7. **Performance.** 60fps on a mid-range phone. Boards are small (see mechanics doc), so keep rendering simple and avoid per-frame allocations.
8. **Accessibility basics.** Colorblind-safe palette (never rely on color alone), adjustable animation speed, reduced-motion respect, large touch targets (min 44px).

## Architecture principles
- Pure logic modules (board, fold, enemy AI, relics) with no DOM access, so they can be unit tested.
- Rendering and input are thin layers over game state.
- Every fold is a reversible, previewable operation until confirmed.
- Data-driven content: enemies, relics, tiles, and floors defined as plain data objects.

## Working style
- Build one phase at a time. Finish and test it before starting the next.
- After each phase, summarize what works and what's next.
- If a spec is ambiguous, ask before inventing mechanics. Log open questions in `docs/OPEN-QUESTIONS.md`.
- Keep commits small and descriptive.
