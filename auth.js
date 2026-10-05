// Gold n Crypto Traders — auth.js

(function () {
  var KEY_USER = 'gnc_user';
  var KEY_FREE = 'gnc_free_view_used';

  function isLoggedIn() {
    return !!localStorage.getItem(KEY_USER) || !!localStorage.getItem('gnc_session');
  }

  function freeViewUsed() {
    return localStorage.getItem(KEY_FREE) === '1';
  }

  window.goSignup = function () {
    window.location.href = 'login.html';
  };

  window.showAuthModal = window.goSignup;
  window.goLogin = window.goSignup;

  window.requireAuthForVerdict = function (href) {
    if (isLoggedIn()) {
      window.location.href = href || 'verdict.html';
      return;
    }
    if (!freeViewUsed()) {
      localStorage.setItem(KEY_FREE, '1');
      window.location.href = href || 'verdict.html';
      return;
    }
    window.location.href = 'login.html';
  };

  window.checkVerdictGate = function () {
    var lock = document.getElementById('verdictLock') || document.querySelector('[data-gate="verdict-lock"]');
    if (isLoggedIn()) {
      if (lock) lock.style.display = 'none';
      return;
    }
    if (!freeViewUsed()) {
      localStorage.setItem(KEY_FREE, '1');
      return;
    }
    if (lock) lock.style.display = 'flex';
  };

  window.sendOtp = async function () {
    var emailEl = document.getElementById('otpEmailInput') || document.querySelector('input[type="email"]');
    var nameEl = document.getElementById('signupName') || document.querySelector('input[placeholder="Your Name"]') || document.querySelector('input[type="text"]');
    var phoneEl = document.getElementById('signupPhone') || document.querySelector('input[type="tel"]');

    var email = emailEl && emailEl.value ? emailEl.value.trim() : '';
    var name = nameEl && nameEl.value ? nameEl.value.trim() : '';
    var phone = phoneEl && phoneEl.value ? phoneEl.value.trim() : '';

    if (!email) { alert('Enter your email'); return; }

    var res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, phone, purpose: 'signup' }),
    });

    var data = await res.json().catch(function () { return {}; });

    if (data.success) {
      var s1 = document.getElementById('signupStep');
      var s2 = document.getElementById('otpStep');
      if (s1) s1.style.display = 'none';
      if (s2) s2.style.display = 'block';
      alert('Code sent to ' + email);
    } else {
      alert(data.error || 'Failed to send OTP');
    }
  };

  window.verifyOtp = async function () {
    var emailEl = document.getElementById('otpEmailInput') || document.querySelector('input[type="email"]') || document.getElementById('signupEmail');
    var otpEl = document.getElementById('otpCode') || document.querySelector('input[maxlength="6"]');
    var nameEl = document.getElementById('signupName');
    var phoneEl = document.getElementById('signupPhone');

    var email = emailEl && emailEl.value ? emailEl.value.trim() : '';
    var otp = otpEl && otpEl.value ? otpEl.value.trim() : '';
    var name = nameEl && nameEl.value ? nameEl.value.trim() : '';
    var phone = phoneEl && phoneEl.value ? phoneEl.value.trim() : '';

    var res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, purpose: 'signup' }),
    });

    var data = await res.json().catch(function () { return {}; });

    if (data.success) {
      localStorage.setItem('gnc_user', JSON.stringify({ name: name || 'Member', email, phone }));
      if (data.sessionToken) localStorage.setItem('gnc_session', data.sessionToken);
      localStorage.removeItem('gnc_free_view_used');
      window.location.href = 'verdict.html';
    } else {
      alert(data.error || 'Invalid OTP');
    }
  };

  window.__gncCheckGateOnLoad = function () {
    if (!isLoggedIn() && freeViewUsed()) {
      var lock = document.getElementById('verdictLock') || document.querySelector('[data-gate="verdict-lock"]');
      if (lock) lock.style.display = 'flex';
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.__gncCheckGateOnLoad();
  });
})();
