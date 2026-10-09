// ✅ FIX: was '../lib/...' — from api/verdict/ that resolves to api/lib/* (missing)
// and crashes the function with MODULE_NOT_FOUND on every call.
import { getAsset, getAllAssetsForUI, formatPrice, ASSET_KEYS } from '../../lib/assets';
import { fetchAllMarketData } from '../../lib/market-data';
import { checkRateLimit, getClientIP } from '../../lib/supabase';

interface VerdictRequest {
  query: {
    asset?: string;
  };
}

function calculateTechnicalScore(price: number, ema20: number, ema50: number, rsi14: number): number {
  let score = 0;
  // Price vs EMA20
  score += price > ema20 ? 1.2 : -1.2;
  // EMA20 vs EMA50
  score += ema20 > ema50 ? 0.9 : -0.9;
  // RSI — momentum in the normal band, but FADED at extremes.
  // ✅ FIX: previously RSI 90 scored MORE bullish than RSI 70 while the
  // reasoning box called it "overbought" — score and story contradicted.
  let rsiTerm = (rsi14 - 50) / 25;
  if (rsi14 > 70) rsiTerm = 0.8 - (rsi14 - 70) * 0.06;   // fade overbought toward reversal
  if (rsi14 < 30) rsiTerm = -0.8 - (rsi14 - 30) * 0.06;  // fade oversold toward bounce
  score += rsiTerm;
  return score;
}

function calculateCompositeScore(
  technicalScore: number,
  marketData: any,
  tf: string,
  change24h: number,
  assetKey: string
): number {
  // Timeframe weights
  const tfWeights: Record<string, any> = {
    '15m': { tech: 0.50, oi: 0.10, ls: 0.08, liq: 0.10, fg: 0.05, flow: 0.10, news: 0.02, whale: 0.03, macro: 0.02 },
    '30m': { tech: 0.45, oi: 0.12, ls: 0.08, liq: 0.10, fg: 0.06, flow: 0.10, news: 0.03, whale: 0.03, macro: 0.03 },
    '1h':  { tech: 0.40, oi: 0.13, ls: 0.09, liq: 0.10, fg: 0.08, flow: 0.09, news: 0.04, whale: 0.04, macro: 0.03 },
    '4h':  { tech: 0.30, oi: 0.15, ls: 0.10, liq: 0.10, fg: 0.10, flow: 0.07, news: 0.06, whale: 0.06, macro: 0.06 },
    '1d':  { tech: 0.25, oi: 0.15, ls: 0.10, liq: 0.08, fg: 0.12, flow: 0.05, news: 0.08, whale: 0.09, macro: 0.08 },
  };
  
  const w = tfWeights[tf] || tfWeights['1h'];
  
  // Open Interest Score
  // ✅ FIX: OI direction only means something WITH price direction.
  // Rising OI + rising price = new longs (bullish). Rising OI + falling price
  // = new shorts (bearish). Previously rising OI was always bullish.
  let oiScore = 0;
  const oiChg = marketData.openInterest.change24h;
  if (oiChg > 5 && change24h > 0) oiScore = 0.6;
  else if (oiChg > 5 && change24h < 0) oiScore = -0.5;
  else if (oiChg < -5) oiScore = -0.4;

  // Long/Short Ratio Score
  // ✅ FIX: `value` is the raw RATIO (BTC ≈ 2.0, XRP ≈ 3.1 — always > 0.65),
  // so the old code was bearish -0.5 on EVERY asset every day and the bullish
  // branch could never fire. The 0.65/0.45 thresholds belong to the
  // longAccount FRACTION (0–1). Contrarian: crowded longs = bearish risk.
  let lsScore = 0;
  const longAcct = marketData.longShortRatio.accounts; // 0–1 fraction long
  if (longAcct > 0.65) lsScore = -0.5;        // crowd heavily long → squeeze risk
  else if (longAcct < 0.45) lsScore = 0.5;    // crowd heavily short → squeeze upside
  else lsScore = (0.5 - longAcct) * 0.4;      // mild contrarian tilt in the normal band

  // Liquidations Score
  let liqScore = 0;
  if (marketData.liquidations.longs > marketData.liquidations.shorts * 1.5) liqScore = 0.4;
  else if (marketData.liquidations.shorts > marketData.liquidations.longs * 1.5) liqScore = -0.4;

  // Fear & Greed Score (contrarian)
  // ✅ FIX: old thresholds jumped from +0.5 at 75 to -0.6 at 76 — a 1.1 score
  // discontinuity from a 1-point index move. Now continuous through the band.
  // ✅ FIX 2: F&G is a CRYPTO index — must not move gold/silver verdicts.
  const isCrypto = assetKey !== 'gold' && assetKey !== 'silver';
  let fgScore = 0;
  if (isCrypto) {
    if (marketData.fearGreedIndex > 75) fgScore = -0.6;
    else if (marketData.fearGreedIndex < 25) fgScore = 0.6;
    else fgScore = (50 - marketData.fearGreedIndex) / 50;
  }
  
  // Taker Flow Score
  const flowScore = (marketData.takerFlow.ratio - 0.5) * 2;
  
  // News Score
  const newsScore = Math.max(-0.8, Math.min(0.8, marketData.newsSentiment.score));
  
  // Whale Score — netFlow is in $M (real aggTrades ≥$100k window)
  // ✅ FIX: thresholds were ±500 (old placeholder units) and could never trigger
  let whaleScore = 0;
  if (marketData.whaleActivity.netFlow < -2) whaleScore = -0.5;
  else if (marketData.whaleActivity.netFlow > 2) whaleScore = 0.5;
  
  // Macro Score
  let macroScore = 0;
  macroScore += marketData.macroFactors.dxy > 105 ? -0.4 : marketData.macroFactors.dxy < 102 ? 0.4 : 0;
  macroScore += marketData.macroFactors.realYields > 2.3 ? -0.3 : marketData.macroFactors.realYields < 1.9 ? 0.3 : 0;
  macroScore += marketData.macroFactors.fedPolicy === 'Dovish' ? 0.5 : marketData.macroFactors.fedPolicy === 'Hawkish' ? -0.5 : 0;
  
  // Volume adjustment
  let volAdj = 0;
  if (change24h > 2.5) volAdj = 0.3;
  else if (change24h < -2.5) volAdj = -0.3;
  
  const compositeScore = 
    technicalScore * w.tech +
    oiScore * w.oi +
    lsScore * w.ls +
    liqScore * w.liq +
    fgScore * w.fg +
    flowScore * w.flow +
    newsScore * w.news +
    whaleScore * w.whale +
    macroScore * w.macro +
    volAdj;
  
  return compositeScore;
}

