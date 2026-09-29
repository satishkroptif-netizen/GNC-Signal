// ============================================================
// GNC Signal — Authentication & Free View System
// ============================================================

const FREE_VIEW_KEY = 'gnc_free_view';
const USER_KEY = 'gnc_user';
const OTP_KEY = 'gnc_otp';

// ─── Free View Logic ──────────────────────────────────────────

function getFreeViewUsed() {
  return localStorage.getItem(FREE_VIEW_KEY) === 'true';
}

function setFreeViewUsed() {
  localStorage.setItem(FREE_VIEW_KEY, 'true');
}

function canViewVerdict() {
  // Allow if: free view not used yet OR user is logged in
  return !getFreeViewUsed() || isLoggedIn();
}

// ─── User Session ─────────────────────────────────────────────

function isLoggedIn() {
  return localStorage.getItem(USER_KEY) !== null;
}

function getUser() {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function logout() {
  localStorage.removeItem(USER_KEY);
  window.location.href = 'index.html';
}

// ─── OTP System ───────────────────────────────────────────────

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendOTP(email, name) {
  const otp = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  localStorage.setItem(OTP_KEY, JSON.stringify({
    email,
    name,
    otp,
    expiresAt,
    verified: false
  }));

  // In production, send via email API (SendGrid, Resend, etc.)
  // For now, show OTP in console and alert (demo mode)
  console.log(`OTP for ${email}: ${otp}`);

  // Demo: Show OTP in alert (remove in production)
  alert(`Demo Mode: Your OTP is ${otp}\n(In production, this will be sent to your email)`);

  return otp;
}

function verifyOTP(code) {
  const data = localStorage.getItem(OTP_KEY);
  if (!data) return { success: false, error: 'No OTP found. Please request a new one.' };

  const otpData = JSON.parse(data);

  if (Date.now() > otpData.expiresAt) {
    localStorage.removeItem(OTP_KEY);
    return { success: false, error: 'OTP expired. Please request a new one.' };
  }

  if (otpData.otp !== code) {
    return { success: false, error: 'Invalid OTP. Please try again.' };
  }

  // OTP verified — create user account
  const user = {
    name: otpData.name,
    email: otpData.email,
    phone: otpData.phone || '',
    verified: true,
    plan: 'Free',
    joined: Date.now()
  };

  setUser(user);
  localStorage.removeItem(OTP_KEY);

  return { success: true, user };
}

// ─── View Tracking ────────────────────────────────────────────

function recordView(asset, timeframe) {
  const views = JSON.parse(localStorage.getItem('gnc_views') || '[]');
  views.push({ asset, timeframe, at: Date.now() });
  localStorage.setItem('gnc_views', JSON.stringify(views));
}

function getViewCount() {
  return JSON.parse(localStorage.getItem('gnc_views') || '[]').length;
}

// ─── Auth UI Helpers ──────────────────────────────────────────

function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'flex';
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'none';
}

function updateAuthUI() {
  const user = getUser();
  const authBtn = document.getElementById('authBtn');
  const userInfo = document.getElementById('userInfo');

  if (user) {
    if (authBtn) authBtn.style.display = 'none';
    if (userInfo) {
      userInfo.style.display = 'flex';
      userInfo.innerHTML = `
        <span style="color:var(--gold);font-weight:700">${user.name}</span>
        <button onclick="logout()" class="btn btn-ghost" style="padding:.3rem .8rem;font-size:.8rem">Logout</button>
      `;
    }
  } else {
    if (authBtn) authBtn.style.display = 'inline-block';
    if (userInfo) userInfo.style.display = 'none';
  }
}

// ─── Initialize ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();

  // Handle signup form
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('signupName').value.trim();
      const email = document.getElementById('signupEmail').value.trim();
      const phone = document.getElementById('signupPhone').value.trim();

      if (!name || !email || !phone) {
        alert('Please fill all fields');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Please enter a valid email');
        return;
      }

      if (phone.length < 10) {
        alert('Please enter a valid phone number');
        return;
      }

      // Send OTP
      sendOTP(email, name);

      // Show OTP step
      document.getElementById('signupStep').style.display = 'none';
      document.getElementById('otpStep').style.display = 'block';
    });
  }

  // Handle OTP form
  const otpForm = document.getElementById('otpForm');
  if (otpForm) {
    otpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('otpCode').value.trim();

      const result = verifyOTP(code);
      if (result.success) {
        alert('Welcome, ' + result.user.name + '! You can now view all verdicts.');
        hideAuthModal();
        updateAuthUI();
        // Reload verdict if on verdict page
        if (typeof loadAsset === 'function') {
          loadAsset(currentAsset);
        }
      } else {
        alert(result.error);
      }
    });
  }

  // Handle resend OTP
  const resendBtn = document.getElementById('resendOtp');
  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      const data = localStorage.getItem(OTP_KEY);
      if (data) {
        const otpData = JSON.parse(data);
        sendOTP(otpData.email, otpData.name);
        alert('New OTP sent!');
      }
    });
  }
});
