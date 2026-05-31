# fall-vetter · guild signup gate

**R2 ┃ validate · prime 347 · v1.0 · MIT**

Drop-in pre-block for any signup form. Validates the name + email + LinkedIn (or social fallback) before the form submits. Catches:

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

## Audit broadcast

Every vet result is broadcast on `BroadcastChannel('fall-signal')` with kind `fall_vetter_result`, so any estate tool listening on that channel can pull the audit record into its review queue. Only an 8-char FNV-1a hash of `name|email` is included — no PII.

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
