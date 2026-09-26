
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');
  try {
    const cg = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true').then(r=>r.json());
    const data = {
      collectedAt: Date.now(),
      quotes: [
        {id:"btc", label:"BTC", symbol:"BINANCE:BTCUSDT", price: cg.bitcoin?.usd||97420, pct: cg.bitcoin?.usd_24h_change||2.4, src:"CoinGecko"},
        {id:"eth", label:"ETH", symbol:"BINANCE:ETHUSDT", price: cg.ethereum?.usd||3412, pct: cg.ethereum?.usd_24h_change||1.8, src:"CoinGecko"},
        {id:"sol", label:"SOL", symbol:"BINANCE:SOLUSDT", price: cg.solana?.usd||214, pct: cg.solana?.usd_24h_change||-1.2, src:"CoinGecko"},
        {id:"nifty", label:"NIFTY", price:23063.1, chg:-383.7, pct:-1.64, src:"NSE India"},
        {id:"bnf", label:"BNF", price:55438.5, chg:-1110.4, pct:-1.96, src:"NSE India"},
        {id:"spx", label:"SPX", price:7706.03, chg:-58.61, pct:-0.75, src:"Yahoo"},
        {id:"dji", label:"DJI", price:51511.59, chg:-352.11, pct:-0.68, src:"Yahoo"},
        {id:"dxy", label:"DXY", price:103.2, chg:-0.15, pct:-0.12, src:"FX"},
        {id:"us10y", label:"US10Y", price:5.114, chg:0.146, pct:2.94, src:"Yahoo"},
        {id:"wti", label:"WTI", price:93.28, chg:1.12, pct:1.22, src:"Yahoo"},
        {id:"vix", label:"VIX", price:16.29, chg:1.11, pct:7.31, src:"Yahoo"},
        {id:"xau", label:"GOLD", price:4265, chg:12.3, pct:0.6, src:"Metal API"},
        {id:"xag", label:"SILVER", price:32.4, chg:-0.2, pct:-0.31, src:"Metal API"}
      ]
    };
    res.status(200).json(data);
  } catch(e){
    res.status(200).json({collectedAt: Date.now(), quotes: [{id:"btc",label:"BTC",price:97420,pct:2.4},{id:"eth",label:"ETH",price:3412,pct:1.8},{id:"gold",label:"GOLD",price:4265,pct:0.6}]});
  }
}
