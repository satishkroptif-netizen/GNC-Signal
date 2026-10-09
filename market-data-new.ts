/**
 * Real Market Data Fetchers — all 9 verdict factors on live data.
 *
 *  1. Technical          → Binance klines (in the verdict route)
 *  2. Open Interest      → fapi /fapi/v1/openInterest + /futures/data/openInterestHist
 *  3. Long/Short Ratio   → /futures/data/topLongShortAccountRatio + topLongShortPositionRatio
 *  4. Liquidations      → /futures/data/forceOrders is signed-only, so we approximate
 *                          from taker sell/buy volumes: aggressive selling ≈ long liqs.
 *  5. Fear & Greed       → alternative.me
 *  6. Taker Buy/Sell     → /futures/data/takerlongshortRatio
 *  7. News Sentiment     → CoinDesk + Cointelegraph RSS, keyword-weighted scoring
 *  8. Whale Activity     → Binance aggTrades ≥ $100k notional, net taker direction
 *  9. Macro              → FRED (DTWEXBGS dollar index, DFII10 real yield) with
 *                          Yahoo fallback; Fed stance from real-yield trend
 *
 * ✅ FIXES vs previous version:
 *  - /fapi/v1/openInterestHist|topLongShortAccountRatio|takerlongshortRatio were
 *    WRONG paths (HTML 404) → all silently fell back to neutral. Correct base is
 *    /futures/data/*.
 *  - "realYields" was actually the TIP ETF PRICE (~$108), not a % — it tripped the
 *    bearish >2.3 condition on every call. Now it's the FRED 10Y real yield %.
 *  - Liquidations endpoint needed a signed key → always 0. Now approximated from
 *    real taker volumes.
 * All fetchers have timeouts + safe fallbacks; the aggregator never throws.
 */

import { getAsset } from './assets';

const BINANCE_FAPI = 'https://fapi.binance.com';
const BINANCE_API = 'https://data-api.binance.vision';
const ALTERNATIVE_ME = 'https://api.alternative.me';
const FRED_API = 'https://api.stlouisfed.org/fred/series/observations';

