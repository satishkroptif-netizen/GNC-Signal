/**
 * Verify OTP API Route
 * POST /api/verify-otp
 * Body: { email: string, otp: string }
 */

// In-memory OTP store (shared with send-otp.js in production use Redis/DB)
const otpStore = new Map();

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const stored = otpStore.get(email);

  if (!stored) {
    return res.status(400).json({ error: 'No OTP found for this email. Please request a new one.' });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (stored.otp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
  }

  // OTP verified — delete it
  otpStore.delete(email);

  return res.status(200).json({
    success: true,
    message: 'Email verified successfully',
  });
}
