# Open Questions

Design questions awaiting a decision. Add new ones as they come up; once
decided, move them to the top of `docs/OPEN-QUESTIONS-RESOLVED.md` with
the answer. A reference like OPEN-QUESTIONS "Menu redesign" names an entry
in either file (grep both; most point to the resolved one).

## Open
These belong to later phases and get decided when that phase is built.
- Scrap rates and costs: settled in 7a (see OPEN-QUESTIONS-RESOLVED "Paper scraps");
  tune in Phase 9.
- Relic rarities and offer weights (provisional; tune in Phase 9
  playtests). Weights common 6 / uncommon 3 / rare 1; 12/8/4 since 7c.
  Common: Extra Crease, Spring Crease, Paper Heart, Laminate, Mender,
  Master Key, Paper Cut, Wax Coat, Sharp Edge, Compass, Sticky Tape,
  Crease Trap. Uncommon: Thick Paper, Recycled Crease, Diagonal Crease,
  Soft Landing, Folded Shield, Heavy Stamp, Scout's Eye, Lucky Scrap.
  Rare: Origami Luck, Echo Fold, Pocket Fold, Rewind Charm.
- Great Crane arena layout and charges (7 since 6b; fresh sheet and lift
  tags since 9d, see OPEN-QUESTIONS-RESOLVED; tune further in playtests).
- Two new spirits (content push, design round S0 in docs/PROGRESS.md):
  Claude drafts 3-4 concepts (name, HP, perk), the user picks two.
  Rabbit and Koi are only ideas (Koi overlaps Scout's Eye).
- Endless twists and difficulty curve (content push, design round E0):
  the twist list (pick 1 of 3 at each loop, settled) and how floors get
  harder past the Crane.
- Telemetry consent at launch: keep "on by default" (see OPEN-QUESTIONS-RESOLVED,
  playtests) or move to opt-in (a first-run prompt) for some regions?
  Revisit with the move from Sheets to a database.

- Share preview on Android (P3): if sharing only `{title, url}` with a
  drawn favicon still shows "Sharing text" and a mail icon on the user's
  phone, that sheet is the device's and we stop there (sharing an image
  file would load `share.png`, which the game must not).

### Roadmap (docs/08-roadmap.md)
Decisions the roadmap needs. None blocks Phase 9. (Diagonal shortcuts
and templates per floor were settled 2026-10-18: OPEN-QUESTIONS
"Content push".)
- **1.0 checklist contents** (roadmap Stage 0, item 5).
- **2.0 headline:** level editor and puzzle mode (recommended), or
  materials and acts first.
- **Editor levels in the template pool:** allowed after review, or kept
  to Puzzle mode only.
- **Materials list and act length:** which materials, and how long the
  long mode runs.
- **Fold verbs as unlocks:** which verbs, and whether they're per spirit
  or global.
- **Backend for leaderboards:** what replaces the Sheets collector, and
  whether telemetry moves with it.
- **`LOGIC_VERSION` policy** once levels and scores are public: keep old
  rule versions runnable, migrate, or expire.
- **Storage:** move editor levels and replays to IndexedDB?
