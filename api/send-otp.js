// GnC Verdict — Vercel Serverless Function: POST /api/send-otp
// Body: { email } (name/phone optional — login.html sends only email)
// Sends a 6-digit verification code via Resend.
//
// OTP generation is STATELESS (HMAC-SHA256 of email + time-window with a secret),
// so it works across serverless instances with no shared database.
// Uses the Web Crypto API (global `crypto.subtle`) — available in Node 18+
// runtimes and browsers, no imports required.
//
// Required Vercel environment variables:
//   RESEND_API_KEY — from https://resend.com (also fixes the current 500 error)
//   SENDER_EMAIL   — a verified sender, e.g. "GnC Verdict <noreply@gncsignal.com>"
//   OTP_SECRET     — random hex string. Generate:
//                      node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const WINDOW_MS = 10 * 60 * 1000; // code valid for 10 minutes
const RATE = new Map(); // email -> [timestamps] (best-effort, per instance)

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function otpFor(secret, email, windowIndex) {
  const hex = await hmacHex(secret, email + '|' + windowIndex);
  const num = parseInt(hex.slice(0, 8), 16) % 1000000;
  return String(num).padStart(6, '0');
}

function cleanRate() {
  const now = Date.now();
  for (const [k, v] of RATE) {
    const filtered = v.filter((t) => now - t < 60 * 60 * 1000);
    if (filtered.length) RATE.set(k, filtered);
    else RATE.delete(k);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  let body = {};
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body.' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'A valid email address is required.' });
  }

  cleanRate();
  const now = Date.now();
  const reqs = RATE.get(email) || [];
  if (reqs.length >= 3) {
    return res.status(429).json({ success: false, error: 'Too many attempts. Please try again in an hour.' });
  }
  reqs.push(now);
  RATE.set(email, reqs);

  const secret = process.env.OTP_SECRET || 'DEV_SECRET_CHANGE_ME';
  const otp = await otpFor(secret, email, Math.floor(now / WINDOW_MS));

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEV] OTP for ' + email + ' -> ' + otp);
      return res.status(200).json({ success: true, devOtp: otp });
    }
    console.error('send-otp: RESEND_API_KEY is not set — this is why the endpoint was returning 500.');
    return res.status(500).json({ success: false, error: 'Email service not configured (missing RESEND_API_KEY).' });
  }

  const sender = process.env.SENDER_EMAIL || 'GnC Verdict <noreply@gncsignal.com>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: email,
        subject: 'Your GnC Verdict verification code',
        html:
          '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0f172a">' +
          '<h2 style="color:#b45309">🪙 GnC Verdict</h2>' +
          '<p>Your verification code is:</p>' +
          '<div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#fef3c7;padding:12px;border-radius:8px;text-align:center">' +
          otp + '</div>' +
          '<p style="color:#64748b;font-size:13px">This code expires in 10 minutes. If you didn\'t request it, ignore this email.</p>' +
          '<p style="color:#94a3b8;font-size:12px">GnC Verdict — educational tool, not financial advice.</p></div>',
      }),
    });
    if (!r.ok) {
      console.error('Resend error:', r.status, await r.text());
      return res.status(500).json({ success: false, error: 'Failed to send email.' });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Failed to send email.' });
  }
}
