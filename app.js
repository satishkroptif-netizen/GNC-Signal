// Gold n Crypto Traders — app.js

// 1. Live ticker (demo data - real API connects in Phase 2)
const TICKS = [
  ["BTC", 97420, 2.4], ["ETH", 3412, 1.8], ["GOLD", 2915, 0.6],
  ["SOL", 214, -1.2], ["BNB", 692, 0.9], ["XRP", 2.41, -0.8],
  ["DOGE", 0.32, 3.1], ["SENSEX", 81455, 0.4]
];
(function(){
  const t = document.getElementById('tickerTrack');
  if(!t) return;
  const html = TICKS.map(([s,p,c]) =>
    `<span><b>${s}</b> $${p.toLocaleString('en-IN')} <b class="${c>=0?'up':'down'}">${c>=0?'▲':'▼'} ${Math.abs(c)}%</b></span>`
  ).join('');
  t.innerHTML = html + html; // loop ke liye duplicate
})();

// 2. Beginner mode toggle (macro section)
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
// Dashboard guard
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
