// Gold n Crypto Traders — app.js

// 1. LIVE price ticker (CoinGecko free API, auto-refresh every 60s)
const COINS = [
  {id:'bitcoin', sym:'BTC'}, {id:'ethereum', sym:'ETH'},
  {id:'solana', sym:'SOL'}, {id:'binancecoin', sym:'BNB'}
];
const DEMO = [["BTC",97420,2.4],["ETH",3412,1.8],["SOL",214,-1.2],["BNB",692,0.9],["GOLD",2915,0.6]];

async function loadTicker(){
  const t = document.getElementById('tickerTrack');
  if(!t) return;
  let rows = DEMO;
  try{
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_24hr_change=true');
    const d = await r.json();
    rows = COINS.map(c => [c.sym, d[c.id].usd, d[c.id].usd_24h_change]);
    rows.push(["GOLD", await getGold(), 0.4]);
  }catch(e){ /* fallback to demo */ }
  const html = rows.map(([s,p,c]) =>
    `<span><b>${s}</b> $${Number(p).toLocaleString('en-IN',{maximumFractionDigits:2})} <b class="${c>=0?'up':'down'}">${c>=0?'▲':'▼'} ${Math.abs(c).toFixed(1)}%</b></span>`
  ).join('');
  t.innerHTML = html + html;
  const lv = document.getElementById('livePrices');
  if(lv) lv.innerHTML = rows.map(([s,p,c]) =>
    `<div class="factor"><span>${s}/USD</span><b>$${Number(p).toLocaleString('en-IN',{maximumFractionDigits:2})} <span class="${c>=0?'up':'down'}">${c>=0?'▲':'▼'}${Math.abs(c).toFixed(1)}%</span></b></div>`
  ).join('');
}
async function getGold(){
  try{
    const r = await fetch('https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv');
    const line = (await r.text()).trim().split('\n')[1];
    return parseFloat(line.split(',')[6]) || 2915;
  }catch(e){ return 2915; }
}
loadTicker();
setInterval(loadTicker, 60000);

// 2. Beginner mode toggle
(function(){
  const tg = document.getElementById('beginnerToggle');
  const tx = document.getElementById('beginnerText');
  if(tg && tx) tg.addEventListener('change', () => tx.classList.toggle('hidden', !tg.checked));
})();

// 3. Demo login/signup (localStorage) - Supabase connects in Phase 2
function handleAuth(e, mode){
  e.preventDefault();
  const name = document.getElementById('authName').value.trim();
  const phone = document.getElementById('authPhone').value.trim();
  if(!name || phone.length < 10){ alert('Please enter your name and a valid 10-digit mobile number'); return; }
  localStorage.setItem('gnc_user', JSON.stringify({name, phone, plan:'Free', joined: Date.now()}));
  window.location.href = 'dashboard.html';
}
function logout(){
  localStorage.removeItem('gnc_user');
  window.location.href = 'index.html';
}
(function(){
  if(window.location.pathname.endsWith('dashboard.html')){
    const u = localStorage.getItem('gnc_user');
    if(!u){ window.location.href = 'login.html'; return; }
    const user = JSON.parse(u);
    const el = document.getElementById('dashName');
    if(el) el.textContent = user.name;
    const pl = document.getElementById('dashPlan');
    if(pl) pl.textContent = user.plan;
  }
})();
