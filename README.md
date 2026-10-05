# GnC Verdict — Critical Fixes Package

Fixes for the 7 critical issues found on gncsignal.com.

| # | Issue | Fix | File |
|---|-------|-----|------|
| 1 | `auth.js` 404 → Sign Up / paywall / modal buttons all dead | New auth module: modal control + OTP signup flow + session + paywall unlock | `auth.js` |
| 2 | `POST /api/send-otp` returns 500 (missing `RESEND_API_KEY`) | Drop-in serverless functions, stateless HMAC OTP | `api/send-otp.js`, `api/verify-otp.js` |
| 3 | `admin.html` publicly exposed (Telegram bot token tool) | SHA-256 password gate + 5-attempt lockout + credentials in sessionStorage | `admin.html` |
| 4 | No risk disclaimer on the verdict page | Disclaimer bar added | `verdict.html`, `index.html` |
| 5 | Random `Math.random()` buy/sell verdicts when the API fails | Honest error card with Retry button | `verdict.html` |
| 6 | Stale hardcoded prices ($84,447 / $84,014 / $2,915 gold) labelled "LIVE" | Honest "connecting…" / "DELAYED" / "unavailable" states | `verdict.html`, `index.html`, `admin.html` |
| 7 | Copy bugs: FAQ promises nonexistent nav buttons; footer is a spec note; paywall contradicts itself | Rewritten FAQ, footer, paywall copy + cross-link to GnC Signal | `index.html`, `verdict.html` |

## How to deploy

### 1. Upload the files to your static-site repo (the one that serves gncsignal.com)

```
gncsignal-fix/
├── auth.js            → copy to site ROOT (this fixes the 404)
├── index.html         → replace root index.html
├── verdict.html       → replace root verdict.html
├── admin.html         → replace root admin.html
└── api/
    ├── send-otp.js    → copy to api/send-otp.js  (Vercel serverless function)
    └── verify-otp.js  → copy to api/verify-otp.js
```

`login.html` and `app.js` need **no changes** — they already call `/api/send-otp` and
`/api/verify-otp`, which these functions serve.

### 2. Set Vercel environment variables

Project → Settings → Environment Variables → add all three (Production + Preview):

- **`RESEND_API_KEY`** — from https://resend.com (this alone likely fixes the current 500)
- **`SENDER_EMAIL`** — a verified sender, e.g. `GnC Verdict <noreply@gncsignal.com>`
  (verify your domain in Resend first, or use `Resend <hello@resend.io>` test sender)
- **`OTP_SECRET`** — random string. Generate with:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Then **redeploy** (env changes require a new deployment).

### 3. Set the admin password in `admin.html`

```
node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"
```

Paste the output into `admin.html` where it says `REPLACE_WITH_SHA256_OF_YOUR_PASSWORD`.

### 4. Test checklist

- [ ] Homepage: BTC price shows a real live number (or "unavailable" — never a fake LIVE price)
- [ ] Verdict Terminal: first view free → second click shows paywall → **Sign Up Free** opens the modal
- [ ] Signup: enter name/email/phone → 6-digit code arrives by email → verify → paywall disappears, verdict loads
- [ ] login.html: OTP flow still works end-to-end
- [ ] Verdict Terminal: temporarily point `/api/verdict` at a bad URL → see the red "Verdict unavailable / Retry" card (no random signals)
- [ ] `gncsignal.com/admin.html` → asks for password; 5 wrong attempts → 15-min lockout
- [ ] Disclaimer visible on homepage and verdict page

## Architecture notes / caveats

1. **OTP is stateless** (HMAC-SHA256 of `email|time-window` with `OTP_SECRET`, 10-min
   window, previous window also accepted). This is deliberate: serverless functions have
   no shared memory, so a Map-based store breaks across instances. No database needed.
2. **Rate limiting is best-effort** (per-instance Map, 3 emails/hour). Good enough for a
   free tool; for real scale put OTP state in Upstash Redis.
3. **The admin gate is a speed bump, not security** — the page is client-side, so anyone
   with the HTML can see the (hashed) gate. Best practice: enable **Vercel Deployment
   Protection → Authentication** on the deployment, or keep `admin.html` out of the
   public deploy and run it locally.
4. **Sessions are client-side** (`localStorage` `gnc_user`). Fine for a free tool; not
   suitable for payments or personal data.
5. **`admin.html` credentials** (bot token / chat ID) now live in `sessionStorage` —
   they vanish when the tab closes instead of persisting in `localStorage`.

## If you only want the 2-minute fix

If your existing `api/send-otp.js` is otherwise fine, the 500 is almost certainly just
the missing `RESEND_API_KEY` env var — add it in the Vercel dashboard and redeploy, then
upload **only** `auth.js` (the true 404) and the fixed `index.html` / `verdict.html`.