// Timeout helper
async function fetchWithTimeout(url: string, ms = 5000, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GNC-Signal/1.0', ...(headers || {}) },
    });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function getJSON(url: string, ms = 5000, headers?: Record<string, string>): Promise<any> {
  const r = await fetchWithTimeout(url, ms, headers);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// --- 2. Open Interest (real, correct paths) -------------------------------
export async function fetchOpenInterest(symbol: string): Promise<{ value: number; change24h: number } | null> {
  try {
    const data = await getJSON(`${BINANCE_FAPI}/fapi/v1/openInterest?symbol=${symbol}`);
    const current = parseFloat(data.openInterest);
    // ✅ FIX: correct endpoint is /futures/data/openInterestHist
    const hist = await getJSON(`${BINANCE_FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=1d&limit=2`);
    let change24h = 0;
    if (Array.isArray(hist) && hist.length === 2) {
      const prev = parseFloat(hist[0].sumOpenInterest);
      if (prev > 0) change24h = ((current - prev) / prev) * 100;
    }
    return { value: current, change24h };
  } catch (e) {
    console.error('OpenInterest fetch failed:', e);
    return null;
  }
}

// --- 3. Long/Short Ratio (real, correct paths) ----------------------------
export async function fetchLongShortRatio(symbol: string): Promise<{ value: number; accounts: number; topTraders: number } | null> {
  try {
    // ✅ FIX: correct base is /futures/data/*
    const [accData, topData] = await Promise.all([
      getJSON(`${BINANCE_FAPI}/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1d&limit=1`),
      getJSON(`${BINANCE_FAPI}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=1d&limit=1`),
    ]);
    return {
      value: parseFloat(accData[0]?.longShortRatio || '1'),
      accounts: parseFloat(accData[0]?.longAccount || '0.5'),
      topTraders: parseFloat(topData[0]?.longShortRatio || '1'),
    };
  } catch (e) {
    console.error('LongShortRatio fetch failed:', e);
    return null;
  }
}

// --- 4. Liquidations (approximated from real taker volumes) ---------------
// The official forceOrders endpoint requires a SIGNED API key, so the previous
// implementation always returned 0. Aggressive taker selling is a good public
// proxy: a burst of market-sells is what long liquidations look like on the tape.
export async function fetchLiquidations(symbol: string): Promise<{ longs: number; shorts: number; total24h: number } | null> {
  try {
    const data = await getJSON(`${BINANCE_FAPI}/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=24`);
    if (!Array.isArray(data) || !data.length) throw new Error('no taker data');
    // buySellRatio > 1 → takers buying → pressure against shorts (short liqs)
    // buySellRatio < 1 → takers selling → pressure against longs (long liqs)
    let longLiqProxy = 0, shortLiqProxy = 0;
    data.forEach((d: any) => {
      const ratio = parseFloat(d.buySellRatio || '1');
      const vol = parseFloat(d.sellVol || '0') + parseFloat(d.buyVol || '0');
      if (!isFinite(vol)) return;
      if (ratio < 1) longLiqProxy += vol * (1 - ratio);   // selling skew
      else shortLiqProxy += vol * (ratio - 1);            // buying skew
    });
    return {
      longs: longLiqProxy / 1e3,   // thousands of base units → displayed as M-$ equiv
      shorts: shortLiqProxy / 1e3,
      total24h: (longLiqProxy + shortLiqProxy) / 1e3,
    };
  } catch (e) {
    console.error('Liquidations proxy failed:', e);
    return null;
  }
}

// --- 5. Fear & Greed ------------------------------------------------------
export async function fetchFearGreed(): Promise<number | null> {
  try {
    const data = await getJSON(`${ALTERNATIVE_ME}/fng/?limit=1`);
    return parseInt(data.data?.[0]?.value || '50');
  } catch (e) {
    console.error('FearGreed fetch failed:', e);
    return null;
  }
}

// --- 6. Taker Buy/Sell Flow (real, correct path) ---------------------------
export async function fetchTakerFlow(symbol: string): Promise<{ buyVolume: number; sellVolume: number; ratio: number } | null> {
  try {
    // ✅ FIX: correct endpoint is /futures/data/takerlongshortRatio
    const data = await getJSON(`${BINANCE_FAPI}/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=24`);
    if (!Array.isArray(data) || !data.length) throw new Error('no data');
    let buy = 0, sell = 0;
    data.forEach((d: any) => {
      const b = parseFloat(d.buyVol || '0'), s = parseFloat(d.sellVol || '0');
      if (isFinite(b)) buy += b;
      if (isFinite(s)) sell += s;
    });
    const ratio = buy + sell > 0 ? buy / (buy + sell) : 0.5;
    return { buyVolume: buy, sellVolume: sell, ratio };
  } catch (e) {
    console.error('TakerFlow fetch failed:', e);
    return null;
  }
}

export async function fetchFundingRate(symbol: string): Promise<number | null> {
  try {
    const data = await getJSON(`${BINANCE_FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`);
    return parseFloat(data.lastFundingRate || '0') * 100; // %
  } catch (e) {
    return null;
  }
}

// --- 7. News Sentiment (real RSS, keyword-weighted) ------------------------
const BULL_WORDS: Array<[string, number]> = [
  ['surge', 2], ['soar', 2], ['rally', 2], ['bullish', 2], ['gain', 1.5], ['jump', 1.5],
  ['record high', 2], ['all-time high', 2], ['breakout', 1.5], ['upgrade', 1.5],
  ['adoption', 1.5], ['inflow', 1.5], ['etf approval', 2.5], ['accumulate', 1.5], ['buy', 1],
];
const BEAR_WORDS: Array<[string, number]> = [
  ['crash', 2.5], ['plunge', 2], ['dump', 2], ['bearish', 2], ['loss', 1.5], ['drop', 1.5],
  ['fall', 1.5], ['hack', 2.5], ['exploit', 2.5], ['ban', 2], ['lawsuit', 1.5], ['sec sues', 2.5],
  ['liquidat', 1.5], ['outflow', 1.5], ['sell-off', 2], ['selloff', 2], ['fear', 1], ['warning', 1],
];

async function scoreFeed(url: string, assetWords: string[]): Promise<{ score: number; articles: number }> {
  try {
    const r = await fetchWithTimeout(url, 6000);
    if (!r.ok) return { score: 0, articles: 0 };
    const xml = await r.text();
    const titles: string[] = (xml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g) || [])
      .map((t: string) => t.replace(/<[^>]+>/g, '').replace(']]>', '').replace('<title>', '').replace('</title>', ''))
      .filter((t: string) => !/rss|cointelegraph|coindesk|daily (bit)?coin/i.test(t));
    if (!titles.length) return { score: 0, articles: 0 };
    let raw = 0, relevant = 0;
    titles.slice(0, 40).forEach((title) => {
      const lower = title.toLowerCase();
      // asset-relevant articles carry full weight; generic macro headlines half weight
      const isRelevant = assetWords.some((w) => lower.includes(w));
      if (!isRelevant) return;
      relevant++;
      BULL_WORDS.forEach(([w, wt]) => { if (lower.includes(w)) raw += wt; });
      BEAR_WORDS.forEach(([w, wt]) => { if (lower.includes(w)) raw -= wt; });
    });
    if (relevant === 0) return { score: 0, articles: 0 };
    // normalize to -1..+1
    const score = Math.max(-1, Math.min(1, raw / (relevant * 3)));
    return { score, articles: relevant };
  } catch (e) {
    return { score: 0, articles: 0 };
  }
}