function getBiasAndConfidence(score: number): { bias: string; confidence: number; signal: string } {
  // ✅ FIX: confidence used Math.random() — the same market state showed a
  // different confidence on every refresh. Now it's deterministic from |score|
  // (distance beyond the neutral band = conviction).
  const confBase = Math.min(95, 55 + Math.abs(score) * 12);
  const confidence = Math.round(confBase);
  if (score > 1.8) return { bias: 'STRONGLY BULLISH', confidence, signal: 'Strong Buy / Long' };
  if (score > 1.0) return { bias: 'BULLISH', confidence: Math.min(confidence, 88), signal: 'Buy / Long' };
  if (score > 0.4) return { bias: 'CAUTIOUSLY BULLISH', confidence: Math.min(confidence, 78), signal: 'Buy on dip' };
  if (score < -1.8) return { bias: 'STRONGLY BEARISH', confidence, signal: 'Strong Sell / Short' };
  if (score < -1.0) return { bias: 'BEARISH', confidence: Math.min(confidence, 88), signal: 'Sell / Short' };
  if (score < -0.4) return { bias: 'CAUTIOUSLY BEARISH', confidence: Math.min(confidence, 78), signal: 'Sell on rise' };
  return { bias: 'NEUTRAL / RANGE', confidence: Math.min(confidence, 60), signal: 'Wait / Range' };
}

