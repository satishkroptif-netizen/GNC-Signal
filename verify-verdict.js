// Full verdict-route integration test: transpile api/verdict/[asset].ts with
// correct relative imports, run it against live data, print the BTC verdict.
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/Satish Kumar/Desktop/GNC-Signal-Fix';
const ts = require(path.join(BASE, 'node_modules', 'typescript'));

// real assets module compiled from disk (no stub — this is the real deal)
const compiled = {};
require.extensions['.ts'] = function (module, filename) {
  const key = path.relative(BASE, filename).replace(/\\/g, '/');
  let source = fs.readFileSync(filename, 'utf8');
  if (compiled[key]) { source = compiled[key].source; }
  // rewrite the real imports so the relative paths work from this harness
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

// minimal Vercel req/res mocks
const res = {
  headers: {}, statusCode: 200,
  setHeader(k, v) { this.headers[k] = v; return this; },
  status(c) { this.statusCode = c; return this; },
  json(o) {
    console.log('HTTP', this.statusCode);
    if (o && o.verdicts) {
      const v = o.verdicts['1h'];
      console.log('asset:', o.asset, '| price:', o.currentPrice, '| 24h:', o.change24h + '%');
      console.log('1h verdict:', v.bias, '| confidence:', v.confidence + '%', '| signal:', v.signal);
      console.log('levels  S/R:', v.support, '/', v.resistance, ' SL:', v.stopLoss, ' T1/T2:', v.target1, '/', v.target2);
      console.log('factors:', JSON.stringify(v.factors));
      console.log('reasoning boxes:', (v.reasoningBoxes || []).map(b => b.title + ' → ' + b.sentiment).join(' | '));
    } else {
      console.log(JSON.stringify(o).slice(0, 300));
    }
    process.exit(0);
  },
};

verdict.default({ method: 'GET', query: { asset: 'btc' }, headers: { 'x-forwarded-for': '127.0.0.1' } }, res);
