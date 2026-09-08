# Command Center

The Command Center is the **target-centric** view of the platform. SpiderX is a
target-based NDR / CT console: an analyst saves a subject of interest, the
platform carries it to the probes, and the console shows that same subject back
to them by the name they typed. Every panel here sits somewhere on that circuit.

Route: [`src/app/(console)/command/page.tsx`](<src/app/(console)/command/page.tsx>)
API:   `GET /api/v1/ndr/command` in [`src/app/api/v1/[...path]/route.ts`](src/app/api/v1/[...path]/route.ts)

## The golden thread

One circuit, seven hops. Two human actions — step 1 and step 7 — and everything
in between is the platform.

```
1 Analyst saves a target        target_managements        ← in the console
2 capture_filter written        capture_filter            reference_id → target
3 Agent pulls the dictionary    probe dictionary, ≤60s
4 Probe matches on the wire     link-stats-*
5 SOI / LINK stats on the edge  soi-stats-*, link-stats-*
6 Indexed on the CMS            soi-stats-*, link-stats-*
7 Surfaced to the analyst       logvehere-alerts-*        ← back in the console
```

The `GoldenThread` rail renders these as seven live tiles. Each carries the
number that proves the hop is moving, so **a break in the chain shows up as the
place the numbers stop** rather than as a silent empty dashboard. Hop 6 swaps its
sub-label for freshness (`last write 7m ago`), because for an indexing hop lag
matters more than volume.

## Why alerts can name the subject

This is the load-bearing fact behind the whole page. An alert document embeds
the **entire target document** it matched against:

```jsonc
{
  "priority": "low",
  "value": "50013",                    // what the probe actually matched
  "link_name": "10.0.0.20_pvif-0",
  "target": {
    "personalInfo":         { "alias": "target050013", "firstName": "…", "priority": "Low" },
    "interceptionCriteria": { "subject": ["Financial050013"] },
    "targetValue":          ["50013"],
    "capture_action":       ["metadata", "raw", "content"],
    "activeFromTZ": "2026-09-03T08:03:20Z",
    "validTillTZ":  "2026-10-06T12:30:55Z",
    "created_by": "Debadeepta"
  }
}
```

Every one of those is mapped with a `.keyword` subfield, so alerts can be
aggregated **by alias and by subject** directly — no join back to
`target_managements` needed. That is what lets the console label a bar with the
alias typed in step 1.

`mapTarget()` in [`src/lib/es-server.ts`](src/lib/es-server.ts) normalises this
into `TargetIdentity` ([`src/lib/types.ts`](src/lib/types.ts)). The `*TZ` twins
are already ISO; the bare `activeFrom` / `validTill` are epoch **seconds**.

> `mapAlert()` deliberately leaves `title` as `alert_name`. The Detections page
> renders that field, so the alias is exposed on `target` instead of overwriting
> a value another page depends on.

## Panels

| Panel | Source | What it answers |
|---|---|---|
| KPI row | targets + alerts | How much of the watchlist is armed, live, and expiring |
| Golden Thread | all seven indices | Is the pipeline moving, and where does it stop |
| Interception Cadence | `logvehere-alerts-*` | *When* did each priority band surge |
| Subject Activity | `logvehere-alerts-*` | Which of *my* subjects are hitting, and when |
| Wire Spectrum | `link-stats-*` | Did the probe see anything at all |
| Subject Orbit | `logvehere-alerts-*` | Who are the busiest subjects right now |
| Target Dossier | selected alert | Who is this, and under whose authority |

### Interception Cadence

A centre-balanced streamgraph banded by priority
([`threat-cadence.tsx`](src/components/ndr/threat-cadence.tsx)). Bands stack
outward from a centre line so quiet periods *pinch* rather than drop to a floor,
which reads as rhythm instead of as a gap. The priority chips are still the
stream filter — the same interaction the old flat tiles had — but the shape now
carries the "when". Hover scrubs the window and reports the per-bucket split
plus how many distinct subjects were live in that bucket.

### Subject Activity / Wire Spectrum

