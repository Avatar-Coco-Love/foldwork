# Open Questions

Design questions awaiting a decision. Add new ones as they come up; move them
to "Resolved" with the answer once decided.

## Open
These belong to later phases and get decided when that phase is built.
- Exact scrap costs and earn rates (Phase 7; tune in Phase 9).
- Relic rarities and offer weights (provisional since 4b; tune in Phase 9
  playtests). Weights common 6 / uncommon 3 / rare 1. Common: Extra Crease,
  Spring Crease, Paper Heart, Laminate, Mender, Master Key, Paper Cut,
  Wax Coat. Uncommon: Thick Paper, Recycled Crease, Soft Landing, Folded
  Shield, Heavy Stamp. Rare: Origami Luck. The 10 relics not built yet get theirs
  when they arrive (aim: ~12/8/4 overall, docs/03).
- Telemetry start: collection is off (`TELEMETRY.collect: false`) until the
  first playtests have been watched; then deploy the Sheets collector and
  switch it on (docs/07).
- Great Crane arena layout and charges (6a, being tuned); phase 2-3
  behaviour (6b).
- Names and mechanics for the two later spirits (post-launch; ideas: Rabbit,
  Koi).
- Telemetry consent before a public launch: is "on by default, with an
  off switch and a short notice" right for the target regions, or should it
  be opt-in (a first-run prompt)? Where is the notice shown? The repo ships
  with no endpoint, so nothing is sent until this is decided and an
  endpoint is configured in `src/config.js`.

- Diagonal creases shortcut many floors (Phase 9 balance). With the
  Frog (or Diagonal Crease), `f5-press` takes 3 turns instead of 10,
  `f3-ferry` 7 instead of 17, `f4-gatehouse` 11 instead of 20. Templates
  prove their `needs` with straight folds only. Options: accept it as the
  Frog's strength, prove templates with diagonals too, or block the
  shortcuts with thick card.

- Send Feedback / Report a Bug (P3 About): deferred by the user to the
  telemetry setup. Likely route: the same Google Sheets collector
  (Apps Script web app) with a short free-text form, which needs its own
  privacy note (docs/07 says "no free text" today). Hidden until then.
- Share preview on Android (P3): if sharing only `{title, url}` with a
  drawn favicon still shows "Sharing text" and a mail icon on the user's
  phone, that sheet is the device's and we stop there (sharing an image
  file would load `share.png`, which the game must not).

