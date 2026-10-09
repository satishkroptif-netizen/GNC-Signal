/**
 * Real Market Data Fetchers
 * Replaces Math.random() with actual API calls
 * All functions have fallbacks and timeouts
 */

import { getAsset } from './assets';

const BINANCE_FAPI = 'https://fapi.binance.com';
const BINANCE_API = 'https://data-api.binance.vision';
const ALTERNATIVE_ME = 'https://api.alternative.me';

// Timeout helper
async function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { 
      signal: controller.signal, 
      headers: { 'User-Agent': 'GNC-Signal/1.0' } 
    });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// --- Binance Futures Data ---
export async function fetchOpenInterest(symbol: string): Promise<{ value: number; change24h: number } | null> {
  try {
    const r = await fetchWithTimeout(`${BINANCE_FAPI}/fapi/v1/openInterest?symbol=${symbol}`);
    const data = await r.json();
    const current = parseFloat(data.openInterest);
    
    // Get 24h change from stats
    const stats = await fetchWithTimeout(`${BINANCE_FAPI}/fapi/v1/openInterestHist?symbol=${symbol}&period=1d&limit=2`);
    const hist = await stats.json();
    let change24h = 0;
    if (hist.length === 2) {
      const prev = parseFloat(hist[0].sumOpenInterest);
      change24h = ((current - prev) / prev) * 100;
    }
    
    return { value: current, change24h };
  } catch (e) {
    console.error('OpenInterest fetch failed:', e);
    return null;
  }
}

export async function fetchLongShortRatio(symbol: string): Promise<{ value: number; accounts: number; topTraders: number } | null> {
  try {
    const [accountRatio, topTraderRatio] = await Promise.all([
      fetchWithTimeout(`${BINANCE_FAPI}/fapi/v1/topLongShortAccountRatio?symbol=${symbol}&period=1d&limit=1`),
      fetchWithTimeout(`${BINANCE_FAPI}/fapi/v1/topLongShortPositionRatio?symbol=${symbol}&period=1d&limit=1`),
    ]);
    
    const accData = await accountRatio.json();
    const topData = await topTraderRatio.json();
    
    return {
      value: parseFloat(accData[0]?.longShortRatio || '1'),
      accounts: parseFloat(accData[0]?.longShortRatio || '1'),
      topTraders: parseFloat(topData[0]?.longShortRatio || '1'),
    };
  } catch (e) {
    console.error('LongShortRatio fetch failed:', e);
    return null;
  }
}

export async function fetchLiquidations(symbol: string): Promise<{ longs: number; shorts: number; total24h: number } | null> {
  try {
    // Get liquidation orders from last 24h
    const r = await fetchWithTimeout(`${BINANCE_FAPI}/fapi/v1/forceOrders?symbol=${symbol}&limit=100`);
    const orders = await r.json();
    
    let longs = 0, shorts = 0;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    orders.forEach((o: any) => {
      const qty = parseFloat(o.origQty);
      const price = parseFloat(o.price);
      const value = qty * price;
      if (o.side === 'SELL') longs += value; // Long liquidations are SELL orders
      else shorts += value;
    });
    
    return { 
      longs: longs / 1e6, // Convert to millions
      shorts: shorts / 1e6,
      total24h: (longs + shorts) / 1e6
    };
  } catch (e) {
    console.error('Liquidations fetch failed:', e);
    return null;
  }
}

export async function fetchTakerFlow(symbol: string): Promise<{ buyVolume: number; sellVolume: number; ratio: number } | null> {
  try {
    // Taker buy/sell volume ratio
    const r = await fetchWithTimeout(`${BINANCE_FAPI}/fapi/v1/takerlongshortRatio?symbol=${symbol}&period=1h&limit=1`);
    const data = await r.json();
    const ratio = parseFloat(data[0]?.buySellRatio || '1');
    
    // Approximate volumes from ratio
    const totalVol = 100; // normalized
    const buyVolume = (ratio / (1 + ratio)) * totalVol * 100;
    const sellVolume = totalVol * 100 - buyVolume;
    
    return { buyVolume, sellVolume, ratio };
  } catch (e) {
    console.error('TakerFlow fetch failed:', e);
    return null;
  }
}

