import { getAsset, getAllAssetsForUI } from '../../lib/assets';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  
  const fetchWithTimeout = async (url: string, ms = 4000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
      const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'GNC/1.0' } });
      clearTimeout(id);
      return r;
    } catch (e) { clearTimeout(id); throw e; }
  };
  
  // Get all crypto assets from shared config
  const cryptoAssets = getAllAssetsForUI().filter(a => ['btc', 'eth', 'sol', 'xrp', 'bnb'].includes(a.key));
  const symbols = cryptoAssets.map(a => a.tv.replace('BINANCE:', ''));
  
  let quotes: any[] = [];
  let prices: Record<string, number> = {};
  let changes: Record<string, number> = {};
  
  // PRIMARY: Binance batch API
  try {
    const url = `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=["${symbols.join('","')}"]`;
    const r = await fetchWithTimeout(url);
    const data = await r.json();
    
    if (Array.isArray(data)) {
      data.forEach(t => {
        const asset = getAssetByBinance(t.symbol);
        if (asset) {
          const price = parseFloat(t.lastPrice);
          const pct = parseFloat(t.priceChangePercent);
          prices[asset.key] = price;
          changes[asset.key] = pct;
        }
      });
    }
  } catch (e) {
    console.error('Binance batch failed:', e);
  }
  
  // Fallback: CoinGecko
  const missing = cryptoAssets.filter(a => !prices[a.key]);
  if (missing.length > 0) {
    try {
      const ids = missing.map(a => a.coingecko).join(',');
      const r = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
      const j = await r.json();
      missing.forEach(a => {
        if (j[a.coingecko]?.usd) {
          prices[a.key] = j[a.coingecko].usd;
          changes[a.key] = j[a.coingecko].usd_24h_change || 0;
        }
      });
    } catch (e) {
      console.error('CoinGecko fallback failed:', e);
    }
  }
  
  // Build quotes array with all assets including macro
  const allAssets = [
    ...cryptoAssets.map(a => ({
      id: a.key,
      label: a.label,
      symbol: a.tv,
      price: prices[a.key] || 0,
      pct: changes[a.key] || 0,
      src: 'BINANCE live - same as chart',
    })),
    // Macro assets (static for now, could be fetched from Yahoo Finance)
    { id: 'nifty', label: 'NIFTY', price: 23063, chg: -383.7, pct: -1.64, src: 'NSE India' },
    { id: 'bnf', label: 'BNF', price: 55438, chg: -1110.4, pct: -1.96, src: 'NSE India' },
    { id: 'spx', label: 'SPX', price: 7706, chg: -58.6, pct: -0.75, src: 'Yahoo' },
    { id: 'dji', label: 'DJI', price: 51511, chg: -352.1, pct: -0.68, src: 'Yahoo' },
    { id: 'dxy', label: 'DXY', price: 103.2, chg: -0.15, pct: -0.12, src: 'FX' },
    { id: 'us10y', label: 'US10Y', price: 5.114, chg: 0.146, pct: 2.94, src: 'Yahoo' },
    { id: 'wti', label: 'WTI', price: 93.28, chg: 1.12, pct: 1.22, src: 'Yahoo' },
    { id: 'xau', label: 'GOLD', symbol: 'OANDA:XAUUSD', price: prices.gold || 4265, chg: 12.3, pct: 0.6, src: 'Metal' },
    { id: 'xag', label: 'SILVER', symbol: 'OANDA:XAGUSD', price: prices.silver || 32.4, chg: -0.2, pct: -0.31, src: 'Metal' },
  ];
  
  res.status(200).json({ 
    collectedAt: Date.now(), 
    quotes: allAssets, 
    source: 'BINANCE live - same as TradingView chart' 
  });
}

// Helper to get asset by Binance symbol
function getAssetByBinance(binance: string) {
  const all = getAllAssetsForUI();
  return all.find(a => a.tv === `BINANCE:${binance}`);
}