// ═══════════════════════════════════════════════════════════════════
//  fall-vetter · v2.0 "Cassandra mode" · guild signup gate · R2 ring
//  prime 347 (v1 vet) + prime 401 (v2 read) · sovereign single-file · MIT
//
//  v1 binary gate (always available · fast path):
//    FallVetter.vet({name, email, linkedin, github, tool, message})
//      → { score, decision: 'allow'|'review'|'block', reasons[], audit }
//
//  v2 Cassandra · the deeper psychological read (4 lenses + synthesis):
//    FallVetter.read({...same input + body})
//      → { score, decision, archetype, reading{summary,confidence},
//          lenses: { base, jung, freud, sales101, ladder }, audit }
//
//  Lens 1 · Jung archetype (12 classics · transparent keyword scorer)
//  Lens 2 · Freud defense mechanisms (7 patterns · severity 0-3)
//  Lens 3 · Sales 101 buyer-stance read (BUYER/TIRE-KICKER/COMPETITOR/PEER/NOISE)
//  Lens 4 · Alex's swear-word ladder (3 tiers · extension point · empty seed)
//
//  No network calls by default. Pure function. Offline-first.
//  Audit broadcast on BroadcastChannel('fall-signal') for estate listeners.
//
//  Usage:
//    <script src="https://sjgant80-hub.github.io/fall-vetter/fall-vetter.js"></script>
//    const v = FallVetter.vet({...});               // v1 fast gate
//    const r = FallVetter.read({...});              // v2 deep read
//    const r = FallVetter.vet({...}, {mode:'cassandra'});  // alias for read
// ═══════════════════════════════════════════════════════════════════

