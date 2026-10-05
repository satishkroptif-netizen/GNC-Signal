// Gold n Crypto Traders — auth.js
// Fixes dead Sign Up button + one-free-verdict gate

(function () {
  var KEY_USER = 'gnc_user';
  var KEY_FREE = 'gnc_free_view_used';
  var REDIRECT = 'login.html';

  function isLoggedIn() { return !!localStorage.getItem(KEY_USER); }
  function freeViewUsed() { return localStorage.getItem(KEY_FREE) === '1'; }

  // Wraps any "view verdict" click: 1 free view, then force signup
  window.requireAuthForVerdict = function (href) {
    if (isLoggedIn()) { window.location.href = href || 'verdict.html'; return; }
    if (!freeViewUsed()) {
      localStorage.setItem(KEY_FREE, '1');   // this was your one free view
      window.location.href = href || 'verdict.html';
      return;
    }
    window.location.href = REDIRECT + '?next=' + encodeURIComponent(href || 'verdict.html');
  };

  // Verdict page: allow one view, then show the lock
  window.checkVerdictGate = function () {
    var lock = document.getElementById('verdictLock') || document.querySelector('[data-gate="verdict-lock"]');
    if (isLoggedIn()) { if (lock) lock.style.display = 'none'; return; }
    if (!freeViewUsed()) return;              // first visit: content visible, burn the view
    localStorage.setItem(KEY_FREE, '1');
    if (lock) lock.style.display = 'flex';
  };

  // Sign Up / Login buttons anywhere
  window.showAuthModal = function () { window.location.href = REDIRECT; };
  window.goSignup = function () { window.location.href = REDIRECT; };

  // verdict.html "Send Verification Code"
  window.sendOtp = async function () {
    var email = document.getElementById('otpEmailInput')?.value
             || document.querySelector('input[type="email"]')?.value;
    if (!email) { alert('Enter your email'); return; }
    var res = await fetch('/api/send-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    var data = await res.json().catch(() => ({}));
    if (data.success || data.ok) {
      var s1 = document.getElementById('step1');
      var s2 = document.getElementById('step2');
      if (s1) s1.style.display = 'none';
      if (s2) s2.style.display = 'block';
      alert('Code sent to ' + email);
    } else alert(data.error || 'Failed to send OTP');
  };

  // verdict.html "Verify & Continue"
  window.verifyOtp = async function () {
    var email = document.getElementById('otpEmailInput')?.value
             || document.querySelector('input[type="email"]')?.value;
    var otp = document.getElementById('otpCode')?.value
           || document.querySelector('input[maxlength="6"]')?.value;
    var name = document.getElementById('signupName')?.value || 'Member';
    var phone = document.getElementById('signupPhone')?.value || '';
    var res = await fetch('/api/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, name, phone }),
    });
    var data = await res.json().catch(() => ({}));
    if (data.success || data.ok) {
      localStorage.setItem(KEY_USER, JSON.stringify({ name, email, phone }));
      localStorage.removeItem(KEY_FREE);
      window.location.href = 'verdict.html';
    } else alert(data.error || 'Invalid OTP');
  };
})();
