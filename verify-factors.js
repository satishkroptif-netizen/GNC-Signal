// Verify the full verdict data pipeline against LIVE APIs (no Vercel needed).
// Registers a TS require hook, imports lib/market-data.ts, prints all 9 factors.
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/Satish Kumar/Desktop/GNC-Signal-Fix';

const ts = require(path.join(BASE, 'node_modules', 'typescript'));
if (!ts) { console.error('typescript not installed — run npm install first'); process.exit(1); }

const oldTsExtLoader = require.extensions['.ts'];
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  // strip the only import (assets) — we stub it below
  const stripped = source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, 'const { getAsset } = global.__GNC_ASSETS;');
  const js = ts.transpileModule(stripped, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(js, filename);
};

// stub the assets module (only what market-data uses)
global.__GNC_ASSETS = {
  getAsset: (k) => ({ binance: k === 'btc' ? 'BTCUSDT' : 'ETHUSDT', name: k === 'btc' ? 'Bitcoin' : 'Ethereum' }),
};

const md = require(path.join(BASE, 'lib', 'market-data.ts'));

(async () => {
  console.log('Fetching all 9 factor groups for BTC…');
  const data = await md.fetchAllMarketData('btc');
  console.log(JSON.stringify(data, null, 2));

  const ok = (name, cond) => console.log(cond ? `✅ ${name}` : `❌ ${name}`);
  console.log('\n--- checks ---');
  ok('2. OpenInterest real (change != 0)', data.openInterest.change24h !== 0 && data.openInterest.value > 0);
  ok('3. LongShortRatio real', data.longShortRatio.value !== 1);
  ok('4. Liquidations proxy present', data.liquidations.total24h > 0);
  ok('5. FearGreed in 0-100', data.fearGreedIndex >= 0 && data.fearGreedIndex <= 100);
  ok('6. TakerFlow real (not 0.5 default)', data.takerFlow.ratio !== 0.5);
  ok('7. News sentiment parsed', data.newsSentiment.articles > 0 && data.newsSentiment.score !== 0);
  ok('8. Whale activity present', data.whaleActivity.largeTransactions > 0);
  ok('9. Macro real yields sane (< 5%)', data.macroFactors.realYields < 5 && data.macroFactors.realYields > -5);
  process.exit(0);
})();