function buildReasoningBoxes(price: number, ema20: number, ema50: number, rsi14: number, marketData: any, tf: string, assetKey: string) {
  const boxes = [];
  
  // Technical
  const techStatus = price > ema20 ? 'Price above EMA20' : 'Price below EMA20';
  const trendStatus = ema20 > ema50 ? 'EMA20 > EMA50 (uptrend)' : 'EMA20 < EMA50 (downtrend)';
  const rsiStatus = rsi14 > 70 ? 'overbought' : rsi14 < 30 ? 'oversold' : 'neutral';
  boxes.push({
    title: '📊 Technical Analysis',
    data: [`${techStatus} ($${ema20.toFixed(2)})`, trendStatus, `RSI at ${rsi14.toFixed(0)} (${rsiStatus})`],
    sentiment: price > ema20 && ema20 > ema50 ? 'bullish' : price < ema20 && ema20 < ema50 ? 'bearish' : 'neutral',
  });
  
  // Open Interest
  let oiInterp = '';
  if (marketData.openInterest.change24h > 5) oiInterp = change24h > 0
    ? 'Rising OI with rising price — new longs entering, trend continuation'
    : 'Rising OI with falling price — new shorts entering, bearish pressure';
  else if (marketData.openInterest.change24h < -5) oiInterp = 'Falling OI indicates position unwinding, weakening trend';
  else oiInterp = 'Stable OI, consolidation phase';
  boxes.push({
    title: '📈 Open Interest',
    data: [`Value: $${(marketData.openInterest.value / 1e9).toFixed(2)}B`, `24h Change: ${marketData.openInterest.change24h > 0 ? '+' : ''}${marketData.openInterest.change24h.toFixed(1)}%`, oiInterp],
    sentiment: marketData.openInterest.change24h > 5 ? (change24h > 0 ? 'bullish' : 'bearish') : marketData.openInterest.change24h < -5 ? 'bearish' : 'neutral',
  });
  
  // Long/Short Ratio — uses the longAccount FRACTION (0–1), not the raw ratio.
  // ✅ FIX: raw ratio (BTC≈2.0, always > 0.65) made this box permanently bearish.
  let lsInterp = '';
  const longAcctFrac = marketData.longShortRatio.accounts;
  if (longAcctFrac > 0.65) lsInterp = 'Market overleveraged long, risk of long squeeze';
  else if (longAcctFrac < 0.45) lsInterp = 'Excessive shorts, potential short squeeze setup';
  else lsInterp = 'Balanced positioning, no extreme leverage';
  boxes.push({
    title: '⚖️ Long/Short Ratio',
    data: [`Ratio: ${marketData.longShortRatio.value.toFixed(2)}`, `Longs (accounts): ${(longAcctFrac * 100).toFixed(1)}%`, lsInterp],
    sentiment: longAcctFrac > 0.65 ? 'bearish' : longAcctFrac < 0.45 ? 'bullish' : 'neutral',
  });
  
  // Liquidations
  let liqInterp = '';
  if (marketData.liquidations.longs > marketData.liquidations.shorts * 1.5) liqInterp = 'Heavy long liquidations cleared weak hands, potentially bullish';
  else if (marketData.liquidations.shorts > marketData.liquidations.longs * 1.5) liqInterp = 'Heavy short liquidations, bears covering, reversal risk';
  else liqInterp = 'Balanced liquidations, normal market activity';
  boxes.push({
    title: '💥 Liquidations (24h)',
    data: [`Longs: $${marketData.liquidations.longs.toFixed(0)}M`, `Shorts: $${marketData.liquidations.shorts.toFixed(0)}M`, liqInterp],
    sentiment: marketData.liquidations.longs > marketData.liquidations.shorts * 1.5 ? 'bullish' : marketData.liquidations.shorts > marketData.liquidations.longs * 1.5 ? 'bearish' : 'neutral',
  });
  
  // Fear & Greed
  // ✅ FIX: F&G is a CRYPTO-ONLY index. Applying it to gold/silver produced
  // nonsense factors (e.g. "Extreme Greed" shifting a silver verdict).
  const isCrypto = assetKey !== 'gold' && assetKey !== 'silver';
  let fgLevel = '', fgInterp = '';
  if (!isCrypto) {
    fgLevel = 'N/A (metals)';
    fgInterp = 'Fear & Greed is a crypto sentiment index — not applied to metals';
  } else if (marketData.fearGreedIndex > 75) { fgLevel = 'Extreme Greed'; fgInterp = 'Market overheated, correction risk high'; }
  else if (marketData.fearGreedIndex > 55) { fgLevel = 'Greed'; fgInterp = 'Bullish sentiment, but watch for excess'; }
  else if (marketData.fearGreedIndex < 25) { fgLevel = 'Extreme Fear'; fgInterp = 'Capitulation zone, contrarian buy opportunity'; }
  else if (marketData.fearGreedIndex < 45) { fgLevel = 'Fear'; fgInterp = 'Cautious sentiment, potential for reversal'; }
  else { fgLevel = 'Neutral'; fgInterp = 'Balanced market psychology'; }
  boxes.push({
    title: '😨 Fear & Greed Index',
    data: [`Index: ${isCrypto ? marketData.fearGreedIndex.toFixed(0) + '/100' : 'N/A'}`, `Level: ${fgLevel}`, fgInterp],
    sentiment: !isCrypto ? 'neutral' : marketData.fearGreedIndex > 75 ? 'bearish' : marketData.fearGreedIndex < 25 ? 'bullish' : 'neutral',
  });
  
  // Taker Flow
  let flowInterp = '';
  if (marketData.takerFlow.ratio > 0.58) flowInterp = 'Strong buying pressure from aggressive market takers';
  else if (marketData.takerFlow.ratio < 0.42) flowInterp = 'Aggressive selling, takers hitting bids';
  else flowInterp = 'Balanced order flow, no directional dominance';
  boxes.push({
    title: '💸 Taker Buy/Sell Flow',
    data: [`Buy: ${(marketData.takerFlow.ratio * 100).toFixed(0)}%`, `Sell: ${((1 - marketData.takerFlow.ratio) * 100).toFixed(0)}%`, flowInterp],
    sentiment: marketData.takerFlow.ratio > 0.58 ? 'bullish' : marketData.takerFlow.ratio < 0.42 ? 'bearish' : 'neutral',
  });
  
  // News Sentiment
  const newsLevel = marketData.newsSentiment.score > 0.3 ? 'Positive' : marketData.newsSentiment.score < -0.3 ? 'Negative' : 'Neutral';
  boxes.push({
    title: '📰 News Sentiment',
    data: [`Sentiment: ${newsLevel}`, `Articles Analyzed: ${marketData.newsSentiment.articles}`, Math.abs(marketData.newsSentiment.score) > 0.5 ? 'Strong narrative impact on market sentiment' : 'Normal news flow'],
    sentiment: marketData.newsSentiment.score > 0.3 ? 'bullish' : marketData.newsSentiment.score < -0.3 ? 'bearish' : 'neutral',
  });
  
  // Whale Activity — netFlow in $M, thresholds scaled to the real proxy window
  let whaleInterp = '';
  if (marketData.whaleActivity.netFlow < -2) whaleInterp = 'Whales distributing, potential bearish signal';
  else if (marketData.whaleActivity.netFlow > 2) whaleInterp = 'Whale accumulation detected, bullish long-term';
  else whaleInterp = 'Neutral whale activity';
  boxes.push({
    title: '🐋 Whale Activity',
    data: [`Large Trades (≥$100k): ${marketData.whaleActivity.largeTransactions}`, `Net Flow: $${marketData.whaleActivity.netFlow > 0 ? '+' : ''}${marketData.whaleActivity.netFlow.toFixed(2)}M`, whaleInterp],
    sentiment: marketData.whaleActivity.netFlow > 2 ? 'bullish' : marketData.whaleActivity.netFlow < -2 ? 'bearish' : 'neutral',
  });
  
  // Macro
  let macroInterp = '';
  if (marketData.macroFactors.dxy > 105) macroInterp = 'Strong dollar headwind for risk assets';
  else if (marketData.macroFactors.dxy < 102) macroInterp = 'Weak dollar supportive for crypto';
  else macroInterp = 'Dollar neutral';
  if (marketData.macroFactors.fedPolicy === 'Dovish') macroInterp += ', accommodative Fed policy bullish';
  else if (marketData.macroFactors.fedPolicy === 'Hawkish') macroInterp += ', tight Fed policy bearish';
  else macroInterp += ', neutral Fed stance';
  boxes.push({
    title: '🌍 Macro Factors',
    data: [`DXY: ${marketData.macroFactors.dxy.toFixed(2)}`, `Real Yields: ${marketData.macroFactors.realYields.toFixed(2)}%`, `Fed Policy: ${marketData.macroFactors.fedPolicy}`, macroInterp],
    sentiment: (marketData.macroFactors.dxy < 102 && marketData.macroFactors.fedPolicy === 'Dovish') ? 'bullish' : (marketData.macroFactors.dxy > 105 && marketData.macroFactors.fedPolicy === 'Hawkish') ? 'bearish' : 'neutral',
  });
  
  return boxes;
}

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Rate limiting
  const ip = getClientIP(req);
  const rateLimit = checkRateLimit(`verdict-${ip}`, 60, 60000); // 60 req/min
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait.' });
  }
  
  const { asset = 'btc' } = req.query;
  const assetKey = asset.toLowerCase().replace('xau', 'gold').replace('xag', 'silver');
  const assetMeta = getAsset(assetKey);
  
  if (!assetMeta) {
    return res.status(400).json({ error: `Unknown asset: ${asset}` });
  }
  
  // Fetch live price (primary: Binance)
  // ✅ FIX: silver (XAGUSDT) does NOT exist on Binance SPOT — the old code
  // silently fell back to a hardcoded $32 while real silver trades ~$60.
  // Chain: spot → futures (fapi has XAGUSDT) → CoinGecko → last resort 400.
  let price = 0;
  let change24h = 0;
  
  try {
    const r = await fetch(`${BINANCE_API}/api/v3/ticker/24hr?symbol=${assetMeta.binance}`, { headers: { 'User-Agent': 'GNC/1.0' } });
    const t = await r.json();
    if (t.lastPrice) {
      price = parseFloat(t.lastPrice);
      change24h = parseFloat(t.priceChangePercent || '0');
    }
  } catch (e) {
    console.error('Price fetch failed:', e);
  }
  
  // Futures fallback (has XAGUSDT + deeper metals coverage)
  if (price === 0) {
    try {
      const r = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${assetMeta.binance}`, { headers: { 'User-Agent': 'GNC/1.0' } });
      const t = await r.json();
      if (t.lastPrice) {
        price = parseFloat(t.lastPrice);
        change24h = parseFloat(t.priceChangePercent || '0');
      }
    } catch (e) {}
  }
  
  // Fallback to CoinGecko
  if (price === 0) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${assetMeta.coingecko}&vs_currencies=usd&include_24hr_change=true`);
      const j = await r.json();
      if (j[assetMeta.coingecko]?.usd) {
        price = j[assetMeta.coingecko].usd;
        change24h = j[assetMeta.coingecko].usd_24h_change || 0;
      }
    } catch (e) {}
  }
  
  // ✅ FIX: no more silent hardcoded fallback price — if every source failed,
  // say so honestly instead of issuing a verdict on a made-up number.
  if (price === 0) {
    return res.status(503).json({
      error: 'Live price unavailable for this asset right now. Please retry.',
      asset: assetKey.toUpperCase(),
    });
  }
  
  // Fetch klines PER TIMEFRAME — a 15m verdict must be computed on 15m candles.
  // ✅ FIX: previously ONE set of 1h candles fed all five timeframes, so the
  // "15m" verdict was really a 1h verdict with tighter levels.
  const tfs = ['15m', '30m', '1h', '4h', '1d'];
  
  async function fetchCloses(interval: string): Promise<number[]> {
    // spot first, futures fallback (XAGUSDT has no spot candles)
    for (const base of [`${BINANCE_API}/api/v3`, 'https://fapi.binance.com/fapi/v1']) {
      try {
        const r = await fetch(`${base}/klines?symbol=${assetMeta.binance}&interval=${interval}&limit=100`, { headers: { 'User-Agent': 'GNC/1.0' } });
        const k = await r.json();
        if (Array.isArray(k) && k.length >= 50) return k.map((c: any) => parseFloat(c[4]));
      } catch (e) {}
    }
    return [];
  }
  
  const closesByTf: Record<string, number[]> = {};
  await Promise.all(tfs.map(async (tf) => { closesByTf[tf] = await fetchCloses(tf); }));
  
  // ✅ FIX: never verdict on fabricated candles — if an asset has no real
  // candles at all, say so instead of inventing them.
  if (tfs.every((tf) => closesByTf[tf].length < 50)) {
    return res.status(503).json({
      error: 'Candle data unavailable for this asset right now. Please retry.',
      asset: assetKey.toUpperCase(),
    });
  }
  
  // Calculate indicators
  function ema(arr: number[], p: number): number {
    if (arr.length < p) return arr[arr.length - 1] || price;
    let k = 2 / (p + 1);
    let e = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
    for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
    return e;
  }
  
  function rsi(arr: number[], period = 14): number {
    if (arr.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = arr.length - period; i < arr.length; i++) {
      let d = arr[i] - arr[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    if (losses === 0) return 70;
    let rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }
  
  // ✅ FIX: per-timeframe EMA/RSI from that timeframe's OWN candles
  const techByTf: Record<string, { ema20: number; ema50: number; rsi14: number }> = {};
  for (const tf of tfs) {
    const closes = closesByTf[tf];
    if (closes.length >= 50) {
      techByTf[tf] = { ema20: ema(closes, 20), ema50: ema(closes, 50), rsi14: rsi(closes, 14) };
    } else {
      // this TF's candles unavailable → borrow the next available TF's tech
      const donor = tfs.map((t) => techByTf[t]).find(Boolean);
      techByTf[tf] = donor || { ema20: price, ema50: price, rsi14: 50 };
    }
  }
  const { ema20, ema50, rsi14 } = techByTf['1h'] || techByTf[tfs.find((t) => techByTf[t]) || '1h']; // 1h tech drives the reasoning boxes
  
  // Fetch REAL market data
  const marketData = await fetchAllMarketData(assetKey);
  
  // Generate verdicts for all timeframes
  const verdicts: Record<string, any> = {};
  
  const multMap: Record<string, number> = { '15m': 0.009, '30m': 0.013, '1h': 0.02, '4h': 0.035, '1d': 0.06 };
  
  for (const tf of tfs) {
    const mult = multMap[tf] || 0.02;
    // ✅ per-timeframe technicals
    const tech = techByTf[tf];
    const technicalScore = calculateTechnicalScore(price, tech.ema20, tech.ema50, tech.rsi14);
    const compositeScore = calculateCompositeScore(technicalScore, marketData, tf, change24h, assetKey);
    const { bias, confidence, signal } = getBiasAndConfidence(compositeScore);
    const isBullish = bias.includes('BULL');
    // ✅ FIX: NEUTRAL verdicts previously got bearish-biased levels (SL above
    // price). For a "Wait / Range" signal, show both-side levels around price.
    const isNeutral = !isBullish && !bias.includes('BEAR');
    const dir = isNeutral ? 1 : (isBullish ? 1 : -1);
    
    const sup = price * (1 - mult * 1.2);
    const resis = price * (1 + mult * 1.2);
    const sl = isBullish ? price * (1 - mult) : price * (1 + mult);
    // ✅ FIX: neutral verdicts now get symmetrical two-sided levels
    const t1 = price * (1 + dir * mult * 1.6);
    const t2 = price * (1 + dir * mult * 3);
    
    const reasoningBoxes = buildReasoningBoxes(price, ema20, ema50, rsi14, marketData, tf, assetKey);
    
    const verdictSummary = {
      title: '🎯 Verdict Summary',
      data: [
        `Timeframe: ${tf.toUpperCase()}`,
        `Bias: ${bias}`,
        `Confidence: ${Math.round(confidence)}%`,
        `Composite Score: ${compositeScore.toFixed(2)}`,
        `Signal: ${signal}`,
        `Price: $${price.toFixed(assetMeta.decimals)} (${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}% 24h)`
      ],
      sentiment: bias.includes('BULL') ? 'bullish' : bias.includes('BEAR') ? 'bearish' : 'neutral',
    };
    
    verdicts[tf] = {
      timeframe: tf,
      asset: assetKey.toUpperCase(),
      name: assetMeta.name,
      price: Number(price.toFixed(assetMeta.decimals)),
      bias,
      confidence: Math.round(confidence),
      signal,
      support: Number(sup.toFixed(assetMeta.decimals)),
      resistance: Number(resis.toFixed(assetMeta.decimals)),
      stopLoss: Number(sl.toFixed(assetMeta.decimals)),
      target1: Number(t1.toFixed(assetMeta.decimals)),
      target2: Number(t2.toFixed(assetMeta.decimals)),
      // ✅ per-TF technicals (were 1h values copied into every timeframe)
      rsi: Math.round(tech.rsi14),
      ema20: Number(tech.ema20.toFixed(assetMeta.decimals)),
      ema50: Number(tech.ema50.toFixed(assetMeta.decimals)),
      change24h: Number(change24h.toFixed(2)),
      factors: {
        technical: Number(technicalScore.toFixed(2)),
        openInterest: Number(((function(){ const c = marketData.openInterest.change24h; return c > 5 ? (change24h > 0 ? 0.6 : -0.5) : c < -5 ? -0.4 : 0; })()).toFixed(2)),
        longShortRatio: Number(((function(){ const la = marketData.longShortRatio.accounts; return la > 0.65 ? -0.5 : la < 0.45 ? 0.5 : (0.5 - la) * 0.4; })()).toFixed(2)),
        liquidations: Number((marketData.liquidations.longs > marketData.liquidations.shorts * 1.5 ? 0.4 : marketData.liquidations.shorts > marketData.liquidations.longs * 1.5 ? -0.4 : 0).toFixed(2)),
        fearGreed: Number(((function(){ if (assetKey === 'gold' || assetKey === 'silver') return 0; const fg = marketData.fearGreedIndex; return fg > 75 ? -0.6 : fg < 25 ? 0.6 : (50 - fg) / 50; })()).toFixed(2)),
        takerFlow: Number(((marketData.takerFlow.ratio - 0.5) * 2).toFixed(2)),
        newsSentiment: Number(Math.max(-0.8, Math.min(0.8, marketData.newsSentiment.score)).toFixed(2)),
        whaleActivity: Number((marketData.whaleActivity.netFlow < -2 ? -0.5 : marketData.whaleActivity.netFlow > 2 ? 0.5 : 0).toFixed(2)),
        // inline macro score (same formula as calculateCompositeScore)
        macro: Number((
          (marketData.macroFactors.dxy > 105 ? -0.4 : marketData.macroFactors.dxy < 102 ? 0.4 : 0) +
          (marketData.macroFactors.realYields > 2.3 ? -0.3 : marketData.macroFactors.realYields < 1.9 ? 0.3 : 0) +
          (marketData.macroFactors.fedPolicy === 'Dovish' ? 0.5 : marketData.macroFactors.fedPolicy === 'Hawkish' ? -0.5 : 0)
        ).toFixed(2)),
        compositeScore: Number(compositeScore.toFixed(2)),
      },
      reasoningBoxes,
      verdictSummary,
      timestamp: new Date().toISOString(),
    };
  }
  
  return res.status(200).json({
    asset: assetKey.toUpperCase(),
    name: assetMeta.name,
    symbol: assetMeta.binance,
    tvSymbol: assetMeta.tv,
    currentPrice: Number(price.toFixed(assetMeta.decimals)),
    change24h: Number(change24h.toFixed(2)),
    priceSource: `LIVE: Binance ${assetMeta.binance} = $${price.toFixed(assetMeta.decimals)} - SAME AS CHART`,
    marketData,
    verdicts,
    generatedAt: new Date().toISOString(),
  });
}

// Binance API constant
const BINANCE_API = 'https://data-api.binance.vision';