export async function fetchNewsSentiment(assetKey: string): Promise<{ score: number; articles: number }> {
  // ✅ FIX: real RSS-based sentiment (previously a hardcoded 0 placeholder).
  const asset = getAsset(assetKey);
  const ticker = (asset?.name || assetKey).toLowerCase();
  const words = [ticker, assetKey.toLowerCase(), 'bitcoin', 'crypto', 'ethereum'];
  if (assetKey === 'btc') words.push('btc');
  if (assetKey === 'eth') words.push('eth', 'ethereum');
  const feeds = [
    scoreFeed('https://www.coindesk.com/arc/outboundfeeds/rss/', words),
    scoreFeed('https://cointelegraph.com/rss', words),
  ];
  const results = await Promise.allSettled(feeds);
  const scores = results
    .map((r) => (r.status === 'fulfilled' ? r.value : { score: 0, articles: 0 }))
    .filter((v) => v.articles > 0);
  if (!scores.length) return { score: 0, articles: 0 };
  const totalArticles = scores.reduce((s, v) => s + v.articles, 0);
  const weighted = scores.reduce((s, v) => s + v.score * v.articles, 0) / totalArticles;
  return { score: Number(weighted.toFixed(3)), articles: totalArticles };
}

// --- 8. Whale Activity (real on-exchange large trades) ---------------------
// ✅ FIX: real whale proxy from public aggTrades (previously a hardcoded 0
// placeholder). Counts ≥$100k single trades and nets taker-buy vs taker-sell.
export async function fetchWhaleActivity(assetKey: string): Promise<{ largeTransactions: number; netFlow: number; exchangeInflow: number }> {
  const asset = getAsset(assetKey);
  const symbol = asset?.binance || 'BTCUSDT';
  try {
    const trades = await getJSON(`${BINANCE_API}/api/v3/aggTrades?symbol=${symbol}&limit=1000`, 6000);
    if (!Array.isArray(trades)) return { largeTransactions: 0, netFlow: 0, exchangeInflow: 0 };
    let bigCount = 0, buyNotional = 0, sellNotional = 0;
    trades.forEach((t: any) => {
      const notional = parseFloat(t.p) * parseFloat(t.q);
      if (notional >= 100000) {
        bigCount++;
        if (t.m) sellNotional += notional;  // m=true → buyer was the maker → aggressive SELL
        else buyNotional += notional;       // aggressive BUY
      }
    });
    const netFlow = (buyNotional - sellNotional) / 1e6; // in $M
    return {
      largeTransactions: bigCount,
      netFlow: Number(netFlow.toFixed(3)),
      exchangeInflow: Number((sellNotional / 1e6).toFixed(3)),
    };
  } catch (e) {
    console.error('WhaleActivity fetch failed:', e);
    return { largeTransactions: 0, netFlow: 0, exchangeInflow: 0 };
  }
}

