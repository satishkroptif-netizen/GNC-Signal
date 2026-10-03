// verdict-ui.js — UI interactions and auth handling
// Depends on verdict-core.js

import { loadAsset, setCurrentTF, getCurrentAsset, getCurrentTF } from './verdict-core.js';

// ─── Auth Gate ────────────────────────────────────────────────
async function checkAuth() {
  try {
    const r = await fetch('/api/auth/me');
    const data = await r.json();
    
    if (!data.freeViewAvailable && !data.authenticated) {
      document.getElementById('paywall').style.display = 'flex';
      return false;
    }
    
    // Update free view cookie if available
    if (data.freeViewAvailable) {
      document.cookie = 'gnc_free_view=true; Max-Age=31536000; Path=/; SameSite=Lax';
    }
    
    return true;
  } catch (e) {
    console.error('Auth check failed:', e);
    return true; // Fail open for now
  }
}

// Wrap loadAsset to check auth
const originalLoadAsset = loadAsset;
window.loadAsset = async function(asset) {
  if (!await checkAuth()) return;
  return originalLoadAsset(asset);
};

// ─── UI Initialization ────────────────────────────────────────
async function initUI() {
  // Auth check first
  const canView = await checkAuth();
  if (!canView) return;
  
  // Build asset buttons
  const assetBar = document.getElementById('assetBar');
  const assets = [
    { key: 'btc', label: 'BTC' },
    { key: 'eth', label: 'ETH' },
    { key: 'sol', label: 'SOL' },
    { key: 'xrp', label: 'XRP' },
    { key: 'bnb', label: 'BNB' },
    { key: 'gold', label: 'Gold' },
    { key: 'silver', label: 'Silver' },
  ];
  
  assetBar.innerHTML = assets.map(a => 
    `<button class="asset-btn ${a.key === getCurrentAsset() ? 'active' : ''}" data-asset="${a.key}">${a.label}<br><small style="font-size:.65rem"><span class="dot"></span>LIVE</small></button>`
  ).join('');
  
  // Build timeframe buttons
  const tfBar = document.getElementById('tfBar');
  const tfs = ['15m', '30m', '1h', '4h', '1d', 'all'];
  tfBar.innerHTML = tfs.map(tf => 
    `<button class="tf-btn ${tf === getCurrentTF() ? 'active' : ''}" data-tf="${tf}">${tf.toUpperCase() === 'ALL' ? 'All TFs' : tf.toUpperCase()}</button>`
  ).join('');
  
  // Event listeners
  assetBar.addEventListener('click', e => {
    const btn = e.target.closest('.asset-btn');
    if (!btn) return;
    loadAsset(btn.dataset.asset);
  });
  
  tfBar.addEventListener('click', e => {
    const btn = e.target.closest('.tf-btn');
    if (!btn) return;
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCurrentTF(btn.dataset.tf);
    // Recreate currentVerdictCard if it was replaced in all mode
    if (!document.getElementById('currentVerdictCard')) {
      document.querySelector('.main-grid').innerHTML = 
        `<div class="chart-box" id="tv_verdict"></div><div class="verdict-card" id="currentVerdictCard"></div>`;
    }
    loadAsset(getCurrentAsset());
  });
  
  // Auth modal
  window.showAuthModal = () => {
    document.getElementById('authModal').style.display = 'flex';
  };
  
  window.hideAuthModal = () => {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('signupStep').style.display = 'block';
    document.getElementById('otpStep').style.display = 'none';
  };
  
  // Signup form
  document.getElementById('signupForm').addEventListener('submit', async (e) => {
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
    
    const btn = e.target.querySelector('button');
    btn.textContent = 'Sending OTP...';
    btn.disabled = true;
    
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, phone, purpose: 'signup' }),
      });
      const data = await res.json();
      
      if (data.success) {
        document.getElementById('signupStep').style.display = 'none';
        document.getElementById('otpStep').style.display = 'block';
      } else {
        alert(data.error || 'Failed to send OTP');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
    
    btn.textContent = 'Send Verification Code';
    btn.disabled = false;
  });
  
  // OTP form
  document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const code = document.getElementById('otpCode').value.trim();
    
    if (!code || code.length !== 6) {
      alert('Please enter a valid 6-digit OTP');
      return;
    }
    
    const btn = e.target.querySelector('button');
    btn.textContent = 'Verifying...';
    btn.disabled = true;
    
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, purpose: 'signup' }),
      });
      const data = await res.json();
      
      if (data.success) {
        alert('Welcome, ' + (data.user?.name || name) + '! You can now view all verdicts.');
        hideAuthModal();
        if (data.sessionToken) {
          localStorage.setItem('gnc_session', data.sessionToken);
        }
        loadAsset(getCurrentAsset());
      } else {
        alert(data.error || 'Invalid OTP');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
    
    btn.textContent = 'Verify & Continue';
    btn.disabled = false;
  });
  
  // Resend OTP
  document.getElementById('resendOtp').addEventListener('click', async () => {
    const email = document.getElementById('signupEmail').value.trim();
    const name = document.getElementById('signupName').value.trim();
    
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, purpose: 'signup' }),
      });
      const data = await res.json();
      if (data.success) alert('New OTP sent!');
      else alert(data.error || 'Failed to resend OTP');
    } catch (err) {
      alert('Network error. Please try again.');
    }
  });
  
  // Paywall button
  document.querySelector('#paywall button').addEventListener('click', () => {
    document.getElementById('paywall').style.display = 'none';
    showAuthModal();
  });
  
  // Initial load
  loadAsset(getCurrentAsset());
}

// Start when DOM ready
document.addEventListener('DOMContentLoaded', initUI);