# Foldwork — UI, Input, Visuals, Audio

## Layout
- Single full-viewport `<canvas>` for the board plus a thin DOM overlay for HUD and menus.
- Responsive: the board is a square scaled to fit the smaller viewport dimension, centered. In landscape, the HUD sits at the side; in portrait, above and below the board.
- Safe-area insets respected on phones. No scrolling, no pinch zoom (lock viewport scale).
- Minimum touch target 44px.
- The board never sits under the HUD. In portrait the tutorial hint card sits above the action bar and the board moves up to make room (`layout.js` `reserve`); a long hint scrolls inside the card (at most 30% of the height). In landscape the side panel widens into spare width (168 to 300 px, `sideWidth`), relic chips wrap, actions sit in a grid at the panel's foot, and on short screens a long relic tray or hint scrolls above them.

## Accessibility checklist (Phase 8e)
Checked on every PR that touches UI, with `tools/layout-audit.js` (15 device sizes, from 320 px phones through the Galaxy S Ultra in both orientations to tablets and desktops; both text sizes; left-handed landscape) and `tests/contrast.test.js`.
- [x] Every button and field is at least 44x44 CSS px, on screen or in a scroll box.
- [x] Nothing scrolls the page; nothing spills out of its HUD bar or panel.
- [x] The HUD never covers the board; board cells stay at least 32 px.
- [x] Text contrast 4.5:1 (WCAG AA) for ink, soft ink and danger on the background and UI surfaces in every palette; primary buttons use `accentUi` with `onAccent` text (4.5:1), and focus rings `accentUi` (3:1 on the background).
- [x] Never color alone: tile symbols, hollow vs filled meters, dashed spent charges, rarity border styles, the ⚠ on errors, "✓" on pressed toggles.
- [x] Animation speed setting; reduced motion (system or Settings) makes folds instant and turns off screen shake and CSS transitions.
- [x] Large text setting (1.2x), checked at 320 px wide.
- [x] Full keyboard play (table above), visible focus rings, Esc closes panels; HUD meters, relics and hints have screen-reader labels and live regions.

## HUD
- HP (paper hearts), fold charges (small folded-paper icons), floor number, relic tray.
- **Undo** button (free undo of the last fold, per mechanics doc). Disabled when not available.
- **Hint** button (free, unlimited): the floor's tip, then the next step of a winning line marked on the board, or "can't be won from here". **Restart** button: the floor as it started, after a confirm.
- **Wait** button and a pause/menu button.
- Fold preview panel text is minimal; the board itself carries the information.

## Input
| Action | Mouse | Touch | Keyboard |
|---|---|---|---|
| Move / bump | Click adjacent tile | Tap adjacent tile (no swipe: a drag is always a fold) | Arrow keys / WASD |
| Fold | Drag across board, release to confirm (with diagonals unlocked, a drag near 45° gives a diagonal crease) | Drag, release to confirm | F to enter fold mode, arrows move crease, F flips the folding side, R turns the crease to the next axis (diagonals unlocked), Enter confirms, Esc cancels |
| Cancel fold | Drag outside board / right click | Drag off board or tap Cancel | Esc |
| Undo fold | Button / U | Button | U / Z |
| Wait | Button / Space | Button | Space |
| Pocket mode (Pocket Fold relic) | Pocket button / P | Pocket button | P; in fold mode the arrows along the crease move its lane, R turns it v ↔ h |
| Take back last turn (Rewind Charm) | Pause menu, or the defeat panel | Same | Same |

- All inputs use Pointer Events so mouse, touch, and pen share one code path.
- Drag-to-fold: on pointer down, record the start cell (this defines the folding side). The crease sits at the midpoint of the drag, like pulling a paper edge over. While dragging, snap the crease to the nearest valid grid line and show a live preview. On release, confirm if valid, otherwise show a brief invalid shake and cancel.
- Invalid previews (stack over 3, off-board) render in red with a small icon, never color alone.
- Input is ignored during animations, with a short input buffer for one queued action.

