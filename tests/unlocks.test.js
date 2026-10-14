import assert from 'node:assert/strict';
import { test } from './harness.js';
import { createMeta, parseMeta, bankScraps, META_VERSION } from '../src/core/meta.js';
import {
  SHOP_KINDS, RELIC_COSTS, PALETTE_COST, unlockCost, unlockWay, owns, ownedIds, buyUnlock, grantUnlock,
  shopCatalog, affordable, newlyAffordable, relicPool,
} from '../src/core/unlocks.js';
import { RELIC_DEFS } from '../src/core/relics.js';
import { SPIRIT_DEFS } from '../src/core/spirits.js';
import { PALETTES, DEFAULT_PALETTE_ID } from '../src/render/palette.js';
import {
  createRun, rollOffer, poolIds, RELIC_POOL_ALL, OFFER_SIZE,
} from '../src/core/run.js';
import { parseSave, createSave } from '../src/core/save.js';
import { encodeSaveCode, decodeSaveCode } from '../src/core/saveCode.js';
import { runSummary } from '../src/core/summary.js';
import { SETTINGS_GROUPS, rowChoices } from '../src/ui/settings.js';

const rich = (scraps) => ({ ...createMeta(), scraps });

// The starter set (user's choice, 7b). Sharp Edge and Compass join it
// when they are built (7c), for 12.
const STARTER_RELICS = [
  'extra-crease', 'spring-crease', 'paper-heart', 'laminate', 'mender', 'master-key', 'paper-cut', 'wax-coat',
  'soft-landing', 'folded-shield',
];

test('unlocks: the starter relics, spirits and palettes', () => {
  assert.deepEqual(ownedIds(createMeta(), 'relic'), Object.keys(RELIC_DEFS).filter((id) => STARTER_RELICS.includes(id)));
  assert.equal(ownedIds(createMeta(), 'relic').length, STARTER_RELICS.length);
  assert.deepEqual(ownedIds(createMeta(), 'spirit'), ['fox']);
  assert.deepEqual(ownedIds(createMeta(), 'palette'), ['paper', 'night-ink', 'high-contrast']);
  assert.ok(owns(createMeta(), 'palette', DEFAULT_PALETTE_ID), 'the default palette is always owned');
  // A new player's pool fills a whole run of offers (8 floors, 1 taken each).
  assert.ok(relicPool(createMeta()).length >= OFFER_SIZE + 7);
});

test('unlocks: costs (docs/03): relics by rarity, Frog 30, Turtle 50, palettes 50', () => {
  assert.deepEqual({ ...RELIC_COSTS }, { common: 40, uncommon: 70, rare: 120 });
  assert.equal(unlockCost('spirit', 'frog'), 30);
  assert.equal(unlockCost('spirit', 'turtle'), 50);
  assert.equal(unlockCost('spirit', 'fox'), null, 'a starter is not for sale');
  assert.equal(unlockCost('relic', 'origami-luck'), 120);
  assert.equal(unlockCost('relic', 'thick-paper'), 70);
  assert.equal(unlockCost('palette', 'kraft'), PALETTE_COST);
  assert.equal(unlockCost('relic', 'nope'), null);
  assert.equal(unlockCost('hat', 'fox'), null);
});

test('unlocks: every item of every kind is a starter or has a price', () => {
  for (const { kind, defs } of SHOP_KINDS) {
    for (const [id, def] of Object.entries(defs)) {
      assert.equal(def.id, id, `${kind} ${id}: id matches its key`);
      const way = unlockWay(def);
      if (way === 'shop') assert.ok(Number.isInteger(unlockCost(kind, id)) && unlockCost(kind, id) > 0, `${kind} ${id}: no price`);
      if (way === 'reward') assert.equal(typeof def.unlockText, 'string', `${kind} ${id}: say how to earn it`);
    }
    assert.ok(Object.values(defs).some((d) => unlockWay(d) === 'starter'), `${kind}: a new player owns one`);
  }
});

