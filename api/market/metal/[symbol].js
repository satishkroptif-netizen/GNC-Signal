
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const {symbol} = req.query;
  const sym = (symbol||'BTC').toUpperCase();
  // Mock put/call from Deribit style
  res.status(200).json({symbol: sym, putCallRatio: 0.92 + (Math.random()*0.2-0.1), totalVolume: 2100000000, calls: {volume: 1100000000, oi: 850000000}, puts:{volume: 1000000000, oi: 920000000}, updatedAt: new Date().toISOString()});
}
