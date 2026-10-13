# Foldwork — Telemetry

Anonymous play data that tells us how floors, folds, hints and devices
actually behave. The goal is to answer questions we haven't thought of yet
**without changing the backend**. Two choices make that work:

1. **One fixed envelope, open `data`.** Every event has the same top-level
   fields. Everything specific to an event lives in `data`, which the
   backend stores exactly as it arrived and never validates. A new event,
   or a new field on an old one, is a client-only change.
2. **Record inputs, derive the rest.** Game logic is deterministic
   (`CLAUDE.md` rule 5). Each `floor.end` carries the floor's seed, template,
   variant and the full action log, so replaying it through the real rules
   (`core/replay.js`) rebuilds every turn. Most new metrics (where players
   die, which fold they try first, how often a Mite gets pinned) are an
   offline replay script, not a new event. `tools/replay-check.js` is the
   starting point.

## Client
- `src/telemetry/telemetry.js`: envelope, persisted queue (offline play
  is kept and sent later), batching, retry. No DOM; tested in Node.
- `src/telemetry/browser.js`: `fetch` / `sendBeacon` transport, device
  context, input-source tracking, error capture, flush on page hide.
- `src/telemetry/floorRecorder.js`: the per-floor action log and counters.
- `src/config.js`: `TELEMETRY.collect` (master switch, **off**: nothing
  is recorded, queued or given an install id, and the "Share play data"
  toggle is hidden; dev overrides below still work), `TELEMETRY.endpoint`
  (empty = nothing leaves the device), batch size, flush delay, queue cap;
  `APP_VERSION`, `LOGIC_VERSION`.
- Adding an event: `ctx.telemetry.track('thing.happened', { ... })`. If
  you later change that event's `data` shape, pass `{ dv: 2 }` so analysis
  can tell the versions apart. Never repurpose an existing field.
- Bump `LOGIC_VERSION` whenever a rule change would make an old action log
  replay differently. Replays skip logs from another logic version.

## Wire format
`POST <endpoint>` with `Content-Type: text/plain` (a CORS "simple request",
so no preflight, and the same thing `sendBeacon` sends). The body is JSON:

```json
{ "v": 1, "sent": 1760000000000, "events": [ Envelope, ... ] }
```

Envelope (version `v: 1`):

| Field | Meaning |
|---|---|
| `v` | Envelope version. Only changes if these fields change. |
| `id` | Unique event id. The backend dedupes on it (retries resend). |
| `type` | Dotted event name, e.g. `floor.end`. Open-ended. |
| `dv` | Data version for this `type` (default 1). |
| `ts` | Client clock, ms since epoch. |
| `seq` | Counter per session: ordering, and gaps mean lost events. |
| `install` | Anonymous random id, kept in `localStorage` (`foldwork.install`). |
| `session` | Random id per page load. |
| `run` | Run id while a run is active, else null. |
| `app` | `APP_VERSION`. |
| `logic` | `LOGIC_VERSION`. |
| `data` | Any JSON. Opaque to the backend. |

## Backend contract
This is the whole contract. It does not grow when the game does.

1. Accept `POST` with a JSON body of the shape above (≤ 256 KB). Answer
   `2xx` once stored. Allow CORS from the game's origin(s).
2. Reject only a body that isn't JSON or has no `events` array. Skip (don't
   fail on) events missing a string `id` or `type`.
3. Store each event as one row: the envelope fields as columns, `data` as
   raw JSON, plus `received` (server time). Never reject unknown `type`s or
   fields.
4. Make `id` unique; ignore duplicates (the client retries after failures).

`tools/telemetry-collector.js` is a zero-dependency reference
implementation (NDJSON files, one per day) and the executable spec. In
production the same thing fits one table, e.g. in Postgres:

```sql
create table events (
  id        text primary key,
  type      text not null,
  dv        int,
  ts        bigint,
  seq       int,
  install   text,
  session   text,
  run       text,
  app       text,
  logic     int,
  data      jsonb,
  received  timestamptz default now()
);
create index on events (type, received);
create index on events (install);
-- insert ... on conflict (id) do nothing;
```

Any queue, warehouse or serverless function that can store JSON works the
same way; analysis queries read `data` with JSON operators.

## Google Sheets backend (playtests)
`tools/telemetry-sheets/Code.gs` is the contract as a Google Apps Script
web app writing to a Sheet: one row per event, `data` as JSON text (long
`data` continues in the next columns), retry dedupe by id (6 h cache).
Apps Script can't set HTTP status codes, so it answers
`{ status, message }` and the game retries a batch only on a 5xx status.
Good for playtest volume (a Sheet holds 10M cells, roughly 800k events);
move to a database (the SQL above, e.g. Cloudflare D1 or Postgres) before
a public launch.

Setup:
1. Create a Google Sheet. Extensions → Apps Script. Paste `Code.gs`, save.
2. Deploy → New deployment → Web app. Execute as: **Me**. Who has access:
   **Anyone**. Copy the `/exec` URL (opening it shows "collector ok").