One waterfall component
([`signal-waterfall.tsx`](src/components/ndr/signal-waterfall.tsx)) driven by
two datasets, toggled by the **Subjects / Wire** control.

- **Subjects** — rows are target aliases, second line is the case the target is
  filed under, tint is the target's own priority. Clicking a row opens that
  subject's dossier. This is step 7 of the thread, made literal.
- **Wire** — rows are protocol and encapsulation counters. Cool hues for
  encapsulations, hot for protocols, so the two families stay separable when
  interleaved by volume.

**Row vs Global scaling** is the one control worth understanding. Row mode is
linear-with-gamma against each row's own peak, because counters sit within one
order of magnitude bucket to bucket and a log curve pins them all at full
brightness — everything looks saturated and you see nothing. Global mode is the
opposite problem (ETH outruns NTP by five orders), so there log is the honest
ramp. See `intensity()`.

### Target Dossier

Identity first ([`target-dossier.tsx`](src/components/ndr/target-dossier.tsx)):
alias, real name, subject, description — then the **authority window**, which is
the field that turns a hit into a legal question. It counts down, goes amber at
≤1 day and crimson once lapsed. Selectors, capture action and provenance follow.
Raw document fields sit at the bottom, not the top.

## Aggregation notes

**One interval for every timeline.** `pickInterval()` in
[`src/lib/api-utils.ts`](src/lib/api-utils.ts) walks a ladder (1m → 48h) and
picks the smallest interval keeping the window under ~48 buckets. The cadence,
the subject waterfall and the wire waterfall all share it, so the three panels
line up column-for-column.

**`extended_bounds` is mandatory on the per-subject histogram.** Without it a
target's histogram only spans that target's own first-to-last hit, every row
comes back a different length, and the waterfall stops aligning. `resolveBoundMs()`
converts `now-7d` style date math to epoch ms for exactly this.

**`track_total_hits: true` on anything reported as a count.** ES caps at 10,000
by default. The golden-thread rail reports document counts, so every query
feeding it sets this — otherwise hops 5, 6 and 7 quietly report `10,000`.

**`top_hits` on each terms bucket.** Both the orbit and the waterfall attach
`latest` to their terms aggregation, so clicking any node or row opens a real
document even when that subject is outside the newest 20 alerts.

**Priority casing is inconsistent** in `priority.keyword` (`high` and `High`
both occur). Filters match both cases; see `recentQuery`.

The whole page is a single request — around a dozen aggregations in one
`Promise.all`, ~100 ms against the live cluster.

## Wire signal discovery

`link-stats-*` counter sub-fields (`protocols_count.SSH`,
`encapsulations_count.TCP`, …) are per-deployment. `linkSignals()` reads them
from the live mapping, unions across every concrete index in the pattern (a
protocol seen on any day of the window still gets a row), caps at 30, and caches
for 5 minutes. A probe build that adds a protocol shows up without a code change.

## Offline cache

When ES is unreachable, `GET /api/v1/ndr/command` falls back to
`data/es-cache/api/ndr-command.json`. Refresh it with:

```bash
python3 scripts/sync-es-cache.py
```

That script mirrors the route's aggregations — including `mapTarget` — so the
cached payload has full parity and the dossier is not blank offline. **If you
add a section to the API, add it there too**, or the offline view silently loses
a panel.

## Pointing at a cluster

Host and credentials come from `config/spiderx.yml`, overlaid by
`/etc/spiderx/spiderx.yml`, `setup_info.json`, then env. For a one-off:

```bash
ES_HOST='https://<host>:9200' ES_USERNAME=admin ES_PASSWORD='…' npm run dev
```

Elasticsearch listens on **9200**. Transport auto-falls back from Node `https`
to `curl` when a proxy interferes; force it with `ES_TRANSPORT=curl`.

## Extending

Adding a panel is four edits:

1. Aggregation into the `Promise.all` in the `ndr/command` block.
2. Shaping into the response, alongside `thread` / `subjects` / `cadence`.
3. Component under `src/components/ndr/`, rendering an empty state when its
   slice is missing — the cache fallback can legitimately lack it.
4. The matching block in `scripts/sync-es-cache.py`.
