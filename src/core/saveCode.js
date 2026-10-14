// Save codes (playtest P6): a short code that moves a run to another
// device (Settings > Data). Pure; no DOM.
//
// A code holds the run as it was at the start of its current floor (or on
// its waiting relic offer): seed, spirit, floor, HP, relics, landings,
// floors cleared, hint counts. Moves made on the floor are not in it, so
// the floor starts over on the other device, as Restart Floor would (no
// new power). The offer itself is not stored: it is rolled again from the
// seed, which gives the same relics.
//
// Format: 'FW-' then Crockford base32 (no I, L, O, U) in groups of four,
// e.g. FW-2ABC-DEFG-HJKM-NPQR. Reading is forgiving: case, spaces and
// dashes don't matter, O reads as 0 and I / L as 1, and the 'FW' prefix
// may be left off (a code's first character is never F). The bits, most
// significant first:
//
//   version 4 | seed 32 | spirit 3 | floor 4 | lastFloor 4 | hp 4 |
//   maxHp 4 | landings 3 | cleared 4 | offer 1 | clean 1 |
//   relic count 5, then 6 per relic (CODE_RELICS index), in order taken |
//   hint floors 4, then floor 4 + presses 6 each (capped at 63) |
//   CRC-10 of everything before it | zero padding to a whole character
//
// The CRC catches any one mistyped character and any swap of two
// neighbours. Only runs on a plain number seed (every saved run) have a
// code; daily seeds (Phase 7) will take a new version.

import { RUN_VERSION, BOSS_FLOOR, rollOffer, runLength } from './run.js';
import { RELIC_DEFS } from './relics.js';
import { SPIRIT_DEFS } from './spirits.js';
import { templateFloors } from './floors.js';

export const SAVE_CODE_VERSION = 1;

/**
 * Code order for spirits and relics. Append only: an id's position is
 * what codes store (0 = no spirit). tests check every def is listed.
 */
export const CODE_SPIRITS = Object.freeze([null, 'fox', 'frog', 'turtle']);
export const CODE_RELICS = Object.freeze([
  'extra-crease', 'thick-paper', 'recycled-crease', 'spring-crease', 'diagonal-crease',
  'paper-heart', 'laminate', 'soft-landing', 'folded-shield', 'mender', 'wax-coat',
  'master-key', 'paper-cut', 'heavy-stamp', 'origami-luck',
]);

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'FW';
const CRC_BITS = 10;
const CRC_POLY = 0x233;
const MAX_HINTS = 63;

/** Whether `seed` is a plain run seed: a whole number below 2^32, no leading zeros. */
export function isCodeSeed(seed) {
  return typeof seed === 'string' && /^(0|[1-9]\d{0,9})$/.test(seed) && Number(seed) < 2 ** 32;
}

/** The save code for `run` (a RunState still being played), or null if it has none. */
export function encodeSaveCode(run) {
  if (!run || run.status !== 'playing' || !isCodeSeed(run.seed)) return null;
  const spirit = CODE_SPIRITS.indexOf(run.spirit ?? null);
  const relics = run.relics.map((id) => CODE_RELICS.indexOf(id));
  const hints = Object.entries(run.hints || {})
    .map(([floor, n]) => [Number(floor), Math.min(MAX_HINTS, n)])
    .filter(([floor, n]) => n > 0 && floor >= 1 && floor < 16);
  const fields = [
    [SAVE_CODE_VERSION, 4], [Number(run.seed), 32], [spirit, 3], [run.floor, 4], [run.lastFloor, 4],
    [run.hp, 4], [run.maxHp, 4], [run.landings || 0, 3], [run.cleared, 4], [run.offer ? 1 : 0, 1],
    [run.clean ? 1 : 0, 1], [relics.length, 5], ...relics.map((r) => [r, 6]),
    [hints.length, 4], ...hints.flatMap(([floor, n]) => [[floor, 4], [n, 6]]),
  ];
  // Anything that doesn't fit (or is unknown) means no code, never a wrong one.
  if (fields.some(([v, bits]) => !Number.isInteger(v) || v < 0 || v >= 2 ** bits)) return null;
  const out = [];
  for (const [v, bits] of fields) writeBits(out, v, bits);
  writeBits(out, crc10(out), CRC_BITS);
  while (out.length % 5) out.push(0);
  let chars = '';
  for (let i = 0; i < out.length; i += 5) chars += ALPHABET[readNumber(out, i, 5)];
  return `${PREFIX}-${chars.match(/.{1,4}/g).join('-')}`;
}