## Resolved
- Back to Projects (P3, user's choice): links to
  `https://avatar-coco-love.github.io/` (in `src/config.js`).
- Hint button (P2, decided while building): the step search tries a line
  that loses no HP first (solver `noDamage`, also the faster search),
  then any line, saying when every line costs HP. Caps are the floor
  proofs' (40000 states, 40 turns), in a module Web Worker; the search
  starts when the tip shows, so the step is usually ready. "Can't be won
  from here" only when the search finished; if it hit the caps it says no
  line turned up. Restart Floor asks first (it can't be undone); keys H
  and R (R outside keyboard fold mode). The floor's hint count survives
  Restart Floor and saves, and lands on the run as `run.hints`.
- Menu redesign (user's proposal, reviewed against the code; built in
  P3, PR 21). Changes from the proposal are marked. Left-handed layout
  moves only the landscape side panel (portrait has no side to swap).
  Credits (user's wording): "Made by Cody Joshua Clements, built with
  Claude."
  - **Title**: Continue Run (only with a save), New Run, How to Play,
    Settings. Later phases add rows: Daily Seed, Unlocks (the proposal's
    "Collection"), Stats & History (Phase 7). Corner icon buttons, no
    visible words (aria-label, 44px): top-left **Back to Projects**,
    top-right **Share**. Palette, Animation, Reduced motion and Share play
    data leave the title for Settings.
  - **Rows are data**: a `TITLE_ROWS` table (`{id, label, show(ctx),
    go}`) and Settings groups of rows built from the option tables already
    in `ui/settings.js`, so a later phase adds a row, not mount code.
  - **Share**: it already sends title, text and url. Chrome on Android
    joins text + url into one text share, so the sheet says "Sharing
    text" with a generic mail icon, and the page has no icon
    (`<link rel="icon" href="data:,">`). Fix: share only `{title, url}`
    (link previews take the blurb from `og:description`) and draw a
    favicon in code (inline SVG data URI, no file). Desktop keeps the
    copy-link fallback, with a short "Link copied" toast by the icon.
  - **Pause menu**: the HUD Menu button opens it instead of leaving the
    floor. Resume, Restart Floor (P2), How to Play, Settings, Abandon Run
    (confirm), Save & Quit to Title. The run already autosaves after
    every action (P1), so Save & Quit just leaves. Board input pauses
    while it is open; Esc cancels a fold preview first, else toggles the
    menu. Back to Projects is on the title only.
  - **Settings screen** (from the title or the pause menu; Back returns
    to where it was opened):
    - Display: Palette, Text size (new: Normal / Large), Animation
      speed, Reduced motion, Left-handed layout (in docs/04 already;
      `layout.js` supports it).
    - Gameplay: Tap to confirm folds (P4), Show tutorial hints again.
    - Data: Share play data (when offered). Later: save code export /
      import (P6), reset progress (Phase 7).
    - Audio: Phase 8 (master, music, effects, mute).
    - About: version (`APP_VERSION`), credits, Send Feedback, Report a
      Bug.
  - **Dropped from the proposal**: an Undo on/off setting (every fold
    is reversible by design, CLAUDE.md; undo is a rule, not an option);
    a separate colorblind toggle (every palette is colorblind-safe and
    never relies on color alone, hard rule 8; High Contrast is the
    stronger choice); a changelog screen (the version is enough for now;
    revisit in Phase 9).
  - **Why P3**: P2 adds Restart Floor and Hint to an already full HUD;
    the pause menu gives them room. P4's tap-to-confirm and P6's save
    code need a Settings screen to live in.
- Playtest round 1 (user's choices, before Phase 6b). Feedback: Lockjaws
  felt unbeatable (fighting one costs 2 HP: it bites on arrival and
  again after the first hit; two cost 4, max HP is 2-4); floor 2's void
  crossing (riding your own row's fold, then stepping off the plate into
  the open gate) wasn't discoverable; folds were hard to read back or
  unwind after a wrong drag; runs ended on Menu. Every floor is already
  proven winnable with no damage, so the fixes are mostly about teaching.
  Decided, built in order P1-P6 (docs/PROGRESS.md; P3 menus was added
  later, see "Menu redesign"):
  - Saves: **one autosave slot** (no save-scumming), after every action.
    Plus a save code to move a run between devices (P6).
  - Share button on the title; later a Challenge-a-friend seed link (P6).
  - Hints: **free and unlimited**, three levels (written nudge, next step
    from the solver, "can't be won from here"); the count shows in the run
    summary.
  - **Restart Floor always available** (hints say when a floor can't be
    won from where you are).
  - Lockjaw: a visible **bite warning** (jaws open when you step next to
    it; it bites only if you're still adjacent next turn) and a tip that
    says to drop it into a void. HP: rest heals 2, +1 HP for a floor
    cleared without damage.
  - Fold history (P4, user confirmed all four parts, split P4a / P4b):
    each fold leaves a numbered crease mark on the paper; a history strip
    lists the folds; tapping one shows the board as it was before it
    and the paper it moved; "Rewind to here" replays the floor's log up
    to it (no new power: Restart Floor plus the same moves does the
    same). A tap-to-confirm fold setting for players who mis-drag.
    Decided while building P4a: marks are the player's folds only (a
    boss's fold isn't numbered); an undone fold loses its mark and the
    next fold takes its number; the mark stays where the crease was
    made. Tap-to-confirm holds only a valid drag (an invalid one is
    refused at once, as before); Fold or Enter plays it, and Cancel,
    Esc, Back or a tap on the board drops it (the tap doesn't move).
    Keyboard fold mode already confirms with Enter, so it is unchanged.
    Decided for P4b (user's choices): the list is a "Fold history" row
    in the pause menu (between How to Play and Settings), opening a
    full-screen sheet, not an always-visible strip, so it takes no room
    in play. It lists the folds still in effect, numbered like the
    square crease tags, each row a big touch target with a text
    description (number in a square tag, text, never color alone); with
    none it says "No folds yet". Tapping a row peeks: the board as it was
    just before that fold, with the fold preview showing the paper it
    moved (the title and buttons cover only the HUD). "Rewind to here"
    replays the floor's log up to that fold (`core/foldHistory.js`
    `rewindTo`). Back, Esc and the phone Back button go peek → list →
    pause menu. A rewind is **free**, keeps the Hint count, and is not a
    restart: the floor goes on as one attempt, with a `floor.rewind`
    event and an `x<n>` code in the telemetry log so replays stay exact.
    The saved log is cut to the rewind point.
    Decided while building P5: the warning is the Lockjaw's own state
    (`jaws`, def flag `warn`), set in the enemy phase, so a Lockjaw that
    a fold carries next to you also warns first. Open jaws stay open
    while you stay (it bites every turn, as before), and shut when you
    aren't next to it or when it's pinned. A pinned player counts as not
    next to it. Shown as an open-mouth pose plus a "!" tag (shape, not
    color). A fight now costs one bite. "Cleared without damage" means
    the player's HP at the win is not below the floor's start HP (no
    in-floor healing exists; blocked hits don't count as damage); the
    heal is capped at max HP and comes before Mender. Every template
    still proves (needs and no-damage lines) with the new rules.
  - P6 save code and challenge link (user's choices): the save code is
    **short and holds the run at the start of its floor** (seed, spirit,
    HP, relics, floor, a waiting offer, hint counts; ~17 characters, ~5
    more per 4 relics, e.g. FW-27CQ-KD0J-69K0-003K-C). Moves on the floor
    aren't in it, so it starts over there (as Restart Floor: no new
    power). Crockford base32 with a CRC-10 check (every single typo and
    neighbour swap is caught). Codes **can be loaded again**, even after
    the run ends (single-player, offline; it can't be enforced across
    devices anyway); loading over a saved run asks first. Loading is on
    the title's Settings only (in a run the Save code sheet shows the
    code and says so). The challenge link carries **the seed only**: the
    friend picks their own spirit. **Challenge a friend** is a pause-menu
    row (the run summary gets one in 6c); the link opens a "You've been
    challenged" card first on the title (Accept / Not now).
    Decided while building: a code drops the Hint presses on the floor
    in progress (the run keeps floors already won); the loaded run is a
    new telemetry run (`run.load`).
- Great Crane bumps (6a part 2, user's choice after a solver check): on
  the draft arena a no-fold search won at 1 HP (dodge every marked strip,
  bump 6 times; its own folds pile the paper to full stacks, then it has
  no valid crease). Skipping empty creases, measuring strips against the
  paper left, or 1-2 row strips didn't change that. Now a bump deals **no
  damage** and only makes it flee (def `boss.bump: 0`); only void drops
  hurt it (3 drops). Arena `f9-crane` gets **6 charges**: a beam search
  found no line with 5 or fewer (it stalled at two drops). Decided while
  building: a fold that wins the floor stops resolving its other landings,
  so a void that kills the Crane and another landing on the player in the
  same fold is a win (before, the floor was "won" with the player gone).
- Great Crane core rules (6a, user's choice after a solver check): a
  1-tile crane, **6 HP in 3 phases of 2**, not Heavy, never walks or bumps.
  Its only attack is its own fold, on a fixed two-beat cycle: it **marks** a
  crease in one enemy phase and **folds** it in the next, so the player
  always gets one action in between.
  - **Aim** (no RNG): straight creases only, and only a **strip** (the
    smaller side, at most half the rows or columns). It rides the strip
    (not clipped, never landing on the player's cell) or folds it from
    elsewhere, but never onto itself. It prefers covering the player,
    then ending closest to the player, then moving the fewest cells, then
    a fixed order (v before h, index ascending, before before after).
  - The mark is **locked**: if the board changed, it folds whatever is on
    that side now (it can pin or void-drop itself). Invalid when due, it
    **fizzles**. Pinned, its mark is cleared.
  - Its fold landing on the player is a **swat**: 1 damage (blockable)
    and the player moves to the nearest free footing (the new top of its
    cell if that is footing). Never a pin or an instant fall.
  - A **void drop deals 2** instead of killing it. **Every hit** (bump or
    drop) makes it **flee** to the free footing farthest from the player
    by walking distance (ties row-major), mark cleared.
  - Why strips and fleeing: with the first draft ("always ride its own
    half", perch on phase loss) its first fold collapsed the 7x7 to a
    3-row strip and the solver won in 8 turns by bumping, no folds. With
    strips + flee the solver's best line used a pre-emptive fold
    (fizzle), a bump and two void drops (10 turns, 3 folds); a hand line
    with no folds died in 6 turns.
  - Proof: a full solver search of the boss took ~170 s, so the arena
    template stores a winning line and the test replays it (exact, fast).
- F5 "pinning and stranding as the intended solution" (5d, decided while
  building): proven by a `pin` need. At 1 HP, with every fold that pins,
  strands or void-drops an enemy forbidden, the floor must be unwinnable.
  A line that takes hits without pinning is allowed (the lesson is the
  clean line). F5 and F8 use only enemies introduced earlier (no Lockjaw
  or Bloom on F5; F8 uses all but the Bloom, to keep proofs cheap).
- Run length while floors are missing (5c, user's choice): `runLength()`
  stops at the **first gap** in templated floors, so F6/F7 built before F5
  don't make a run reach an untemplated floor. Later floors stay reachable
  via dev `?floor=`. 5c stays ahead of 5d.
- Lockjaw key (5c, user's choice): on death the key drops on Lockjaw's
  cell (top layer; if it died pinned, on the layer covering it). If it
  **falls** into a void, the key lands on the **nearest free walkable
  top-layer tile** (BFS from where it fell, ties in the fixed `board.js`
  step order), so the floor stays winnable.
- Spore Bloom strand (5c, user's choice): a Bloom counts as stranded when
  there is **no walkable path from it to the player**; while stranded (or
  pinned) its spawn counter doesn't fire. Spawning resumes once the path
  reopens. (`fixed` still keeps it out of the walk-based strand event.)
- Spore Bloom spawn tile (5c, user's choice): the free adjacent tile
  **closest to the player**, ties broken in the fixed step order. No RNG,
  so the preview and solver can predict it.
- Lockjaw and Spore Bloom details (5c, decided while building): the
  Lockjaw bites only orthogonal neighbours, like every bump. Its key is a
  creature field (`item`, from the def's `carry`), so a fold that stacks
  the Lockjaw's sheet and a lock directly (either on top) delivers it like
  a key on paper. Nothing in the game damages a pinned creature yet, so
  "dies pinned" can't happen; if it does later, the key goes to the top
  layer of its cell. The Bloom's `sprout` starts at 3 and ticks in the
  enemy phase, so its first Mite comes at the end of turn 3; with no free
  neighbour it stays ready and spawns as soon as one frees up. A spawned
  Mite acts from the next turn. The Bloom never attacks. Stranding a
  Bloom is not a `strand` event (no Recycled Crease refund): `fixed`
  enemies still never strand.
- F7 `needs` (5c): only `fold` is proven. Proving the plate essential
  means searching every line while Mites keep spawning, which doesn't
  finish within the solver caps; the 3-high exit, gate and wall keep the
  gate in place by construction.
- Creaseling slide (5b, chosen from options): on a turn the player
  folds, it slides **instead of** its step, in its normal enemy-phase
  slot. It moves in its own lane **parallel to the crease** (vertical
  crease: up/down; horizontal: left/right; diagonal: diagonally), the way
  that gets closer to the player, up to 3 tiles. Level with the player
  along that lane, or unable to move even 1 tile, it steps like a Mite
  instead. It **stops before** the board edge, walls, locks, shut gates,
  voids, empty cells, any creature and the player's cell (even a pinned
  player's); stacks are climbed freely. The slide **never hits**: ending
  next to you, it bites next turn. Chosen over "slide at fold time plus
  a step" (too strong), "onto the crease, then along it" (hard to read)
  and "slides into holes" (breaks "enemies never step into voids").
- Creaseling details (5b): the slide is geometry only, so a stranded
  Creaseling still slides (it may un-strand itself; the fold still
  counted as a strand for Recycled Crease). A pinned one doesn't act. One
  riding the folded sheet slides from where it lands. The fold preview
  shows each slide as a dashed arrow and a dashed ring on the landing
  cell, computed by playing the real turn, so it's exact even when other
  enemies move first. A slide doesn't pick up items (enemies never do).
- Card Brute vs folds (5a): **Heavy.** A fold may not land anything on
  the Brute's cell; the fold is refused (no turn, no charge), and the
  preview marks the cell with a cross and a "!" badge ("Too heavy"). The
  one exception is a landing stack whose top is a hole: that drops it, as
  docs/03 says. A Brute riding a sheet lands on top as usual and pins what
  it covers (the player too). It can still be stranded. Pin effects
  (Recycled Crease; later Sharp Edge, Sticky Tape) never apply to it.
  Chosen over "climbs on top", "shoved aside" and "brief pin", which all
  need new placement rules. If playtests find it too strong, relax it
  then.
- Card Brute pace (5a): it sits out its first enemy phase, then acts every
  other turn (a per-creature `rest` counter, shown as a "z"). The counter
  ticks every enemy phase, stranded or not.
- Paper Wasp line of fire (5a): it stings for 1 when the player stands on
  a top layer in its row or column within 4 tiles. The shot is stopped by
  a solid top tile (wall, lock, shut gate), by any creature (no friendly
  fire), and by a stack taller than the Wasp's own (docs/03's "layer
  stacked over its line of sight"). It flies over voids and empty cells.
  It stings every turn it has a line. A pinned Wasp can't sting; a pinned
  player can't be stung. A Wasp never moves, so it is never "stranded"
  (no strand event, no Recycled Crease refund). Its lanes are drawn as
  dashed lines ending in a bar.
- Wax Coat (5a): a sting on the player is blocked before Folded Shield or
  Laminate, so it doesn't use them up. Common (provisional).
- Mixed enemy kinds in one template (5a): variants hand each group its
  own anchor set, so which kind stands where is part of the variant and
  every split is proven.
- Relic offers (4b): after every floor won except the last, pick 1 of 3
  (4 with Origami Luck), weighted by rarity, never a relic you own, never
  a repeat in one offer; seeded per floor (`offers-<n>`). There is no skip:
  a choice is required, unless the pool is empty. Rest (after floors 4
  and 7) heals 1 and can be taken at full HP (it says so on the card).
- Laminate / Folded Shield (4b): both negate a whole hit on the player.
  Folded Shield's guard lasts until the end of the turn the fold was made
  (the enemy phase right after it) and is used first; Laminate's ward is
  per floor. Undo restores both, like everything else.
- Soft Landing (4b): only a step into a void or empty cell is caught
  (stay put, 1 damage that can't be blocked; it can still tear you at 1
  HP). Being void-dropped by a fold isn't caught: there's no previous tile,
  and the fold preview already warns. One use per run, carried as
  `run.landings`.
- Master Key (4b): "opens automatically" means the first lock you walk
  into on each floor opens without a key. A carried key is used first.
  Fold delivery is unaffected.
- Mender (4b): heals 1 after every 2nd floor cleared (run.cleared even),
  before the offer.
- Paper Cut (4b): "stacked tile" = the target's cell has 2+ layers. Only
  the player's bumps.
- Heavy Stamp (4b): the plate stays pressed the turn you step off and the
  next 2 (3 turns in all). A creature standing on it keeps it topped up.
- Not built yet (need later systems): Echo Fold, Crease Trap, Pocket
  Fold, Sticky Tape, Sharp Edge (fold relics; timed effects), Scout's Eye and
  Compass (render-side), Lucky Scrap (scraps, Phase 7), Rewind Charm.
- Telemetry hosting (4a): Google Sheets via an Apps Script web app for
  playtests (`tools/telemetry-sheets/`); a real database before launch.
- Run rules (4a, provisional, playtest them): HP carries between floors;
  healing comes from Paper Heart, Mender and rest (4b). Defeat ends the run
  (no more same-floor retry). Leaving mid-floor ends the run as
  `abandoned` until Phase 7 can save and resume runs.
- Spirits (4c, provisional): HP and perk per docs/03; all three can be
  picked until Phase 7 adds scrap unlock costs. Turtle's perk is Spring
  Crease's rule (undo 2 folds); Frog's is Diagonal Crease's. A relic the
  spirit already has is left out of its offers, so it never wastes a card.
  Fox's +1 charge stacks with Extra Crease. Dev runs (`?screen=floor`)
  start with no spirit (3 HP, no perk) unless `?spirit=` names one.
- Diagonal input (4c): a drag within 22.5° of a diagonal gives a diagonal
  crease (only when unlocked); the crease is still the drag's perpendicular
  bisector, snapped to the nearest line through cell centres. Keyboard: R
  turns the crease v → h → d → a; arrows push it. Hinge cells (on the
  line) can't start a drag-fold. Diagonal Crease relic: uncommon
  (provisional).
- Spring Crease (4a): undo unwinds up to 2 consecutive folds, one per
  press; any other action ends the chain (docs/02's undo window).
- Recycled Crease (4a): refunds 1 charge per fold (not per enemy) when it
  pins, strands or void-drops an enemy. Pinning yourself doesn't count.
- Thick Paper (4a): max stack 4, which also lets folds land on templates'
  3-high "thick card". That's the relic's power; floors stay solvable,
  since more legal folds never remove a solution.
- Mite tuning (decided in 3b): stats unchanged (1 HP, bites for 1). Floors
  control the pressure instead: 1 Mite on F1, 2 on F2, 1–2 on F3, on
  template anchors (mostly across the void, so they reach you only after a
  fold). The solver proves every variant winnable with its Mites.
- Template "thick card" (3b): a 3-high stack is a full stack, so nothing
  can land on it and it can only fold onto an empty cell. Templates use it
  to keep an exit, gate or wall row in place so the floor teaches what it
  is meant to (e.g. F2's gate can't be folded over). It follows from the
  existing stack limit; no new rule.
- Tutorial hints (3b): one card at a time, shown once per player (saved),
  never blocking play. A hint from a newer event replaces the card on
  screen. How to Play lists all of them and can re-arm them.
- Floor progression before Phase 4: clearing a floor offers the next one;
  after floor 3 the run ends with a "Run complete" panel. Defeat offers a
  retry of the same floor (same seed) until Phase 4 adds run loss.
- Telemetry design (3b): fixed envelope with opaque `data`, and floors
  record their full action log so new questions are answered by replay,
  not by new events or backend changes (`docs/07-telemetry.md`).
- Void drop (confirmed in 3a): a fold that lands a stack whose top layer is
  a void on a creature's cell drops it (it falls; the player too, which is
  defeat). Any other landing pins. This is the docs/02 "enemy left on a void
  cell" case, since creatures otherwise ride their layer.
- Touch swipe to move (decided in 3a): dropped. On the board a drag is
  always a fold, so tap an adjacent tile to move (docs/04 updated). This
  keeps the fold gesture unambiguous and a short drag (under half a cell)
  already counts as a tap.
- Diagonal creases (decided in 3a, built with the relic in Phase 4): boards
  are always square (docs/02), so diagonals work on every board. A diagonal
  crease runs through cell centres (col - row = k, or col + row = k). Cells
  on the line are the hinge: they stay put and are not covered. Off-line
  cells mirror across it; any that land off-board are clipped, as usual.
- Keys are items on a layer (`layer.item`), not a tile, so they ride folds
  and anything (e.g. Lockjaw) can drop one. Walking onto a key picks it up.
  Keys are per floor and do not carry over.
- Walking into a lock with a key uses the key, opens the lock (it becomes an
  open door) and steps in, all in one turn. Without a key the move is
  refused and takes no turn.
- Fold delivery: a fold that stacks a key's layer and a lock directly on
  each other, in either order, opens the lock and uses the key. The fold
  preview shows a key badge and the HUD says "Ready: opens a lock".
- Plates press while a creature (player or enemy) stands on their top layer.
  A covered plate is never pressed. Plates power gates with the same link
  (shown by a matching shape: dot, triangle, square). Gates update in the
  environment phase, after enemies, so stepping on a plate opens its gate
  at the end of that turn. A gate can't close on a creature.
- Reaching the exit wins at once: enemies don't get a last turn. Only the
  top layer counts, so an exit buried under a fold is inactive.
- Enemies don't pick up keys, but they do press plates. Locks and closed
  gates block them like walls.
- A player covered by a fold is pinned (kept, decided in 2b): can't move,
  but can wait, fold or undo. Enemies can't attack a pinned player.
- A fold that leads to defeat (e.g. a void dropped on the player) can't be
  undone: defeat ends the floor at once (decided in 2b).
- Empty (vacated) cells are void for enemies too: an enemy stepping into one
  falls. Enemy AI never steps into a void or empty cell on its own.
- Strand = an enemy with no walkable path to the player (walls, voids and
  empty cells block; stack heights don't). It waits. A fold that cuts an
  enemy off emits a `strand` event (for relics like Recycled Crease).
- Stack order when folding: the moved stack keeps its internal order (bottom
  stays bottom) and goes on top of the destination. There is no paper-style
  flip. (Tech doc: "preserving internal order".)
- Clipped tiles (mirror lands off-board) stay on their own source cell,
  unfolded and still active.
- Cells emptied by a fold (`layers: []`) behave as void, and are drawn as void.
- Drag-to-fold: the crease is the midpoint of the drag (paper-like), snapped to
  the nearest grid line. Keyboard fold mode: F again flips the folding side.
- Free undo refunds the fold charge, since it restores the exact prior state.
  This is implemented with charges in Phase 2a.
- Undo restores the whole floor state from before the fold (board, charges,
  and anything enemies did after it), not only the board.
- The player walking into an empty (vacated) cell falls, the same as a void
  tile. Walking into a void on purpose is allowed (docs/02: instant defeat).
- Walls and the board edge refuse a move without using the turn. Bumping a
  creature uses the turn.
