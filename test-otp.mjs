// Smoke test: run api/send-otp.js and api/verify-otp.js as Vercel would,
// with mocked req/res, then prove the HMAC OTP verifies across "instances".
import { createHash, createHmac, randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = ''; // force the "not configured" path first
delete process.env.OTP_SECRET;  // ensure no stray env

const send = (await import('./api/send-otp.js')).default;
const verify = (await import('./api/verify-otp.js')).default;

function mockRes() {
  return {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
  };
}
const mockReq = (body) => ({ method: 'POST', body });

// 1. Missing RESEND_API_KEY in non-dev → must 500 with a clear message (not a crash)
let r = mockRes();
await send(mockReq({ email: 'user@example.com' }), r);
console.log('send-otp no-key:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 500 || !/RESEND_API_KEY/.test(r.body.error)) throw new Error('FAIL 1');

// 2. Dev mode returns devOtp
process.env.NODE_ENV = 'development';
r = mockRes();
await send(mockReq({ email: 'user@example.com' }), r);
console.log('send-otp dev:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 200 || !/^\d{6}$/.test(r.body.devOtp)) throw new Error('FAIL 2');

// 3. That devOtp must verify
r = mockRes();
await verify(mockReq({ email: 'user@example.com', otp: r2otp }), r);
function r2otp() { return undefined; } // placeholder to avoid TDZ confusion
console.log('(step 3 uses saved otp)');

// redo cleanly
let savedOtp;
r = mockRes();
await send(mockReq({ email: 'user@example.com' }), r);
savedOtp = r.body.devOtp;
r = mockRes();
await verify(mockReq({ email: 'user@example.com', otp: savedOtp }), r);
console.log('verify correct otp:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 200 || r.body.success !== true) throw new Error('FAIL 3');

// 4. Wrong otp → 400
r = mockRes();
await verify(mockReq({ email: 'user@example.com', otp: '000001' }), r);
console.log('verify wrong otp:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 400) throw new Error('FAIL 4');

// 5. OTP matches independent HMAC recomputation (cross-instance proof)
const secret = randomBytes(32).toString('hex');
process.env.OTP_SECRET = secret;
process.env.NODE_ENV = 'production';
// stub fetch to capture the "email"
let captured = null;
globalThis.fetch = async (url, opts) => {
  captured = JSON.parse(opts.body);
  return { ok: true, text: async () => '{}' };
};
r = mockRes();
await send(mockReq({ email: 'User@Example.com ' }), r);
console.log('send-otp prod:', r.statusCode, 'email html sent to:', captured && /to/.test(JSON.stringify(captured)) ? 'captured' : JSON.stringify(captured).slice(0, 80));
const win = Math.floor(Date.now() / (10 * 60 * 1000));
const expected = String(parseInt(createHmac('sha256', secret).update('user@example.com|' + win).digest('hex').slice(0, 8), 16) % 1e6).padStart(6, '0');
r = mockRes();
await verify(mockReq({ email: 'user@example.com', otp: expected }), r);
console.log('verify HMAC-recomputed otp:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 200) throw new Error('FAIL 5');

// 6. Rate limit: 4th request same email → 429
r = mockRes();
await send(mockReq({ email: 'rate@example.com' }), r);
await send(mockReq({ email: 'rate@example.com' }), r);
await send(mockReq({ email: 'rate@example.com' }), r);
r = mockRes();
await send(mockReq({ email: 'rate@example.com' }), r);
console.log('rate-limit 4th:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 429) throw new Error('FAIL 6');

// 7. Invalid email → 400
r = mockRes();
await send(mockReq({ email: 'not-an-email' }), r);
console.log('bad email:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 400) throw new Error('FAIL 7');

// 8. Bad JSON body → 400, no crash
r = mockRes();
await send({ method: 'POST', body: 'NOT_JSON{{{' }, r);
console.log('bad body:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 400) throw new Error('FAIL 8');

// 9. GET → 405
r = mockRes();
await send({ method: 'GET' }, r);
console.log('GET method:', r.statusCode, JSON.stringify(r.body));
if (r.statusCode !== 405) throw new Error('FAIL 9');

console.log('\nALL 9 SMOKE TESTS PASSED');