test('unlocks: buying spends scraps once; refusals leave the meta alone', () => {
  let meta = rich(100);
  const short = buyUnlock(rich(10), 'spirit', 'turtle');
  assert.deepEqual([short.ok, short.reason], [false, 'scraps']);
  const r = buyUnlock(meta, 'spirit', 'turtle');
  assert.ok(r.ok);
  meta = r.meta;
  assert.equal(meta.scraps, 50);
  assert.equal(meta.earned, 0, 'spending never lowers what was earned');
  assert.ok(owns(meta, 'spirit', 'turtle'));
  assert.deepEqual(meta.unlocks.spirit, ['turtle']);
  for (const [kind, id, reason] of [['spirit', 'turtle', 'owned'], ['spirit', 'fox', 'owned'], ['relic', 'nope', 'unknown']]) {
    const again = buyUnlock(meta, kind, id);
    assert.deepEqual([again.ok, again.reason], [false, reason], `${kind} ${id}`);
    assert.equal(again.meta, meta);
  }
  assert.equal(parseMeta(JSON.parse(JSON.stringify(meta))).unlocks.spirit[0], 'turtle', 'survives a save');
});

test('unlocks: grants are free; the shop lists items with their state', () => {
  const meta = grantUnlock(rich(45), 'relic', 'thick-paper');
  assert.equal(meta.scraps, 45);
  assert.ok(owns(meta, 'relic', 'thick-paper'));
  const items = shopCatalog(meta).flatMap((s) => s.items);
  const at = (kind, id) => items.find((it) => it.kind === kind && it.id === id);
  assert.equal(at('relic', 'thick-paper').state, 'owned');
  assert.equal(at('spirit', 'frog').state, 'buy');
  assert.deepEqual([at('spirit', 'turtle').state, at('spirit', 'turtle').short], ['short', 5]);
  assert.equal(at('relic', 'extra-crease'), undefined, 'starters are not shop items');
  assert.deepEqual(shopCatalog(meta).map((s) => s.kind), ['spirit', 'relic', 'palette']);
  assert.ok(shopCatalog(rich(0), { all: true }).flatMap((s) => s.items).every((it) => it.state === 'owned'), 'dev: all owned');
});

test('unlocks: what a run banked made affordable', () => {
  const before = rich(20);
  const after = bankScraps(before, 20);
  assert.deepEqual(newlyAffordable(before, after).map((it) => it.id), ['frog']);
  assert.ok(newlyAffordable(before, bankScraps(before, 30)).some((it) => it.id === 'kraft'));
  assert.deepEqual(newlyAffordable(after, bankScraps(after, 1)), []);
  assert.equal(affordable(rich(0)).length, 0);
  const sum = runSummary({ ...createRun({ seed: '1' }), status: 'lost', cause: 'hp' }, {
    earned: { lines: [], total: 20 }, total: 40, banked: true, affordable: newlyAffordable(before, after),
  });
  const row = sum.rows.find((r) => r.id === 'unlocks');
  assert.ok(row && row.items.some((line) => line === 'Frog (spirit): 30 scraps'), JSON.stringify(row));
  assert.ok(!runSummary({ ...createRun({ seed: '1' }), status: 'lost' }, { earned: { lines: [], total: 0 }, total: 0, banked: true, affordable: [] })
    .rows.some((r) => r.id === 'unlocks'));
});

test('meta: old metas gain unlocks; unknown kinds, ids and fields are kept', () => {
  const old = { v: 1, scraps: 12, earned: 30, runs: 3 };
  const m = parseMeta(old);
  assert.deepEqual(m.unlocks, createMeta().unlocks);
  assert.equal(m.scraps, 12);
  // From a newer build: a field, a kind and a relic this build doesn't know.
  const newer = parseMeta({
    v: META_VERSION + 1, scraps: 5, earned: 5, runs: 1, stats: { wins: 1 },
    unlocks: { relic: ['thick-paper', 'future-relic', 'thick-paper', 7], hat: ['top'] },
  });
  assert.equal(newer.v, META_VERSION + 1, 'a newer meta keeps its version');
  assert.deepEqual(newer.stats, { wins: 1 });
  assert.deepEqual(newer.unlocks.relic, ['thick-paper', 'future-relic']);
  assert.deepEqual(newer.unlocks.hat, ['top']);
  assert.ok(owns(newer, 'relic', 'thick-paper'));
  assert.ok(!owns(newer, 'relic', 'future-relic'), 'unknown here, so not owned, but not dropped');
  assert.ok(relicPool(newer).every((id) => RELIC_DEFS[id]));
  assert.deepEqual(parseMeta({ ...m, unlocks: 'broken' }).unlocks, createMeta().unlocks);
});

