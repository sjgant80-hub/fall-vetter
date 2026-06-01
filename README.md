# fall-vetter · guild signup gate · v2.0 Cassandra mode

**R2 ┃ validate · prime 347 (v1 gate) + prime 401 (v2 read) · MIT**

Two surfaces · one file:

- **v1 binary gate** · fast pre-block · `FallVetter.vet({...})` → `{score, decision, reasons[], audit}`
- **v2 Cassandra read** · four-lens psychological reading · `FallVetter.read({...})` → `{score, decision, archetype, reading, lenses{base,jung,freud,sales101,ladder}, audit}`

v1 stays as the fast path. v2 is the deeper read · invoked via `read(input)` or `vet(input, {mode:'cassandra'})`.

## v1 catches:

- wind-up / joke names (Mike Hunt, Hugh Jass, John Doe, asdf, etc.)
- profanity and slurs in name / email local / message body (with leet-norm)
- disposable email domains (Mailinator, Yopmail, etc.)
- role-account locals (`info@`, `admin@`, etc.) — flag for review, don't block
- keyboard mash (aaaaa, qwerty)
- all-caps shouting, excessive exclamation
- malformed URLs
- missing identity proof — at least ONE of LinkedIn / GitHub / tool URL is required
- hacker-bait / sarcasm signal in message body (pwn, 0day, "drop tables", etc.)

Returns a score (0-100), a decision (`allow` / `review` / `block`), and a list of human-readable reasons.

---

## Install

```html
<!-- 1. Load the module (one line) -->
<script src="https://sjgant80-hub.github.io/fall-vetter/fall-vetter.js"></script>

<!-- 2. Wire it to your form (one line) -->
<script>
  FallVetter.attach({
    button: document.getElementById('guildSubmit'),
    onAllow:  (v) => submitMyForm(v),
    onReview: (v) => flagForHumanReview(v),
    onBlock:  (v) => showError(v.reasons)
  });
</script>
```

The `attach()` helper auto-detects fields by common IDs (`#gName`, `#gEmail`, `#gLinkedIn`, `#gGithub`, `#gTool`, `#gWhat`, plus standard `name=` selectors). You can override field selectors via the `fields` option.

---

## Direct API

```javascript
const result = FallVetter.vet({
  name:     "Simon Gant",
  email:    "sjgant80@gmail.com",
  linkedin: "https://linkedin.com/in/simon-gant",
  github:   "https://github.com/sjgant80",
  tool:     "https://sjgant80-hub.github.io/cassietorusbtc135solver/",
  message:  "I build sovereign software."
});
// → {
//     score: 100,
//     decision: 'allow',         // 'allow' | 'review' | 'block'
//     reasons: [],
//     audit: { score, decision, reasons, ts, version, input_hash }
//   }
```

---

## Decision matrix

| Decision | Threshold | What to do |
|----------|-----------|------------|
| `allow`  | score ≥ 70 and no block-level finding | submit straight through |
| `review` | score 40-69 | human reviews the borderline signal |
| `block`  | score < 40 or any block-level finding | polite rejection |

Floors are tunable via `options.allowFloor` / `options.reviewFloor`.

---

## Identity policy

**At least one of `linkedin`, `github`, or `tool` URL is required.** Pure email signups are blocked. This is the floor — a guild needs to know who's joining.

- LinkedIn URL preferred. Soft penalty if absent but a social fallback is provided.
- GitHub / GitLab / Bitbucket accepted as professional fallback.
- X / Threads / Bsky / Mastodon accepted as social fallback.
- Substack / Medium / Dev.to / personal domain accepted.

---

## Extending the deny lists

```javascript
// At runtime
FallVetter.lists.WINDUP.push('your custom pattern');
FallVetter.lists.PROFANITY.push('custom_word');
FallVetter.lists.DISPOSABLE_DOMAINS.push('throwaway.io');
```

---

---

## v2.0 · Cassandra mode · the four lenses

```javascript
const r = FallVetter.read({
  name: 'Sarah Chen', email: 'sarah@chenlabs.io',
  linkedin: 'https://linkedin.com/in/sarahchen',
  github: 'https://github.com/sarahchen',
  message: "I'm losing 12 hours a week reconciling 4 dashboards..."
});
// → {
//     score: 95, decision: 'allow',
//     archetype: 'Ruler',
//     reading: { summary: 'Ruler · buyer-seeking · reply', confidence: 'medium' },
//     lenses: {
//       base:     { /* v1 result */ },
//       jung:     { archetype:'Ruler', strength:14, runners_up:[...], signals:[...] },
//       freud:    { detected:[], dominant:null, healthy_signal_count:3, total_severity:0 },
//       sales101: { stance:'BUYER_SEEKING', confidence:96, signals:[...], recommended_next:'reply' },
//       ladder:   { tier1_hits:0, tier2_hits:0, tier3_hits:0, samples:[], score_impact:0, auto_block:false }
//     },
//     audit: { ts, version:'fall-vetter/2.0-cassandra', input_hash }
//   }
```

