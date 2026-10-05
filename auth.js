/* GnC Verdict — auth.js
   The missing auth module (was 404). Provides:
   - showAuthModal() / hideAuthModal()  (called by inline onclick handlers)
   - Signup → POST /api/send-otp  →  OTP → POST /api/verify-otp
   - Client session in localStorage ("gnc_user"), nav user info, logout
   - Auto-unlocks the verdict paywall after successful verification
   Depends on Vercel serverless functions: /api/send-otp and /api/verify-otp
*/
(function () {
  'use strict';

  var SESSION_KEY = 'gnc_user';

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }

  function showAuthModal() {
    var m = $('authModal');
    if (!m) return; // no modal on this page — nothing to do
    m.style.display = 'flex';
    var s1 = $('signupStep'), s2 = $('otpStep');
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    authMsg('', false);
    renderUserInfo();
  }

  function hideAuthModal() {
    var m = $('authModal');
    if (m) m.style.display = 'none';
  }

  function authMsg(text, isErr) {
    var msg = $('authMsg');
    if (!msg) return;
    if (!text) { msg.style.display = 'none'; return; }
    msg.textContent = text;
    msg.style.color = isErr ? '#ef4444' : '#22c55e';
    msg.style.display = 'block';
  }

  function renderUserInfo() {
    var info = $('userInfo'), btn = $('authBtn');
    var u = getSession();
    if (u && info && btn) {
      info.style.display = 'inline-flex';
      info.innerHTML = '<span style="color:#e8edf5">Hi, ' + escapeHtml(u.name || u.email) + '</span>' +
        ' <a href="#" id="logoutLink" style="color:#f6c445;text-decoration:underline">Logout</a>';
      btn.style.display = 'none';
      var lo = $('logoutLink');
      if (lo) lo.onclick = function (e) { e.preventDefault(); logout(); };
    } else if (btn) {
      btn.style.display = '';
      if (info) info.style.display = 'none';
    }
    // If a session exists, make sure the paywall isn't blocking
    var pw = $('paywall');
    if (pw && getSession()) pw.style.display = 'none';
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    renderUserInfo();
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    });
  }

  var cooldownTimer = null;
  function startCooldown() {
    var resend = $('resendOtp');
    if (!resend) return;
    var s = 30;
    resend.style.opacity = '0.5';
    resend.style.pointerEvents = 'none';
    resend.textContent = 'Resend in ' + s + 's';
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(function () {
      s--;
      if (s <= 0) {
        clearInterval(cooldownTimer);
        resend.style.opacity = '1';
        resend.style.pointerEvents = 'auto';
        resend.textContent = 'Resend OTP';
      } else {
        resend.textContent = 'Resend in ' + s + 's';
      }
    }, 1000);
  }

  function init() {
    renderUserInfo();

    // ── Step 1: send OTP ────────────────────────────────
    var form = $('signupForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = ($('signupName') || {}).value || '';
      var email = ($('signupEmail') || {}).value || '';
      var phone = ($('signupPhone') || {}).value || '';
      if (!name.trim() || !email.trim() || !phone.trim()) {
        authMsg('Please fill in all fields.', true);
        return;
      }
      var btn = form.querySelector('button');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending code…'; }
      postJson('/api/send-otp', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      }).then(function (res) {
        if (res.ok && res.j.success) {
          authMsg('Code sent to ' + email.trim() + ' — check your inbox (and spam folder).', false);
          var s1 = $('signupStep'), s2 = $('otpStep');
          if (s1) s1.style.display = 'none';
          if (s2) s2.style.display = 'block';
          startCooldown();
        } else {
          authMsg(res.j.error || 'Could not send the code. Please try again.', true);
        }
      }).catch(function () {
        authMsg('Network error. Check your connection and try again.', true);
      }).finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Send Verification Code'; }
      });
    });

    // ── Step 2: verify OTP ──────────────────────────────
    var otpForm = $('otpForm');
    if (otpForm) otpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = ($('signupEmail') || {}).value || '';
      var otp = (($('otpCode') || {}).value || '').trim();
      if (!/^\d{6}$/.test(otp)) { authMsg('Enter the 6-digit code from your email.', true); return; }
      var btn = otpForm.querySelector('button');
      if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
      postJson('/api/verify-otp', {
        email: email.trim().toLowerCase(),
        otp: otp,
      }).then(function (res) {
        if (res.ok && res.j.success) {
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            name: (res.j.name || '').trim() || nameFromForm(),
            email: email.trim().toLowerCase(),
            verifiedAt: Date.now(),
          }));
          authMsg('Verified! Welcome to GnC Verdict.', false);
          setTimeout(function () {
            hideAuthModal();
            renderUserInfo();
            // If the paywall had blocked a verdict, load it now
            try {
              var pw = $('paywall');
              if (pw && pw.style.display === 'flex' && typeof loadAsset === 'function') {
                var asset = (typeof currentAsset !== 'undefined') ? currentAsset : 'btc';
                loadAsset(asset);
              }
            } catch (err) { /* not on verdict page — ignore */ }
          }, 800);
        } else {
          authMsg(res.j.error || 'Invalid or expired code. Request a new one.', true);
        }
      }).catch(function () {
        authMsg('Network error. Please try again.', true);
      }).finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Verify & Continue'; }
      });
    });

    // ── Resend link → back to details step ──────────────
    var resend = $('resendOtp');
    if (resend) resend.addEventListener('click', function (e) {
      e.preventDefault();
      var s1 = $('signupStep'), s2 = $('otpStep');
      if (s1) s1.style.display = 'block';
      if (s2) s2.style.display = 'none';
    });

    // Expose for inline onclick="" handlers in the HTML
    window.showAuthModal = showAuthModal;
    window.hideAuthModal = hideAuthModal;
    window.gncLogout = logout;
  }

  function nameFromForm() {
    return (($('signupName') || {}).value || '').trim();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
