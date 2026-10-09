# GNC Signal Database

## Overview

This directory contains the database schema and configuration for the GNC Signal platform.

## Schema

### Tables

| Table | Purpose |
|-------|---------|
| `users` | Registered user accounts |
| `otp_codes` | One-time passwords for verification |
| `user_sessions` | Active user sessions |
| `verdicts` | Historical trading verdicts |

## Setup Options

### Option 1: Supabase (Recommended)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Paste the contents of `schema.sql`
4. Run the query

### Option 2: Vercel Postgres

1. Go to your Vercel dashboard
2. Add a Postgres database
3. Connect and run the schema

### Option 3: Local PostgreSQL

```bash
createdb gnc_signal
psql gnc_signal -f database/schema.sql
```

## Environment Variables

Add these to your `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/gnc_signal

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# App
NEXT_PUBLIC_APP_URL=https://gncsignal.com
```

## API Integration

The API routes use these tables:

- `api/send-otp.js` → Inserts into `otp_codes`
- `api/verify-otp.js` → Reads from `otp_codes`
- `api/auth.js` → Inserts into `users`

## Production Considerations

1. **Password Hashing**: Use bcrypt before storing passwords
2. **Rate Limiting**: Add rate limiting to OTP endpoints
3. **Cleanup**: Run `cleanup_expired_otps()` periodically
4. **Backups**: Enable automated backups
