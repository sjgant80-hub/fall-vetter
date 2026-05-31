// ═══════════════════════════════════════════════════════════════════
//  fall-vetter · v1.0 · guild signup gate · R2 ring · ┃ validate
//  prime 347 · sovereign single-file · MIT
//
//  Drop-in pre-block for any signup form. Validates:
//    · name (length / pattern / wind-up / leet / repeated chars)
//    · email (syntax / disposable / role-account / domain)
//    · LinkedIn URL (format + handle sanity)
//    · social fallback (GitHub, X, personal site, Substack)
//    · message body (sarcasm/swearing/hack-bait signal)
//
//  Returns: { score, decision: 'allow'|'review'|'block', reasons[], audit }
//  No network calls by default. Pure function. Offline-first.
//  Optional async helpers for future LinkedIn fetch verification.
//
//  Usage:
//    <script src="https://sjgant80-hub.github.io/fall-vetter/fall-vetter.js"></script>
//    const v = window.FallVetter.vet({ name, email, linkedin, github, message });
//    if (v.decision === 'block') showError(v.reasons);
//    else if (v.decision === 'review') flagForHumanReview(v);
//    else submitForm();
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
      if (typeof BroadcastChannel !== 'undefined') {
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

  // ─── public API ───────────────────────────────────────────────
  const api = {
    vet,
    version: '1.0',
    // Expose deny lists so admins can extend at runtime
    lists: { PROFANITY, WINDUP, DISPOSABLE_DOMAINS, ROLE_LOCALS, RED_FLAGS },
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
