// MindPC Renderer logic (Plain Vanilla JS)

document.addEventListener('DOMContentLoaded', () => {
  // Screens
  const authScreen = document.getElementById('authScreen');
  const statusScreen = document.getElementById('statusScreen');

  // Tabs
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authMessage = document.getElementById('authMessage');

  // Buttons
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const regSubmitBtn = document.getElementById('regSubmitBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Status elements
  const userName = document.getElementById('userName');
  const trackingStatus = document.getElementById('trackingStatus');
  const statusDot = document.getElementById('statusDot');
  const currentAppName = document.getElementById('currentAppName');

  // Sync & Queue elements
  const networkBadge = document.getElementById('networkBadge');
  const authWarning = document.getElementById('authWarning');
  const pendingCount = document.getElementById('pendingCount');
  const lastSyncTime = document.getElementById('lastSyncTime');

  function showMessage(text, isError = true) {
    authMessage.textContent = text;
    authMessage.className = `message ${isError ? 'error' : 'success'}`;
    authMessage.classList.remove('hidden');
  }

  function hideMessage() {
    authMessage.classList.add('hidden');
    authMessage.textContent = '';
  }

  function switchTab(isLogin) {
    hideMessage();
    if (isLogin) {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  }

  tabLogin.addEventListener('click', () => switchTab(true));
  tabRegister.addEventListener('click', () => switchTab(false));

  function formatSyncTime(isoString) {
    if (!isoString) return 'Never';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Never';
    }
  }

  function updateSyncUI(syncState, queueStats) {
    if (queueStats && typeof queueStats.pending === 'number') {
      pendingCount.textContent = queueStats.pending;
    }
    if (syncState) {
      if (syncState.isOnline) {
        networkBadge.textContent = 'Online';
        networkBadge.className = 'network-badge badge-online';
      } else {
        networkBadge.textContent = 'Offline';
        networkBadge.className = 'network-badge badge-offline';
      }

      if (syncState.lastSyncTime) {
        lastSyncTime.textContent = formatSyncTime(syncState.lastSyncTime);
      }

      if (syncState.authError) {
        authWarning.classList.remove('hidden');
      } else {
        authWarning.classList.add('hidden');
      }
    }
  }

  function setAuthenticatedView(user, tracking = false, currentApp = null, syncState = null, queueStats = null) {
    authScreen.classList.add('hidden');
    statusScreen.classList.remove('hidden');
    userName.textContent = user.name || user.email;
    updateTrackingUI(tracking, currentApp);
    updateSyncUI(syncState, queueStats);
  }

  function updateTrackingUI(tracking, currentApp, isIdle = false) {
    if (tracking) {
      trackingStatus.textContent = 'On';
      statusDot.className = 'status-dot dot-on';
      if (isIdle) {
        currentAppName.textContent = 'Idle (No activity)';
      } else if (currentApp && currentApp.appName) {
        currentAppName.textContent = currentApp.appName;
      } else {
        currentAppName.textContent = 'Detecting...';
      }
    } else {
      trackingStatus.textContent = 'Off';
      statusDot.className = 'status-dot dot-off';
      currentAppName.textContent = '—';
    }
  }

  function setUnauthenticatedView() {
    statusScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    switchTab(true);
    loginForm.reset();
    registerForm.reset();
    updateTrackingUI(false, null);
    authWarning.classList.add('hidden');
  }

  // Listen for live tracking updates from the main process
  if (window.mindpc && typeof window.mindpc.onAppChange === 'function') {
    window.mindpc.onAppChange((data) => {
      if (data) {
        updateTrackingUI(data.tracking, data.currentApp, data.isIdle);
        if (data.queueStats || data.syncState) {
          updateSyncUI(data.syncState, data.queueStats);
        }
      }
    });
  }

  // Listen for live sync & queue updates
  if (window.mindpc && typeof window.mindpc.onSyncUpdate === 'function') {
    window.mindpc.onSyncUpdate((data) => {
      if (data) {
        updateSyncUI(data.syncState, data.queueStats);
      }
    });
  }

  // ── Initial Status Check ───────────────────────────────────────────
  async function checkStatus() {
    try {
      const res = await window.mindpc.getStatus();
      if (res && res.loggedIn && res.user) {
        setAuthenticatedView(res.user, res.tracking, res.currentApp, res.syncState, res.queueStats);
      } else {
        setUnauthenticatedView();
      }
    } catch (err) {
      console.error('Failed to get status:', err);
      setUnauthenticatedView();
    }
  }

  // ── Login Handler ──────────────────────────────────────────────────
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Logging in...';

    try {
      const res = await window.mindpc.login(email, password);
      if (res.success && res.user) {
        setAuthenticatedView(res.user, true, null, res.syncState, res.queueStats);
      } else {
        showMessage(res.message || 'Login failed', true);
      }
    } catch (err) {
      showMessage(err.message || 'Network error', true);
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Log In';
    }
  });

  // ── Register Handler ───────────────────────────────────────────────
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    regSubmitBtn.disabled = true;
    regSubmitBtn.textContent = 'Creating account...';

    try {
      const res = await window.mindpc.register(name, email, password);
      if (res.success && res.user) {
        setAuthenticatedView(res.user, true, null, res.syncState, res.queueStats);
      } else {
        showMessage(res.message || 'Registration failed', true);
      }
    } catch (err) {
      showMessage(err.message || 'Network error', true);
    } finally {
      regSubmitBtn.disabled = false;
      regSubmitBtn.textContent = 'Create Account';
    }
  });

  // ── Logout Handler ─────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    try {
      await window.mindpc.logout();
      setUnauthenticatedView();
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  });

  // Run on startup
  checkStatus();
});
