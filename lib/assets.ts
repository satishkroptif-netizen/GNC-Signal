/**
 * Single Source of Truth for Asset Metadata
 * Used by: verdict API, live quotes API, frontend pages
 */

export interface AssetMeta {
  key: string;
  name: string;
  // Binance symbol for price data
  binance: string;
  // TradingView symbol for charts
  tv: string;
  // CoinGecko ID for fallback
  coingecko: string;
  // Display label
  label: string;
  // Whether it's crypto vs commodity
  type: 'crypto' | 'commodity';
  // Decimals for price display
  decimals: number;
  // Sort order
  order: number;
}

export const ASSETS: Record<string, AssetMeta> = {
  btc: {
    key: 'btc',
    name: 'Bitcoin',
    binance: 'BTCUSDT',
    tv: 'BINANCE:BTCUSDT',
    coingecko: 'bitcoin',
    label: 'BTC',
    type: 'crypto',
    decimals: 2,
    order: 1,
  },
  eth: {
    key: 'eth',
    name: 'Ethereum',
    binance: 'ETHUSDT',
    tv: 'BINANCE:ETHUSDT',
    coingecko: 'ethereum',
    label: 'ETH',
    type: 'crypto',
    decimals: 2,
    order: 2,
  },
  sol: {
    key: 'sol',
    name: 'Solana',
    binance: 'SOLUSDT',
    tv: 'BINANCE:SOLUSDT',
    coingecko: 'solana',
    label: 'SOL',
    type: 'crypto',
    decimals: 2,
    order: 3,
  },
  xrp: {
    key: 'xrp',
    name: 'XRP',
    binance: 'XRPUSDT',
    tv: 'BINANCE:XRPUSDT',
    coingecko: 'ripple',
    label: 'XRP',
    type: 'crypto',
    decimals: 4,
    order: 4,
  },
  bnb: {
    key: 'bnb',
    name: 'BNB',
    binance: 'BNBUSDT',
    tv: 'BINANCE:BNBUSDT',
    coingecko: 'binancecoin',
    label: 'BNB',
    type: 'crypto',
    decimals: 2,
    order: 5,
  },
  gold: {
    key: 'gold',
    name: 'Gold',
    binance: 'PAXGUSDT',  // PAXG tracks gold on Binance
    tv: 'OANDA:XAUUSD',   // TV chart uses OANDA spot gold
    coingecko: 'pax-gold',
    label: 'Gold',
    type: 'commodity',
    decimals: 2,
    order: 6,
  },
  silver: {
    key: 'silver',
    name: 'Silver',
    binance: 'XAGUSDT',   // Some brokers have XAGUSDT
    tv: 'OANDA:XAGUSD',   // TV chart uses OANDA spot silver
    coingecko: 'silver',  // Note: silver not on CG, use tether as fallback
    label: 'Silver',
    type: 'commodity',
    decimals: 3,
    order: 7,
  },
};

// Derived arrays for easy iteration
export const ASSET_KEYS = Object.keys(ASSETS).sort((a, b) => ASSETS[a].order - ASSETS[b].order);
export const CRYPTO_ASSETS = ASSET_KEYS.filter(k => ASSETS[k].type === 'crypto');
export const COMMODITY_ASSETS = ASSET_KEYS.filter(k => ASSETS[k].type === 'commodity');

// Helper functions
export function getAsset(key: string): AssetMeta | undefined {
  const normalized = key.toLowerCase().replace('xau', 'gold').replace('xag', 'silver');
  return ASSETS[normalized];
}

export function getAssetByBinance(binance: string): AssetMeta | undefined {
  return Object.values(ASSETS).find(a => a.binance === binance);
}

export function getAssetByTV(tv: string): AssetMeta | undefined {
  return Object.values(ASSETS).find(a => a.tv === tv);
}

export function formatPrice(assetKey: string, price: number): string {
  const asset = getAsset(assetKey);
  if (!asset) return price.toLocaleString();
  return price.toLocaleString(undefined, { 
    minimumFractionDigits: asset.decimals, 
    maximumFractionDigits: asset.decimals 
  });
}

export function getAllAssetsForUI(): Array<{ key: string; label: string; tv: string }> {
  return ASSET_KEYS.map(key => {
    const a = ASSETS[key];
    return { key, label: a.label, tv: a.tv };
  });
}