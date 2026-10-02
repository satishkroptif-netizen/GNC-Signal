/**
 * User Registration API Route
 * POST /api/auth
 * Body: { name: string, email: string, phone: string, password: string }
 */

// In-memory user store (use a real database in production)
const users = new Map();

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

  const { name, email, phone, password } = req.body;

  // Validation
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (phone.length < 10) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Check if user already exists
  if (users.has(email)) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  // Create user (hash password in production!)
  const user = {
    id: Date.now().toString(),
    name,
    email,
    phone,
    password, // TODO: Use bcrypt to hash
    verified: true,
    createdAt: new Date().toISOString(),
  };

  users.set(email, user);

  return res.status(201).json({
    success: true,
    message: 'Account created successfully',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
  });
}

// Helper to get users (for login, etc.)
export function getUsers() {
  return users;
}