## Fold preview rendering
- Translucent overlay shows the destination layout: folded tiles ghosted at their landing cells, stack counts as small numerals.
- Enemy intent arrows appear if the Scout's Eye relic is held.
- Pinned creatures show a small paper-clip marker.

## Visual style (code-drawn)
- Paper-craft look: flat geometric shapes, soft drop shadows, and subtle procedural paper grain (low-contrast noise generated once to an offscreen canvas and reused). Grain is faint (about 3%, scaled per palette). Shadows are soft: under the board, under each raised layer, beside a raised stack (longer when taller) and under a folding sheet (wider as it flies).
- Screen shake: a small, quick wobble of the board when the player is hurt, the boss swats them, or anything drops into the void. On by default with a Settings toggle; never under reduced motion.
- Tile faces are warm off-white with colored accents; different tile types use both color and a distinct symbol/pattern (colorblind-safe).
- Layers are drawn as slightly offset stacked sheets, with a visible edge thickness per layer.
- Creatures are simple origami-inspired polygons built from triangles and rhombi (Mite = small beetle, Wasp = triangular wasp, Brute = boxy golem, etc.). Defined as data, drawn by a shared vector routine.
- Size and alignment guide (tested in `tests/creatures.test.js`): creature art stays inside 0.05–0.95 of the tile face, is centred left to right, and stands on a shared foot line (0.86) above its shadow. Height marks weight class: small (Mite, Wasp) 0.45–0.65, medium (player, Creaseling, Lockjaw, Spore Bloom) 0.65–0.85, large (Card Brute) up to 0.9. Tile glyphs are centred on the face; corners hold link marks, HP pips and clips.
- Fold animation: the folding half rotates around the crease with perspective-like scaling (cosine of fold angle), then settles onto the stack. Duration 350–450ms, adjustable by an animation speed setting, and instant if reduced-motion is on.
- Palette: 3 built-in palettes (default Paper, Night Ink, High Contrast). Extra palettes are unlockable cosmetics (Kraft, Blueprint); Settings lists only owned ones.

## Audio (Web Audio API only)
- Audio starts after the first user gesture (browser autoplay rules).
- SFX synthesized with oscillators, noise buffers, and envelopes: fold swish/crinkle, bump hit, pin, door open, key pickup, fall, relic chosen, boss telegraph, victory and defeat motifs.
- Ambient: a soft generative loop (slow pentatonic pads and gentle plucks driven by the seeded RNG), low CPU.
- Controls: master volume, music volume, SFX volume, mute. Saved in settings.

## Screens
1. Title (Continue Run, New Run, Daily Seed, Unlocks, Stats & History, How to Play, Settings; icon corners: Back to Projects top-left, Share top-right)
2. Spirit select
3. Floor (gameplay)
4. Relic choice (3 cards; 4th rest option on floors 4 and 7)
5. Run summary (floors cleared, scraps earned, unlocks)
6. Unlocks shop (spirits, relics, palettes; scrap bank on top; Buy then Confirm; locked items show a lock and their cost; owned palettes have Use)
7. Settings, in groups: Display (palette, text size, animation speed, reduced motion, screen shake, left-handed layout), Gameplay (tap-to-confirm folds, tutorial hints), Data (share play data, privacy, save code, restore defaults, reset progress), Audio, About (send feedback / report a bug, version, credits)
8. Pause menu, from the floor's Menu button (Resume, Restart Floor, How to Play, Settings, Abandon Run, Save & Quit to Title)
9. Stats & History (totals, best run, by spirit, the last 20 runs, daily history with current and best streaks; read only)

## Tutorial
- Floors 1–2 are scripted guided puzzles with short on-screen hints:
  1. Drag a crease to fold a floor tile over a void and walk across.
  2. Stack a creature, understand pinning, and use a pressure plate.
- Hints appear once, can be dismissed, and are re-viewable via How to Play.
