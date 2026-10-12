# Foldwork — UI, Input, Visuals, Audio

## Layout
- Single full-viewport `<canvas>` for the board plus a thin DOM overlay for HUD and menus.
- Responsive: the board is a square scaled to fit the smaller viewport dimension, centered. In landscape, the HUD sits at the side; in portrait, above and below the board.
- Safe-area insets respected on phones. No scrolling, no pinch zoom (lock viewport scale).
- Minimum touch target 44px.

## HUD
- HP (paper hearts), fold charges (small folded-paper icons), floor number, relic tray.
- **Undo Fold** button (free undo of the last fold, per mechanics doc). Disabled when not available.
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

- All inputs use Pointer Events so mouse, touch, and pen share one code path.
- Drag-to-fold: on pointer down, record the start cell (this defines the folding side). The crease sits at the midpoint of the drag, like pulling a paper edge over. While dragging, snap the crease to the nearest valid grid line and show a live preview. On release, confirm if valid, otherwise show a brief invalid shake and cancel.
- Invalid previews (stack over 3, off-board) render in red with a small icon, never color alone.
- Input is ignored during animations, with a short input buffer for one queued action.

## Fold preview rendering
- Translucent overlay shows the destination layout: folded tiles ghosted at their landing cells, stack counts as small numerals.
- Enemy intent arrows appear if the Scout's Eye relic is held.
- Pinned creatures show a small paper-clip marker.

## Visual style (code-drawn)
- Paper-craft look: flat geometric shapes, soft drop shadows, and subtle procedural paper grain (low-contrast noise generated once to an offscreen canvas and reused).
- Tile faces are warm off-white with colored accents; different tile types use both color and a distinct symbol/pattern (colorblind-safe).
- Layers are drawn as slightly offset stacked sheets, with a visible edge thickness per layer.
- Creatures are simple origami-inspired polygons built from triangles and rhombi (Mite = small beetle, Wasp = triangular wasp, Brute = boxy golem, etc.). Defined as data, drawn by a shared vector routine.
- Size and alignment guide (tested in `tests/creatures.test.js`): creature art stays inside 0.05–0.95 of the tile face, is centred left to right, and stands on a shared foot line (0.86) above its shadow. Height marks weight class: small (Mite, Wasp) 0.45–0.65, medium (player, Creaseling, Lockjaw, Spore Bloom) 0.65–0.85, large (Card Brute) up to 0.9. Tile glyphs are centred on the face; corners hold link marks, HP pips and clips.
- Fold animation: the folding half rotates around the crease with perspective-like scaling (cosine of fold angle), then settles onto the stack. Duration 350–450ms, adjustable by an animation speed setting, and instant if reduced-motion is on.
- Palette: 3 built-in palettes (default Paper, Night Ink, High Contrast). Extra palettes are unlockable cosmetics.

## Audio (Web Audio API only)
- Audio starts after the first user gesture (browser autoplay rules).
- SFX synthesized with oscillators, noise buffers, and envelopes: fold swish/crinkle, bump hit, pin, door open, key pickup, fall, relic chosen, boss telegraph, victory and defeat motifs.
- Ambient: a soft generative loop (slow pentatonic pads and gentle plucks driven by the seeded RNG), low CPU.
- Controls: master volume, music volume, SFX volume, mute. Saved in settings.

## Screens
1. Title (New Run, Daily Seed, Unlocks, Settings, How to Play)
2. Spirit select
3. Floor (gameplay)
4. Relic choice (3 cards; 4th rest option on floors 4 and 7)
5. Run summary (floors cleared, scraps earned, unlocks)
6. Unlocks shop (relics, spirits, palettes)
7. Settings (audio, animation speed, palette, reduced motion, left-handed layout toggle)

## Tutorial
- Floors 1–2 are scripted guided puzzles with short on-screen hints:
  1. Drag a crease to fold a floor tile over a void and walk across.
  2. Stack a creature, understand pinning, and use a pressure plate.
- Hints appear once, can be dismissed, and are re-viewable via How to Play.
