# GNC Signal — Smart Money Concepts Trading Verdicts

**Live at:** https://www.gncsignal.com

Real-time multi-factor trading verdicts for BTC, ETH, SOL, XRP, BNB, Gold & Silver across 15m to 1D timeframes.

## Architecture

```
GnCSignal/
├── api/                    # Next.js API routes (Vercel serverless)
│   ├── auth/
│   │   ├── send-otp.ts     # Send OTP via Resend email
│   │   ├── verify-otp.ts   # Verify OTP, create session
│   │   ├── me.ts           # Get current user from session
│   │   └── logout.ts       # Destroy session
│   ├── live/
│   │   └── quotes.ts       # Batch live prices from Binance (used by verdict API)
│   └── verdict/
│       └── [asset].ts      # Multi-factor verdict engine (real market data)
├── lib/                    # Shared modules
│   ├── assets.ts           # Single source of truth for asset metadata
│   ├── market-data.ts      # Real market data fetchers (OI, LS ratio, liquidations, etc.)
│   ├── supabase.ts         # Database client & helpers
│   ├── auth-middleware.ts  # Session validation & rate limiting
│   └── supabase.ts         # Supabase client
├── database/
│   └── schema.sql          # PostgreSQL schema (run in Supabase SQL Editor)
├── index.html              # Landing page
├── login.html              # OTP-based auth flow
├── verdict.html            # Verdict Terminal (TradingView + multi-factor cards)
├── verdict-core.js         # Core logic (fetching, rendering, no DOM)
├── verdict-ui.js           # UI interactions, auth gate, event handlers
├── admin.html              # Local-only admin signal sender (DO NOT DEPLOY)
├── terminal.html           # Dashboard shell (sidebar + main)
└── styles.css              # Shared styles
```

## Key Features

| Feature | Status |
|---------|--------|
| Real Binance price sync (same as chart) | ✅ |
| Multi-factor verdict (10 factors, TF-weighted) | ✅ |
| Real market data: OI, LS ratio, liquidations, F&G, taker flow | ✅ |
| Order Blocks, FVG, Premium/Discount zones | ✅ (frontend) |
| OTP email auth (Resend) + Supabase sessions | ✅ |
| Free view (1x) then login required | ✅ |
| Rate limiting on all APIs | ✅ |
| TradingView chart integration | ✅ |

## Setup

### 1. Supabase
```bash
# 1. Create project at supabase.com
# 2. Run database/schema.sql in SQL Editor
# 3. Enable Email auth provider (disable email confirmation for OTP flow)
# 4. Get URL & anon key from Settings → API
```

### 2. Resend (Email)
```bash
# 1. Create account at resend.com
# 2. Verify domain (gncsignal.com)
# 3. Create API key
```

### 3. Environment Variables
```bash
cp .env.example .env
# Fill in all values
```

### 4. Deploy to Vercel
```bash
npm install
vercel deploy
# Add env vars in Vercel dashboard
```

## Local Development
```bash
npm run dev
# Opens http://localhost:3000
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/send-otp` | POST | - | Send OTP to email |
| `/api/auth/verify-otp` | POST | - | Verify OTP, create session |
| `/api/auth/me` | GET | Cookie/Token | Get current user |
| `/api/auth/logout` | POST | Cookie | Destroy session |
| `/api/live/quotes` | GET | - | Batch live prices |
| `/api/verdict/[asset]` | GET | Session | Multi-factor verdict |

## Verdict Engine (Real Data)

The verdict API now uses **real market data** instead of `Math.random()`:

| Factor | Source | Timeframe Weight |
|--------|--------|------------------|
| Technical (EMA, RSI) | Binance klines | 50% → 25% |
| Open Interest | Binance Futures API | 10% → 15% |
| Long/Short Ratio | Binance Futures API | 8% → 10% |
| Liquidations | Binance forceOrders | 10% → 8% |
| Fear & Greed | Alternative.me API | 5% → 12% |
| Taker Flow | Binance takerlongshortRatio | 10% → 5% |
| News Sentiment | Placeholder (NewsAPI ready) | 2% → 8% |
| Whale Activity | Placeholder (Glassnode ready) | 3% → 9% |
| Macro (DXY, Yields, Fed) | Yahoo Finance | 2% → 8% |

## Admin Page (Local Only)

`admin.html` contains your Telegram bot token — **never deploy to Vercel**.
Open locally from your computer/phone to send signals to your channel.

## Security Notes

- All API routes have rate limiting (IP-based)
- Sessions stored in Supabase with HTTP-only cookies
- OTPs expire in 10 minutes, single-use
- Free view tracked server-side (cookie + DB)
- Admin page excluded from build (`vercel.json` ignore)

## Vercel Config

```json
{
  "ignoreCommand": "git check-ignore admin.html"
}
```

## Future Enhancements

- [ ] WebSocket live price updates
- [ ] NewsAPI integration for real sentiment
- [ ] Glassnode/WhaleAlert for whale tracking
- [ ] CME FedWatch for real Fed policy
- [ ] Historical verdict tracking in dashboard
- [ ] Mobile PWA support# Force rebuild
