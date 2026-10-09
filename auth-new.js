/* GnC Verdict -- auth.js (v2, email + password)
   LOGIN  = email + password ONLY (no OTP, no email dependency).
   SIGNUP = name + email + phone + password.
   Accounts are stored hashed (SHA-256) in localStorage on this device and the
   session lives in localStorage "gnc_user" (the key the rest of the site reads).
   Works on BOTH the login page and the verdict-page modal -- it binds to:
     #loginTab, #signupTab, #loginPane, #signupPane,
     form#gncLoginForm, form#gncSignupForm, #authMsg
   Demo-grade auth (client-side): to move to a real backend later, swap
   gncSignup/gncLogin for API calls -- the markup stays the same.
*/
(function () {
  'use strict';

  var SESSION_KEY = 'gnc_user';
  var ACCOUNTS_KEY = 'gnc_accounts';
  var SALT = 'GNC_SALT_2026';

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c];
    });
  }

  function getAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveAccounts(a) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function setSession(acc) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      name: acc.name, email: acc.email, phone: acc.phone || '', verifiedAt: Date.now()
    }));
  }

  async function sha256Hex(text) {
    try {
      if (window.crypto && crypto.subtle) {
        var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (e) { /* non-secure context (plain http) */ }
    // Fallback hash for http:// contexts so the UI still works. NOT cryptographic.
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < text.length; i++) {
      h1 = ((h1 ^ text.charCodeAt(i)) * 0x01000193) >>> 0;
      h2 = ((h2 + text.charCodeAt(i) * (i + 7)) * 31) >>> 0;
    }
    return 'x' + h1.toString(16) + h2.toString(16);
  }

  // ── Core auth API (exported) ─────────────────────────────────────
  async function gncSignup(name, email, phone, password) {
    name = String(name || '').trim();
    email = String(email || '').trim().toLowerCase();
    phone = String(phone || '').trim();
    if (!name) return { success: false, error: 'Please enter your name.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'Please enter a valid email address.' };
    if (!/^\d{10}$/.test(phone)) return { success: false, error: 'Phone number must be 10 digits.' };
    if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };
    var accounts = getAccounts();
    if (accounts[email]) return { success: false, error: 'An account with this email already exists on this device. Try logging in.' };
    var passHash = await sha256Hex(SALT + '|' + email + '|' + password);
    var acc = { name: name, email: email, phone: phone, passHash: passHash, createdAt: Date.now() };
    accounts[email] = acc;
    saveAccounts(accounts);
    setSession(acc);
    return { success: true, user: { name: acc.name, email: acc.email, phone: acc.phone } };
  }

  async function gncLogin(email, password) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'Please enter a valid email address.' };
    if (!password) return { success: false, error: 'Please enter your password.' };
    var acc = getAccounts()[email];
    if (!acc) return { success: false, error: 'No account found for this email on this device. Sign up first.' };
    var passHash = await sha256Hex(SALT + '|' + email + '|' + password);
    if (passHash !== acc.passHash) return { success: false, error: 'Invalid password.' };
    setSession(acc);
    return { success: true, user: { name: acc.name, email: acc.email, phone: acc.phone } };
  }

  // ── UI helpers ───────────────────────────────────────────────────
  function authMsg(text, isErr) {
    var msg = $('authMsg');
    if (!msg) return;
    if (!text) { msg.style.display = 'none'; return; }
    msg.textContent = text;
    msg.style.color = isErr ? '#ef4444' : '#22c55e';
    msg.style.display = 'block';
  }

  function activate(tab) {
    var lt = $('loginTab'), st = $('signupTab');
    var lp = $('loginPane'), sp = $('signupPane');
    if (lt && st) {
      lt.classList.toggle('active', tab === 'login');
      st.classList.toggle('active', tab === 'signup');
    }
    if (lp) lp.style.display = tab === 'login' ? 'block' : 'none';
    if (sp) sp.style.display = tab === 'signup' ? 'block' : 'none';
    authMsg('', false);
  }
  window.showAuthTab = activate;

  function renderUserInfo() {
    var info = $('userInfo'), btn = $('authBtn'), loginBtn = $('loginBtn');
    var u = getSession();
    if (u && btn) {
      if (info) {
        info.style.display = 'inline-flex';
        info.innerHTML = '<span style="color:#e8edf5">Hi, ' + escapeHtml(u.name || u.email) + '</span>' +
          ' <a href="#" id="logoutLink" style="color:#f6c445;text-decoration:underline">Logout</a>';
        var lo = $('logoutLink');
        if (lo) lo.onclick = function (e) { e.preventDefault(); logout(); };
      }
      btn.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'none';
    } else if (btn) {
      btn.style.display = '';
      if (loginBtn) loginBtn.style.display = '';
      if (info) info.style.display = 'none';
    }
    var pw = $('paywall');
    if (pw && getSession()) pw.style.display = 'none';
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    renderUserInfo();
  }

  function afterAuthSuccess(form) {
    localStorage.removeItem('gnc_free_view');
    localStorage.removeItem('gnc_free_view_used');
    authMsg('Welcome, ' + (getSession().name || 'trader') + '!', false);
    renderUserInfo();
    var redirect = (form && form.getAttribute && form.getAttribute('data-redirect')) || '';
    setTimeout(function () {
      if (redirect) { location.href = redirect; return; }
      hideAuthModal();
      renderUserInfo();
      try {
        var pw = $('paywall');
        if (pw && pw.style.display === 'flex' && typeof loadAsset === 'function') {
          loadAsset((typeof currentAsset !== 'undefined') ? currentAsset : 'btc');
        }
      } catch (err) { /* not on verdict page */ }
    }, 600);
  }

  function init() {
    renderUserInfo();

    var lt = $('loginTab'), st = $('signupTab');
    if (lt) lt.addEventListener('click', function () { activate('login'); });
    if (st) st.addEventListener('click', function () { activate('signup'); });

    // Login: email + password only (NO OTP)
    var lf = $('gncLoginForm');
    if (lf) lf.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = lf.querySelector('button');
      if (btn) { btn.disabled = true; btn.textContent = 'Logging in...'; }
      var res = await gncLogin(($('loginEmail') || {}).value, ($('loginPassword') || {}).value);
      if (btn) { btn.disabled = false; btn.textContent = 'Log In'; }
      if (res.success) afterAuthSuccess(lf);
      else authMsg(res.error, true);
    });

    // Signup: name + email + phone + password (NO OTP)
    var sf = $('gncSignupForm');
    if (sf) sf.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = sf.querySelector('button');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating account...'; }
      var res = await gncSignup(($('signupName') || {}).value, ($('signupEmail') || {}).value,
                                ($('signupPhone') || {}).value, ($('signupPassword') || {}).value);
      if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
      if (res.success) afterAuthSuccess(sf);
      else authMsg(res.error, true);
    });

    // login.html may deep-link a tab: login.html?tab=signup
    try {
      var q = new URLSearchParams(location.search).get('tab');
      if ((q === 'signup' || q === 'login') && $('signupTab')) activate(q);
    } catch (err) { /* ignore */ }

    window.showAuthModal = function (tab) {
      var m = $('authModal');
      if (!m) return;            // no modal on this page (e.g. login.html)
      m.style.display = 'flex';
      activate(tab || 'login');
      renderUserInfo();
    };
    window.hideAuthModal = function () {
      var m = $('authModal');
      if (m) m.style.display = 'none';
    };
    window.gncLogout = logout;
    window.gncLogin = gncLogin;
    window.gncSignup = gncSignup;
    window.renderUserInfo = renderUserInfo;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
