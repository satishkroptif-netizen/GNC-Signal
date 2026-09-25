
# GNC Signal - Verdict + Telegram Bot Patch for gncsignal.com

Ye patch tere existing gncsignal.com Vercel project me add karna hai.

## Kya hai isme?
- /verdict.html -> BTC, ETH, SOL, XRP, BNB, Gold, Silver dedicated buttons + timeframe 15m,30m,1h,4h,1d verdict
- /api/verdict/[asset].js -> AI verdict API (Binance price + RSI/EMA logic)
- /api/telegram/bot.js -> Telegram bot with inline keyboards (asset -> timeframe)
- /api/live/quotes.js -> Live quotes API (used by verdict)
- /api/market/metal/[symbol].js -> Gold/Silver price
- /api/market/putcall/[symbol].js -> Put/Call ratio

## Installation Steps for gncsignal.com

### Step 1: Apna existing repo clone kar
Tera gncsignal.com Vercel pe kis GitHub repo se connected hai, usko clone kar:
```
git clone https://github.com/YOUR_USERNAME/gncsignal.com.git
cd gncsignal.com
```

### Step 2: Ye patch files copy kar
Is patch zip ko extract karke, andar ke files ko tere gncsignal.com folder me copy kar:

- api/ folder ko merge kar (agar api folder pehle se hai to andar files add kar, overwrite mat kar)
- verdict.html ko root me copy kar

Structure aisa ho jayega:
```
gncsignal.com/
├── index.html (tera existing)
├── verdict.html (NEW - add kiya)
├── api/
│   ├── verdict/
│   │   ├── [asset].js (NEW)
│   │   └── all.js (NEW)
│   ├── telegram/
│   │   └── bot.js (NEW)
│   ├── live/
│   │   └── quotes.js (NEW)
│   └── market/
│       ├── metal/[symbol].js (NEW)
│       └── putcall/[symbol].js (NEW)
```

### Step 3: vercel.json update kar
Agar tere pass vercel.json hai to usme ye rewrites add kar (agar nahi hai to ye file bana de):

```json
{
  "cleanUrls": true,
  "rewrites": [
    {"source": "/verdict", "destination": "/verdict.html"},
    {"source": "/terminal", "destination": "/terminal.html"}
  ]
}
```

### Step 4: index.html me link add kar
Tere existing gncsignal.com ke index.html ke navbar me ye button add kar:

```html
<a href="/verdict.html" class="btn btn-gold">🎯 Verdict Terminal</a>
```

### Step 5: Vercel Env Vars set kar
Vercel Dashboard -> gncsignal.com Project -> Settings -> Environment Variables:

- TELEGRAM_BOT_TOKEN = tera bot token (BotFather se)
- SITE_URL = https://gncsignal.com

### Step 6: Push & Deploy
```
git add .
git commit -m "Add verdict terminal + telegram bot"
git push
```

Vercel auto-deploy karega. 2 min me live.

### Step 7: Telegram webhook set kar
Browser me ye URL open kar (TOKEN replace kar):

https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://gncsignal.com/api/telegram/bot

Response me "ok": true aana chahiye.

### Step 8: Test kar
- https://gncsignal.com/verdict.html?asset=btc&tf=1h
- https://gncsignal.com/api/verdict/btc
- https://gncsignal.com/api/telegram/bot (should say ok:true)
- Telegram pe bot ko /start bhejo -> buttons dikhenge

### Features
- Website: 7 assets x 5 timeframes = 35 verdicts
- Telegram: Same buttons, inline keyboard
- Real Binance price + technical indicators
- Copy/Share buttons

Koi doubt ho to bol.