/**
 * Read a code back. Returns { ok: true, run } with a RunState ready to
 * save, or { ok: false, reason }: 'empty', 'format' (not a code: bad
 * characters or too short), 'check' (a typo: the check failed), 'version'
 * (made by a newer game) or 'data' (checks out, but this game can't play
 * it: an unknown relic, a floor it doesn't have).
 */
export function decodeSaveCode(text, { floors = templateFloors() } = {}) {
  let s = String(text ?? '').toUpperCase().replace(/[\s-]+/g, '');
  if (!s) return { ok: false, reason: 'empty' };
  if (s.startsWith(PREFIX)) s = s.slice(PREFIX.length);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  const bits = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { ok: false, reason: 'format' };
    writeBits(bits, v, 5);
  }
  let at = 0;
  const read = (n) => {
    if (at + n > bits.length) throw new RangeError('short');
    const v = readNumber(bits, at, n);
    at += n;
    return v;
  };
  let f;
  try {
    const version = read(4);
    // A newer game's layout can't be read here, so not even checked.
    if (version !== SAVE_CODE_VERSION) return { ok: false, reason: version > SAVE_CODE_VERSION ? 'version' : 'format' };
    f = {
      version, seed: read(32), spirit: read(3), floor: read(4), lastFloor: read(4), hp: read(4), maxHp: read(4),
      landings: read(3), cleared: read(4), offer: read(1), clean: read(1),
    };
    f.relics = Array.from({ length: read(5) }, () => read(6));
    f.hints = Array.from({ length: read(4) }, () => [read(4), read(6)]);
    const sum = crc10(bits.slice(0, at));
    if (read(CRC_BITS) !== sum) return { ok: false, reason: 'check' };
    // Padding: under one character, all zero.
    if (bits.length - at >= 5 || bits.slice(at).some((b) => b)) return { ok: false, reason: 'check' };
  } catch {
    return { ok: false, reason: 'format' };
  }
  const run = toRun(f, floors);
  return run ? { ok: true, run } : { ok: false, reason: 'data' };
}

/** The RunState a decoded code describes, or null if this game can't play it. */
function toRun(f, floors) {
  const spirit = CODE_SPIRITS[f.spirit];
  const relics = f.relics.map((r) => CODE_RELICS[r]);
  if (spirit === undefined || (spirit && !SPIRIT_DEFS[spirit])) return null;
  if (relics.some((id) => !id || !RELIC_DEFS[id]) || new Set(relics).size !== relics.length) return null;
  if (f.lastFloor < 1 || f.lastFloor > Math.min(BOSS_FLOOR, runLength(floors))) return null;
  if (f.floor < 1 || f.floor > f.lastFloor || f.cleared > f.floor - 1) return null;
  if (f.hp < 1 || f.hp > f.maxHp || (f.offer && f.floor < 2)) return null;
  const hints = {};
  for (const [floor, n] of f.hints) {
    if (floor < 1 || floor > f.lastFloor || !n || hints[floor]) return null;
    hints[floor] = n;
  }
  const run = {
    v: RUN_VERSION,
    seed: String(f.seed),
    spirit,
    floor: f.floor,
    lastFloor: f.lastFloor,
    hp: f.hp,
    maxHp: f.maxHp,
    relics,
    landings: f.landings,
    cleared: f.cleared,
    offer: null,
    clean: !!f.clean,
    ...(f.hints.length ? { hints } : {}),
    status: 'playing',
    cause: null,
  };
  // The offer waiting after the floor before this one (core/run.js finishFloor).
  if (f.offer) run.offer = rollOffer(run, f.floor - 1);
  return run;
}

function writeBits(out, value, bits) {
  for (let i = bits - 1; i >= 0; i--) out.push(Math.floor(value / 2 ** i) % 2);
}

function readNumber(bits, at, n) {
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 2 + bits[at + i];
  return v;
}

/** CRC-10 (poly 0x233, start 0x3FF) of a bit list. */
function crc10(bits) {
  let crc = 0x3ff;
  for (const b of bits) {
    const top = (crc >> 9) & 1;
    crc = (crc << 1) & 0x3ff;
    if (top ^ b) crc ^= CRC_POLY;
  }
  return crc;
}