test('run pool: offers come only from the pool; old saves offer every relic', () => {
  const pool = ['thick-paper', 'laminate', 'mender', 'extra-crease'];
  const run = createRun({ seed: 'pool', pool });
  assert.deepEqual(run.pool, pool);
  for (let f = 1; f <= 8; f++) {
    for (const id of rollOffer(run, f).relics) assert.ok(pool.includes(id), id);
  }
  // A pool's order and unknown ids don't change the offer.
  const shuffled = createRun({ seed: 'pool', pool: ['gone-relic', ...pool.slice().reverse()] });
  assert.deepEqual(rollOffer(shuffled, 3), rollOffer(run, 3));
  // No pool (a save from before 7b) = every relic, the same offers as before.
  const { pool: _, ...legacy } = createRun({ seed: 'legacy' });
  assert.deepEqual(rollOffer(legacy, 2), rollOffer(createRun({ seed: 'legacy', pool: RELIC_POOL_ALL }), 2));
  assert.deepEqual(poolIds(undefined), Object.keys(RELIC_DEFS));
  assert.ok(parseSave(JSON.parse(JSON.stringify(createSave({ run: legacy })))), 'old saves still load');
  assert.ok(parseSave(JSON.parse(JSON.stringify(createSave({ run })))));
});

test('save code v3: an open pool stays open; an own pool takes the loading device\'s', () => {
  const open = createRun({ seed: '42', spirit: 'fox' });
  assert.deepEqual(decodeSaveCode(encodeSaveCode(open), { pool: ['laminate'] }).run.pool, RELIC_POOL_ALL);
  const own = createRun({ seed: '42', spirit: 'fox', pool: ['laminate', 'mender'] });
  const mine = ['laminate', 'thick-paper'];
  const back = decodeSaveCode(encodeSaveCode(own), { pool: mine });
  assert.ok(back.ok);
  assert.deepEqual(back.run.pool, mine);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(own)).run.pool, RELIC_POOL_ALL, 'no device pool given: every relic');
});

test('palettes: every palette has every token; Settings offers only owned ones', () => {
  const tokens = Object.keys(PALETTES[DEFAULT_PALETTE_ID]).filter((k) => !['unlock', 'cost'].includes(k)).sort();
  for (const p of Object.values(PALETTES)) {
    assert.deepEqual(Object.keys(p).filter((k) => !['unlock', 'cost'].includes(k)).sort(), tokens, p.id);
  }
  const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find((r) => r.id === 'palette');
  const ctx = (meta) => ({ owns: (kind, id) => owns(meta, kind, id) });
  assert.deepEqual(rowChoices(row, ctx(createMeta())).map((o) => o.id), ['paper', 'night-ink', 'high-contrast']);
  const bought = buyUnlock(rich(50), 'palette', 'blueprint').meta;
  assert.ok(rowChoices(row, ctx(bought)).some((o) => o.id === 'blueprint'));
  assert.equal(row.note(ctx(bought)), 'More palettes in Unlocks.', 'Kraft is still in the shop');
});

// WCAG relative luminance contrast, for the text and symbol colors.
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test('palettes: text and tile symbols keep readable contrast', () => {
  for (const p of Object.values(PALETTES)) {
    assert.ok(contrast(p.ink, p.background) >= 4.5, `${p.id}: ink on background`);
    assert.ok(contrast(p.glyph, p.tileFace) >= 4.5, `${p.id}: symbols on tiles`);
    assert.ok(contrast(p.inkSoft, p.background) >= 3, `${p.id}: soft ink on background`);
  }
});

test('save code: a v2 code (before the pool bit) still reads, on the device\'s pool', () => {
  // Made by the version 2 encoder: seed 2718281828, Turtle, floor 3,
  // Laminate, 5 fold kills.
  const v2 = decodeSaveCode('FW-58G5-P1J6-EA40-G513-0XH', { pool: ['laminate', 'mender'] });
  assert.ok(v2.ok);
  assert.deepEqual([v2.run.seed, v2.run.spirit, v2.run.floor, v2.run.foldKills], ['2718281828', 'turtle', 3, 5]);
  assert.deepEqual(v2.run.relics, ['laminate']);
  assert.deepEqual(v2.run.pool, ['laminate', 'mender']);
});
