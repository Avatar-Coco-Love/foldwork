// What's new: every release, newest first, as plain data. The newest entry
// is the game's version (config.js APP_VERSION reads it), so adding an
// entry is the version bump. One entry per merged PR.
//
// Version scheme (OPEN-QUESTIONS "Version and What's new"):
//   0.<phase>.<n>   phase: the build-plan phase in progress (docs/06);
//                   n: that phase's nth release. 1.0.0 is the launch.
//
// An entry: { version, date: 'YYYY-MM-DD', pr, title, notes: [string] }.
// Notes are for players: short, plain, what changed for them.

export const CHANGELOG = Object.freeze([
  {
    version: '0.9.1', date: '2026-10-14', pr: 42,
    title: 'Sharing play data',
    notes: [
      'Foldwork now shares anonymous play data (how floors, folds and hints go, and your device type) to help balance the game. No names, accounts or anything you type.',
      'Turn it off any time: Settings > Data > Share play data.',
    ],
  },
  {
    version: '0.9.0', date: '2026-10-14', pr: 41,
    title: 'Hints with diagonal creases',
    notes: [
      'Hint finds a way through again when you can fold diagonally (the Frog, Diagonal Crease). It used to give up on some floors that could still be won.',
      'When Hint does give up, it now says the search ran out, not that there is no way through.',
    ],
  },
  {
    version: '0.8.7', date: '2026-10-14', pr: 40,
    title: 'Restore defaults',
    notes: [
      'Settings > Audio: Restore audio defaults.',
      'Settings > Data: Restore default settings (tap twice). Your runs, progress and play-data choice stay.',
    ],
  },
  {
    version: '0.8.6', date: '2026-10-14', pr: 39,
    title: 'Music you can hear, and this page',
    notes: [
      'The ambient music is louder and its low notes an octave higher, so phone and laptop speakers carry it.',
      'What\'s new: tap the version in Settings to see every update.',
      'The version number now goes up with every update.',
    ],
  },
  {
    version: '0.8.5', date: '2026-10-14', pr: 38,
    title: 'Fits every screen',
    notes: ['Menus and the board line up on phones, tablets and desktops, in both orientations.', 'Hint cards no longer cover the board.', 'Easier-to-read buttons in every palette.'],
  },
  {
    version: '0.8.4', date: '2026-10-14', pr: 37,
    title: 'Paper and shadows',
    notes: ['Paper grain, soft shadows under folds and creatures, and smoother folds.', 'A small screen shake when you are hit (Settings can turn it off).'],
  },
  {
    version: '0.8.3', date: '2026-10-14', pr: 36,
    title: 'Playtest fixes',
    notes: ['Fold a flap back along its crease to lift it.', 'Paper Wasps can see you when you stand higher.', 'The top bar no longer slides under the address bar.'],
  },
  {
    version: '0.8.2', date: '2026-10-14', pr: 35,
    title: 'Ambient music',
    notes: ['A gentle generated soundtrack on every screen, darker on the boss floor.'],
  },
  {
    version: '0.8.1', date: '2026-10-14', pr: 34,
    title: 'Sound effects',
    notes: ['Folds, hits, doors and more make sounds, all made in code.', 'Settings > Audio: master, music and effects volumes, and mute.'],
  },
  {
    version: '0.7.5', date: '2026-10-14', pr: 33,
    title: 'Stats & History',
    notes: ['A record of your runs, wins, best run and dailies.', 'Settings > Data: Reset progress.'],
  },
  {
    version: '0.7.4', date: '2026-10-14', pr: 32,
    title: 'Daily Seed',
    notes: ['The same run for everyone, every day.'],
  },
  {
    version: '0.7.3', date: '2026-10-14', pr: 31,
    title: 'Nine more relics',
    notes: ['24 relics in all, with rarities: pins, tape, traps, the Rewind Charm and more.'],
  },
  {
    version: '0.7.2', date: '2026-10-14', pr: 30,
    title: 'Unlocks',
    notes: ['Spend paper scraps on spirits, relics and palettes.'],
  },
  {
    version: '0.7.1', date: '2026-10-14', pr: 29,
    title: 'Paper scraps',
    notes: ['Every run earns paper scraps, kept between runs.'],
  },
  {
    version: '0.6.12', date: '2026-10-14', pr: 28,
    title: 'Run summary',
    notes: ['A summary at the end of every run, won or lost.'],
  },
  {
    version: '0.6.11', date: '2026-10-14', pr: 27,
    title: 'The Crane fights back',
    notes: ['The Great Crane\'s later phases: minions and double creases.'],
  },
  {
    version: '0.6.10', date: '2026-10-14', pr: 26,
    title: 'Save codes and challenges',
    notes: ['Move a run to another device with a save code.', 'Challenge a friend to your run with a link.'],
  },
  {
    version: '0.6.9', date: '2026-10-14', pr: 25,
    title: 'Fairer fights',
    notes: ['Lockjaw warns before it bites.', 'Resting heals 2 HP, and a floor cleared without damage gives 1.'],
  },
  {
    version: '0.6.8', date: '2026-10-13', pr: 24,
    title: 'Fold history',
    notes: ['A list of your folds in the pause menu: peek at the board before each, or rewind.'],
  },
  {
    version: '0.6.7', date: '2026-10-13', pr: 23,
    title: 'Crease marks',
    notes: ['Numbered marks show where you folded.', 'Optional tap to confirm each fold.'],
  },
  {
    version: '0.6.6', date: '2026-10-13', pr: 22,
    title: 'Back button',
    notes: ['The phone or browser Back button goes back in the game.'],
  },
  {
    version: '0.6.5', date: '2026-10-13', pr: 21,
    title: 'New menus',
    notes: ['A new title screen, a Settings screen and a pause menu.'],
  },
  {
    version: '0.6.4', date: '2026-10-13', pr: 20,
    title: 'Hints and restarts',
    notes: ['A Hint button that nudges, shows a next step, or says when a floor can\'t be won.', 'Restart Floor.'],
  },
  {
    version: '0.6.3', date: '2026-10-12', pr: 19,
    title: 'Continue your run',
    notes: ['Runs save as you play; Continue picks up where you left off.', 'Share Foldwork from the title.'],
  },
  {
    version: '0.6.2', date: '2026-10-12', pr: 18,
    title: 'The boss floor',
    notes: ['Floor 9: the Great Crane\'s arena. It warns where it will crease next.'],
  },
  {
    version: '0.6.1', date: '2026-10-12', pr: 17,
    title: 'The Great Crane',
    notes: ['The boss arrives: it creases the floor in strips.'],
  },
  {
    version: '0.5.5', date: '2026-10-12', pr: 16,
    title: 'Link preview',
    notes: ['Shared links show a Foldwork preview card.'],
  },
  {
    version: '0.5.4', date: '2026-10-12', pr: 15,
    title: 'Floors 5 and 8',
    notes: ['Two floors that mix every enemy and tile so far.'],
  },
  {
    version: '0.5.3', date: '2026-10-12', pr: 14,
    title: 'Lockjaw and Spore Bloom',
    notes: ['Two new enemies, and floors 6 and 7.'],
  },
  {
    version: '0.5.2', date: '2026-10-12', pr: 13,
    title: 'Creaseling',
    notes: ['A new enemy that slides along your creases toward you, and floor 4.'],
  },
  {
    version: '0.5.1', date: '2026-10-12', pr: 12,
    title: 'Wasps and Brutes',
    notes: ['Paper Wasp and Card Brute join the dungeon.', 'The Wax Coat relic.'],
  },
  {
    version: '0.4.3', date: '2026-10-12', pr: 11,
    title: 'Spirits',
    notes: ['Choose a spirit for each run: Fox, Frog or Turtle.', 'Diagonal creases.'],
  },
  {
    version: '0.4.2', date: '2026-10-12', pr: 10,
    title: 'Relic choices',
    notes: ['Pick a relic after each floor: 13 relics to find.'],
  },
  {
    version: '0.4.1', date: '2026-10-12', pr: 9,
    title: 'Runs',
    notes: ['Floors link into a run, and relics change how folds work.'],
  },
  {
    version: '0.3.2', date: '2026-10-12', pr: 8,
    title: 'First floors',
    notes: ['Floors 1 to 3, each one provably solvable.', 'Tutorial hints.'],
  },
  {
    version: '0.3.1', date: '2026-10-12', pr: 7,
    title: 'Puzzles',
    notes: ['Keys, locks, pressure plates, gates and the stairs out.'],
  },
  {
    version: '0.2.2', date: '2026-10-12', pr: 6,
    title: 'Scrap Mites',
    notes: ['The first enemy. Fold paper onto it to pin it, or fold it into the void.'],
  },
  {
    version: '0.2.1', date: '2026-10-12', pr: 5,
    title: 'Turns',
    notes: ['Move, bump and wait; folds cost charges.'],
  },
  {
    version: '0.1.3', date: '2026-10-12', pr: 4,
    title: 'Fold animation',
    notes: ['Folds animate, with animation speed and reduced motion settings.'],
  },
  {
    version: '0.1.2', date: '2026-10-12', pr: 3,
    title: 'Drag to fold',
    notes: ['Drag across the floor to fold it, with a live preview. Keyboard folds too.'],
  },
  {
    version: '0.1.1', date: '2026-10-12', pr: 2,
    title: 'Folding',
    notes: ['The folding rules behind everything.'],
  },
  {
    version: '0.0.1', date: '2026-10-12', pr: 1,
    title: 'First sheet',
    notes: ['A paper board on the screen.'],
  },
]);

/** The game's version: the newest entry's. */
export const LATEST_VERSION = CHANGELOG[0].version;

/** Compare two 'a.b.c' versions: negative, 0 or positive. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** The entries newer than `seen` (a version, or null: none are new). */
export function newSince(seen) {
  if (!seen) return [];
  return CHANGELOG.filter((e) => compareVersions(e.version, seen) > 0);
}

/**
 * The version a player has seen What's new up to, at startup. `stored` is
 * the saved one (or null); a player with no saved one who has played
 * before (`returning`) predates the page, so the newest entry is new to
 * them. A new player has nothing new.
 */
export function startingSeen(stored, returning) {
  if (typeof stored === 'string' && /^\d+\.\d+\.\d+$/.test(stored)) return stored;
  return returning && CHANGELOG[1] ? CHANGELOG[1].version : LATEST_VERSION;
}

/** '2026-10-14' → 'Oct 14, 2026' (fixed English, no locale or time zone). */
export function dateText(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
