import { supabase, storeOTP, verifyOTP, createSession, validateSession, deleteSession } from '../../lib/supabase';
import { checkRateLimit, getClientIP } from '../../lib/supabase';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  // Rate limiting
  const ip = getClientIP(req);
  const rateLimit = checkRateLimit(`otp-send-${ip}`, 5, 60000); // 5 OTPs per minute per IP
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please wait before requesting another OTP.' });
  }
  
  const { email, name, phone, purpose = 'signup' } = req.body;
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  
  if (purpose === 'signup') {
    if (!name || !phone || phone.length < 10) {
      return res.status(400).json({ error: 'Name and phone number (10 digits) required for signup' });
    }
  }
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store in Supabase
  await storeOTP(email, otp, purpose as 'signup' | 'login' | 'reset_password');
  
  // Send email via Resend
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);
      
      await resend.emails.send({
        from: 'noreply@gncsignal.com',
        to: email,
        subject: 'Your GNC Signal Verification Code',
        html: `
          <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:20px;">
            <h2 style="color:#f6c445;">GNC Signal</h2>
            <p>Your verification code is:</p>
            <h1 style="font-size:48px;letter-spacing:8px;color:#f6c445;text-align:center;padding:20px;background:#121827;border-radius:12px;">${otp}</h1>
            <p>This code expires in 10 minutes.</p>
            <p style="color:#8b95a5;font-size:12px;">If you didn't request this, please ignore this email.</p>
          </div>
        `,
      });
    } else {
      console.log(`OTP for ${email}: ${otp} (dev mode - no Resend key)`);
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'OTP sent successfully',
      devOtp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  } catch (error) {
    console.error('Email error:', error);
    // Even if email fails, OTP is stored - user can check console in dev
    return res.status(200).json({ 
      success: true, 
      message: 'OTP sent (check console in dev mode)',
      devOtp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  }
}