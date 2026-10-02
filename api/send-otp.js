/**
 * Send OTP API Route
 * POST /api/send-otp
 * Body: { email: string }
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// In-memory OTP store (use Redis/DB in production)
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

  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Store OTP
  otpStore.set(email, { otp, expiresAt });

  try {
    // Send email via Resend
    await resend.emails.send({
      from: 'noreply@gncsignal.com',
      to: email,
      subject: 'Your GNC Signal Verification Code',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: auto; padding: 20px;">
          <h2 style="color: #f6c445;">GNC Signal</h2>
          <p>Your verification code is:</p>
          <h1 style="font-size: 48px; letter-spacing: 8px; color: #f6c445; text-align: center; padding: 20px; background: #121827; border-radius: 12px;">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
          <p style="color: #8b95a5; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    console.error('Email send error:', error);

    // Fallback: return OTP in development mode
    if (process.env.NODE_ENV === 'development') {
      return res.status(200).json({
        success: true,
        message: 'OTP sent (dev mode)',
        devOtp: otp, // Remove in production!
      });
    }

    return res.status(500).json({ error: 'Failed to send OTP' });
  }
}

// Helper function to get OTP store (for verify-otp.js)
export function getOtpStore() {
  return otpStore;
}
