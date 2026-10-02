import { supabase, verifyOTP, createSession, getUserFromToken } from '../../lib/supabase';
import { checkRateLimit, getClientIP } from '../../lib/supabase';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  // Rate limiting
  const ip = getClientIP(req);
  const rateLimit = checkRateLimit(`otp-verify-${ip}`, 20, 60000); // 20 attempts per minute
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many verification attempts. Please wait.' });
  }
  
  const { email, otp, purpose = 'signup' } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }
  
  if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'Invalid OTP format' });
  }
  
  // Verify OTP
  const result = await verifyOTP(email, otp, purpose as 'signup' | 'login' | 'reset_password');
  
  if (!result.valid) {
    return res.status(400).json({ error: result.error || 'Invalid OTP' });
  }
  
  // Get user
  let user = result.user;
  
  // If signup, create user record
  if (purpose === 'signup' && supabase) {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (!existingUser) {
      // User will be created by the frontend after OTP verification
      // We just return success here
    } else {
      user = existingUser;
    }
  }
  
  // Create session token
  const sessionToken = user ? await createSession(user.id) : '';
  
  // Set secure HTTP-only cookie
  if (sessionToken) {
    res.setHeader('Set-Cookie', `gnc_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}; Path=/`);
  }
  
  return res.status(200).json({ 
    success: true, 
    message: 'Email verified successfully',
    user: user ? { name: user.name, email: user.email, plan: user.plan } : null,
    sessionToken // Return token for localStorage backup
  });
}