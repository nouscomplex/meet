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
    cachedMessages: {},
    inactivityTimer: null,
    INACTIVITY_TIMEOUT: 300000,
    isChannelActive: false,
    isTabFocused: true,
    tabChannel: null,
    isRefreshing: false,
    isMerging: false, // New flag to prevent merge conflicts
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
  // 5b. NOTIFICATION SOUND & VISUAL NOTIFICATIONS
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

    try {
      if (typeof Notification !== 'undefined' && 
          Notification.permission === 'granted' && 
          document.hidden) {
        const senderName = state.currentUser ? getDisplayName(state.currentUser.username) : 'Someone';
        const channelName = state.currentChannel?.name || 'Class';
        
        const notification = new Notification(`💬 ${senderName} in ${channelName}`, {
          body: 'New message! Tap to open.',
          icon: CONFIG.BRANDING.LOGO.PATH || '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'new-message-' + Date.now(),
          requireInteraction: true,
          silent: true,
        });
        
        setTimeout(() => {
          notification.close();
        }, 10000);
        
        notification.onclick = function() {
          window.focus();
          notification.close();
        };
      }
    } catch (e) {
      console.warn('Could not show notification:', e);
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

  async function syncVapidSubscriptionOnLogin(username) {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications not supported on this browser/device.');
        return false;
      }

      if (!CONFIG.PUSH || !CONFIG.PUSH.VAPID_PUBLIC_KEY) {
        console.warn('No VAPID public key configured — push sync skipped.');
        return false;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.warn('Could not get user UUID:', userError);
        return false;
      }
      
      const userUuid = userData.user.id;
      console.log(`🔑 Using user UUID: ${userUuid}`);

      const registration = await navigator.serviceWorker.ready;

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

      const subscriptionJson = subscription.toJSON();
      
      const { error } = await supabase
        .from('user_device_tokens')
        .upsert({
          user_id: userUuid,
          subscription_data: subscriptionJson,
          endpoint: subscriptionJson.endpoint,
          p256dh: subscriptionJson.keys?.p256dh,
          auth: subscriptionJson.keys?.auth,
          username: username,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;
      console.log("✅ VAPID Push Subscription safely stored in Supabase.");
      return true;

    } catch (err) {
      console.error("Failed to sync push configurations:", err);
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
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          await supabase
            .from('user_device_tokens')
            .delete()
            .eq('user_id', userData.user.id);
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

  async function sendVapidNotificationsToOfflineStudents(senderId, messageContent, channelId) {
    try {
      if (!CONFIG.PUSH || !CONFIG.PUSH.VAPID_PUBLIC_KEY) {
        console.log('Push notifications disabled - no VAPID key');
        return;
      }

      const { data: members, error: memberError } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MEMBERS)
        .select('username')
        .eq('channel_id', channelId)
        .neq('username', senderId);

      if (memberError) {
        console.error("Failed to look up channel members:", memberError.message);
        return;
      }

      const memberUsernames = (members || []).map((m) => m.username);
      if (!memberUsernames.length) {
        console.log('No other channel members to notify');
        return;
      }

      const { data: offlineStudents, error: queryError } = await supabase
        .from('user_device_tokens')
        .select('username, subscription_data, endpoint')
        .in('username', memberUsernames);

      if (queryError) {
        console.error("Failed to lookup student push destinations:", queryError.message);
        return;
      }

      if (!offlineStudents || offlineStudents.length === 0) {
        console.log('No offline students with VAPID subscriptions found');
        return;
      }

      const senderName = getDisplayName(senderId);
      const channelName = state.currentChannel?.name || 'Class';

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
  // 5f2. SAFE MESSAGE MERGING (NEW)
  // ============================================================
  function mergeMessagesSafely(newMessages) {
    // Prevent concurrent merges
    if (state.isMerging) {
      console.log('⏳ Merge already in progress, skipping');
      return;
    }
    
    state.isMerging = true;
    
    try {
      // If newMessages is not an array, make it one
      const messagesToAdd = Array.isArray(newMessages) ? newMessages : [newMessages];
      
      // Create a Map for deduplication (key by message ID)
      const messageMap = new Map();
      
      // Add existing messages first
      state.messages.forEach(msg => {
        messageMap.set(msg.id, msg);
      });
      
      // Add/overwrite with new messages
      messagesToAdd.forEach(msg => {
        if (msg && msg.id) {
          // If this is a temporary message, check if we have a real one
          if (msg.id.startsWith('temp_') || msg.isPending) {
            // Check if a real version exists
            const realVersion = messagesToAdd.find(m => 
              !m.isPending && m.client_id === msg.client_id
            );
            if (realVersion) {
              // Replace temp with real
              messageMap.set(realVersion.id, realVersion);
              messageMap.delete(msg.id);
              return;
            }
          }
          messageMap.set(msg.id, msg);
        }
      });
      
      // Convert Map values back to array
      const mergedMessages = Array.from(messageMap.values());
      
      // Sort by created_at
      mergedMessages.sort((a, b) => {
        const dateA = new Date(a.created_at || a.createdAt || 0);
        const dateB = new Date(b.created_at || b.createdAt || 0);
        return dateA - dateB;
      });
      
      // Update state
      state.messages = mergedMessages;
      
      // Update cache if we have a channel
      if (state.currentChannel) {
        saveCachedMessages(state.currentChannel.id, mergedMessages);
      }
      
      // Update UI
      renderMessages();
      
      console.log(`✅ Merged ${messagesToAdd.length} messages, total: ${mergedMessages.length}`);
      
    } catch (error) {
      console.error('Error merging messages:', error);
    } finally {
      state.isMerging = false;
    }
  }

  // ============================================================
  // 5g. INACTIVITY DISCONNECTION MANAGEMENT
  // ============================================================
  function setupInactivityManager() {
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }

    function resetInactivityTimer() {
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
      }
      
      if (state.messagesSubscription && state.messagesSubscription.state === 'closed') {
        console.log("🔄 User active! Reconnecting...");
        if (state.currentChannel) {
          subscribeToMessages(state.currentChannel.id);
        }
      }

      state.inactivityTimer = setTimeout(() => {
        if (state.messagesSubscription && state.isTabFocused) {
          console.log("⏰ 5 min idle. Disconnecting to save resources.");
          supabase.removeChannel(state.messagesSubscription);
          state.messagesSubscription = null;
          state.isChannelActive = false;
          console.log("💤 Channel disconnected. Will reconnect when active.");
        }
      }, state.INACTIVITY_TIMEOUT);
    }

    resetInactivityTimer();

    const activityEvents = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer);
    });

    state._inactivityCleanup = function() {
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
      }
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };

    console.log('⏱️ Inactivity manager initialized');
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
    if (state.tabChannel) {
      supabase.removeChannel(state.tabChannel);
      state.tabChannel = null;
    }

    if (state.currentChannel) {
      state.tabChannel = supabase.channel(`tab-focus-${state.currentChannel.id}`);
      state.tabChannel.subscribe();
    }

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log("🔴 Tab hidden. Dropping connection to save free tier slots.");
        state.isTabFocused = false;
        
        if (state.messagesSubscription) {
          supabase.removeChannel(state.messagesSubscription);
          state.messagesSubscription = null;
          state.isChannelActive = false;
        }
        
        if (state.tabChannel) {
          await supabase.removeChannel(state.tabChannel);
          state.tabChannel = null;
        }
      } else {
        console.log("🟢 Tab focused again! Reconnecting...");
        state.isTabFocused = true;
        
        if (!state.tabChannel && state.currentChannel) {
          state.tabChannel = supabase.channel(`tab-focus-${state.currentChannel.id}`);
          state.tabChannel.subscribe();
        }
        
        if (!state.messagesSubscription && state.currentChannel) {
          subscribeToMessages(state.currentChannel.id);
        }
        
        if (state.currentChannel && !state.isRefreshing) {
          state.isRefreshing = true;
          console.log("📥 Catching up on messages missed while tab was inactive...");
          try {
            await fetchFreshHistory(state.currentChannel.id);
            console.log("✅ Catch-up complete!");
          } catch (e) {
            console.warn('Catch-up failed:', e);
          } finally {
            state.isRefreshing = false;
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

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

    console.warn(`No role found in role cache for "${username}" — defaulting to student.`);
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
  // 6b. SCREEN NAVIGATION
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
    const keepChatsVisible = isDesktop && CHAT_GROUP_SCREENS.includes(name);

    Object.entries(SCREEN_EL).forEach(([key, el]) => {
      if (!el) return;
      
      let shouldBeVisible = false;
      
      if (key === name) {
        shouldBeVisible = true;
      } else if (isDesktop && key === 'chats' && CHAT_GROUP_SCREENS.includes(name)) {
        shouldBeVisible = true;
      } else if (isDesktop && keepChatsVisible && key === 'chats') {
        shouldBeVisible = true;
      } else if (isDesktop && key === 'chatDetail' && name === 'chats') {
        shouldBeVisible = true;
      }
      
      if (shouldBeVisible) {
        el.classList.remove('hidden');
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    });
    
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
          `"${username}" already had an account.\n\n` +
          `Role set to ${role}, but the password shown here was NOT applied.`
        );
      } else if (signUpData && !signUpData.session) {
        alert(
          `Account created for "${username}" (${role}).\n\n` +
          `Turn off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email.`
        );
      } else {
        alert(`Account created for "${username}" (${role}).\n\nPassword: ${password}`);
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
  async function createChannel(name) {
    if (!name || !name.trim()) return;
    
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.CHANNELS)
      .insert({ 
        name: name.trim(),
        created_by: state.currentUser?.username,
        created_at: new Date().toISOString()
      })
      .select();
      
    if (error) {
      alert('Could not create channel: ' + error.message);
      return;
    }
    
    await renderChannels();
    if (data && data[0]) {
      selectChannel(data[0]);
    }
  }

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

  // ============================================================
  // 8d. SAFE FETCH FRESH HISTORY (NEW)
  // ============================================================
  async function fetchFreshHistory(channelId) {
    if (!channelId) return;
    
    try {
      console.log('🔄 Fetching fresh message history...');
      
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        console.warn('Failed to fetch fresh history:', error);
        return;
      }

      if (data && data.length > 0) {
        // Use the safe merge function
        mergeMessagesSafely(data);
        console.log(`✅ Fetched ${data.length} fresh messages`);
      }
      
      updateProfileScreen();
      
    } catch (error) {
      console.error('Error fetching fresh history:', error);
    }
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
  // 8f. GROUP MEMBER MANAGEMENT
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

  async function callAdminUpdateUserFunction(targetUsername, { newEmail, newPassword } = {}) {
    if (!newEmail && !newPassword) return { error: null };
    const { data, error } = await supabase.functions.invoke('admin-update-user', {
      body: {
        targetUsername,
        newEmail: newEmail || undefined,
        newPassword: newPassword || undefined,
      },
    });
    if (error) return { error };
    if (data && data.error) return { error: new Error(data.error) };
    return { error: null };
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
        
        const { error: authError } = await callAdminUpdateUserFunction(username, {
          newEmail: generateEmail(newUsername),
        });
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

        if (newPassword && newPassword.length > 0) {
          const { error: passError } = await callAdminUpdateUserFunction(newUsername, { newPassword });
          if (passError) throw passError;
        }
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

        if (newPassword && newPassword.length > 0) {
          const { error: passError } = await callAdminUpdateUserFunction(username, { newPassword });
          if (passError) throw passError;
        }
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

  async function callAdminDeleteUserFunction(targetUsername) {
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { targetUsername },
    });
    if (error) return { error };
    if (data && data.error) return { error: new Error(data.error) };
    return { error: null };
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
      
      const { error: authError } = await callAdminDeleteUserFunction(username);
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
  // 8g. REALTIME MESSAGE SYNC (UPDATED WITH SAFE MERGE)
  // ============================================================

  function subscribeToMessages(channelId) {
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
        const newMessage = payload.new;
        
        // Check if message already exists
        if (state.messages.some(msg => msg.id === newMessage.id)) {
          console.log(`✋ Message ${newMessage.id} already exists, skipping`);
          return;
        }
        
        // Check if this is replacing an optimistic message
        if (newMessage.client_id) {
          const optimisticIndex = state.messages.findIndex(m => 
            m.client_id === newMessage.client_id || 
            (m.isPending && m.id && m.id.includes('temp_'))
          );
          
          if (optimisticIndex !== -1) {
            console.log(`✅ Replacing optimistic message (clientId: ${newMessage.client_id})`);
            state.messages[optimisticIndex] = newMessage;
            delete state.messages[optimisticIndex].isPending;
            renderMessages();
            saveCachedMessages(channelId, state.messages);
            
            // Play sound for messages from others
            if (newMessage.username !== state.currentUser?.username) {
              playNotifySound();
              markDelivered(channelId);
              markSeen(channelId);
            }
            return;
          }
        }
        
        // Use safe merge for new message
        console.log(`📥 Adding new message (ID: ${newMessage.id})`);
        mergeMessagesSafely(newMessage);
        
        // Refresh unread badges
        refreshUnreadBadges();
        
        // Play sound for messages from others
        if (newMessage.username !== state.currentUser?.username) {
          playNotifySound();
          markDelivered(channelId);
          markSeen(channelId);
        }
        
        // Reset inactivity timer
        if (state.inactivityTimer) {
          clearTimeout(state.inactivityTimer);
          state.inactivityTimer = null;
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
          saveCachedMessages(channelId, state.messages);
        }
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: CONFIG.SUPABASE.TABLES.MESSAGES, 
        filter: `channel_id=eq.${channelId}` 
      }, (payload) => {
        const initialCount = state.messages.length;
        state.messages = state.messages.filter((m) => m.id !== payload.old.id);
        
        if (state.messages.length < initialCount) {
          console.log(`🗑️ Message deleted (ID: ${payload.old.id})`);
          renderMessages();
          saveCachedMessages(channelId, state.messages);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          state.isChannelActive = true;
          console.log(`✅ Subscribed to channel ${channelId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Channel error for ${channelId}`);
          state.isChannelActive = false;
        }
      });
  }

  async function loadMessages(channelId) {
    if (!channelId) return;

    try {
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        console.warn('Messages fallback:', error);
        if (state.messages.length === 0) {
          state.messages = [{ id: '1', content: 'Welcome to the channel!', username: 'system', created_at: Date.now() }];
        }
        renderMessages();
        return;
      }

      if (data && data.length > 0) {
        // Use safe merge instead of direct assignment
        mergeMessagesSafely(data);
        console.log(`📥 Loaded ${data.length} messages from Supabase`);
      } else if (state.messages.length === 0) {
        state.messages = [];
        renderMessages();
      }
      
      updateProfileScreen();
    } catch (error) {
      console.error('Error loading messages:', error);
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
          <a href="${escapeHtml(msg.file_url)}" target="_blank" rel="noopener" class="msg-file">
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


  // ============================================================
  // 9. SEND MESSAGE (UPDATED WITH SAFE MERGE)
  // ============================================================
  async function sendMessage(content, file) {
    if (!state.currentChannel || !state.currentUser) { 
      alert('Please select a channel first.'); 
      return; 
    }

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
        alert(`File upload failed: ${e.message}`);
        return;
      }
    }

    const replyPayload = state.replyingTo
      ? { 
          reply_to: state.replyingTo.id, 
          reply_username: state.replyingTo.username, 
          reply_content: state.replyingTo.content || (state.replyingTo.file_url ? '📎 Attached file' : '') 
        }
      : {};

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newMessage = {
      channel_id: state.currentChannel.id,
      username: state.currentUser.username,
      content: content || '',
      file_url: fileUrl,
      client_id: clientId,
      ...replyPayload,
    };

    const tempId = `temp_${clientId}`;
    const optimisticMessage = { 
      id: tempId, 
      ...newMessage,
      created_at: new Date().toISOString(),
      isPending: true 
    };
    
    // Add optimistic message using safe merge
    mergeMessagesSafely(optimisticMessage);
    console.log(`✉️ Message added (optimistic, clientId: ${clientId})`);

    const { error, data } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .insert(newMessage)
      .select();

    if (error) {
      console.error('Send error:', error);
      alert('Failed to send message.');
      // Remove the optimistic message
      state.messages = state.messages.filter((m) => m.id !== tempId);
      renderMessages();
      console.log('❌ Message rolled back');
    } else if (data && data[0]) {
      const realMessage = data[0];
      
      // Replace the optimistic message with the real one
      const index = state.messages.findIndex((m) => m.id === tempId);
      if (index !== -1) {
        state.messages[index] = realMessage;
        delete state.messages[index].isPending;
        renderMessages();
        console.log(`✅ Message replaced: ${tempId} → ${realMessage.id}`);
      } else {
        // If temp message wasn't found, add the real one
        mergeMessagesSafely(realMessage);
      }
      
      // Send push notifications
      sendVapidNotificationsToOfflineStudents(
        state.currentUser.username,
        content || '📎 New attachment',
        state.currentChannel.id
      );

      state.channelPreviews = await loadChannelPreviews(allChannels.map((c) => c.id));
      renderChatList(allChannels);
      
      if (state.currentChannel) {
        saveCachedMessages(state.currentChannel.id, state.messages);
      }
    }

    state.replyingTo = null;
    DOM.replyPreview.classList.add('hidden');
  }

  async function selectChannel(channel) {
    state.currentChannel = channel;
    updateChatEmptyState();
    highlightActiveChatRow();
    
    const cachedMessages = getCachedMessages(channel.id);
    if (cachedMessages) {
      state.messages = cachedMessages;
      renderMessages();
      console.log(`⚡ Instant load: ${cachedMessages.length} messages from cache`);
    }
    
    await loadMessages(channel.id);
    await loadMembers(channel.id);
    subscribeToMessages(channel.id);
    await markDelivered(channel.id);
    await markSeen(channel.id);
    await loadSchedule(channel.id);
    subscribeToSchedule(channel.id);
    updateChatDetailHeader();
    updateProfileScreen();
    
    setupInactivityManager();
    setupTabFocusManager();
  }

  // ============================================================
  // 10. STATUS UPDATES (unchanged)
  // ============================================================
  // ... (status updates code remains the same) ...

  // ============================================================
  // 11. VIDEO / LIVEKIT (unchanged)
  // ============================================================
  // ... (video code remains the same) ...

  // ============================================================
  // 12. ADMIN FUNCTIONS (unchanged)
  // ============================================================
  // ... (admin code remains the same) ...

  // ============================================================
  // 13. PROFILE & SHARED MEDIA SCREEN (unchanged)
  // ============================================================
  // ... (profile code remains the same) ...

  // ============================================================
  // 14. LOGIN FLOW (unchanged)
  // ============================================================
  // ... (login code remains the same) ...

  // ============================================================
  // 15. EVENT BINDINGS (unchanged)
  // ============================================================
  // ... (event bindings remain the same) ...

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