3. In `src/config.js` set `endpoint` to that URL and `collect: true`.
   Bump `APP_VERSION`.
4. Analysis: File → Download → CSV, then
   `node tools/replay-check.js events.csv` (or
   `node tools/sheet-to-ndjson.js events.csv > events.ndjson`).

Redeploying after editing the script: Deploy → Manage deployments → edit →
New version (keeps the same URL).

## Events (data dictionary)
All `dv: 1`. Floor events share a tag: `floor`, `seed`, `source`
(`template` | `dev`), `templateId`, `variant`, `loadout` (what the floor
started with: `spirit`, `relics`, `hp`, `maxHp`, `landings`; replays need
it; logs without `spirit` predate spirits and had none), and `overrides`
when dev URL params changed the floor (such floors aren't replayable).
Run events share a run tag: `seed`, `floor`, `hp`, `maxHp`, `relics`,
`spirit`.

| Type | When | `data` |
|---|---|---|
| `session.start` | Page load | `device` (viewport, screen, dpr, orientation, pointer, hover, touchPoints, reducedMotion, colorScheme, lang, tzOffset, ua, standalone), `settings`, `palette`, `entry` (start screen, dev params used) |
| `session.hide` | Page hidden / closed | `ms` since load |
| `screen.view` | Every screen change | `name`, `floor` |
| `run.start` | New Run | run tag, `daily`, `lastFloor` |
| `run.end` | Run won, lost, or given up (`abandoned`: a new run started over it; Menu no longer ends a run, it stays saved) | run tag, `outcome`, `cause`, `cleared`, `lastFloor` |
| `run.resume` | Continue Run on the title screen (the session's later events carry the run's saved id) | run tag, `cleared`, `lastFloor`, `offer` (resumed on a relic offer), `savedMs` (age of the save) |
| `spirit.pick` | Spirit chosen on the select screen (the run starts right after) | run tag, `index` (card position), `offered` [spirit ids, in card order] |
| `relic.offer` | Relic choice shown after a floor | run tag, `cleared` (the floor just cleared), `offered` [relic ids, in card order], `rest` |
| `relic.pick` | A choice taken | run tag (after taking it), `cleared`, `pick` (relic id, `rest`, or null when nothing was offered), `index` (card position), `offered` |
| `floor.start` | Floor shown | floor tag, `map` (dev), `attempt`, `checked`, `size`, `charges`, `enemies` [{kind, col, row}], `resumedFrom` (continued from a save: the action codes replayed first; prepend them to this floor's `log` to replay it), `restarted` (the save no longer matched the floor, so it started over) |
| `floor.end` | Won, lost, or left mid-floor: `left` (Menu; the run is saved and can continue), `restart` (Restart Floor; a fresh `floor.start` follows) or `abandoned` (a dev floor) | floor tag, `outcome`, `cause`, `turn`, `chargesLeft`, `keys`, `hp`, `ms`, `turns`, `folds`, `undos`, `refused`, `previews`, `foldAttempts`, `previewsCancelled`, `hints`, `inputs` {source: count}, `log`, `resumedFrom` (as in floor.start) |
| `hint.show` | Tutorial hint shown | floor tag, `id`, `turn` |
| `hint.dismiss` | Hint closed | floor tag, `id`, `by` (`player` / `replaced`), `ms` shown |
| `hint.ask` | Hint button pressed (free, unlimited) | floor tag, `level` (1 the floor's tip, 2 a next step or "can't be won from here"), `count` (presses on this floor so far, kept through Restart Floor), `turn` |
| `settings.change` | Any setting changed | `patch`, `settings` |
| `share` | Share Foldwork pressed (title screen) | `result`: `shared`, `copied`, `cancelled` or `manual` (link shown to copy) |
| `error` | Uncaught error / rejection (≤ 20 per session) | `message`, `source`, `line`, `col`, `stack`, `rejection` |

`log` entries are `[ms since floor start, action code, input source,
refusal reason?]`. Action codes are in `core/replay.js` (`u d l r w z`,
folds like `fh3a`; diagonal axes `d` and `a`, e.g. `fd4b`). Input sources: `key`, `mouse`, `touch`, `pen`.

## Privacy
- No accounts, names, emails, IP-derived data or free text. Ids are random
  and live only in the player's browser.
- A player setting ("Share play data", title screen; the Phase 7 settings
  screen later) turns it off. Off deletes unsent events and records nothing
  more.
- With `collect: false` (the default in the repo) nothing is recorded;
  with no `endpoint` nothing is sent.
- Before a public launch, decide the consent notice and default (see
  `docs/OPEN-QUESTIONS.md`).

## Local testing
```sh
node tools/telemetry-collector.js          # :8787, writes ./telemetry-data/
npm start                                  # :8080
# play at http://localhost:8080/?telemetry=http://localhost:8787/collect
node tools/replay-check.js telemetry-data/*.ndjson
```
`?telemetry=console` logs events in the browser console instead;
`?telemetry=off` disables it for the session.
