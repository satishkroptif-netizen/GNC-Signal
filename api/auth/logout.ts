import { deleteSession } from '../../lib/supabase';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  // Get session token from cookie
  const cookie = req.headers.get('cookie') || '';
  const sessionMatch = cookie.match(/gnc_session=([^;]+)/);
  const sessionToken = sessionMatch ? sessionMatch[1] : null;
  
  if (sessionToken) {
    await deleteSession(sessionToken);
  }
  
  // Clear cookies
  res.setHeader('Set-Cookie', [
    'gnc_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
    'gnc_free_view=; Max-Age=0; Path=/',
  ]);
  
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
}