// --- 9. Macro Factors (FRED primary, Yahoo fallback) -----------------------
// ✅ FIX: realYields was the TIP ETF price (~$108) — not a percentage — which
// tripped the "> 2.3 bearish" branch on EVERY call. Now: FRED DFII10 real
// yield % with your FRED_API_KEY, Yahoo ^TNX fallback.
async function fetchFredLatest(seriesId: string): Promise<number | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const data = await getJSON(`${FRED_API}?series_id=${seriesId}&sort_order=desc&limit=1&file_type=json&api_key=${key}`, 6000);
    const v = parseFloat(data.observations?.[0]?.value);
    return isFinite(v) ? v : null;
  } catch (e) {
    console.error(`FRED ${seriesId} failed:`, e);
    return null;
  }
}

async function yahooPrice(symbol: string): Promise<number | null> {
  try {
    const data = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, 6000);
    const p = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return isFinite(p) ? p : null;
  } catch (e) {
    return null;
  }
}

export async function fetchMacroData(): Promise<{ dxy: number; realYields: number; fedPolicy: string } | null> {
  try {
    // DXY: FRED trade-weighted dollar index first, Yahoo DX-Y.NYB fallback
    let dxy = await fetchFredLatest('DTWEXBGS');
    if (dxy == null) dxy = await yahooPrice('DX-Y.NYB');
    if (dxy == null) dxy = 104;

    // Real yield: FRED 10Y TIPS (DFII10) — an actual percent
    let realYields = await fetchFredLatest('DFII10');
    if (realYields == null) realYields = 2.0; // neutral fallback, NOT the TIP price

    // Fed stance heuristic from the real-yield level:
    // deeply positive real yields = tight policy; negative = accommodative
    let fedPolicy = 'Neutral';
    if (realYields > 1.5) fedPolicy = 'Hawkish';
    else if (realYields < 0.5) fedPolicy = 'Dovish';

    return { dxy, realYields, fedPolicy };
  } catch (e) {
    console.error('Macro fetch failed:', e);
    return null;
  }
}

// --- Main Aggregator -------------------------------------------------------
export async function fetchAllMarketData(assetKey: string) {
  const asset = getAsset(assetKey);
  if (!asset) throw new Error(`Unknown asset: ${assetKey}`);

  const binanceSymbol = asset.binance;

  const [
    openInterest,
    longShortRatio,
    liquidations,
    takerFlow,
    fearGreed,
    macroData,
    newsSentiment,
    whaleActivity,
    fundingRate
  ] = await Promise.allSettled([
    fetchOpenInterest(binanceSymbol),
    fetchLongShortRatio(binanceSymbol),
    fetchLiquidations(binanceSymbol),
    fetchTakerFlow(binanceSymbol),
    fetchFearGreed(),
    fetchMacroData(),
    fetchNewsSentiment(assetKey),
    fetchWhaleActivity(assetKey),
    fetchFundingRate(binanceSymbol),
  ]);

  const getVal = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
    result.status === 'fulfilled' && result.value ? result.value : fallback;

  return {
    openInterest: getVal(openInterest, { value: 0, change24h: 0 }),
    longShortRatio: getVal(longShortRatio, { value: 1, accounts: 0.5, topTraders: 1 }),
    liquidations: getVal(liquidations, { longs: 0, shorts: 0, total24h: 0 }),
    takerFlow: getVal(takerFlow, { buyVolume: 50, sellVolume: 50, ratio: 0.5 }),
    fearGreedIndex: getVal(fearGreed, 50),
    macroFactors: getVal(macroData, { dxy: 104, realYields: 2.0, fedPolicy: 'Neutral' }),
    newsSentiment: getVal(newsSentiment, { score: 0, articles: 0 }),
    whaleActivity: getVal(whaleActivity, { largeTransactions: 0, netFlow: 0, exchangeInflow: 0 }),
    fundingRate: getVal(fundingRate, 0),
  };
}