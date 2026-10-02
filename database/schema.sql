-- GNC Signal Database Schema
-- PostgreSQL / Supabase compatible

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  plan VARCHAR(50) DEFAULT 'Free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OTP codes table
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  purpose VARCHAR(50) NOT NULL, -- 'signup', 'login', 'reset_password'
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Verdicts history table
CREATE TABLE IF NOT EXISTS verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  verdict VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL,
  confidence INTEGER NOT NULL,
  entry_price DECIMAL(20, 8),
  target_1 DECIMAL(20, 8),
  target_2 DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8),
  regime VARCHAR(50),
  risk_level VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_verdicts_symbol ON verdicts(symbol);
CREATE INDEX IF NOT EXISTS idx_verdicts_created ON verdicts(created_at);

-- Function to clean up expired OTPs
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < NOW() OR used = TRUE;
END;
$$ LANGUAGE plpgsql;
