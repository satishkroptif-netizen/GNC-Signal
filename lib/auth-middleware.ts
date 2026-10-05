import { validateSession, getUserFromToken, checkRateLimit, getClientIP } from './supabase';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  email_verified: boolean;
}

export interface AuthContext {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isFreeView: boolean;
}

/**
 * Extract user from request (cookie or Authorization header)
 */
export async function getAuthContext(req: any): Promise<AuthContext> {
  // Try cookie first
  const cookie = req.headers.get('cookie') || '';
  const sessionMatch = cookie.match(/gnc_session=([^;]+)/);
  const sessionToken = sessionMatch ? sessionMatch[1] : null;
  
  // Fallback to Authorization header
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.replace('Bearer ', '') || null;
  
  const token = sessionToken || bearerToken;
  
  if (!token) {
    // Check free view
    const freeViewUsed = cookie.includes('gnc_free_view=true');
    return { user: null, isAuthenticated: false, isFreeView: !freeViewUsed };
  }
  
  // Validate session
  const user = await validateSession(token);
  
  if (user) {
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        email_verified: user.email_verified,
      },
      isAuthenticated: true,
      isFreeView: false,
    };
  }
  
  // Check free view
  const freeViewUsed = cookie.includes('gnc_free_view=true');
  return { user: null, isAuthenticated: false, isFreeView: !freeViewUsed };
}

/**
 * Middleware to protect API routes
 * Usage: export default withAuth(async (req, res) => { ... })
 */
export function withAuth(handler: (req: any, res: any, auth: AuthContext) => Promise<any>) {
  return async (req: any, res: any) => {
    // Rate limiting
    const ip = getClientIP(req);
    const rateLimit = checkRateLimit(`api-${ip}`, 100, 60000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    // Get auth context
    const auth = await getAuthContext(req);
    
    // Check if free view is allowed (one-time)
    if (!auth.isAuthenticated && auth.isFreeView) {
      // Allow one free view
      res.setHeader('Set-Cookie', 'gnc_free_view=true; Max-Age=31536000; Path=/; SameSite=Lax');
      return handler(req, res, { ...auth, isFreeView: false });
    }
    
    // Require authentication
    if (!auth.isAuthenticated) {
      return res.status(401).json({ 
        error: 'Authentication required',
        redirect: '/login.html'
      });
    }
    
    return handler(req, res, auth);
  };
}

/**
 * Optional auth - doesn't block, just adds context
 */
export function withOptionalAuth(handler: (req: any, res: any, auth: AuthContext) => Promise<any>) {
  return async (req: any, res: any) => {
    const auth = await getAuthContext(req);
    
    if (!auth.isAuthenticated && auth.isFreeView) {
      res.setHeader('Set-Cookie', 'gnc_free_view=true; Max-Age=31536000; Path=/; SameSite=Lax');
    }
    
    return handler(req, res, auth);
  };
}

/**
 * Admin-only middleware
 */
export function withAdminAuth(handler: (req: any, res: any, auth: AuthContext) => Promise<any>) {
  return withAuth(async (req, res, auth) => {
    if (auth.user?.plan !== 'Admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return handler(req, res, auth);
  });
}