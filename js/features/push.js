const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // REPLACE THESE
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

window.PUSH = {
  _initialized: false,
  _token: null,

  init() {
    if (this._initialized) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[PUSH] Not supported by this browser.');
      return;
    }
    
    // Load Firebase scripts dynamically
    if (typeof firebase === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
      s.onload = () => {
        const m = document.createElement('script');
        m.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js';
        m.onload = () => this._setupFirebase();
        document.head.appendChild(m);
      };
      document.head.appendChild(s);
    } else {
      this._setupFirebase();
    }
  },

  _setupFirebase() {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    this._messaging = firebase.messaging();
    this._initialized = true;
    
    // Handle foreground messages
    this._messaging.onMessage((payload) => {
      if (typeof toast === 'function') {
        toast(payload.notification?.title + ': ' + payload.notification?.body, 6000);
      }
    });

    this.refreshButtonUI();
  },

  async enable() {
    if (!this._initialized) {
      if (typeof toast === 'function') toast('Push notifications are not configured yet.');
      return;
    }
    if (typeof Notification === 'undefined') {
      if (typeof toast === 'function') toast('This browser does not support notifications. On iPhone, add Abhyas to your Home Screen first.', 5000);
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Replace YOUR_PUBLIC_VAPID_KEY with the key from Firebase Console > Cloud Messaging
        const token = await this._messaging.getToken({ vapidKey: 'YOUR_PUBLIC_VAPID_KEY' });
        if (token) {
          this._token = token;
          await this._saveToken(token);
          if (typeof toast === 'function') toast('✅ Notifications enabled');
          this.refreshButtonUI();
        }
      } else {
        if (typeof toast === 'function') toast('Notifications blocked by browser.', 4000);
      }
    } catch (e) {
      console.error('[PUSH] Enable failed', e);
      if (typeof toast === 'function') toast('Could not enable notifications.', 4000);
    }
  },

  async disable() {
    if (!this._initialized) return;
    try {
      await this._messaging.deleteToken();
      this._token = null;
      if (typeof toast === 'function') toast('Notifications disabled.');
      this.refreshButtonUI();
    } catch (e) {}
  },

  async _saveToken(token) {
    if (typeof netFetch === 'undefined' || !S.user) return;
    const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || APPS;
    try {
      await netFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'savepushtoken', username: S.user.username, token: S.user.token, fcmToken: token })
      });
    } catch(e) {}
  },

  async silentRefresh() {
    if (!this._initialized) return;
    try {
      // Need VAPID key here too
      const token = await this._messaging.getToken({ vapidKey: 'YOUR_PUBLIC_VAPID_KEY' });
      if (token && token !== this._token) {
        this._token = token;
        await this._saveToken(token);
      }
    } catch(e) {}
  },

  refreshButtonUI() {
    const btn = document.getElementById('push-enable-btn');
    if (!btn) return;
    const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted'; // iOS Safari (non-PWA) has no Notification API
    if (granted && this._token) {
      btn.innerHTML = '<i class="ph ph-bell-slash"></i> Turn off notifications';
      btn.onclick = () => this.disable();
    } else {
      btn.innerHTML = '<i class="ph ph-bell"></i> Turn on notifications';
      btn.onclick = () => this.enable();
    }
  },

  subscribe() { return this.enable(); },
  unsubscribe() { return this.disable(); }
};

// Auto-initialize on load
setTimeout(() => window.PUSH.init(), 3000);