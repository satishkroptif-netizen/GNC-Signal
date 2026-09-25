
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
  const assets = ['btc','eth','sol','xrp','bnb','gold','silver'];
  const results = {};
  for(const a of assets){
    try{
      const url = `${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}/api/verdict/${a}`;
      const data = await fetch(url).then(r=>r.json());
      results[a] = data;
    }catch(e){
      results[a] = {asset:a.toUpperCase(), error:'failed'};
    }
  }
  res.status(200).json({assets: results, generatedAt: new Date().toISOString()});
}