### Lens 1 · Jung archetype detection
12 classic archetypes (Innocent / Orphan / Hero / Caregiver / Explorer / Rebel / Lover / Creator / Jester / Sage / Magician / Ruler) scored by transparent keyword + structural rules (emoji density · question density · exclamation density). The dominant archetype wins. Tune via `FallVetter.lists.JUNG_ARCHETYPES`.

### Lens 2 · Freud defense mechanisms
7 patterns scanned in the message body: Projection / Displacement / Sublimation / Rationalization / Denial / ReactionFormation / Intellectualization. Each detection carries a severity 0-3. The dominant mechanism is surfaced. Healthy signals (concrete details · owned uncertainty · direct asks) are counted separately.

### Lens 3 · Sales 101 buyer-stance read
Classifies the signup into one of `BUYER_SEEKING` (named pain · urgency · qualifying q) · `TIRE_KICKER` (vague · no pain) · `COMPETITOR` (architecture probes) · `BUILDER_PEER` (their own builds · estate vocab) · `NOISE` (fan mail · empty). Returns `recommended_next`: `reply` / `guild-invite` / `archive`.

### Lens 4 · Alex's swear-word ladder (EXTENSION POINT)
Three tiers · seed empty · Alex fills:

```javascript
FallVetter.lists.SWEAR_LADDER.tier1_mild.push('damn');     // -10/hit
FallVetter.lists.SWEAR_LADDER.tier2_medium.push('shit');   // -25/hit
FallVetter.lists.SWEAR_LADDER.tier3_severe.push('slur');   // AUTO-BLOCK
```

All matching is leet-normalised whole-word (so `sh1t` matches `shit`). Tier-3 hits force `decision = block` regardless of other lenses. The cassandra.html admin UI has a live textarea for runtime tuning.

### Synthesis · the prophetic verdict
```
final score = base.score - (freud.total_severity × 5) + ladder.score_impact
              + stance_bonus (up to +15 for BUYER_SEEKING, +12 for BUILDER_PEER)
decision = 'block'  if tier3 hit · freud severity ≥ 6 · v1 blocks · score < 40
         | 'review' if 40 ≤ score < 70
         | 'allow'  if score ≥ 70
```

The `reading.summary` cites the lenses · doesn't dress them up:
- `"Sage in seeker mode · names specific pain · BUYER_SEEKING · reply"`
- `"Trickster with intellectualization · TIRE_KICKER · archive"`
- `"Orphan · displacement defense · BUILDER_PEER · invite to guild"`

### Admin / test surface
`cassandra.html` ships alongside `index.html`. Hero: ◊ Cassandra · the psychological reading. Six fields + body textarea + READ button (gold). Output renders as a prophet's scroll: archetype banner with strength bar · 1-3 sentence reading · decision badge · 4 collapsible lens panels with quoted evidence · 8 preset signups. Footer textarea lets Alex push to all 3 ladder tiers and re-read live.

---

## Audit broadcast

Every vet result is broadcast on `BroadcastChannel('fall-signal')` with kind `fall_vetter_result`. v2 broadcasts also carry `archetype`, `sales_stance`, `recommended_next`, `tier3_hits`, and `freud_dominant` — the si-didy daily digest (`vetter_digest` MCP tool) consumes these. Only an 8-char FNV-1a hash of `name|email` is included — no PII.

```javascript
new BroadcastChannel('fall-signal').onmessage = (e) => {
  if (e.data.kind === 'fall_vetter_result') {
    console.log('signup vetted:', e.data.payload);
  }
};
```

---

## For ACG specifically

Add the two-line install to whatever signup form ACG uses. The defaults work for the AIN hub form (`#gName`, `#gEmail`, etc.) — they'll work for any form that follows the same convention. For different IDs, pass `fields: { name: '#yourId', ... }`.

When you want stricter or looser thresholds, pass `vetOptions: { allowFloor: 80, reviewFloor: 50 }`.

---

## Architecture

Pure client-side. Zero network calls by default. No PII leaves the browser. The audit broadcast is intra-tab (BroadcastChannel) only.

Future v2 can add an optional `vetAsync()` that does a HEAD on the LinkedIn URL to confirm it resolves (200), but that's opt-in and currently out of scope.

---

## License

MIT
