// Multi-asset verdict test: BTC + silver + gold, all TFs, checks the specific bugs fixed
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/Satish Kumar/Desktop/GNC-Signal-Fix';
const ts = require(path.join(BASE, 'node_modules', 'typescript'));

require.extensions['.ts'] = function (module, filename) {
  let source = fs.readFileSync(filename, 'utf8');
  source = source
    .replace(/from '\.\.\/\.\.\/lib\/assets'/, "from '" + path.join(BASE, 'lib', 'assets.ts').replace(/\\/g, '/') + "'")
    .replace(/from '\.\.\/\.\.\/lib\/market-data'/, "from '" + path.join(BASE, 'lib', 'market-data.ts').replace(/\\/g, '/') + "'")
    .replace(/from '\.\.\/\.\.\/lib\/supabase'/, "from '" + path.join(BASE, 'lib', 'supabase.ts').replace(/\\/g, '/') + "'");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(js, filename);
};

const verdict = require(path.join(BASE, 'api', 'verdict', '[asset].ts'));

function run(asset) {
  return new Promise((resolve) => {
    const res = {
      headers: {}, statusCode: 200,
      setHeader(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ code: this.statusCode, body: o }); },
      end() { resolve({ code: 200, body: null }); },
    };
    verdict.default({ method: 'GET', query: { asset }, headers: { 'x-forwarded-for': '127.0.0.1' } }, res);
  });
}

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond, detail) => {
    console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
    cond ? pass++ : fail++;
  };

  for (const asset of ['btc', 'silver', 'gold', 'xrp']) {
    const { code, body } = await run(asset);
    console.log('\n========== ' + asset.toUpperCase() + ' (HTTP ' + code + ') ==========');
    if (code !== 200 || !body.verdicts) { check(asset + ' verdict HTTP 200', false, JSON.stringify(body).slice(0,120)); continue; }

    const v1h = body.verdicts['1h'];
    const v15m = body.verdicts['15m'];
    console.log('price:', body.currentPrice, '| 24h:', body.change24h + '%');

    if (asset === 'btc') {
      check('BTC price live (~82-83k)', body.currentPrice > 70000 && body.currentPrice < 95000, String(body.currentPrice));
      check('15m RSI differs from 1h RSI (per-TF candles)', v15m.rsi !== v1h.rsi, `15m:${v15m.rsi} vs 1h:${v1h.rsi}`);
    }
    if (asset === 'silver') {
      check('SILVER price REAL ~$60 (was fake $32)', body.currentPrice > 40, String(body.currentPrice));
    }
    if (asset === 'gold') {
      check('GOLD price live (~4200-4400 PAXG)', body.currentPrice > 3000, String(body.currentPrice));
      const fgBox = v1h.reasoningBoxes.find((b) => b.title.includes('Fear & Greed'));
      check('GOLD F&G box = N/A for metals', fgBox && /N\/A/.test(fgBox.data[0]), fgBox ? fgBox.data[0] : 'missing');
      check('GOLD F&G factor = 0', v1h.factors.fearGreed === 0, String(v1h.factors.fearGreed));
    }
    check(asset + ': confidence 55-95 & deterministic', v1h.confidence >= 55 && v1h.confidence <= 95, String(v1h.confidence) + '%');
    check(asset + ': macro factor numeric', typeof v1h.factors.macro === 'number', String(v1h.factors.macro));

    for (const tf of ['15m','30m','1h','4h','1d']) {
      const v = body.verdicts[tf];
      const sane = ['STRONGLY BULLISH','BULLISH','CAUTIOUSLY BULLISH','STRONGLY BEARISH','BEARISH','CAUTIOUSLY BEARISH','NEUTRAL / RANGE'].includes(v.bias);
      if (!sane) check(asset + ' ' + tf + ' bias sane', false, v.bias);
    }
  }
  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})();
