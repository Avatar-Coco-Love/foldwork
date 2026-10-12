# Foldwork — Content (Draft 1)

All content is data-driven (plain JS objects). Numbers are starting values for tuning. **[OPEN]** items await design input.

## Run structure
- 8 floors, then the boss floor (9 total).
- Floors 1–2 are gentle (single mechanic each). Complexity ramps each floor.
- After each floor (not the boss): choose 1 of 3 relics. Floors 4 and 7 also offer a rest option (heal 1 HP) as a 4th choice.
- Board sizes: F1–2: 5x5, F3–5: 6x6, F6–8: 7x7, Boss: 7x7 special arena.
- Fold charges per floor: starts at 3, varies by floor template (2–4).

## Floor progression (introductions)
| Floor | New element | Enemy introduced |
|---|---|---|
| 1 | Folding basics, bridging a void | Scrap Mite |
| 2 | Pressure plates | Paper Wasp |
| 3 | Keys and locks | Card Brute |
| 4 | Combined plate + key puzzles | Creaseling |
| 5 | Pinning and stranding enemies as the intended solution | (mix) |
| 6 | Guarded keys | Lockjaw |
| 7 | Time pressure from spawners | Spore Bloom |
| 8 | Everything mixed, tight charges | (mix) |
| 9 | Boss: The Great Crane | Great Crane |

## Enemies (6)
| Enemy | HP | Behavior | Fold interaction |
|---|---|---|---|
| Scrap Mite | 1 | Moves 1 tile toward the player each turn; bumps to attack for 1. | Standard. Easily pinned or stranded. |
| Paper Wasp | 1 | Stationary. Hits the player for 1 if in clear line (row/column) within 4 tiles. | A layer stacked over its line of sight (taller than its own stack), a wall or another creature blocks the shot. Fold it away from line, or pin it, to disarm. |
| Card Brute | 3 | Moves every other turn toward the player (rests first); hits for 1. | **Cannot be pinned** (too heavy): a fold can't land on it, except a void sheet, which drops it. It can still be stranded. |
| Creaseling | 2 | After any fold, it slides along the crease line toward the player (up to 3 tiles): in its own lane, parallel to the crease, stopping before anything it can't stand on, any creature or you. The slide replaces its step and never hits. Otherwise moves like a Mite. | Fold-aware. Counter it by choosing creases that move it away from you; the fold preview shows each slide as a dashed arrow. Pinned, it can't slide. |
| Lockjaw | 2 | Stationary guard. Attacks adjacent tiles for 1. Holds a key (dropped on death). | Fold it away from its key spot, or deliver the key via a fold without fighting it. |
| Spore Bloom | 2 | Stationary. Spawns a Scrap Mite every 3 turns on an adjacent free tile. | Stranding or pinning stops its spawns. Pressure to solve quickly. |

## Boss: The Great Crane (floor 9)
A giant paper crane that refolds the arena itself. The player must out-fold it.
- 6 HP total, 3 phases (2 HP each). 7x7 arena with voids at the edges.
- **Telegraphed crease:** every 2 turns the Crane marks a crease line on the board (visible warning). On the next beat it executes the fold, stacking one side onto the other.
- The player can pre-empt by folding first to change what the Crane's fold does, or to pin the Crane under a layer.
- Damage comes from bump attacks when the Crane is adjacent and not pinned, and from folds that drop it onto a void tile.
- **Phase 1:** single telegraphed folds, no minions.
- **Phase 2:** spawns Scrap Mites on its fold; its folds carry minions with them.
- **Phase 3:** telegraphs two creases at once; the arena shrinks as edges fold under.
- **[OPEN]** Exact balance and arena templates; to be tuned in playtests.

## Spirits (starting characters)
| Spirit | HP | Perk |
|---|---|---|
| Fox | 3 | Starts each floor with +1 fold charge. |
| Frog | 2 | Diagonal creases unlocked from the start. |
| Turtle | 4 | Can undo the last two folds for free instead of one. |

- Fox is available from the start; Frog and Turtle unlock early using paper scraps (cheap).
- **[OPEN]** Two more spirits for post-launch unlocks (ideas: Rabbit with free first move each floor; Koi with fold preview of enemy turns).

## Relics (24)
**Fold relics (10)**
1. Extra Crease: +1 fold charge per floor.
2. Diagonal Crease: diagonal creases unlocked.
3. Sharp Edge: pinned creatures take 1 damage.
4. Thick Paper: max stack height +1.
5. Echo Fold: once per floor, fold twice in a single turn.
6. Recycled Crease: refund 1 charge when a fold pins, strands, or kills an enemy.
7. Crease Trap: creases leave a spiked line for 2 turns that damages enemies stepping on it.
8. Pocket Fold: fold only a single row or column strip.
9. Spring Crease: free undo works on the last 2 folds.
10. Sticky Tape: pinned enemies stay pinned 2 extra turns after unfolding.

**Defense relics (6)**
11. Paper Heart: +1 max HP and heal 1.
12. Laminate: ignore the first hit each floor.
13. Soft Landing: once per run, survive a fall into a void (return to previous tile, take 1 damage).
14. Folded Shield: after a fold, the next hit this turn cycle is negated.
15. Mender: heal 1 HP after every 2 floors.
16. Wax Coat: ranged attacks (Wasp) deal no damage to you.

**Utility relics (8)**
17. Scout's Eye: after previewing a fold, enemy next moves are shown.
18. Master Key: the first lock on each floor opens automatically.
19. Lucky Scrap: +50% paper scraps at the end of a run.
20. Compass: shows the exit tile even when buried under layers.
21. Paper Cut: bump attacks deal +1 damage against enemies on stacked tiles.
22. Rewind Charm: once per run, undo one full turn.
23. Heavy Stamp: a pressure plate you step off stays triggered for 3 turns.
24. Origami Luck: relic choices show 4 options instead of 3.

- Rarity: common/uncommon/rare (roughly 12/8/4). Rarity affects offer weights, not raw power. **[OPEN]** Rarity assignments.
- Unlocks: 12 relics available at the start; 12 unlock with paper scraps.

## Meta-progression: paper scraps
- Earn scraps per run: per floor cleared, per enemy defeated by fold (bonus), and a boss-clear bonus.
- Spend on: unlocking relics, spirits (Frog, Turtle), and cosmetic palette variants.
- No permanent stat upgrades. Unlocks add variety only.
- **[OPEN]** Exact scrap costs and earn rates.