(function(global){
  'use strict';

  // ─── deny lists (kept terse · case-insensitive matching) ────────
  // Profanity / slurs (mild list · expand via options.profanity)
  const PROFANITY = [
    'fuck','shit','cunt','dick','wank','bollocks','bastard','prick',
    'asshole','bitch','slut','whore','retard','faggot','nigger',
    'twat','arse','bugger',
    // soft variants caught by leet-norm
  ];

  // Wind-up / joke / sarcasm signal handles
  const WINDUP = [
    'hugh jass','mike hunt','ben dover','seymour butts','dixie normous',
    'phil mccracken','heywood jablowme','anita bath','ivana tinkle',
    'pat mygroin','dixie wrecked','lou stooles',
    'test','testing','testtest','asdf','qwerty','noname','none',
    'firstname lastname','your name','john doe','jane doe','admin',
    'root','user','example','sample','demo','foo','bar','baz',
    'aaa','bbb','xxx','aaaa','bbbb',
  ];

  // Disposable email domains (well-known list · trimmed)
  const DISPOSABLE_DOMAINS = [
    'mailinator.com','tempmail.com','10minutemail.com','guerrillamail.com',
    'throwawaymail.com','yopmail.com','trashmail.com','sharklasers.com',
    'maildrop.cc','getairmail.com','dispostable.com','fakemailgenerator.com',
    'getnada.com','mailnesia.com','spambox.us','tempinbox.com','mvrht.com',
    'tempmailaddress.com','mintemail.com','mailcatch.com','mailtemp.info',
    'tempmailo.com','emailondeck.com','tempemail.com','spamgourmet.com',
    'inboxbear.com','tmpmail.org','mohmal.com','mailbox52.ga','minuteinbox.com',
    'eyepaste.com','jetable.org','fake-mail.net','spambog.com','byom.de',
    'guerrillamail.org','guerrillamail.net','guerrillamail.biz','grr.la',
    'pokemail.net','spam4.me','meltmail.com','tempr.email','tempmail.de',
  ];

  // Role-account locals (warn but not auto-block · org signups OK)
  const ROLE_LOCALS = [
    'info','admin','contact','support','sales','hello','noreply','no-reply',
    'webmaster','postmaster','abuse','security','help','root',
  ];

  // Hacker / sarcasm / red-flag tokens in message body
  const RED_FLAGS = [
    '0day','pwn','pwned','rooted','exploit','dox','doxx','swatting',
    'l33t','1337','hacker','script kiddie','skidd','script-kiddie',
    'dropping tables','little bobby','xss','sql injection','rce','nuke',
    'destroy','grift','scam','rug pull','vibe code','jailbreak prompt',
  ];

  // ─── helpers ───────────────────────────────────────────────────
  function lower(s) { return (s || '').toString().toLowerCase().trim(); }

  function leetNorm(s) {
    // Normalise common leet substitutions for profanity detection
    return lower(s)
      .replace(/0/g,'o').replace(/1/g,'i').replace(/!/g,'i')
      .replace(/3/g,'e').replace(/4/g,'a').replace(/@/g,'a')
      .replace(/5/g,'s').replace(/\$/g,'s').replace(/7/g,'t')
      .replace(/8/g,'b').replace(/9/g,'g')
      .replace(/[^a-z\s]/g,'');
  }

  function repeatedCharRatio(s) {
    // Returns fraction of characters that are immediate repeats (eg. "aaaaa" → 0.8)
    if (!s || s.length < 2) return 0;
    let r = 0;
    for (let i = 1; i < s.length; i++) if (s[i] === s[i-1]) r++;
    return r / s.length;
  }

  function isAllCaps(s) {
    if (!s || s.length < 4) return false;
    return s === s.toUpperCase() && /[A-Z]/.test(s);
  }

  function tokenContains(haystackLeet, list) {
    for (const t of list) {
      const tn = leetNorm(t);
      if (tn && haystackLeet.includes(tn)) return t;
    }
    return null;
  }

  function rawContains(haystack, list) {
    const h = lower(haystack);
    for (const t of list) if (h.includes(lower(t))) return t;
    return null;
  }

  // ─── name validation ───────────────────────────────────────────
  function vetName(name, deductions, reasons) {
    const n = (name || '').toString().trim();
    if (!n) {
      deductions.push(40);
      reasons.push({ field: 'name', level: 'block', msg: 'Name is required.' });
      return;
    }
    if (n.length < 2) {
      deductions.push(30);
      reasons.push({ field: 'name', level: 'block', msg: 'Name is too short.' });
    }
    if (n.length > 80) {
      deductions.push(20);
      reasons.push({ field: 'name', level: 'review', msg: 'Name is unusually long.' });
    }
    // Must contain at least one letter
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(n)) {
      deductions.push(35);
      reasons.push({ field: 'name', level: 'block', msg: 'Name has no letters.' });
    }
    // No URLs / @ handles inside the name field
    if (/https?:\/\/|www\.|@/.test(n)) {
      deductions.push(25);
      reasons.push({ field: 'name', level: 'block', msg: 'Name should not contain a URL or @.' });
    }
    // Excessive digits in a name
    const digitRatio = ((n.match(/\d/g) || []).length) / n.length;
    if (digitRatio > 0.3) {
      deductions.push(20);
      reasons.push({ field: 'name', level: 'review', msg: 'Name has unusual numeric content.' });
    }
    // Repeated character bash ("Sssssssss" / "aaaaaaaa")
    if (repeatedCharRatio(n.replace(/\s/g,'')) > 0.4) {
      deductions.push(30);
      reasons.push({ field: 'name', level: 'block', msg: 'Name looks like keyboard mashing.' });
    }
    // ALL CAPS shouting
    if (isAllCaps(n)) {
      deductions.push(10);
      reasons.push({ field: 'name', level: 'review', msg: 'Name is ALL CAPS — please use normal case.' });
    }
    // Wind-up / joke handles
    const leet = leetNorm(n);
    const wind = tokenContains(leet, WINDUP);
    if (wind) {
      deductions.push(50);
      reasons.push({ field: 'name', level: 'block', msg: `Name matches a known wind-up pattern ("${wind}").` });
    }
    // Profanity in the name (rare but happens)
    const prof = tokenContains(leet, PROFANITY);
    if (prof) {
      deductions.push(50);
      reasons.push({ field: 'name', level: 'block', msg: `Name contains profanity ("${prof}").` });
    }
    // Single-word names are OK but flag for review (most pro signups use first+last)
    if (n.split(/\s+/).length === 1 && n.length < 15) {
      deductions.push(8);
      reasons.push({ field: 'name', level: 'review', msg: 'Single-name signup — confirm via social link.' });
    }
  }

  // ─── email validation ──────────────────────────────────────────
  function vetEmail(email, deductions, reasons) {
    const e = lower(email);
    if (!e) {
      deductions.push(40);
      reasons.push({ field: 'email', level: 'block', msg: 'Email is required.' });
      return;
    }
    // RFC-ish syntax (deliberately permissive)
    const m = e.match(/^([^\s@]+)@([^\s@]+\.[^\s@]+)$/);
    if (!m) {
      deductions.push(40);
      reasons.push({ field: 'email', level: 'block', msg: 'Email is malformed.' });
      return;
    }
    const local = m[1], domain = m[2];
    // Disposable
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      deductions.push(50);
      reasons.push({ field: 'email', level: 'block', msg: `Disposable email domain ("${domain}").` });
    }
    // Role account
    if (ROLE_LOCALS.includes(local)) {
      deductions.push(8);
      reasons.push({ field: 'email', level: 'review', msg: `Role-account local ("${local}@…") — OK for orgs, flag for human.` });
    }
    // Profanity / wind-up in local part
    const localLeet = leetNorm(local);
    const localProf = tokenContains(localLeet, PROFANITY);
    if (localProf) {
      deductions.push(40);
      reasons.push({ field: 'email', level: 'block', msg: `Email local contains profanity ("${localProf}").` });
    }
    const localWind = tokenContains(localLeet, WINDUP);
    if (localWind) {
      deductions.push(35);
      reasons.push({ field: 'email', level: 'block', msg: `Email local matches wind-up pattern ("${localWind}").` });
    }
    // Excessive numeric local ("user1234567890@…")
    const digits = (local.match(/\d/g) || []).length;
    if (digits >= 6 && digits / local.length > 0.5) {
      deductions.push(10);
      reasons.push({ field: 'email', level: 'review', msg: 'Email local is mostly digits — possibly throwaway.' });
    }
    // Repeated chars in local
    if (repeatedCharRatio(local) > 0.5) {
      deductions.push(20);
      reasons.push({ field: 'email', level: 'block', msg: 'Email local looks like keyboard mashing.' });
    }
    // Suspicious TLDs (loose)
    if (/\.(tk|ml|ga|cf|gq|zip)$/.test(domain)) {
      deductions.push(15);
      reasons.push({ field: 'email', level: 'review', msg: `Uncommon TLD — flag for review.` });
    }
  }

  // ─── LinkedIn / social URL validation ──────────────────────────
  function vetLinkedIn(url, deductions, reasons) {
    const u = (url || '').toString().trim();
    if (!u) return false; // signal "no LinkedIn provided"
    try {
      const parsed = new URL(u);
      if (!/linkedin\.com$/.test(parsed.hostname.replace(/^www\./,''))) {
        return false; // not a LinkedIn URL — caller may try social fallback
      }
      // Path should be /in/<handle> or /pub/<handle> · we keep it loose
      if (!/^\/(in|pub|company)\/[A-Za-z0-9_\-\.%]+/i.test(parsed.pathname)) {
        deductions.push(15);
        reasons.push({ field: 'linkedin', level: 'review', msg: 'LinkedIn URL is not a profile path (/in/…).' });
        return true;
      }
      return true;
    } catch (e) {
      deductions.push(20);
      reasons.push({ field: 'linkedin', level: 'review', msg: 'LinkedIn URL is malformed.' });
      return false;
    }
  }

  function vetSocial(url, deductions, reasons, fieldName) {
    const u = (url || '').toString().trim();
    if (!u) return false;
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.replace(/^www\./,'').toLowerCase();
      const allowed = [
        'github.com','gitlab.com','bitbucket.org',
        'x.com','twitter.com','threads.net','bsky.app','mastodon.social','mastodon.online',
        'substack.com','medium.com','dev.to','hashnode.com','hashnode.dev',
        'youtube.com','vimeo.com',
      ];
      // Allow .substack.com / .github.io / personal domains (any host with a TLD)
      const allowedMatch = allowed.some(d => host === d || host.endsWith('.' + d));
      const isPersonal = !!host.match(/\.[a-z]{2,}$/) && !allowedMatch;
      if (!allowedMatch && !isPersonal) {
        deductions.push(8);
        reasons.push({ field: fieldName, level: 'review', msg: 'Social URL not recognised — flag for review.' });
      }
      return true;
    } catch (e) {
      deductions.push(10);
      reasons.push({ field: fieldName, level: 'review', msg: `${fieldName} URL is malformed.` });
      return false;
    }
  }

  // ─── message body screen ──────────────────────────────────────
  function vetMessage(msg, deductions, reasons) {
    const m = (msg || '').toString().trim();
    if (!m) return; // optional field
    // Profanity
    const prof = tokenContains(leetNorm(m), PROFANITY);
    if (prof) {
      deductions.push(25);
      reasons.push({ field: 'message', level: 'block', msg: `Message contains profanity ("${prof}").` });
    }
    // Red-flag tokens (hacker bait / sarcasm signal)
    const red = rawContains(m, RED_FLAGS);
    if (red) {
      deductions.push(15);
      reasons.push({ field: 'message', level: 'review', msg: `Message contains a red-flag token ("${red}").` });
    }
    // Wind-up names dropped into the message
    const wind = tokenContains(leetNorm(m), WINDUP);
    if (wind && WINDUP.indexOf(wind) < 14) {
      // only the first ~14 entries are the joke-name list, rest are placeholder words
      deductions.push(20);
      reasons.push({ field: 'message', level: 'block', msg: `Message contains a wind-up pattern ("${wind}").` });
    }
    // Excessive caps
    if (m.length > 30 && isAllCaps(m)) {
      deductions.push(8);
      reasons.push({ field: 'message', level: 'review', msg: 'Message is ALL CAPS — please use normal case.' });
    }
    // Excessive exclamation
    const exC = (m.match(/!/g) || []).length;
    if (exC >= 5) {
      deductions.push(5);
      reasons.push({ field: 'message', level: 'review', msg: 'Message has excessive exclamation.' });
    }
  }

  // ─── name vs email coherence ──────────────────────────────────
  function vetCoherence(name, email, deductions, reasons) {
    const n = lower(name).replace(/[^a-z]/g,'');
    const local = (lower(email).split('@')[0] || '').replace(/[^a-z]/g,'');
    if (!n || !local || n.length < 3 || local.length < 3) return;
    // Soft check: name should appear at least partially in the email local,
    // OR email local should be a reasonable initials/handle.
    // If neither, deduct a small amount (the human reviewer can confirm).
    const nameParts = n.match(/.{3,}/) ? [n] : [];
    let overlap = false;
    for (const part of [n.slice(0,3), n.slice(0,4), n.slice(-3), n.slice(-4)]) {
      if (part && local.includes(part)) { overlap = true; break; }
    }
    if (!overlap && local.length < 25) {
      deductions.push(5);
      reasons.push({ field: 'coherence', level: 'review', msg: 'Name and email local do not overlap — flag for review.' });
    }
  }

  // ─── main entry ───────────────────────────────────────────────
  function vet(input, options) {
    const opts = options || {};
    const deductions = [];
    const reasons = [];

    const name     = input && input.name;
    const email    = input && input.email;
    const linkedin = input && input.linkedin;
    const github   = input && input.github;
    const tool     = input && input.tool;     // optional tool URL
    const message  = input && (input.message || input.what);

    vetName(name, deductions, reasons);
    vetEmail(email, deductions, reasons);

    const hasLI = vetLinkedIn(linkedin, deductions, reasons);
    const hasGH = vetSocial(github, deductions, reasons, 'github');
    const hasTool = vetSocial(tool, deductions, reasons, 'tool');

    // Identity proof: at least ONE of LinkedIn / GitHub / tool URL.
    // If none provided → review (not block — let human decide).
    if (!hasLI && !hasGH && !hasTool) {
      deductions.push(25);
      reasons.push({ field: 'identity', level: 'block', msg: 'No LinkedIn, GitHub, or tool URL provided — at least one is required.' });
    } else if (!hasLI && !opts.skipLinkedInPreference) {
      // Soft penalty when no LinkedIn but social fallback provided
      deductions.push(5);
      reasons.push({ field: 'linkedin', level: 'review', msg: 'No LinkedIn URL — using social fallback. Confirm via human.' });
    }

    vetMessage(message, deductions, reasons);
    vetCoherence(name, email, deductions, reasons);

    const totalDeduction = deductions.reduce((a, b) => a + b, 0);
    const score = Math.max(0, Math.min(100, 100 - totalDeduction));

    const hasBlock = reasons.some(r => r.level === 'block');
    const allowFloor = opts.allowFloor != null ? opts.allowFloor : 70;
    const reviewFloor = opts.reviewFloor != null ? opts.reviewFloor : 40;

    let decision;
    if (hasBlock || score < reviewFloor) decision = 'block';
    else if (score < allowFloor)         decision = 'review';
    else                                  decision = 'allow';

    const audit = {
      score, decision,
      reasons,
      ts: Date.now(),
      version: 'fall-vetter/1.0',
      input_hash: hashish((name||'') + '|' + (email||''))
    };

    // Broadcast to fall-signal for estate-wide audit (optional)
    try {
      if (typeof BroadcastChannel !== 'undefined' && !(opts && opts._skipBroadcast)) {
        const ch = new BroadcastChannel('fall-signal');
        ch.postMessage({ kind: 'fall_vetter_result', payload: audit });
        ch.close();
      }
    } catch(_) {}

    return { score, decision, reasons, audit };
  }

  // ─── light fingerprint (privacy-preserving) ───────────────────
  function hashish(s) {
    // FNV-1a 32-bit · enough to dedupe in admin logs without storing PII
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // ═══════════════════════════════════════════════════════════════
  //  CASSANDRA MODE · v2.0 · the 4-lens psychological read
  //  prime 401 · the prophetic synthesis on top of the v1 gate
  // ═══════════════════════════════════════════════════════════════

  // ─── Lens 1 · Jung archetype detection ──────────────────────────
  // 12 classic archetypes · transparent keyword + structure scorer.
  // Each archetype has weighted phrase signals · the dominant wins.
  // Documented openly so Alex can tune the patterns.
  const JUNG_ARCHETYPES = {
    Innocent:   { keywords: ['hope this is ok','just trying','naive','simple','first time','please','sorry to bother','newbie','beginner','help me'], weight_per: 6 },
    Orphan:     { keywords: ['been burned','let down','nobody','alone','rejected','ignored','no one listens','tired of','fed up','again'], weight_per: 7 },
    Hero:       { keywords: ['fight for','win','crush','dominate','leverage','beat','conquer','smash','take on','battle','arena'], weight_per: 7 },
    Caregiver:  { keywords: ['help my team','for my clients','for my people','serve','give back','support','protect','nurture','look after'], weight_per: 7 },
    Explorer:   { keywords: ['discover','exploring','curious','wandering','find out','try','journey','new territory','frontier','what if'], weight_per: 6 },
    Rebel:      { keywords: ['break','disrupt','f the system','tear down','anti','against','revolt','overthrow','burn it down','no rules'], weight_per: 8 },
    Lover:      { keywords: ['love','passion','beautiful','adore','intimate','connect','relationship','bond','devoted','beloved'], weight_per: 6 },
    Creator:    { keywords: ['build','make','craft','design','imagine','create','original','my own','from scratch','artisan'], weight_per: 6 },
    Jester:     { keywords: ['lol','lmao','haha','jk','kidding','joking','funny','meme','😂','🤣','😅','obvs','tbh','ngl'], weight_per: 8 },
    Sage:       { keywords: ['understand','learn from','research','study','wisdom','truth','analyse','analyze','reflect','knowledge','insight','principle'], weight_per: 7 },
    Magician:   { keywords: ['transform','catalyse','catalyze','manifest','envision','alchemy','vision','consciousness','emergent','synthesis','transmute'], weight_per: 8 },
    Ruler:      { keywords: ['my company','my team','my estate','i run','i own','i lead','i command','my domain','my org','enterprise','authority'], weight_per: 7 },
  };

  function lensJung(message, name) {
    const text = lower((message || '') + ' ' + (name || ''));
    const scores = {};
    const signals = {};
    for (const [arch, def] of Object.entries(JUNG_ARCHETYPES)) {
      scores[arch] = 0;
      signals[arch] = [];
      for (const kw of def.keywords) {
        if (text.includes(kw)) {
          scores[arch] += def.weight_per;
          signals[arch].push(kw);
        }
      }
    }
    // Structural signals
    const emojiCount = (message || '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
    if (emojiCount.length >= 2) { scores.Jester += emojiCount.length * 4; signals.Jester.push('emoji-density:'+emojiCount.length); }
    const qMarks = ((message||'').match(/\?/g)||[]).length;
    if (qMarks >= 3) { scores.Explorer += qMarks * 3; signals.Explorer.push('question-density:'+qMarks); }
    const exclamation = ((message||'').match(/!/g)||[]).length;
    if (exclamation >= 3) { scores.Hero += exclamation * 2; signals.Hero.push('exclamation-density:'+exclamation); }
    // Convert to 0-100 strengths (cap)
    for (const k of Object.keys(scores)) scores[k] = Math.min(100, scores[k]);
    // Rank
    const ranked = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    const top = ranked[0];
    const archetype = top && top[1] > 0 ? top[0] : 'Seeker'; // Seeker = the empty default
    const strength = top ? top[1] : 0;
    const runners = ranked.slice(1, 4).filter(([,s])=>s>0).map(([name,s])=>({name, strength: s}));
    const triggered = signals[archetype] || [];
    return { archetype, strength, runners_up: runners, signals: triggered };
  }

  // ─── Lens 2 · Freud defense mechanisms ──────────────────────────
  // 7 classic patterns · each with regex/phrase signature + severity rule.
  function lensFreud(message) {
    const m = (message || '').toString();
    const lo = lower(m);
    const detected = [];
    function add(mech, evidence, severity) { detected.push({ mechanism: mech, evidence, severity }); }

    // Projection: "everyone always" / "people are all" / "they all..."
    if (/\b(everyone|nobody|everybody)\s+(always|never)\b/i.test(m)) add('Projection', m.match(/\b(everyone|nobody|everybody)\s+(always|never)[^.!?]*/i)[0], 2);
    if (/\bpeople\s+are\s+all\b/i.test(m)) add('Projection', 'people are all…', 2);

    // Displacement: "I'm not angry but X is..." / "not about Y but Z"
    if (/\bi'?m not (angry|upset|mad)\b.*\bbut\b/i.test(m)) add('Displacement', m.match(/\bi'?m not[^.!?]*but[^.!?]*/i)[0].slice(0,120), 2);
    if (/\bnot about\b.*\bbut\b/i.test(lo)) add('Displacement', 'not about X but Y construction', 1);

    // Sublimation: "I channel my X into Y" (often healthy · low severity)
    if (/\bchannel(?:s|ed)? my\b/i.test(m)) add('Sublimation', m.match(/\bchannel[^.!?]*/i)[0].slice(0,100), 1);
    if (/\bpour(?:ed)? (?:my|all) (?:rage|anger|pain) into\b/i.test(m)) add('Sublimation', 'pour X into Y construction', 1);

    // Rationalization: "the reason I X is because" / "I had to" / "I only X because"
    if (/\bthe reason (?:i|we) [a-z]+ is because\b/i.test(m)) add('Rationalization', m.match(/\bthe reason[^.!?]*/i)[0].slice(0,120), 2);
    if (/\bi (?:only|just) did [a-z]+ because\b/i.test(m)) add('Rationalization', 'I only did X because…', 1);
    if (/\bi had to\b/i.test(m) && /\bbecause\b/i.test(m)) add('Rationalization', 'I had to…because…', 1);

    // Denial: "I never" / "I don't have a problem with" / "it's fine, really"
    if (/\bi never\b/i.test(m)) add('Denial', 'I never…', 1);
    if (/\bi don'?t have a problem (?:with|about)\b/i.test(m)) add('Denial', "I don't have a problem with…", 2);
    if (/\bit'?s fine,? really\b/i.test(m)) add('Denial', "it's fine, really", 2);

    // Reaction Formation: extreme love/hate of all/everything
    if (/\bi (?:love|adore) everything (?:about )?\b/i.test(m)) add('ReactionFormation', 'I love everything about…', 2);
    if (/\bi (?:hate|loathe|despise) everything (?:about )?\b/i.test(m)) add('ReactionFormation', 'I hate everything about…', 3);
    if (/\b(LOVE|HATE)\s+(LOVE|HATE)\b/.test(m)) add('ReactionFormation', 'CAPS LOVE/HATE stack', 3);

    // Intellectualization: jargon stacking · over-abstraction
    const jargon = ['paradigm','epistemological','ontological','synergistic','holistic','meta-cognitive','dialectic','phenomenological','heuristic','frameworks','optimisation','optimization','scaffolding','substrate','emergent properties','first principles','systemic','axiomatic'];
    const hits = jargon.filter(j => lo.includes(j));
    if (hits.length >= 3) add('Intellectualization', 'jargon-stack: ' + hits.slice(0,5).join(', '), Math.min(3, hits.length - 1));
    // Word salad: very long sentences with abstract nouns and no concrete details
    const longSentence = (m.match(/[^.!?]{180,}/g) || []).length;
    if (longSentence >= 1 && hits.length >= 2) add('Intellectualization', 'long abstract sentence (no concrete grounding)', 2);

    // Healthy signals (concrete details · named feelings · direct asks)
    let healthy = 0;
    if (/\bi feel\b/i.test(m) && !/i feel like (everyone|nobody|always)/i.test(m)) healthy++;
    if (/\b(can you|could you|please|would you)\b.*\?/i.test(m)) healthy++;
    if (/\b(£|\$|€)\s?\d/.test(m)) healthy++; // concrete money
    if (/\b\d{1,4}\s?(users|customers|clients|months|weeks|years|days)\b/i.test(m)) healthy++; // concrete metrics
    if (/\bi (don'?t know|am unsure|might be wrong)\b/i.test(m)) healthy++; // owned uncertainty

    // Dominant mechanism (highest severity)
    let dominant = null;
    if (detected.length) {
      const sorted = [...detected].sort((a,b)=>b.severity-a.severity);
      dominant = sorted[0].mechanism;
    }
    const total_severity = detected.reduce((a,b)=>a+b.severity, 0);
    return { detected, dominant, healthy_signal_count: healthy, total_severity };
  }

  // ─── Lens 3 · Sales 101 buyer-stance read ───────────────────────
  function lensSales101(message, tool) {
    const m = (message || '').toString();
    const lo = lower(m);
    const signals = [];

    // BUYER_SEEKING: specific pain · urgency · qualifying questions
    let buyer = 0;
    if (/\b(losing|wasting|spending|costs?)\s+(£|\$|€|\d+|hours|days|money|time)\b/i.test(m)) { buyer += 3; signals.push('named-pain-cost'); }
    if (/\b(urgent|asap|by (?:next|the) (?:week|month)|deadline|launching)\b/i.test(m)) { buyer += 3; signals.push('urgency'); }
    if (/\b(how much|what does it cost|pricing|price|how do i (?:buy|get started|sign up))\b/i.test(m)) { buyer += 4; signals.push('qualifying-q'); }
    if (/\b(my (?:client|customer|team|org|company|business))\b/i.test(m)) { buyer += 2; signals.push('owned-context'); }

    // TIRE_KICKER: vague interest · no pain · no urgency
    let kicker = 0;
    if (/\b(just (?:curious|looking|browsing|checking)|maybe|might|someday|eventually|wondering)\b/i.test(m)) { kicker += 3; signals.push('vague-interest'); }
    if (m.length > 0 && m.length < 60 && !buyer) { kicker += 2; signals.push('thin-message'); }
    if (/\binteresting\b/i.test(m) && !/\bbecause\b/i.test(m)) { kicker += 2; signals.push('interesting-no-why'); }

    // COMPETITOR: architecture probes · no biz context
    let comp = 0;
    if (/\b(how do you (?:build|architect|implement|scale)|what (?:stack|framework|database))\b/i.test(m)) { comp += 4; signals.push('architecture-probe'); }
    if (/\b(open[- ]?source|github|repo)\b/i.test(m) && !tool) { comp += 1; signals.push('source-probe'); }
    if (/\b(competitive analysis|benchmark|compare to|vs\.?\s)\b/i.test(m)) { comp += 3; signals.push('comparison-frame'); }

    // BUILDER_PEER: talks about own builds · mutual respect frame
    let peer = 0;
    if (/\b(i (?:built|made|ship(?:ped)?|wrote|created)|my (?:tool|project|app|build))\b/i.test(m)) { peer += 4; signals.push('own-builds'); }
    if (tool && tool.length > 5) { peer += 3; signals.push('tool-url-attached'); }
    if (/\b(respect|love what you|been following|fan of your)\b/i.test(m) && /\bbuild\b/i.test(m)) { peer += 2; signals.push('peer-respect'); }
    if (/\b(guild|mesh|estate|sovereign|substrate)\b/i.test(m)) { peer += 2; signals.push('estate-vocabulary'); }

    // NOISE: fan mail · congrats · no signal
    let noise = 0;
    if (/\b(congrats|congratulations|amazing work|well done|great job|nice site|cool site)\b/i.test(m) && m.length < 200) { noise += 4; signals.push('fan-mail'); }
    if (m.length > 0 && m.length < 30) { noise += 2; signals.push('tiny-message'); }
    if (!m.trim()) { noise += 5; signals.push('empty-message'); }

    const scores = { BUYER_SEEKING: buyer, TIRE_KICKER: kicker, COMPETITOR: comp, BUILDER_PEER: peer, NOISE: noise };
    const ranked = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    const top = ranked[0];
    const stance = (top && top[1] > 0) ? top[0] : 'UNREAD';
    const confidence = top ? Math.min(100, top[1] * 12) : 0;

    const RECOMMEND = {
      BUYER_SEEKING: 'reply',
      BUILDER_PEER:  'guild-invite',
      TIRE_KICKER:   'archive',
      COMPETITOR:    'archive',
      NOISE:         'archive',
      UNREAD:        'reply',
    };
    return { stance, confidence, signals, recommended_next: RECOMMEND[stance] };
  }

  // ─── Lens 4 · Alex's swear-word ladder (EXTENSION POINT) ────────
  // 3 tiers · seed empty · Alex pushes runtime additions via
  // FallVetter.lists.SWEAR_LADDER.tier1_mild.push('...')
  //
  // Tiering convention (document for Alex):
  //   tier1_mild   · soft expletives · -10 score each hit · OK in passion
  //                  examples Alex MIGHT fill: damn, crap, hell, bloody
  //   tier2_medium · stronger swearing · -25 score each hit · review-band
  //                  examples Alex MIGHT fill: fuck, shit, bullshit
  //                  (note: v1 PROFANITY list also catches these · ladder
  //                   gives Alex fine-grained per-tier control independent
  //                   of v1's block-all PROFANITY behaviour)
  //   tier3_severe · slurs · threats · harassment · AUTO-BLOCK regardless
  //                  examples Alex MIGHT fill: targeted slurs, threats
  //
  // All matching uses leetNorm (l33t/4lt characters fold to base letters)
  // so "sh1t" matches "shit" entries.
  const SWEAR_LADDER = {
    tier1_mild:   [], // ALEX TO FILL · soft expletives · -10/hit
    tier2_medium: [], // ALEX TO FILL · stronger · -25/hit
    tier3_severe: [], // ALEX TO FILL · slurs/threats · AUTO-BLOCK
  };

  function lensLadder(message, name) {
    const text = leetNorm((message || '') + ' ' + (name || ''));
    const samples = [];
    function countHits(list) {
      if (!list || !list.length) return 0;
      let n = 0;
      for (const w of list) {
        const ln = leetNorm(w);
        if (!ln) continue;
        // Whole-word-ish match · word boundary on either side in normalized text
        const re = new RegExp('(^|\\s)' + ln.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(\\s|$)', 'g');
        const m = text.match(re);
        if (m) { n += m.length; samples.push(w); }
      }
      return n;
    }
    const t1 = countHits(SWEAR_LADDER.tier1_mild);
    const t2 = countHits(SWEAR_LADDER.tier2_medium);
    const t3 = countHits(SWEAR_LADDER.tier3_severe);
    const score_impact = -(t1 * 10 + t2 * 25 + t3 * 50);
    const auto_block = t3 > 0;
    return { tier1_hits: t1, tier2_hits: t2, tier3_hits: t3, samples, score_impact, auto_block };
  }

  // ─── Synthesis · the prophetic verdict ──────────────────────────
  function synthesize(base, jung, freud, sales, ladder) {
    // Sales101 buyer bonus (up to +15)
    const stanceBonus = sales.stance === 'BUYER_SEEKING' ? Math.min(15, Math.round(sales.confidence * 0.15))
                      : sales.stance === 'BUILDER_PEER'  ? Math.min(12, Math.round(sales.confidence * 0.12))
                      : 0;
    let score = base.score - (freud.total_severity * 5) + ladder.score_impact + stanceBonus;
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Decision floor
    let decision;
    const hasBaseBlock = base.decision === 'block';
    const hardBlock = ladder.auto_block || freud.total_severity >= 6 || hasBaseBlock;
    if (hardBlock) decision = 'block';
    else if (score < 40) decision = 'block';
    else if (score < 70) decision = 'review';
    else decision = 'allow';

    // Confidence in reading
    const evidenceCount = (jung.signals.length) + freud.detected.length + sales.signals.length + ladder.samples.length;
    const confidence = evidenceCount >= 6 ? 'high' : evidenceCount >= 3 ? 'medium' : 'low';

    // Reading summary · cite the lens results, don't dress them up
    const fragments = [];
    fragments.push(jung.archetype + (jung.strength ? ' (Jung str ' + jung.strength + ')' : ' (no archetype signal)'));
    if (freud.dominant) fragments.push(freud.dominant.toLowerCase() + ' defense');
    fragments.push(sales.stance.toLowerCase().replace(/_/g,'-'));
    if (ladder.tier1_hits + ladder.tier2_hits + ladder.tier3_hits) {
      fragments.push('ladder t1=' + ladder.tier1_hits + ' t2=' + ladder.tier2_hits + ' t3=' + ladder.tier3_hits);
    }
    fragments.push(sales.recommended_next === 'guild-invite' ? 'invite to guild'
                : sales.recommended_next === 'reply'        ? 'reply'
                : sales.recommended_next === 'archive'      ? 'archive'
                : 'review');
    const summary = fragments.join(' · ');

    return { score, decision, summary, confidence };
  }

  function read(input, options) {
    const opts = options || {};
    const name     = input && input.name;
    const email    = input && input.email;
    const linkedin = input && input.linkedin;
    const github   = input && input.github;
    const tool     = input && input.tool;
    const message  = input && (input.message || input.what || input.body);

    // Always run v1 base
    const base  = vet({ name, email, linkedin, github, tool, message }, { _skipBroadcast: true });
    const jung  = lensJung(message, name);
    const freud = lensFreud(message);
    const sales = lensSales101(message, tool);
    const ladder= lensLadder(message, name);

    const syn = synthesize(base, jung, freud, sales, ladder);

    const audit = {
      ts: Date.now(),
      version: 'fall-vetter/2.0-cassandra',
      input_hash: hashish((name||'') + '|' + (email||''))
    };

    const result = {
      score: syn.score,
      decision: syn.decision,
      archetype: jung.archetype,
      reading: { summary: syn.summary, confidence: syn.confidence },
      lenses: { base, jung, freud, sales101: sales, ladder },
      audit
    };

    // Broadcast to fall-signal (estate-wide audit)
    try {
      if (typeof BroadcastChannel !== 'undefined' && !opts._skipBroadcast) {
        const ch = new BroadcastChannel('fall-signal');
        ch.postMessage({
          kind: 'fall_vetter_result',
          payload: {
            score: result.score,
            decision: result.decision,
            archetype: result.archetype,
            reading: result.reading,
            sales_stance: sales.stance,
            recommended_next: sales.recommended_next,
            tier3_hits: ladder.tier3_hits,
            freud_dominant: freud.dominant,
            audit
          }
        });
        ch.close();
      }
    } catch (_) {}

    return result;
  }

  // Allow vet(input, {mode:'cassandra'}) to dispatch to read()
  const _vetOriginal = vet;
  function vetDispatch(input, options) {
    if (options && options.mode === 'cassandra') return read(input, options);
    return _vetOriginal(input, options);
  }

  // ─── public API ───────────────────────────────────────────────
  const api = {
    vet: vetDispatch,
    read,
    version: '2.0-cassandra',
    // Expose deny lists so admins can extend at runtime
    lists: { PROFANITY, WINDUP, DISPOSABLE_DOMAINS, ROLE_LOCALS, RED_FLAGS, SWEAR_LADDER, JUNG_ARCHETYPES },
    // Utility — wire to a button click
    attach: function(opts) {
      const o = opts || {};
      const form    = o.form    || document;
      const button  = o.button  || form.querySelector('[data-vet-submit]') || form.querySelector('button[type=submit]');
      const fields  = {
        name:     o.fields && o.fields.name     || form.querySelector('[name=name],#gName,#name'),
        email:    o.fields && o.fields.email    || form.querySelector('[name=email],#gEmail,#email'),
        linkedin: o.fields && o.fields.linkedin || form.querySelector('[name=linkedin],#gLinkedIn,#linkedin'),
        github:   o.fields && o.fields.github   || form.querySelector('[name=github],#gGithub,#github'),
        tool:     o.fields && o.fields.tool     || form.querySelector('[name=tool],#gTool,#tool'),
        message:  o.fields && o.fields.message  || form.querySelector('[name=message],[name=what],#gWhat,#message'),
      };
      const onAllow  = o.onAllow  || function(){};
      const onReview = o.onReview || function(v){ alert('Your application looks unusual — a human will review.\n\n' + v.reasons.filter(r=>r.level!=='block').map(r=>'• '+r.msg).join('\n')); };
      const onBlock  = o.onBlock  || function(v){ alert('We can\'t process this signup.\n\n' + v.reasons.filter(r=>r.level==='block').map(r=>'• '+r.msg).join('\n')); };

      if (!button) {
        console.warn('[fall-vetter] no submit button found');
        return null;
      }

      const handler = function(ev) {
        const input = {
          name:     fields.name     && fields.name.value,
          email:    fields.email    && fields.email.value,
          linkedin: fields.linkedin && fields.linkedin.value,
          github:   fields.github   && fields.github.value,
          tool:     fields.tool     && fields.tool.value,
          message:  fields.message  && fields.message.value,
        };
        const result = vet(input, o.vetOptions);
        if (result.decision === 'allow')      onAllow(result);
        else if (result.decision === 'review') { if (ev && ev.preventDefault) ev.preventDefault(); onReview(result); }
        else                                    { if (ev && ev.preventDefault) ev.preventDefault(); onBlock(result); }
        return result;
      };
      button.addEventListener('click', handler);
      return { handler, detach: function(){ button.removeEventListener('click', handler); } };
    }
  };

  global.FallVetter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