export async function fetchFundingRate(symbol: string): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(`${BINANCE_FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`);
    const data = await r.json();
    return parseFloat(data.lastFundingRate || '0') * 100; // Convert to %
  } catch (e) {
    return null;
  }
}

// --- Fear & Greed Index ---
export async function fetchFearGreed(): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(`${ALTERNATIVE_ME}/fng/?limit=1`);
    const data = await r.json();
    return parseInt(data.data?.[0]?.value || '50');
  } catch (e) {
    console.error('FearGreed fetch failed:', e);
    return null;
  }
}

// --- Macro Data (DXY, Yields, Fed) ---
// Using free Yahoo Finance / FRED alternatives
export async function fetchMacroData(): Promise<{ dxy: number; realYields: number; fedPolicy: string } | null> {
  try {
    // DXY from Yahoo Finance
    const dxyRes = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB');
    const dxyData = await dxyRes.json();
    const dxy = dxyData.chart?.result?.[0]?.meta?.regularMarketPrice || 104;
    
    // US 10Y real yield approximation
    const yieldRes = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/TIP');
    const yieldData = await yieldRes.json();
    const realYields = yieldData.chart?.result?.[0]?.meta?.regularMarketPrice || 2.1;
    
    // Fed policy - heuristic based on recent rate decisions
    // In production, use FRED API or CME FedWatch
    const fedPolicy = 'Neutral'; // Would need CME FedWatch API
    
    return { dxy, realYields, fedPolicy };
  } catch (e) {
    console.error('Macro fetch failed:', e);
    return null;
  }
}

// --- News Sentiment ---
// Placeholder - in production use NewsAPI, CryptoPanic, etc.
export async function fetchNewsSentiment(assetKey: string): Promise<{ score: number; articles: number }> {
  // For now, return neutral with article count
  // Real implementation would analyze recent news headlines
  return { 
    score: 0, 
    articles: 0 
  };
}

// --- Whale Activity ---
// Placeholder - in production use Glassnode, WhaleAlert, or on-chain analysis
export async function fetchWhaleActivity(assetKey: string): Promise<{ largeTransactions: number; netFlow: number; exchangeInflow: number }> {
  return {
    largeTransactions: 0,
    netFlow: 0,
    exchangeInflow: 0
  };
}

// --- Main Aggregator ---
export async function fetchAllMarketData(assetKey: string) {
  const asset = getAsset(assetKey);
  if (!asset) throw new Error(`Unknown asset: ${assetKey}`);
  
  const binanceSymbol = asset.binance;
  
  // Fetch all data in parallel
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
  
  // Extract values with safe defaults
  const getVal = <T>(result: PromiseSettledResult<T>, fallback: T): T => 
    result.status === 'fulfilled' && result.value ? result.value : fallback;
  
  return {
    openInterest: getVal(openInterest, { value: 0, change24h: 0 }),
    longShortRatio: getVal(longShortRatio, { value: 1, accounts: 1, topTraders: 1 }),
    liquidations: getVal(liquidations, { longs: 0, shorts: 0, total24h: 0 }),
    takerFlow: getVal(takerFlow, { buyVolume: 50, sellVolume: 50, ratio: 0.5 }),
    fearGreedIndex: getVal(fearGreed, 50),
    macroFactors: getVal(macroData, { dxy: 104, realYields: 2.1, fedPolicy: 'Neutral' }),
    newsSentiment: getVal(newsSentiment, { score: 0, articles: 0 }),
    whaleActivity: getVal(whaleActivity, { largeTransactions: 0, netFlow: 0, exchangeInflow: 0 }),
    fundingRate: getVal(fundingRate, 0),
  };
}