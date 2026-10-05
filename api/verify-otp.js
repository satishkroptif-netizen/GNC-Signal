// GnC Verdict — Vercel Serverless Function: POST /api/verify-otp
// Body: { email, otp }
// Stateless verification: recomputes the HMAC-based code for the current
// (and previous) 10-minute window and compares. No shared store needed,
// so it works across serverless instances.
// Uses the Web Crypto API (global `crypto.subtle`) — no imports required.
//
// Uses the same OTP_SECRET as api/send-otp.js (set it once in Vercel env).

const WINDOW_MS = 10 * 60 * 1000;

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
  const otp = String(body.otp || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'A valid email address is required.' });
  }
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, error: 'OTP must be 6 digits.' });
  }

  const secret = process.env.OTP_SECRET || 'DEV_SECRET_CHANGE_ME';
  const now = Math.floor(Date.now() / WINDOW_MS);
  const ok =
    (await otpFor(secret, email, now)) === otp ||
    (await otpFor(secret, email, now - 1)) === otp;

  if (!ok) {
    return res.status(400).json({ success: false, error: 'Invalid or expired code. Please request a new one.' });
  }

  return res.status(200).json({ success: true, email: email });
}
