// Gold n Crypto Traders — app.js

// 1. Live ticker: now handled by ticker.js (real Binance prices — this demo block was fake data)

// 2. Beginner mode toggle (macro section)
(function(){
  const tg = document.getElementById('beginnerToggle');
  const tx = document.getElementById('beginnerText');
  if(tg && tx) tg.addEventListener('change', () => tx.classList.toggle('hidden', !tg.checked));
})();

// 3. Auth system (free view + email OTP) — auth.js handles the logic
function handleAuth(e, mode){
  e.preventDefault();
  // Redirect to verdict page which has the auth modal
  window.location.href = 'verdict.html';
}
function logout(){
  localStorage.removeItem('gnc_user');
  localStorage.removeItem('gnc_free_view');
  localStorage.removeItem('gnc_free_view_used');
  localStorage.removeItem('gnc_session');
  window.location.href = 'index.html';
}

function markLoggedOut() {
  localStorage.removeItem('gnc_user');
  localStorage.removeItem('gnc_session');
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
