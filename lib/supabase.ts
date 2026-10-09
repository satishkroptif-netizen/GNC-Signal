/**
 * Supabase Client & Database Setup
 * Run schema.sql in Supabase SQL Editor first
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars not set - using mock client');
}

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// --- Database Types ---
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  email_verified: boolean;
  phone_verified: boolean;
  plan: string;
  created_at: string;
  updated_at: string;
}

export interface OTPCode {
  id: string;
  email: string;
  otp: string;
  purpose: 'signup' | 'login' | 'reset_password';
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Verdict {
  id: string;
  symbol: string;
  timeframe: string;
  verdict: string;
  score: number;
  confidence: number;
  entry_price: number;
  target_1: number;
  target_2: number;
  stop_loss: number;
  regime: string;
  risk_level: string;
  created_at: string;
}

// --- Auth Helpers ---
export async function getUserFromToken(token: string): Promise<User | null> {
  if (!supabase) return null;
  
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();
    
  return profile;
}

export async function createSession(userId: string): Promise<string> {
  if (!supabase) return '';
  
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  await supabase.from('user_sessions').insert({
    user_id: userId,
    token,
    expires_at: expiresAt
  });
  
  return token;
}

export async function validateSession(token: string): Promise<User | null> {
  if (!supabase) return null;
  
  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .single();
    
  if (!session || new Date(session.expires_at) < new Date()) {
    return null;
  }
  
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .single();
    
  return user;
}

export async function deleteSession(token: string) {
  if (!supabase) return;
  await supabase.from('user_sessions').delete().eq('token', token);
}

// --- OTP Helpers ---
export async function storeOTP(email: string, otp: string, purpose: OTPCode['purpose'] = 'signup') {
  if (!supabase) return;
  
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  
  await supabase.from('otp_codes').insert({
    email,
    otp,
    purpose,
    expires_at: expiresAt
  });
}

export async function verifyOTP(email: string, otp: string, purpose: OTPCode['purpose'] = 'signup'): Promise<{ valid: boolean; error?: string; user?: User }> {
  if (!supabase) return { valid: false, error: 'Database not configured' };
  
  const { data: otpData } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', email)
    .eq('otp', otp)
    .eq('purpose', purpose)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  if (!otpData) {
    return { valid: false, error: 'Invalid or expired OTP' };
  }
  
  // Mark OTP as used
  await supabase.from('otp_codes').update({ used: true }).eq('id', otpData.id);
  
  // If signup, create user
  if (purpose === 'signup') {
    // User creation handled separately after OTP verification
  }
  
  // Get or create user
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
    
  if (!user) {
    // This shouldn't happen for signup flow - user should be created after OTP verify
    return { valid: false, error: 'User not found' };
  }
  
  return { valid: true, user };
}

// --- Verdict Storage ---
export async function storeVerdict(verdict: Omit<Verdict, 'id' | 'created_at'>) {
  if (!supabase) return;
  
  await supabase.from('verdicts').insert(verdict);
}

export async function getVerdictHistory(symbol: string, limit = 100) {
  if (!supabase) return [];
  
  const { data } = await supabase
    .from('verdicts')
    .select('*')
    .eq('symbol', symbol)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  return data || [];
}

// --- Rate Limiting ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(identifier: string, maxRequests = 30, windowMs = 60000): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

export function getClientIP(req: Request | any): string {
  // ✅ FIX: works on BOTH runtimes — Web Request (headers.get) and
  // Vercel/Next Node runtime (plain object). The old code called
  // req.headers.get() unconditionally, which throws on the Node runtime
  // and 500s every request.
  const h: any = (req && req.headers) || {};
  const get = (name: string): string | undefined => {
    if (typeof h.get === 'function') return h.get(name);
    return h[name];
  };
  const forwarded = get('x-forwarded-for');
  const realIP = get('x-real-ip');
  return (forwarded && String(forwarded).split(',')[0].trim()) || realIP || 'unknown';
}