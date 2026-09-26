
export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=30');
  const {symbol} = req.query;
  const sym = (symbol||'XAU').toUpperCase();
  // Try free metal price API fallback to mock
  let price = sym==='XAU'? 4265 + (Math.random()*10-5) : 32.4 + (Math.random()-0.5);
  try{
    if(sym==='XAU'){
      // Gold price via coingecko PAXG proxy
      const g = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd').then(r=>r.json());
      if(g['pax-gold']?.usd) price = g['pax-gold'].usd;
    }
  }catch(e){}
  res.status(200).json({currency:"USD", currencySymbol:"$", exchangeRate:1, name: sym==='XAU'?'Gold':'Silver', price, symbol:sym, updatedAt:new Date().toISOString(), updatedAtReadable:"a few seconds ago"});
}
