import { getAuthContext } from '../../../lib/auth-middleware';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const auth = await getAuthContext(req);
  
  return res.status(200).json({
    authenticated: auth.isAuthenticated,
    freeViewAvailable: auth.isFreeView,
    user: auth.user ? {
      name: auth.user.name,
      email: auth.user.email,
      plan: auth.user.plan,
    } : null,
  });
}