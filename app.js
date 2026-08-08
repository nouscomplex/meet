// ============================================================
// NOUS COMPLEX ORBIT — Application Logic
// ============================================================

(function() {
  "use strict";

  // ============================================================
  // 0. THEME (applied before login too)
  // ============================================================
  try {
    if (localStorage.getItem('orbit-theme') === 'dark') {
      document.body.classList.add('theme-dark');
    }
  } catch (e) { /* localStorage unavailable */ }

  // ============================================================
  // 0b. VIEWPORT HEIGHT (mobile keyboard fix)
  // ============================================================
  function setAppHeight() {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', h + 'px');
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
    window.visualViewport.addEventListener('scroll', setAppHeight);
  }

  // ============================================================
  // 1. LOAD CONFIGURATION
  // ============================================================
  const CONFIG = window.CONFIG;

  if (!CONFIG) {
    console.error('❌ Config not loaded! Please include config.js');
    alert('Configuration file not found. Please check your setup.');
    return;
  }

  console.log(`🏫 ${CONFIG.BRANDING.NAME} v${CONFIG.BRANDING.VERSION}`);
  console.log(`🔧 Environment: ${CONFIG.ENV}`);

  // ============================================================
  // 2. SUPABASE CLIENT
  // ============================================================
  const supabase = window.supabase.createClient(
    CONFIG.SUPABASE.URL,
    CONFIG.SUPABASE.ANON_KEY
  );

  const adminAuthClient = window.supabase.createClient(
    CONFIG.SUPABASE.URL,
    CONFIG.SUPABASE.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // ============================================================
  // 3. APPLICATION STATE
  // ============================================================
  const state = {
    currentUser: null,
    currentChannel: null,
    currentMembers: [],
    statuses: [],
    messages: [],
    channelPreviews: {},
    isAdmin: false,
    isTeacher: false,
    videoActive: false,
    progressInterval: null,
    messagesSubscription: null,
    replyingTo: null,
    unreadByChannel: {},
    roleCache: {},
    displayNameCache: {},
    onlineUsers: new Set(),
    currentTab: 'chats',
    screenReturn: 'chats',
    currentScreen: 'chats',
    // Cache for messages to enable instant loading
    cachedMessages: {},
    // Inactivity management
    inactivityTimer: null,
    INACTIVITY_TIMEOUT: 300000, // 5 minutes
    isChannelActive: false,
    // Tab focus management
    isTabFocused: true,
    tabChannel: null,
    isRefreshing: false,
  };

  // ============================================================
  // 4. DOM REFS
  // ============================================================
  const $ = (id) => document.getElementById(id);

  const DOM = {
    authCard: $('authCard'),
    dashboard: $('dashboard'),
    usernameInput: $('usernameInput'),
    passwordInput: $('passwordInput'),
    loginBtn: $('loginBtn'),
    authError: $('authError'),
    authErrorText: $('authErrorText'),
    authLogo: $('authLogo'),
    sidebarLogo: $('sidebarLogo'),

    // screens
    screenChats: $('screenChats'),
    screenUpdates: $('screenUpdates'),
    screenSettings: $('screenSettings'),
    screenChatDetail: $('screenChatDetail'),
    screenMembers: $('screenMembers'),
    screenProfile: $('screenProfile'),
    bottomNav: $('bottomNav'),
    navChatsBadge: $('navChatsBadge'),

    // chats
    chatSearchInput: $('chatSearchInput'),
    channelList: $('channelList'),

    // updates
    userBadge: $('userBadge'),
    statusTray: $('statusTray'),
    statusPlaceholder: $('statusPlaceholder'),
    statusAddBtn: $('statusAddBtn'),
    postStatusBtn: $('postStatusBtn'),
    postStatusFab: $('postStatusFab'),
    backFromUpdates: $('backFromUpdates'),

    // settings
    settingsAvatar: $('settingsAvatar'),
    settingsName: $('settingsName'),
    settingsEmail: $('settingsEmail'),
    settingsDisplayName: $('settingsDisplayName'),
    notifToggle: $('notifToggle'),
    darkToggle: $('darkToggle'),
    adminSettingsCard: $('adminSettingsCard'),
    createChannelBtn: $('createChannelBtn'),
    signOutBtn: $('signOutBtn'),

    // admin: create teacher/student account
    adminCreateUserCard: $('adminCreateUserCard'),
    adminUserManagementCard: $('adminUserManagementCard'),
    newUserUsername: $('newUserUsername'),
    newUserDisplayName: $('newUserDisplayName'),
    newUserRole: $('newUserRole'),
    newUserPassword: $('newUserPassword'),
    generatePasswordBtn: $('generatePasswordBtn'),
    createUserBtn: $('createUserBtn'),
    
    // admin: user management
    manageUserSearch: $('manageUserSearch'),
    loadUserBtn: $('loadUserBtn'),
    userEditForm: $('userEditForm'),
    editUsername: $('editUsername'),
    editDisplayName: $('editDisplayName'),
    editNewUsername: $('editNewUsername'),
    editPassword: $('editPassword'),
    editRole: $('editRole'),
    updateUserBtn: $('updateUserBtn'),
    deleteUserBtn: $('deleteUserBtn'),

    // chat detail
    backFromChat: $('backFromChat'),
    chatDetailTitleBtn: $('chatDetailTitleBtn'),
    chatDetailName: $('chatDetailName'),
    chatDetailSub: $('chatDetailSub'),
    joinLiveBtn: $('joinLiveBtn'),
    liveBtnText: $('liveBtnText'),
    scheduleBanner: $('scheduleBanner'),
    scheduleBannerText: $('scheduleBannerText'),
    chatContainer: $('chatContainer'),
    chatMessages: $('chatMessages'),
    fileUploadStatus: $('fileUploadStatus'),
    replyPreview: $('replyPreview'),
    replyPreviewAuthor: $('replyPreviewAuthor'),
    replyPreviewText: $('replyPreviewText'),
    replyPreviewCancel: $('replyPreviewCancel'),
    filePreview: $('filePreview'),
    filePreviewName: $('filePreviewName'),
    filePreviewRemove: $('filePreviewRemove'),
    fileInput: $('fileInput'),
    messageInput: $('messageInput'),
    sendMsgBtn: $('sendMsgBtn'),
    videoContainer: $('videoContainer'),
    videoIframe: $('videoIframe'),
    closeVideoBtn: $('closeVideoBtn'),

    // members
    backFromMembers: $('backFromMembers'),
    memberSearchInput: $('memberSearchInput'),
    adminAddMemberRow: $('adminAddMemberRow'),
    assignStudentInput: $('assignStudentInput'),
    registeredUsersList: $('registeredUsersList'),
    assignRoleSelect: $('assignRoleSelect'),
    assignStudentBtn: $('assignStudentBtn'),
    channelMembersList: $('channelMembersList'),
    alphaIndex: $('alphaIndex'),

    // profile
    backFromProfile: $('backFromProfile'),
    profileChannelName: $('profileChannelName'),
    profileChannelMeta: $('profileChannelMeta'),
    profileChannelDesc: $('profileChannelDesc'),
    profileMembersBtn: $('profileMembersBtn'),
    profileSeeAllMedia: $('profileSeeAllMedia'),
    sharedMediaGrid: $('sharedMediaGrid'),
    adminProfileSchedule: $('adminProfileSchedule'),
    scheduleTeacherInput: $('scheduleTeacherInput'),
    scheduleTimeInput: $('scheduleTimeInput'),
    scheduleDurationInput: $('scheduleDurationInput'),
    setScheduleBtn: $('setScheduleBtn'),
    
    // admin: channel description
    adminDescEdit: $('adminDescEdit'),
    channelDescInput: $('channelDescInput'),
    updateDescBtn: $('updateDescBtn'),

    // status viewer
    statusModal: $('statusModal'),
    statusSegments: $('statusSegments'),
    statusProgress: $('statusProgress'),
    closeStatusModal: $('closeStatusModal'),
    statusViewerAvatar: $('statusViewerAvatar'),
    statusModalTitle: $('statusModalTitle'),
    statusModalTime: $('statusModalTime'),
    statusModalMedia: $('statusModalMedia'),
    statusModalContent: $('statusModalContent'),
    statusPauseBtn: $('statusPauseBtn'),
  };

  // ============================================================
  // 5. LOGO HANDLING
  // ============================================================
  function setupLogos() {
    const logoPath = CONFIG.BRANDING.LOGO.PATH;
    const altText = CONFIG.BRANDING.LOGO.ALT;

    [DOM.authLogo, DOM.sidebarLogo].forEach((el) => {
      if (!el) return;
      el.src = logoPath;
      el.alt = altText;
      el.addEventListener('error', function onErr() {
        this.removeEventListener('error', onErr);
        this.style.display = 'none';
        const fallback = document.createElement('i');
        fallback.className = 'fas fa-graduation-cap';
        fallback.style.cssText = 'color:var(--accent); font-size:1.4rem; display:flex; align-items:center; justify-content:center;';
        this.parentNode.insertBefore(fallback, this);
      });
    });
  }

  // ============================================================
  // 5b. NOTIFICATION SOUND
  // ============================================================
  let audioCtx = null;

  function playNotifySound() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      [[880, 0], [1175, 0.09]].forEach(([freq, delay]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.18);
      });
    } catch (e) {
      console.warn('Notification sound unavailable:', e);
    }
  }

  // ============================================================
  // 5c. PUSH NOTIFICATIONS
  // ============================================================
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  // ============================================================
  // 5d. VAPID SUBSCRIPTION SYNC
  // ============================================================
  async function syncVapidSubscriptionOnLogin(userId) {
    try {
      // Check if service workers and push are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications not supported on this browser/device.');
        return false;
      }

      // Check if VAPID is configured
      if (!CONFIG.PUSH || !CONFIG.PUSH.VAPID_PUBLIC_KEY) {
        console.warn('No VAPID public key configured — push sync skipped.');
        return false;
      }

      // 1. Ensure the Service Worker is running and ready
      const registration = await navigator.serviceWorker.ready;

      // 2. Grab the existing subscription, or generate a fresh one via your VAPID key
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(CONFIG.PUSH.VAPID_PUBLIC_KEY)
        });
      }

      if (!subscription) {
        console.warn('Could not create push subscription');
        return false;
      }

      // 3. Upsert the complete raw subscription payload directly into your Supabase table
      const subscriptionJson = subscription.toJSON();
      const { error } = await supabase
        .from('user_device_tokens')
        .upsert({
          user_id: userId,
          subscription_data: subscriptionJson,
          endpoint: subscriptionJson.endpoint,
          p256dh: subscriptionJson.keys?.p256dh,
          auth: subscriptionJson.keys?.auth,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;
      console.log("VAPID Push Subscription safely stored in Supabase.");
      return true;

    } catch (err) {
      console.error("Failed to sync your custom Web Push configurations:", err);
      return false;
    }
  }

  async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported on this browser/device.');
      return false;
    }
    if (!CONFIG.PUSH || !CONFIG.PUSH.VAPID_PUBLIC_KEY) {
      console.warn('No VAPID public key configured — push notifications disabled.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted.');
        return false;
      }

      // Use the sync function to handle subscription
      return await syncVapidSubscriptionOnLogin(state.currentUser.username);
    } catch (e) {
      console.warn('Push subscription failed:', e);
      return false;
    }
  }

  async function unsubscribeFromPush() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Clean up from database
        if (state.currentUser) {
          await supabase
            .from('user_device_tokens')
            .delete()
            .eq('user_id', state.currentUser.username);
        }
        await subscription.unsubscribe();
      }
    } catch (e) {
      console.warn('Push unsubscribe failed:', e);
    }
  }

  async function setNotificationsEnabled(enabled) {
    if (enabled) {
      const ok = await subscribeToPush();
      DOM.notifToggle.checked = !!ok;
    } else {
      await unsubscribeFromPush();
    }
  }

  // ============================================================
  // 5e. VAPID PUSH NOTIFICATION SENDING (via Supabase Edge Function)
  // ============================================================
  async function sendVapidNotificationsToOfflineStudents(senderId, messageContent, channelId) {
    try {
      // 1. Find all students who are NOT the sender
      const { data: offlineStudents, error: queryError } = await supabase
        .from('user_device_tokens')
        .select('user_id, subscription_data, endpoint')
        .neq('user_id', senderId);

      if (queryError) {
        console.error("Failed to lookup student push destinations:", queryError.message);
        return;
      }

      if (!offlineStudents || offlineStudents.length === 0) {
        console.log('No offline students with VAPID subscriptions found');
        return;
      }

      // Get sender's display name and channel name for the notification
      const senderName = getDisplayName(senderId);
      const channelName = state.currentChannel?.name || 'Class';

      // Prepare the notification payload
      const payload = {
        title: `${senderName} in ${channelName}`,
        body: messageContent.length > 100 ? messageContent.substring(0, 100) + '…' : messageContent,
        icon: CONFIG.BRANDING.LOGO.PATH || '/favicon.ico',
        badge: '/favicon.ico',
        data: {
          url: window.location.href,
          type: 'chat_message',
          channel_id: channelId,
          sender: senderId
        }
      };

      console.log(`📨 Sending VAPID notifications to ${offlineStudents.length} offline students via Edge Function`);

      // 2. Call the Supabase Edge Function to send notifications
      const { data, error } = await supabase.functions.invoke('send-push-notifications', {
        body: {
          subscriptions: offlineStudents.map(s => s.subscription_data).filter(s => s !== null),
          payload: payload
        }
      });

      if (error) {
        console.error('Edge Function error:', error);
        return;
      }

      console.log('✅ VAPID notifications sent successfully:', data);

    } catch (error) {
      console.error('Failed to send VAPID notifications:', error);
    }
  }

  // ============================================================
  // 5f. CACHED MESSAGES - INSTANT LOAD
  // ============================================================
  function getCachedMessages(channelId) {
    try {
      const cacheKey = `cached_chat_history_${channelId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log(`📦 Loaded ${parsed.length} cached messages for channel ${channelId}`);
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load cached messages:', e);
    }
    return null;
  }

  function saveCachedMessages(channelId, messages) {
    try {
      const cacheKey = `cached_chat_history_${channelId}`;
      // Only cache the last 50 messages
      const toCache = messages.slice(-50);
      localStorage.setItem(cacheKey, JSON.stringify(toCache));
      console.log(`💾 Cached ${toCache.length} messages for channel ${channelId}`);
    } catch (e) {
      console.warn('Failed to cache messages:', e);
    }
  }

  function clearCachedMessages(channelId) {
    try {
      const cacheKey = `cached_chat_history_${channelId}`;
      localStorage.removeItem(cacheKey);
    } catch (e) {
      console.warn('Failed to clear cached messages:', e);
    }
  }

  // ============================================================
  // 5g. INACTIVITY DISCONNECTION MANAGEMENT
  // ============================================================
  function setupInactivityManager() {
    // Clear any existing timer
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }

    // Define the reset routine - runs whenever user is active
    function resetInactivityTimer() {
      // Clear the pending disconnect countdown
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
      }
      
      // If the channel was disconnected, revive the connection silently in the background
      if (state.messagesSubscription && state.messagesSubscription.state === 'closed') {
        console.log("🔄 User active! Reviving background connection silently...");
        if (state.currentChannel) {
          subscribeToMessages(state.currentChannel.id);
        }
      }

      // Start a fresh 5-minute countdown
      state.inactivityTimer = setTimeout(() => {
        if (state.messagesSubscription) {
          console.log("⏰ 5 minutes of inactivity reached. Disconnecting idle channel to save resources.");
          supabase.removeChannel(state.messagesSubscription);
          state.messagesSubscription = null;
          state.isChannelActive = false;
        }
      }, state.INACTIVITY_TIMEOUT);
    }

    // Initialize connection and start the first timer countdown
    resetInactivityTimer();

    // Attach standard browser event listeners to monitor user activity
    const activityEvents = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer);
    });

    // Store cleanup function
    state._inactivityCleanup = function() {
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
      }
      const events = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
      events.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };

    console.log('⏱️ Inactivity manager initialized (5 minute timeout)');
  }

  function cleanupInactivityManager() {
    if (state._inactivityCleanup) {
      state._inactivityCleanup();
      state._inactivityCleanup = null;
    }
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
    console.log('⏱️ Inactivity manager cleaned up');
  }

  // ============================================================
  // 5h. TAB FOCUS MANAGER
  // ============================================================
  function setupTabFocusManager() {
    // Clean up any existing tab channel
    if (state.tabChannel) {
      supabase.removeChannel(state.tabChannel);
      state.tabChannel = null;
    }

    // Create a separate channel for tab focus management
    if (state.currentChannel) {
      state.tabChannel = supabase.channel(`tab-focus-${state.currentChannel.id}`);
      state.tabChannel.subscribe();
    }

    // Handle visibility change
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // 1. Student closed or minimized the tab -> Disconnect instantly!
        console.log("🔴 Tab hidden. Dropping connection to save free tier slots.");
        state.isTabFocused = false;
        
        // Remove the main messages subscription
        if (state.messagesSubscription) {
          supabase.removeChannel(state.messagesSubscription);
          state.messagesSubscription = null;
          state.isChannelActive = false;
        }
        
        // Also remove the tab channel
        if (state.tabChannel) {
          await supabase.removeChannel(state.tabChannel);
          state.tabChannel = null;
        }
      } else {
        // 2. Student clicked back into the tab -> Reconnect silently!
        console.log("🟢 Tab focused again! Reconnecting...");
        state.isTabFocused = true;
        
        // Recreate the tab channel
        if (!state.tabChannel && state.currentChannel) {
          state.tabChannel = supabase.channel(`tab-focus-${state.currentChannel.id}`);
          state.tabChannel.subscribe();
        }
        
        // Reconnect the main messages subscription
        if (!state.messagesSubscription && state.currentChannel) {
          subscribeToMessages(state.currentChannel.id);
        }
        
        // 3. SILENT CATCH-UP: Grab messages sent while the student was away
        if (state.currentChannel && !state.isRefreshing) {
          state.isRefreshing = true;
          console.log("📥 Catching up on messages missed while tab was inactive...");
          try {
            await loadMessages(state.currentChannel.id);
            console.log("✅ Catch-up complete!");
          } catch (e) {
            console.warn('Catch-up failed:', e);
          } finally {
            state.isRefreshing = false;
          }
        }
      }
    };

    // Attach listener to the browser document
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Store cleanup function
    state._tabFocusCleanup = function() {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (state.tabChannel) {
        supabase.removeChannel(state.tabChannel);
        state.tabChannel = null;
      }
    };

    console.log('📋 Tab focus manager initialized');
  }

  function cleanupTabFocusManager() {
    if (state._tabFocusCleanup) {
      state._tabFocusCleanup();
      state._tabFocusCleanup = null;
    }
    if (state.tabChannel) {
      supabase.removeChannel(state.tabChannel);
      state.tabChannel = null;
    }
    console.log('📋 Tab focus manager cleaned up');
  }

  // ============================================================
  // 5i. HISTORY NAVIGATION (mobile back button)
  // ============================================================
  let screenHistory = [];
  let isBackNavigation = false;

  function pushScreenState(screenName) {
    if (screenHistory.length === 0 || screenHistory[screenHistory.length - 1] !== screenName) {
      screenHistory.push(screenName);
      if (history.pushState) {
        history.pushState({ orbitScreen: screenName }, '', '#' + screenName);
      }
    }
  }

  function handleBackNavigation(event) {
    const targetScreen = event.state && event.state.orbitScreen;

    if (targetScreen && SCREEN_EL[targetScreen]) {
      isBackNavigation = true;
      const idx = screenHistory.lastIndexOf(targetScreen);
      screenHistory = idx !== -1 ? screenHistory.slice(0, idx + 1) : [targetScreen];
      goToScreen(targetScreen);
      isBackNavigation = false;
      return;
    }

    if (DOM.statusModal && !DOM.statusModal.classList.contains('hidden')) {
      closeStatusViewer();
      if (state.currentScreen) pushScreenState(state.currentScreen);
      return;
    }
    if (DOM.videoContainer && !DOM.videoContainer.classList.contains('hidden')) {
      DOM.videoContainer.classList.add('hidden');
      DOM.videoIframe.src = '';
      state.videoActive = false;
      if (state.currentScreen) pushScreenState(state.currentScreen);
    }
  }

  // ============================================================
  // 6. UTILITY FUNCTIONS
  // ============================================================
  function getRoleFromUsername(username) {
    if (!username) return CONFIG.AUTH.ROLES.STUDENT;
    const key = username.toLowerCase();

    if (state.roleCache[key]) return state.roleCache[key];

    if (key.includes(CONFIG.AUTH.ROLES.ADMIN)) return CONFIG.AUTH.ROLES.ADMIN;
    if (key.includes(CONFIG.AUTH.ROLES.TEACHER)) return CONFIG.AUTH.ROLES.TEACHER;
    return CONFIG.AUTH.ROLES.STUDENT;
  }

  function getDisplayName(username) {
    if (!username) return username;
    const key = username.toLowerCase();
    return state.displayNameCache[key] || username;
  }

  async function getUserRoles(username) {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('username', username.toLowerCase());
    
    if (error || !data || data.length === 0) {
      return null;
    }
    return data.map(row => row.role);
  }

  async function loadRoleCache() {
    const { data, error } = await supabase.from('user_roles').select('username, role, display_name');
    if (error) {
      console.warn('Role cache unavailable, using username-based fallback:', error);
      return;
    }
    (data || []).forEach((row) => {
      const key = row.username.toLowerCase();
      state.roleCache[key] = row.role;
      if (row.display_name) {
        state.displayNameCache[key] = row.display_name;
      }
    });
    populateRegisteredUsersDatalist();
  }

  function populateRegisteredUsersDatalist() {
    if (!DOM.registeredUsersList) return;
    DOM.registeredUsersList.innerHTML = Object.keys(state.roleCache)
      .sort()
      .map((u) => `<option value="${escapeHtml(u)}"></option>`)
      .join('');
  }

  function roleKey(username) {
    const role = getRoleFromUsername(username);
    if (role === CONFIG.AUTH.ROLES.ADMIN) return 'admin';
    if (role === CONFIG.AUTH.ROLES.TEACHER) return 'teacher';
    return 'student';
  }

  function avatarHtml(username, size) {
    const key = roleKey(username);
    const displayName = getDisplayName(username);
    const initial = (displayName || '?').charAt(0).toUpperCase();
    const sizeClass = size === 'sm' ? ' sm' : size === 'lg' ? ' lg' : '';
    const online = state.onlineUsers.has((username || '').toLowerCase());
    return `<div class="avatar avatar-${key}${sizeClass}">${initial}<span class="avatar-dot${online ? ' online' : ''}"></span></div>`;
  }

  function channelColorKey(ch) {
    const keys = ['admin', 'teacher', 'student'];
    let hash = 0;
    for (const c of String(ch.id)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return keys[hash % keys.length];
  }

  function channelAvatarHtml(ch) {
    const key = channelColorKey(ch);
    const initial = (ch.name || '?').charAt(0).toUpperCase();
    return `<div class="avatar avatar-${key}">${initial}</div>`;
  }

  function setAvatarEl(el, username, extraClass) {
    if (!el) return;
    const key = roleKey(username);
    const displayName = getDisplayName(username);
    el.className = `avatar avatar-${key}${extraClass ? ' ' + extraClass : ''}`;
    el.textContent = (displayName || '?').charAt(0).toUpperCase();
  }

  function generateEmail(username) {
    return `${username}${CONFIG.AUTH.EMAIL_SUFFIX}`;
  }

  function normalizeUsername(raw) {
    return (raw || '').trim().toLowerCase();
  }

  function generatePassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatFullDate(ts) {
    return new Date(ts).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function formatTimeAgo(ts) {
    if (!ts) return '';
    const diffMs = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function truncate(str, n = 20) {
    if (!str) return '';
    return str.length > n ? str.substr(0, n) + '…' : str;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function isImageFile(url) {
    return !!url && /\.(png|jpe?g|gif|webp|svg)$/i.test(url.split('?')[0]);
  }

  function isVideoFile(url) {
    return !!url && /\.(mp4|webm|mov|m4v|ogv)$/i.test(url.split('?')[0]);
  }

  function showError(message) {
    DOM.authErrorText.textContent = message;
    DOM.authError.classList.remove('hidden');
  }

  function hideError() {
    DOM.authError.classList.add('hidden');
  }

  function generateStoragePath(channelId, filename) {
    const timestamp = Date.now();
    return CONFIG.UPLOAD.STORAGE_PATH
      .replace('{channelId}', channelId)
      .replace('{timestamp}', timestamp)
      .replace('{filename}', filename);
  }

  // ============================================================
  // 6b. SCREEN NAVIGATION - FIXED FOR DESKTOP
  // ============================================================
  const ROOT_TABS = ['chats', 'updates', 'settings'];
  const SCREEN_EL = {
    chats: DOM.screenChats,
    updates: DOM.screenUpdates,
    settings: DOM.screenSettings,
    chatDetail: DOM.screenChatDetail,
    members: DOM.screenMembers,
    profile: DOM.screenProfile,
  };

  const CHAT_GROUP_SCREENS = ['chats', 'chatDetail', 'members', 'profile'];
  const isDesktopLayout = () => window.matchMedia('(min-width: 1024px)').matches;

  function updateChatEmptyState() {
    if (!DOM.screenChatDetail) return;
    DOM.screenChatDetail.classList.toggle('no-chat', !state.currentChannel);
  }

  function goToScreen(name) {
    updateChatEmptyState();
    const isDesktop = isDesktopLayout();
    
    // On desktop, we want chats to always be visible when in chat-related screens
    const keepChatsVisible = isDesktop && CHAT_GROUP_SCREENS.includes(name);

    // Handle all screens
    Object.entries(SCREEN_EL).forEach(([key, el]) => {
      if (!el) return;
      
      // Determine if this screen should be visible
      let shouldBeVisible = false;
      
      if (key === name) {
        shouldBeVisible = true;
      } else if (isDesktop && key === 'chats' && CHAT_GROUP_SCREENS.includes(name)) {
        // On desktop, always show chats when in a chat group
        shouldBeVisible = true;
      } else if (isDesktop && keepChatsVisible && key === 'chats') {
        shouldBeVisible = true;
      } else if (isDesktop && key === 'chatDetail' && name === 'chats') {
        // WhatsApp-Web style: the right pane always shows something —
        // either the open conversation or the "select a chat" welcome
        // screen — instead of going blank on the chats tab.
        shouldBeVisible = true;
      }
      
      // Apply visibility
      if (shouldBeVisible) {
        el.classList.remove('hidden');
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    });
    
    // Navigation visibility
    const isRoot = ROOT_TABS.includes(name);
    const hideNav = !isRoot && !isDesktop;
    DOM.bottomNav.classList.toggle('hidden', hideNav);
    
    if (isDesktop) {
      DOM.bottomNav.classList.remove('hidden');
      DOM.bottomNav.style.display = 'flex';
    }
    
    if (isRoot) {
      state.currentTab = name;
      DOM.bottomNav.querySelectorAll('.nav-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === name);
      });
    }
    
    state.currentScreen = name;
    
    if (!isBackNavigation) {
      pushScreenState(name);
    }
  }

  let lastIsDesktop = isDesktopLayout();
  window.addEventListener('resize', () => {
    const nowDesktop = isDesktopLayout();
    if (nowDesktop !== lastIsDesktop) {
      lastIsDesktop = nowDesktop;
      if (state.currentScreen) goToScreen(state.currentScreen);
    }
  });

  // ============================================================
  // 7. AUTHENTICATION
  // ============================================================
  async function loginWithUsername(username, password) {
    const email = generateEmail(username);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.user;
    } catch (e) {
      console.error('Auth error:', e);
      if (/email not confirmed/i.test(e.message || '')) {
        throw new Error('This account is waiting on an email confirmation that can\'t reach this address. Ask your admin to turn off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email.');
      }
      throw new Error('Incorrect School ID or password.');
    }
  }

  // ============================================================
  // 7a. ADMIN: CREATE TEACHER / STUDENT ACCOUNT
  // ============================================================
  async function createUserAccount(username, displayName, role, password) {
    username = normalizeUsername(username);
    if (!username) { alert('Enter a username.'); return; }
    if (!password) { alert('Enter or generate a password.'); return; }

    const email = generateEmail(username);

    try {
      const { data: signUpData, error: signUpError } = await adminAuthClient.auth.signUp({ email, password });
      await adminAuthClient.auth.signOut();

      const isAlreadyRegistered =
        signUpError && /already registered|already exists/i.test(signUpError.message || '');

      if (signUpError && !isAlreadyRegistered) throw signUpError;

      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ 
          username, 
          role, 
          display_name: displayName || username 
        }, { onConflict: 'username' });
      if (roleError) throw roleError;

      const key = username.toLowerCase();
      state.roleCache[key] = role;
      state.displayNameCache[key] = displayName || username;
      populateRegisteredUsersDatalist();
      DOM.newUserUsername.value = '';
      DOM.newUserDisplayName.value = '';
      DOM.newUserPassword.value = '';
      DOM.newUserRole.value = 'student';

      if (isAlreadyRegistered) {
        alert(
          `"${username}" already had an account (e.g. from before self-signup was disabled).\n\n` +
          `Role set to ${role}, but the password shown here was NOT applied — a browser-side ` +
          `signup can't change another account's password. Reset it from the Supabase ` +
          `dashboard (Authentication → Users) or have them use their existing password.`
        );
      } else if (signUpData && !signUpData.session) {
        alert(
          `Account created for "${username}" (${role}), but it likely can't log in yet: this ` +
          `Supabase project requires email confirmation, and confirmation emails can't reach a ` +
          `fake address like ${email}.\n\n` +
          `Turn off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email, ` +
          `then this account (and any others stuck the same way) will be able to log in.`
        );
      } else {
        alert(`Account created for "${username}" (${role}).\n\nPassword: ${password}\n\nShare this with them securely — it won't be shown again.`);
      }
    } catch (e) {
      console.error('Create user error:', e);
      alert('Could not create account: ' + (e.message || e));
    }
  }

  // ============================================================
  // 7b. PRESENCE (who's online)
  // ============================================================
  let presenceChannel = null;

  function setupPresence() {
    if (!state.currentUser) return;
    presenceChannel = supabase.channel('presence:orbit', {
      config: { presence: { key: state.currentUser.username.toLowerCase() } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const s = presenceChannel.presenceState();
        state.onlineUsers = new Set(Object.keys(s));
        renderMembers();
        updateChatDetailSubtitle();
        updateProfileMeta();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ username: state.currentUser.username, online_at: new Date().toISOString() });
        }
      });
  }

  function teardownPresence() {
    if (presenceChannel) {
      supabase.removeChannel(presenceChannel);
      presenceChannel = null;
    }
    state.onlineUsers = new Set();
  }

  // ============================================================
  // 8. CHANNELS (CRUD)
  // ============================================================
  async function loadChannels() {
    if (!state.currentUser) return [];

    if (state.isAdmin) {
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.CHANNELS)
        .select('*')
        .order('name');

      if (error) {
        console.warn('Channels fallback:', error);
        return [
          { id: '1', name: 'Math 101' },
          { id: '2', name: 'Science' },
          { id: '3', name: 'History' }
        ];
      }
      return data || [];
    }

    const { data: memberships, error: memberError } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MEMBERS)
      .select('channel_id')
      .eq('username', state.currentUser.username);

    if (memberError) {
      console.warn('Membership lookup failed:', memberError);
      return [];
    }

    const channelIds = (memberships || []).map((m) => m.channel_id);
    if (!channelIds.length) return [];

    const { data: channels, error: channelError } = await supabase
      .from(CONFIG.SUPABASE.TABLES.CHANNELS)
      .select('*')
      .in('id', channelIds)
      .order('name');

    if (channelError) {
      console.warn('Channels fallback:', channelError);
      return [];
    }
    return channels || [];
  }

  async function loadChannelPreviews(channelIds) {
    if (!channelIds.length) return {};
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .select('channel_id, content, username, created_at, file_url')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      console.warn('Preview lookup failed:', error);
      return {};
    }
    const map = {};
    (data || []).forEach((m) => {
      if (!map[m.channel_id]) map[m.channel_id] = m;
    });
    return map;
  }

  let allChannels = [];

  async function renderChannels() {
    const channels = await loadChannels();
    allChannels = channels;
    state.channelPreviews = await loadChannelPreviews(channels.map((c) => c.id));
    renderChatList(channels);

    if (!state.currentChannel && channels.length) {
      selectChannel(channels[0]);
    }
  }

  function renderChatList(channels) {
    DOM.channelList.innerHTML = '';

    if (!channels || channels.length === 0) {
      DOM.channelList.innerHTML = state.isAdmin
        ? '<div class="empty-note">No channels yet — tap + to create one</div>'
        : '<div class="empty-note">You haven\'t been added to a group yet — ask your admin.</div>';
      return;
    }

    channels.forEach((ch) => {
      const preview = state.channelPreviews[ch.id];
      const unread = state.unreadByChannel[ch.id] || 0;
      const previewText = preview
        ? (preview.content ? escapeHtml(truncate(preview.content, 42)) : (preview.file_url ? '📎 Attachment' : ''))
        : 'No messages yet';
      const previewAuthor = preview && preview.username ? `${escapeHtml(getDisplayName(preview.username))}: ` : '';
      const time = preview ? formatTimeAgo(preview.created_at) : '';

      const row = document.createElement('div');
      row.className = 'chat-row' + (state.currentChannel && state.currentChannel.id === ch.id ? ' active' : '');
      row.dataset.id = ch.id;
      row.dataset.name = ch.name.toLowerCase();
      row.innerHTML = `
        ${channelAvatarHtml(ch)}
        <div class="chat-row-body">
          <div class="chat-row-top">
            <span class="chat-row-name">${escapeHtml(ch.name)}</span>
            <span class="chat-row-time">${time}</span>
          </div>
          <div class="chat-row-bottom">
            <span class="chat-row-preview">${previewAuthor}${previewText}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>
        </div>
        ${state.isAdmin ? `
          <span class="chat-admin-actions">
            <button class="icon-btn" style="width:26px;height:26px;" title="Rename" data-action="rename" data-id="${ch.id}"><i class="fas fa-pen" style="font-size:10px;"></i></button>
            <button class="icon-btn" style="width:26px;height:26px;" title="Delete" data-action="delete-channel" data-id="${ch.id}"><i class="fas fa-trash" style="font-size:10px;color:var(--danger);"></i></button>
          </span>
        ` : ''}
      `;
      row.addEventListener('pointerup', (e) => {
        if (e.target.closest('[data-action]')) return;
        openChannel(ch);
      });
      DOM.channelList.appendChild(row);
    });

    DOM.channelList.querySelectorAll('[data-action="rename"]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); renameChannel(btn.dataset.id); });
    });
    DOM.channelList.querySelectorAll('[data-action="delete-channel"]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteChannel(btn.dataset.id); });
    });
  }

  function highlightActiveChatRow() {
    if (!DOM.channelList) return;
    DOM.channelList.querySelectorAll('.chat-row').forEach((row) => {
      row.classList.toggle('active', !!state.currentChannel && row.dataset.id === String(state.currentChannel.id));
    });
  }

  function filterChatList(query) {
    const q = query.trim().toLowerCase();
    DOM.channelList.querySelectorAll('.chat-row').forEach((row) => {
      row.classList.toggle('hidden', !!q && !row.dataset.name.includes(q));
    });
  }

  async function openChannel(channel) {
    await selectChannel(channel);
    goToScreen('chatDetail');
  }

  async function renameChannel(channelId) {
    const newName = prompt('New channel name:');
    if (!newName) return;
    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.CHANNELS)
      .update({ name: newName })
      .eq('id', channelId);
    if (error) { alert('Rename failed: ' + error.message); return; }
    if (state.currentChannel?.id === channelId) state.currentChannel.name = newName;
    await renderChannels();
  }

  async function deleteChannel(channelId) {
    if (!confirm('Delete this channel? This also removes its messages and member list. This cannot be undone.')) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.CHANNELS).delete().eq('id', channelId);
    if (error) { alert('Delete failed: ' + error.message); return; }
    if (state.currentChannel?.id === channelId) {
      state.currentChannel = null;
      if (state.messagesSubscription) {
        supabase.removeChannel(state.messagesSubscription);
        state.messagesSubscription = null;
      }
    }
    await renderChannels();
  }

  async function refreshUnreadBadges() {
    if (!state.currentUser) return;
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .select('channel_id')
      .is('seen_at', null)
      .neq('username', state.currentUser.username);

    if (error) return;

    const counts = {};
    (data || []).forEach((row) => { counts[row.channel_id] = (counts[row.channel_id] || 0) + 1; });
    state.unreadByChannel = counts;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    DOM.navChatsBadge.textContent = total > 99 ? '99+' : String(total);
    DOM.navChatsBadge.classList.toggle('hidden', total === 0);

    renderChatList(allChannels);
  }

  // ============================================================
  // 8a. CHANNEL DESCRIPTION (admin editable)
  // ============================================================
  async function loadChannelDescription(channelId) {
    if (!channelId) return;
    
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.CHANNELS)
      .select('description')
      .eq('id', channelId)
      .single();
    
    if (error || !data) {
      DOM.profileChannelDesc.textContent = `Group workspace for ${state.currentChannel?.name || 'this group'}. Share updates, chat with the group, and join live sessions together.`;
      return;
    }
    
    const desc = data.description || `Group workspace for ${state.currentChannel?.name || 'this group'}. Share updates, chat with the group, and join live sessions together.`;
    DOM.profileChannelDesc.textContent = desc;
    DOM.channelDescInput.value = desc || '';
    
    DOM.adminDescEdit.classList.toggle('hidden', !state.isAdmin);
  }

  async function updateChannelDescription(channelId, description) {
    if (!channelId) { alert('Select a channel first.'); return; }
    if (!description) { alert('Enter a description.'); return; }
    
    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.CHANNELS)
      .update({ description: description })
      .eq('id', channelId);
    
    if (error) { alert('Could not update description: ' + error.message); return; }
    
    await loadChannelDescription(channelId);
    alert('Description updated successfully!');
  }

  // ============================================================
  // 8c. DELIVERED / SEEN TRACKING
  // ============================================================
  async function markDelivered(channelId) {
    if (!state.currentUser) return;
    await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .update({ delivered_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .neq('username', state.currentUser.username)
      .is('delivered_at', null);
  }

  async function markSeen(channelId) {
    if (!state.currentUser || !document.hasFocus()) return;
    await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .update({ seen_at: new Date().toISOString(), seen_by: state.currentUser.username })
      .eq('channel_id', channelId)
      .neq('username', state.currentUser.username)
      .is('seen_at', null);
    await refreshUnreadBadges();
  }

  async function selectChannel(channel) {
    state.currentChannel = channel;
    updateChatEmptyState();
    highlightActiveChatRow();
    
    // INSTANT LOAD: Show cached messages immediately (0ms)
    const cachedMessages = getCachedMessages(channel.id);
    if (cachedMessages) {
      state.messages = cachedMessages;
      renderMessages();
      console.log(`⚡ Instant load: ${cachedMessages.length} messages from cache`);
    }
    
    // BACKGROUND FETCH: Load fresh messages from Supabase
    await loadMessages(channel.id);
    
    await loadMembers(channel.id);
    subscribeToMessages(channel.id);
    await markDelivered(channel.id);
    await markSeen(channel.id);
    await loadSchedule(channel.id);
    subscribeToSchedule(channel.id);
    updateChatDetailHeader();
    updateProfileScreen();
    
    // Setup inactivity manager for this channel
    setupInactivityManager();
    
    // Setup tab focus manager for this channel
    setupTabFocusManager();
  }

  function updateChatDetailHeader() {
    if (!state.currentChannel) return;
    DOM.chatDetailName.textContent = state.currentChannel.name;
    updateChatDetailSubtitle();
  }

  function updateChatDetailSubtitle() {
    if (!state.currentChannel) return;
    const total = state.currentMembers.length;
    const online = state.currentMembers.filter((m) => state.onlineUsers.has((m.username || '').toLowerCase())).length;
    DOM.chatDetailSub.textContent = total ? `${total} member${total === 1 ? '' : 's'} · ${online} online` : '';
  }

  // ============================================================
  // 8e. CLASS SCHEDULING
  // ============================================================
  let scheduleSubscription = null;

  async function loadSchedule(channelId) {
    const { data, error } = await supabase
      .from('class_schedule')
      .select('*')
      .eq('channel_id', channelId)
      .gte('scheduled_time', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('scheduled_time', { ascending: true })
      .limit(1);

    if (error || !data || !data.length) {
      DOM.scheduleBanner.classList.add('hidden');
      return;
    }
    renderScheduleBanner(data[0]);
  }

  function renderScheduleBanner(schedule) {
    const when = new Date(schedule.scheduled_time);
    const formatted = when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    DOM.scheduleBannerText.textContent = `Class with ${getDisplayName(schedule.teacher_username)} scheduled for ${formatted} (${schedule.duration_minutes} min)`;
    DOM.scheduleBanner.classList.remove('hidden');
  }

  function subscribeToSchedule(channelId) {
    if (scheduleSubscription) {
      supabase.removeChannel(scheduleSubscription);
      scheduleSubscription = null;
    }
    scheduleSubscription = supabase
      .channel(`schedule:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_schedule', filter: `channel_id=eq.${channelId}` }, () => loadSchedule(channelId))
      .subscribe();
  }

  async function setClassSchedule(teacherUsername, datetimeLocal, durationMinutes) {
    if (!state.currentChannel) { alert('Select a channel first.'); return; }
    teacherUsername = normalizeUsername(teacherUsername);
    if (!teacherUsername || !datetimeLocal) { alert('Enter a teacher username and a date/time.'); return; }

    const registeredRole = state.roleCache[teacherUsername.toLowerCase()];
    if (registeredRole !== CONFIG.AUTH.ROLES.TEACHER) {
      alert(`"${teacherUsername}" isn't a registered teacher account. Create it first from Settings → Add teacher or student.`);
      return;
    }

    const { error } = await supabase.from('class_schedule').insert({
      channel_id: state.currentChannel.id,
      teacher_username: teacherUsername,
      scheduled_time: new Date(datetimeLocal).toISOString(),
      duration_minutes: durationMinutes || 45,
      set_by: state.currentUser.username,
    });

    if (error) { alert('Could not set schedule: ' + error.message); return; }
    alert(`✅ Class time set for ${teacherUsername}`);
    await loadSchedule(state.currentChannel.id);
  }

  // ============================================================
  // 8d. GROUP MEMBER MANAGEMENT
  // ============================================================
  async function loadMembers(channelId) {
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MEMBERS)
      .select('*')
      .eq('channel_id', channelId)
      .order('username');

    if (error) {
      state.currentMembers = [];
      DOM.channelMembersList.innerHTML = '<div class="empty-note">Could not load members</div>';
      return;
    }
    
    state.currentMembers = (data || []).map(member => ({
      ...member,
      role: member.role || getRoleFromUsername(member.username)
    }));
    
    renderMembers();
    updateChatDetailSubtitle();
    updateProfileMeta();
  }

  let memberLetterAnchors = {};

  const MEMBER_ROLE_ORDER = ['admin', 'teacher', 'student'];
  const MEMBER_ROLE_LABEL = { admin: 'Admins', teacher: 'Teachers', student: 'Students' };

  function renderMembers() {
    DOM.adminAddMemberRow.classList.toggle('hidden', !state.isAdmin);

    const query = (DOM.memberSearchInput.value || '').trim().toLowerCase();
    const members = [...state.currentMembers]
      .filter((m) => !query || m.username.toLowerCase().includes(query))
      .sort((a, b) => {
        const roleDiff = MEMBER_ROLE_ORDER.indexOf(a.role) - MEMBER_ROLE_ORDER.indexOf(b.role);
        if (roleDiff !== 0) return roleDiff;
        return a.username.localeCompare(b.username);
      });

    if (!members.length) {
      DOM.channelMembersList.innerHTML = `<div class="empty-note">${state.currentChannel ? 'No members yet' : 'Select a channel'}</div>`;
      DOM.alphaIndex.innerHTML = '';
      return;
    }

    let html = '';
    let lastRole = '';
    let lastLetter = '';
    let anchorIdx = 0;
    memberLetterAnchors = {};
    members.forEach((m) => {
      if (m.role !== lastRole) {
        html += `<div class="member-group-letter member-role-header">${MEMBER_ROLE_LABEL[m.role] || escapeHtml(m.role)}</div>`;
        lastRole = m.role;
        lastLetter = '';
      }
      const displayName = getDisplayName(m.username);
      const letter = displayName.charAt(0).toUpperCase();
      if (letter !== lastLetter) {
        const anchorId = `memberLetter-${anchorIdx++}`;
        html += `<div class="member-group-letter" id="${anchorId}">${letter}</div>`;
        if (!(letter in memberLetterAnchors)) memberLetterAnchors[letter] = anchorId;
        lastLetter = letter;
      }
      const online = state.onlineUsers.has(m.username.toLowerCase());
      html += `
        <div class="member-row" id="member-${m.id}">
          ${avatarHtml(m.username, 'sm')}
          <div style="flex:1; min-width:0;">
            <div class="member-name">${escapeHtml(displayName)} <span class="member-display-name">(${escapeHtml(m.username)})</span></div>
            <div class="member-status${online ? ' online' : ''}"><span class="dot"></span>${online ? 'Active now' : 'Offline'}</div>
          </div>
          <span class="role-chip role-${m.role}-chip member-role-chip">${escapeHtml(m.role)}</span>
          ${state.isAdmin ? `
            <button class="icon-btn member-remove-btn" style="width:26px;height:26px;" title="Remove from group" data-remove-member="${m.id}">
              <i class="fas fa-xmark" style="font-size:11px;"></i>
            </button>` : ''}
        </div>
      `;
    });
    DOM.channelMembersList.innerHTML = html;

    DOM.channelMembersList.querySelectorAll('[data-remove-member]').forEach((btn) => {
      btn.addEventListener('click', () => removeMember(btn.dataset.removeMember));
    });

    const present = new Set(members.map((m) => getDisplayName(m.username).charAt(0).toUpperCase()));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    DOM.alphaIndex.innerHTML = alphabet.map((l) => `<span data-letter="${l}" class="${present.has(l) ? '' : 'hidden'}">${l}</span>`).join('');
    DOM.alphaIndex.querySelectorAll('span').forEach((span) => {
      span.addEventListener('click', () => {
        const anchorId = memberLetterAnchors[span.dataset.letter];
        const target = anchorId && document.getElementById(anchorId);
        if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  }

  async function addMemberToChannel(username, role) {
    username = normalizeUsername(username);
    if (!username || !state.currentChannel) { alert('Enter a username and select a channel.'); return; }

    const registeredRoles = await getUserRoles(username);
    if (!registeredRoles || registeredRoles.length === 0) {
      alert(`No account exists for "${username}". Create it first from Settings → Add teacher or student, then add them here.`);
      return;
    }

    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MEMBERS)
      .upsert(
        { 
          channel_id: state.currentChannel.id, 
          username, 
          role: role || 'student', 
          added_by: state.currentUser.username 
        },
        { onConflict: 'channel_id,username' }
      );

    if (error) { alert('Could not add member: ' + error.message); return; }

    await loadMembers(state.currentChannel.id);
  }

  async function removeMember(memberId) {
    if (!confirm('Remove this person from the group?')) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.MEMBERS).delete().eq('id', memberId);
    if (error) { alert('Remove failed: ' + error.message); return; }
    await loadMembers(state.currentChannel.id);
  }

  // ============================================================
  // 7c. ADMIN: USER MANAGEMENT (edit/delete users)
  // ============================================================
  async function loadUserForEdit(username) {
    username = normalizeUsername(username);
    if (!username) { alert('Enter a username to search for.'); return; }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('username, role, display_name')
      .eq('username', username)
      .maybeSingle();

    if (roleError || !roleData) {
      alert(`User "${username}" not found.`);
      DOM.userEditForm.style.display = 'none';
      return;
    }

    DOM.editUsername.value = roleData.username;
    DOM.editDisplayName.value = roleData.display_name || roleData.username;
    DOM.editNewUsername.value = roleData.username;
    DOM.editRole.value = roleData.role;
    DOM.editPassword.value = '';
    DOM.userEditForm.style.display = 'flex';
  }

  async function updateUserAccount(username, newUsername, newDisplayName, newRole, newPassword) {
    username = normalizeUsername(username);
    newUsername = normalizeUsername(newUsername);
    
    if (!username) { alert('Current username is required.'); return; }
    
    try {
      if (newUsername && newUsername !== username) {
        await supabase.from('user_roles').delete().eq('username', username);
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ 
            username: newUsername, 
            role: newRole,
            display_name: newDisplayName || newUsername
          });
        if (roleError) throw roleError;
        
        const { error: authError } = await supabase.auth.admin.updateUserById(
          state.currentUser.id,
          { email: generateEmail(newUsername) }
        );
        if (authError) throw authError;
        
        await supabase.from(CONFIG.SUPABASE.TABLES.MEMBERS)
          .update({ username: newUsername })
          .eq('username', username);
        
        await supabase.from(CONFIG.SUPABASE.TABLES.MESSAGES)
          .update({ username: newUsername })
          .eq('username', username);
        
        await supabase.from(CONFIG.SUPABASE.TABLES.STATUSES)
          .update({ username: newUsername })
          .eq('username', username);
        
        await supabase.from('class_schedule')
          .update({ teacher_username: newUsername })
          .eq('teacher_username', username);
        
        delete state.roleCache[username];
        delete state.displayNameCache[username];
        state.roleCache[newUsername] = newRole;
        state.displayNameCache[newUsername] = newDisplayName || newUsername;
      } else {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ 
            role: newRole,
            display_name: newDisplayName || username
          })
          .eq('username', username);
        if (roleError) throw roleError;
        state.roleCache[username] = newRole;
        state.displayNameCache[username] = newDisplayName || username;
      }
      
      if (newPassword && newPassword.length > 0) {
        const { error: passError } = await supabase.auth.admin.updateUserById(
          state.currentUser.id,
          { password: newPassword }
        );
        if (passError) throw passError;
      }
      
      alert('User updated successfully!');
      DOM.userEditForm.style.display = 'none';
      DOM.manageUserSearch.value = '';
      populateRegisteredUsersDatalist();
      await loadRoleCache();
      
    } catch (e) {
      console.error('Update user error:', e);
      alert('Could not update user: ' + (e.message || e));
    }
  }

  async function deleteUserAccount(username) {
    username = normalizeUsername(username);
    if (!username) { alert('No user selected.'); return; }
    
    if (!confirm(`Delete user "${username}" permanently? This cannot be undone and will remove all their data.`)) return;
    
    try {
      await supabase.from('user_roles').delete().eq('username', username);
      await supabase.from(CONFIG.SUPABASE.TABLES.MEMBERS).delete().eq('username', username);
      await supabase.from(CONFIG.SUPABASE.TABLES.MESSAGES).delete().eq('username', username);
      await supabase.from(CONFIG.SUPABASE.TABLES.STATUSES).delete().eq('username', username);
      await supabase.from('class_schedule').delete().eq('teacher_username', username);
      
      const { error: authError } = await supabase.auth.admin.deleteUser(
        state.currentUser.id
      );
      if (authError) throw authError;
      
      delete state.roleCache[username];
      delete state.displayNameCache[username];
      alert('User deleted successfully!');
      DOM.userEditForm.style.display = 'none';
      DOM.manageUserSearch.value = '';
      populateRegisteredUsersDatalist();
      await loadRoleCache();
      
    } catch (e) {
      console.error('Delete user error:', e);
      alert('Could not delete user: ' + (e.message || e));
    }
  }

  // ============================================================
  // 8b. REALTIME MESSAGE SYNC (with instant cache & inactivity)
  // ============================================================
  function subscribeToMessages(channelId) {
    // Clean up existing subscription
    if (state.messagesSubscription) {
      supabase.removeChannel(state.messagesSubscription);
      state.messagesSubscription = null;
    }

    state.messagesSubscription = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: CONFIG.SUPABASE.TABLES.MESSAGES, 
        filter: `channel_id=eq.${channelId}` 
      }, async (payload) => {
        // Check if message already exists
        const exists = state.messages.some((m) => m.id === payload.new.id);
        if (!exists) {
          state.messages.push(payload.new);
          renderMessages();
          refreshUnreadBadges();
          
          // Cache the updated messages
          saveCachedMessages(channelId, state.messages);

          // Reset inactivity timer on new message
          if (state.inactivityTimer) {
            clearTimeout(state.inactivityTimer);
            state.inactivityTimer = null;
          }

          // Only send notifications if the message is from someone else
          if (payload.new.username !== state.currentUser?.username) {
            // Play sound notification (existing)
            playNotifySound();
            
            // Send VAPID push notifications to offline students via Edge Function
            await sendVapidNotificationsToOfflineStudents(
              payload.new.username,
              payload.new.content || '📎 New attachment',
              channelId
            );
            
            markDelivered(channelId);
            markSeen(channelId);
          }
        }
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: CONFIG.SUPABASE.TABLES.MESSAGES, 
        filter: `channel_id=eq.${channelId}` 
      }, (payload) => {
        const idx = state.messages.findIndex((m) => m.id === payload.new.id);
        if (idx !== -1) { 
          state.messages[idx] = payload.new; 
          renderMessages();
          // Update cache on message update
          saveCachedMessages(channelId, state.messages);
        }
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: CONFIG.SUPABASE.TABLES.MESSAGES, 
        filter: `channel_id=eq.${channelId}` 
      }, (payload) => {
        state.messages = state.messages.filter((m) => m.id !== payload.old.id);
        renderMessages();
        // Update cache on message delete
        saveCachedMessages(channelId, state.messages);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          state.isChannelActive = true;
          console.log(`✅ Subscribed to messages for channel ${channelId}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          state.isChannelActive = false;
          console.warn('Realtime message sync unavailable — falling back to manual refresh.');
        }
      });
  }

  async function createChannel(name) {
    if (!name) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.CHANNELS).insert({ name });
    if (error) { alert('Error creating channel: ' + error.message); return; }
    await renderChannels();
  }

  // ============================================================
  // 9. MESSAGES (with caching support)
  // ============================================================
  async function loadMessages(channelId) {
    if (!channelId) return;

    // Try to get cached messages first (already loaded in selectChannel)
    // But we still fetch fresh data in background
    
    try {
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50); // Just grab the last 50 messages to keep it fast

      if (error) {
        console.warn('Messages fallback:', error);
        // If there's an error, check if we have cached messages
        if (state.messages.length === 0) {
          state.messages = [{ id: '1', content: 'Welcome to the channel!', username: 'system', created_at: Date.now() }];
        }
        renderMessages();
        return;
      }

      if (data && data.length > 0) {
        // Update state with fresh data
        state.messages = data;
        // Save these fresh messages to local storage for the next time they open the app
        saveCachedMessages(channelId, data);
        renderMessages();
        console.log(`📥 Fetched ${data.length} fresh messages from Supabase`);
      } else if (state.messages.length === 0) {
        // If no messages from DB and no cache, show empty state
        state.messages = [];
        renderMessages();
      }
      
      updateProfileScreen();
    } catch (error) {
      console.error('Error loading messages:', error);
      // Fallback to cached messages if available
      if (state.messages.length === 0) {
        state.messages = [{ id: '1', content: 'Welcome to the channel!', username: 'system', created_at: Date.now() }];
        renderMessages();
      }
    }
  }

  function ticksHtml(msg) {
    if (msg.seen_at) return `<span class="msg-ticks seen" title="Seen"><i class="fas fa-check-double"></i></span>`;
    if (msg.delivered_at) return `<span class="msg-ticks delivered" title="Delivered"><i class="fas fa-check-double"></i></span>`;
    return `<span class="msg-ticks" title="Sent"><i class="fas fa-check"></i></span>`;
  }

  function renderMessages() {
    DOM.chatMessages.innerHTML = '';

    if (!state.messages.length) {
      DOM.chatMessages.innerHTML = '<div class="empty-note center-text" style="width:100%;">No messages yet — say hello</div>';
      return;
    }

    state.messages.forEach((msg) => {
      const isMine = msg.username === state.currentUser?.username;
      const wrap = document.createElement('div');
      wrap.className = `msg ${isMine ? 'msg-mine' : 'msg-theirs'}`;
      wrap.dataset.id = msg.id;
      wrap.dataset.role = roleKey(msg.username);

      let replyHtml = '';
      if (msg.reply_to) {
        replyHtml = `
          <div class="msg-reply-quote">
            <span class="reply-author">${escapeHtml(getDisplayName(msg.reply_username || 'Message'))}</span>
            <span class="reply-text">${escapeHtml(truncate(msg.reply_content || '', 60))}</span>
          </div>
        `;
      }

      let bubbleHtml = '';
      if (msg.content) {
        bubbleHtml += `<div class="msg-bubble">${replyHtml}${escapeHtml(msg.content)}</div>`;
      } else if (replyHtml) {
        bubbleHtml += `<div class="msg-bubble">${replyHtml}</div>`;
      }
      if (msg.file_url) {
        bubbleHtml += `
          <a href="${msg.file_url}" target="_blank" rel="noopener" class="msg-file">
            <i class="fas fa-paperclip"></i> Attached file
          </a>
        `;
      }

      const footerHtml = isMine
        ? `<div class="msg-meta" style="margin-top:2px;">${ticksHtml(msg)}${msg.seen_at ? `<span class="msg-seen-time">Seen ${formatDate(msg.seen_at)}</span>` : ''}</div>`
        : '';

      const displayName = getDisplayName(msg.username);
      wrap.innerHTML = `
        ${avatarHtml(msg.username, 'sm')}
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-author">${escapeHtml(displayName)}</span>
            <span class="msg-time">${formatDate(msg.created_at)}</span>
          </div>
          ${bubbleHtml}
          ${footerHtml}
        </div>
        <div class="msg-actions">
          <button class="msg-reply-btn" title="Reply" data-reply-id="${msg.id}"><i class="fas fa-reply"></i></button>
          ${state.isAdmin ? `<button class="msg-reply-btn" title="Delete message" data-delete-id="${msg.id}" style="margin-left:4px;"><i class="fas fa-trash" style="color:var(--danger);"></i></button>` : ''}
        </div>
      `;
      DOM.chatMessages.appendChild(wrap);
    });

    DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
  }

  async function deleteMessage(messageId) {
    if (!confirm('Delete this message for everyone?')) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.MESSAGES).delete().eq('id', messageId);
    if (error) { alert('Delete failed: ' + error.message); return; }
    state.messages = state.messages.filter((m) => m.id !== messageId);
    renderMessages();
    // Update cache after deletion
    if (state.currentChannel) {
      saveCachedMessages(state.currentChannel.id, state.messages);
    }
  }

  DOM.chatMessages.addEventListener('click', (e) => {
    const btn = e.target.closest('.msg-reply-btn');
    if (!btn) return;

    if (btn.dataset.deleteId) { deleteMessage(btn.dataset.deleteId); return; }

    const id = btn.dataset.replyId;
    const msg = state.messages.find((m) => m.id === id);
    if (!msg) return;

    state.replyingTo = msg;
    DOM.replyPreviewAuthor.textContent = getDisplayName(msg.username);
    DOM.replyPreviewText.textContent = msg.content || (msg.file_url ? 'Attached file' : '');
    DOM.replyPreview.classList.remove('hidden');
    DOM.messageInput.focus();
  });

  DOM.replyPreviewCancel.addEventListener('click', () => {
    state.replyingTo = null;
    DOM.replyPreview.classList.add('hidden');
  });

  async function sendMessage(content, file) {
    if (!state.currentChannel || !state.currentUser) { alert('Please select a channel first.'); return; }

    let fileUrl = null;

    if (file) {
      if (file.size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
        alert(`File exceeds ${CONFIG.UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
        return;
      }

      const path = generateStoragePath(state.currentChannel.id, file.name);

      try {
        const { error } = await supabase.storage.from(CONFIG.SUPABASE.STORAGE_BUCKET).upload(path, file);
        if (error) throw error;

        const { data: urlData } = supabase.storage.from(CONFIG.SUPABASE.STORAGE_BUCKET).getPublicUrl(path);
        fileUrl = urlData.publicUrl;

        DOM.fileUploadStatus.textContent = `📎 ${file.name} uploaded`;
        DOM.fileUploadStatus.classList.remove('hidden');
        setTimeout(() => DOM.fileUploadStatus.classList.add('hidden'), 4000);
      } catch (e) {
        console.error('Upload error:', e);
        alert(`File upload failed: ${e.message || 'unknown error — check console for details.'}`);
        return;
      }
    }

    const replyPayload = state.replyingTo
      ? { reply_to: state.replyingTo.id, reply_username: state.replyingTo.username, reply_content: state.replyingTo.content || (state.replyingTo.file_url ? '📎 Attached file' : '') }
      : {};

    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.MESSAGES).insert({
      channel_id: state.currentChannel.id,
      username: state.currentUser.username,
      content: content || '',
      file_url: fileUrl,
      created_at: new Date().toISOString(),
      ...replyPayload,
    });

    if (error) { console.error('Send error:', error); alert('Failed to send message.'); }

    state.replyingTo = null;
    DOM.replyPreview.classList.add('hidden');

    await loadMessages(state.currentChannel.id);
    state.channelPreviews = await loadChannelPreviews(allChannels.map((c) => c.id));
    renderChatList(allChannels);
  }

  // ============================================================
  // 10. STATUS UPDATES
  // ============================================================
  async function loadStatuses() {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.STATUSES)
      .select('*')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      state.statuses = [{ id: '1', content: 'Welcome to Nous Complex Orbit!', username: 'admin', created_at: Date.now() }];
    } else {
      state.statuses = data || [];
    }
    renderStatuses();
  }

  function renderStatuses() {
    DOM.statusTray.innerHTML = '';

    if (!state.statuses.length) {
      DOM.statusTray.innerHTML = '<div class="empty-note">No updates yet</div>';
    } else {
      state.statuses.forEach((st) => {
        const item = document.createElement('div');
        item.className = 'update-row';
        const displayName = getDisplayName(st.username);
        const preview = st.content
          ? escapeHtml(truncate(st.content, 46))
          : (st.media_url ? '<i class="fas fa-camera"></i> Photo/video' : '');
        item.innerHTML = `
          ${avatarHtml(st.username)}
          <div class="update-row-body">
            <div class="update-row-name">${escapeHtml(displayName)}</div>
            <div class="update-row-preview">${preview}</div>
          </div>
          <div class="update-row-time">${formatTimeAgo(st.created_at)}</div>
          ${state.isAdmin ? `
            <button class="icon-btn" style="width:26px;height:26px;" title="Delete status" data-delete-status="${st.id}">
              <i class="fas fa-trash" style="font-size:11px;color:var(--danger);"></i>
            </button>
          ` : ''}
        `;
        item.addEventListener('pointerup', (e) => {
          if (e.target.closest('[data-delete-status]')) return;
          showStatusModal(st);
        });
        DOM.statusTray.appendChild(item);
      });
    }

    const shouldShow = (state.isAdmin || state.isTeacher) && CONFIG.FEATURES.ENABLE_STATUS_UPDATES;
    DOM.statusAddBtn.classList.toggle('hidden', !shouldShow);
    if (DOM.postStatusFab) DOM.postStatusFab.classList.add('hidden');
  }

  async function deleteStatus(statusId) {
    if (!confirm('Delete this status update?')) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.STATUSES).delete().eq('id', statusId);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await loadStatuses();
  }

  function generateStatusStoragePath(username, filename) {
    const ext = (filename.split('.').pop() || 'dat').toLowerCase();
    const rand = Math.random().toString(36).slice(2, 8);
    return `status/${username}/${Date.now()}-${rand}.${ext}`;
  }

  const STATUS_EXPIRY_MS = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    never: null,
  };

  async function postStatus({ content, file, expiryKey }) {
    if (!state.currentUser) return;

    let mediaUrl = null;
    if (file) {
      if (file.size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
        alert(`File exceeds ${CONFIG.UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
        return;
      }
      const path = generateStatusStoragePath(state.currentUser.username, file.name);
      try {
        const { error: uploadError } = await supabase.storage.from(CONFIG.SUPABASE.STORAGE_BUCKET).upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from(CONFIG.SUPABASE.STORAGE_BUCKET).getPublicUrl(path);
        mediaUrl = urlData.publicUrl;
      } catch (e) {
        console.error('Status media upload error:', e);
        alert(`Media upload failed: ${e.message || 'unknown error — check console for details.'}`);
        return;
      }
    }

    const ms = STATUS_EXPIRY_MS[expiryKey];
    const expiresAt = ms ? new Date(Date.now() + ms).toISOString() : null;

    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.STATUSES).insert({
      username: state.currentUser.username,
      content: content || '',
      media_url: mediaUrl,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });
    if (error) { console.error('Status error:', error); alert('Failed to post status: ' + error.message); return; }
    await loadStatuses();
  }

  function openStatusComposer() {
    if (!CONFIG.FEATURES.ENABLE_STATUS_UPDATES) { alert('Status updates are disabled.'); return; }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card">
        <h3 class="modal-title"><i class="fas fa-bullhorn"></i> Post an update</h3>
        <textarea id="statusComposeText" class="field" rows="3" placeholder="Write something..." style="resize:vertical; margin-bottom:10px;"></textarea>

        <label class="section-label" style="display:block; margin-bottom:6px;">Photo or video (optional)</label>
        <input id="statusComposeFile" type="file" accept="image/*,video/*" class="field" style="margin-bottom:4px;">
        <div id="statusComposeFileName" class="modal-body" style="margin:2px 0 10px; font-size:12.5px;"></div>

        <label class="section-label" style="display:block; margin-bottom:6px;">Expires</label>
        <select id="statusComposeExpiry" class="field" style="margin-bottom:16px;">
          <option value="1h">In 1 hour</option>
          <option value="6h">In 6 hours</option>
          <option value="24h" selected>In 24 hours</option>
          <option value="3d">In 3 days</option>
          <option value="7d">In 7 days</option>
          <option value="never">Never</option>
        </select>

        <div style="display:flex; gap:10px;">
          <button id="statusComposeCancel" class="btn btn-ghost" style="flex:1;">Cancel</button>
          <button id="statusComposePost" class="btn btn-primary" style="flex:1;"><i class="fas fa-paper-plane"></i> Post</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const textEl = modal.querySelector('#statusComposeText');
    const fileEl = modal.querySelector('#statusComposeFile');
    const fileNameEl = modal.querySelector('#statusComposeFileName');
    const expiryEl = modal.querySelector('#statusComposeExpiry');

    fileEl.addEventListener('change', () => {
      fileNameEl.textContent = fileEl.files[0] ? `📎 ${fileEl.files[0].name}` : '';
    });

    const close = () => modal.remove();
    modal.querySelector('#statusComposeCancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#statusComposePost').addEventListener('click', async () => {
      const content = textEl.value.trim();
      const file = fileEl.files[0] || null;
      if (!content && !file) { alert('Add some text or a photo/video first.'); return; }

      const postBtn = modal.querySelector('#statusComposePost');
      postBtn.disabled = true;
      postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

      await postStatus({ content, file, expiryKey: expiryEl.value });
      close();
    });
  }

  let statusProgressValue = 0;
  let statusPaused = false;

  function showStatusModal(status) {
    setAvatarEl(DOM.statusViewerAvatar, status.username, 'sm status-viewer-avatar');
    DOM.statusModalTitle.textContent = getDisplayName(status.username);
    DOM.statusModalTime.textContent = formatFullDate(status.created_at);
    DOM.statusModalContent.textContent = status.content || '';

    if (status.media_url && isVideoFile(status.media_url)) {
      DOM.statusModalMedia.innerHTML = `<video src="${status.media_url}" controls autoplay muted playsinline></video>`;
    } else if (status.media_url) {
      DOM.statusModalMedia.innerHTML = `<img src="${status.media_url}" alt="Status media">`;
    } else {
      DOM.statusModalMedia.innerHTML = '';
    }

    DOM.statusProgress.style.width = '0%';
    DOM.statusModal.classList.remove('hidden');
    
    if (window.innerWidth < 560) {
      const inner = document.querySelector('.status-viewer-inner');
      if (inner) {
        inner.style.maxHeight = '100vh';
        inner.style.height = '100vh';
      }
    }

    statusProgressValue = 0;
    statusPaused = false;
    updateStatusPauseIcon();
    if (state.progressInterval) clearInterval(state.progressInterval);

    state.progressInterval = setInterval(() => {
      if (statusPaused) return;
      statusProgressValue += 1.2;
      if (statusProgressValue >= 100) {
        clearInterval(state.progressInterval);
        state.progressInterval = null;
        DOM.statusModal.classList.add('hidden');
      }
      DOM.statusProgress.style.width = Math.min(statusProgressValue, 100) + '%';
    }, 50);
  }

  function toggleStatusPause() {
    statusPaused = !statusPaused;
    updateStatusPauseIcon();
  }

  function updateStatusPauseIcon() {
    if (!DOM.statusPauseBtn) return;
    DOM.statusPauseBtn.innerHTML = statusPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
    DOM.statusPauseBtn.title = statusPaused ? 'Resume' : 'Pause';
  }

  function closeStatusViewer() {
    DOM.statusModal.classList.add('hidden');
    if (state.progressInterval) { clearInterval(state.progressInterval); state.progressInterval = null; }
    statusPaused = false;
    DOM.statusModalMedia.innerHTML = '';
  }

  // ============================================================
  // 11. VIDEO / LIVEKIT
  // ============================================================
  function buildLiveUrl() {
    const settings = { ...CONFIG.LIVEKIT.ROOM_SETTINGS };
    if (state.isTeacher) {
      settings.lock_webcam = false;
      settings.hide_host_management_controls = false;
    }
    const params = new URLSearchParams(settings);
    return `${CONFIG.LIVEKIT.URL}?${params.toString()}`;
  }

  async function joinLiveClass() {
    if (!state.currentUser || !state.currentChannel) { alert('Please select a channel first.'); return; }

    if (CONFIG.FEATURES.ENABLE_ATTENDANCE_LOGGING) {
      try {
        await supabase.from(CONFIG.SUPABASE.TABLES.ATTENDANCE).insert({
          student_name: state.currentUser.username,
          channel_id: state.currentChannel.id,
          join_time: new Date().toISOString(),
          status: 'Present',
        });
      } catch (e) {
        console.warn('Attendance log skipped:', e);
      }
    }

    DOM.videoContainer.classList.remove('hidden');
    DOM.videoIframe.src = buildLiveUrl();
    state.videoActive = true;
    DOM.liveBtnText.textContent = state.isTeacher ? 'Start Live Session' : 'Join Live Session';
  }

  // ============================================================
  // 12. ADMIN FUNCTIONS
  // ============================================================
  async function generateRoster() {
    const students = [];
    const count = CONFIG.FEATURES.ROSTER.STUDENT_COUNT;
    const prefix = CONFIG.FEATURES.ROSTER.PREFIX;
    const passLength = CONFIG.FEATURES.ROSTER.PASSWORD_LENGTH;

    for (let i = 1; i <= count; i++) {
      const uid = `${prefix}${String(i).padStart(3, '0')}`;
      const pass = Math.random().toString(36).slice(2, 2 + passLength);
      students.push({ username: uid, password: pass });
      try {
        await supabase.auth.signUp({ email: generateEmail(uid), password: pass });
      } catch (e) { /* ignore duplicate errors */ }
    }

    let csv = 'Username,Password\n';
    students.forEach(s => csv += `${s.username},${s.password}\n`);

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `roster_${count}_students.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`✅ ${count} student roster generated and downloaded!`);
  }

  async function exportAttendance() {
    const { data, error } = await supabase.from(CONFIG.SUPABASE.TABLES.ATTENDANCE).select('*');
    if (error) { alert('No attendance data found.'); return; }

    let csv = 'Student,Channel,Join Time,Status\n';
    data.forEach(r => csv += `${r.student_name},${r.channel_id},${r.join_time},${r.status}\n`);

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'attendance_log.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function requestMediaPermissions() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      console.log('Media permissions granted.');
    } catch (e) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-card">
          <h3 class="modal-title"><i class="fas fa-triangle-exclamation" style="color:var(--role-admin); font-size:14px;"></i> Permissions required</h3>
          <p class="modal-body">Camera and microphone access are blocked. Allow permissions in your browser settings, then reload the page.</p>
          <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-ghost btn-block">Got it</button>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  // ============================================================
  // 13. PROFILE & SHARED MEDIA SCREEN
  // ============================================================
  function updateProfileMeta() {
    if (!state.currentChannel) return;
    const total = state.currentMembers.length;
    const online = state.currentMembers.filter((m) => state.onlineUsers.has((m.username || '').toLowerCase())).length;
    DOM.profileChannelMeta.textContent = total ? `${total} member${total === 1 ? '' : 's'} · ${online} online` : '';
  }

  function updateProfileScreen() {
    if (!state.currentChannel) return;
    DOM.profileChannelName.textContent = state.currentChannel.name;
    loadChannelDescription(state.currentChannel.id);
    updateProfileMeta();

    const media = state.messages.filter((m) => isImageFile(m.file_url));
    if (!media.length) {
      DOM.sharedMediaGrid.innerHTML = '<div class="empty-note">No shared media yet</div>';
      DOM.profileSeeAllMedia.classList.add('hidden');
      return;
    }
    const showAll = DOM.sharedMediaGrid.dataset.showAll === 'true';
    const shown = showAll ? media : media.slice(-6);
    DOM.sharedMediaGrid.innerHTML = shown.map((m) => `<img src="${m.file_url}" alt="Shared media" loading="lazy">`).join('');
    DOM.profileSeeAllMedia.classList.toggle('hidden', media.length <= 6);
  }

  // ============================================================
  // 14. LOGIN FLOW
  // ============================================================
  async function completeLogin(username, user) {
    await loadRoleCache();
    const role = getRoleFromUsername(username);
    const key = roleKey(username);
    const displayName = getDisplayName(username);

    state.currentUser = { id: user.id, username: username, email: user.email, role: role };
    state.isAdmin = role === CONFIG.AUTH.ROLES.ADMIN;
    state.isTeacher = role === CONFIG.AUTH.ROLES.TEACHER || state.isAdmin;

    DOM.authCard.classList.add('hidden');
    DOM.dashboard.classList.remove('hidden');

    DOM.userBadge.textContent = displayName;
    DOM.userBadge.className = `role-chip role-${key}-chip`;

    setAvatarEl(DOM.settingsAvatar, username, 'lg');
    DOM.settingsName.textContent = displayName;
    DOM.settingsEmail.textContent = user.email || generateEmail(username);
    DOM.settingsDisplayName.textContent = `Username: ${username}`;

    DOM.adminSettingsCard.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));
    DOM.adminCreateUserCard.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));
    DOM.adminUserManagementCard.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));
    DOM.adminProfileSchedule.classList.toggle('hidden', !state.isAdmin);

    setupPresence();
    await requestMediaPermissions();
    await renderChannels();
    await loadStatuses();
    
    // Sync VAPID subscription on login
    await syncVapidSubscriptionOnLogin(username);
    
    // Subscribe to push notifications (existing)
    subscribeToPush().then((ok) => { DOM.notifToggle.checked = !!ok; });

    screenHistory = [];
    goToScreen('chats');
  }

  async function handleLogin() {
    const username = normalizeUsername(DOM.usernameInput.value);
    const password = DOM.passwordInput.value;

    if (!username || !password) {
      showError('Enter both your School ID and password.');
      return;
    }
    hideError();

    try {
      const user = await loginWithUsername(username, password);
      DOM.passwordInput.value = '';
      await completeLogin(username, user);
    } catch (e) {
      DOM.passwordInput.value = '';
      showError(e.message || 'Login error. Please try again.');
    }
  }

  async function restoreSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user || !session.user.email) return;

      const suffix = CONFIG.AUTH.EMAIL_SUFFIX;
      if (!session.user.email.endsWith(suffix)) return;

      const username = normalizeUsername(session.user.email.slice(0, -suffix.length));
      await completeLogin(username, session.user);
    } catch (e) {
      console.warn('Session restore skipped:', e);
    }
  }

  async function handleSignOut() {
    if (!confirm('Sign out?')) return;

    // Clean up VAPID subscription before signing out
    try {
      if (state.currentUser) {
        // Delete the subscription from the table while the session is still active
        await supabase
          .from('user_device_tokens')
          .delete()
          .eq('user_id', state.currentUser.username);
        console.log('VAPID subscription cleaned up successfully');
      }
    } catch (e) {
      console.warn('Cleanup VAPID subscription error:', e);
    }

    // Terminate login session cleanly
    try { 
      await supabase.auth.signOut(); 
    } catch (e) { 
      console.warn('Sign out error:', e); 
    }

    // Clean up subscriptions and presence
    if (state.messagesSubscription) { 
      supabase.removeChannel(state.messagesSubscription); 
      state.messagesSubscription = null; 
    }
    if (scheduleSubscription) { 
      supabase.removeChannel(scheduleSubscription); 
      scheduleSubscription = null; 
    }
    teardownPresence();

    // Clean up inactivity manager
    cleanupInactivityManager();
    
    // Clean up tab focus manager
    cleanupTabFocusManager();

    // Reset state
    state.currentUser = null;
    state.currentChannel = null;
    state.currentMembers = [];
    state.isAdmin = false;
    state.isTeacher = false;
    state.messages = [];
    state.statuses = [];
    state.replyingTo = null;
    state.isChannelActive = false;
    state.isTabFocused = true;

    // Clear cached messages on logout
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('cached_chat_history_')) {
          localStorage.removeItem(key);
        }
      });
      console.log('🗑️ Cleared cached messages on logout');
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }

    // Update UI
    DOM.dashboard.classList.add('hidden');
    DOM.videoContainer.classList.add('hidden');
    DOM.authCard.classList.remove('hidden');
    DOM.usernameInput.value = '';
    DOM.passwordInput.value = '';
    hideError();
    
    screenHistory = [];
  }

  // ============================================================
  // 15. EVENT BINDINGS
  // ============================================================
  DOM.loginBtn.addEventListener('click', handleLogin);
  DOM.usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
  });
  DOM.passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
  });

  DOM.bottomNav.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('pointerup', () => goToScreen(btn.dataset.tab));
  });

  DOM.chatSearchInput.addEventListener('input', () => filterChatList(DOM.chatSearchInput.value));

  DOM.backFromChat.addEventListener('click', () => goToScreen('chats'));
  DOM.backFromUpdates.addEventListener('click', () => goToScreen('chats'));
  DOM.chatDetailTitleBtn.addEventListener('click', () => {
    if (!state.currentChannel) return;
    updateProfileScreen();
    goToScreen('profile');
  });

  DOM.sendMsgBtn.addEventListener('click', async () => {
    const content = DOM.messageInput.value.trim();
    const file = DOM.fileInput.files[0];
    if (!content && !file) return;
    await sendMessage(content, file);
    DOM.messageInput.value = '';
    DOM.fileInput.value = '';
    DOM.filePreview.classList.add('hidden');
    
    // Reset inactivity timer on sending message (user is active)
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
  });

  DOM.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { 
      e.preventDefault(); 
      DOM.sendMsgBtn.click(); 
    }
    // Reset inactivity timer on typing
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
  });

  // Message input focus/blur handlers for inactivity
  DOM.messageInput.addEventListener('focus', () => {
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
  });

  DOM.postStatusBtn.addEventListener('click', () => openStatusComposer());
  if (DOM.postStatusFab) DOM.postStatusFab.addEventListener('click', () => openStatusComposer());

  DOM.joinLiveBtn.addEventListener('click', () => {
    if (!CONFIG.FEATURES.ENABLE_VIDEO_CONFERENCE) { alert('Video conferencing is disabled.'); return; }
    joinLiveClass();
  });

  DOM.closeVideoBtn.addEventListener('click', () => {
    DOM.videoContainer.classList.add('hidden');
    DOM.videoIframe.src = '';
    state.videoActive = false;
  });

  DOM.fileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) { DOM.filePreview.classList.add('hidden'); return; }
    if (file.size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
      alert(`File exceeds ${CONFIG.UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
      this.value = '';
      DOM.filePreview.classList.add('hidden');
      return;
    }
    DOM.filePreviewName.textContent = file.name;
    DOM.filePreview.classList.remove('hidden');
    
    // Reset inactivity timer on file selection
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
  });

  DOM.filePreviewRemove.addEventListener('click', () => {
    DOM.fileInput.value = '';
    DOM.filePreview.classList.add('hidden');
  });

  async function handleCreateChannel() {
    const name = prompt('Enter new channel name:');
    if (name) await createChannel(name);
  }
  DOM.createChannelBtn.addEventListener('click', handleCreateChannel);

  DOM.generatePasswordBtn.addEventListener('click', () => {
    DOM.newUserPassword.value = generatePassword();
  });
  DOM.createUserBtn.addEventListener('click', () => {
    createUserAccount(
      DOM.newUserUsername.value.trim(),
      DOM.newUserDisplayName.value.trim(),
      DOM.newUserRole.value,
      DOM.newUserPassword.value.trim()
    );
  });

  DOM.loadUserBtn.addEventListener('click', () => {
    loadUserForEdit(DOM.manageUserSearch.value);
  });

  DOM.updateUserBtn.addEventListener('click', () => {
    const currentUser = DOM.editUsername.value;
    const newUser = DOM.editNewUsername.value || currentUser;
    const displayName = DOM.editDisplayName.value || currentUser;
    const role = DOM.editRole.value;
    const password = DOM.editPassword.value;
    updateUserAccount(currentUser, newUser, displayName, role, password);
  });

  DOM.deleteUserBtn.addEventListener('click', () => {
    deleteUserAccount(DOM.editUsername.value);
  });

  DOM.setScheduleBtn.addEventListener('click', async () => {
    await setClassSchedule(
      DOM.scheduleTeacherInput.value.trim(),
      DOM.scheduleTimeInput.value,
      parseInt(DOM.scheduleDurationInput.value, 10)
    );
    DOM.scheduleTeacherInput.value = '';
    DOM.scheduleTimeInput.value = '';
  });

  DOM.assignStudentBtn.addEventListener('click', async () => {
    const username = DOM.assignStudentInput.value.trim();
    const role = DOM.assignRoleSelect.value;
    await addMemberToChannel(username, role);
    DOM.assignStudentInput.value = '';
  });

  DOM.updateDescBtn.addEventListener('click', () => {
    if (!state.currentChannel) return;
    updateChannelDescription(state.currentChannel.id, DOM.channelDescInput.value.trim());
  });

  DOM.channelDescInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      DOM.updateDescBtn.click();
    }
  });

  DOM.backFromMembers.addEventListener('click', () => goToScreen('profile'));
  DOM.memberSearchInput.addEventListener('input', () => renderMembers());
  DOM.profileMembersBtn.addEventListener('click', () => {
    if (!state.currentChannel) { alert('Select a channel first.'); return; }
    renderMembers();
    goToScreen('members');
  });

  DOM.backFromProfile.addEventListener('click', () => goToScreen('chatDetail'));
  DOM.profileSeeAllMedia.addEventListener('click', (e) => {
    e.preventDefault();
    DOM.sharedMediaGrid.dataset.showAll = 'true';
    updateProfileScreen();
  });

  DOM.closeStatusModal.addEventListener('click', closeStatusViewer);
  DOM.statusModal.addEventListener('click', (e) => { if (e.target === DOM.statusModal) closeStatusViewer(); });
  DOM.statusPauseBtn.addEventListener('click', toggleStatusPause);

  DOM.statusTray.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-status]');
    if (btn) {
      e.stopPropagation();
      deleteStatus(btn.dataset.deleteStatus);
    }
  });

  DOM.notifToggle.addEventListener('change', () => setNotificationsEnabled(DOM.notifToggle.checked));
  DOM.darkToggle.addEventListener('change', () => {
    document.body.classList.toggle('theme-dark', DOM.darkToggle.checked);
    try { localStorage.setItem('orbit-theme', DOM.darkToggle.checked ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  });
  DOM.darkToggle.checked = document.body.classList.contains('theme-dark');

  DOM.signOutBtn.addEventListener('click', handleSignOut);

  // ============================================================
  // 16. BOOTSTRAP
  // ============================================================
  setupLogos();

  if (history.replaceState) {
    history.replaceState({ orbitScreen: null }, '', location.pathname + location.search);
  }

  window.addEventListener('popstate', handleBackNavigation);

  restoreSession();
  console.log('✅ Application initialized successfully.');

})();
