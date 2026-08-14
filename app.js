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
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'orbit-admin-auth-noop',
      }
    }
  );

  // FIX: If this device's session becomes invalid — e.g. an admin deleted
  // this account (auth.admin.deleteUser revokes the refresh token), the
  // password/role was reset elsewhere, or the user signed out in another
  // tab — supabase-js will fail its automatic token refresh and emit
  // SIGNED_OUT internally. Previously nothing listened for that, so the
  // deleted user's tab kept showing the dashboard with a dead session
  // (every subsequent request just silently failed). Now we react to it
  // immediately and force a clean logout with an explanation.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && state.currentUser) {
      forceSignOut('Your session has ended. Please sign in again.');
    }
  });

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
    connectionWatchdog: null,
    INACTIVITY_TIMEOUT: 300000,
    isChannelActive: false,
    isTabFocused: true,
    tabChannel: null,
    isRefreshing: false,
    isMerging: false,
    messageReads: new Map(),
    readsSubscription: null,
    // FIX: Track active lightbox overlay for back button handling
    activeLightbox: null,
    // FIX: Track this user's own membership row ids (channel_id -> members.id)
    // so we can detect exactly when THEY are removed from a group via realtime,
    // and a periodic watchdog handle to detect the account itself being deleted.
    myMemberships: new Map(),
    sessionWatchdog: null,
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

    screenChats: $('screenChats'),
    screenUpdates: $('screenUpdates'),
    screenSettings: $('screenSettings'),
    screenChatDetail: $('screenChatDetail'),
    screenMembers: $('screenMembers'),
    screenProfile: $('screenProfile'),
    bottomNav: $('bottomNav'),
    navChatsBadge: $('navChatsBadge'),

    chatSearchInput: $('chatSearchInput'),
    channelList: $('channelList'),
    brandHeader: $('brandHeader'),
    channelSelectHeader: $('channelSelectHeader'),
    channelSelectCloseBtn: $('channelSelectCloseBtn'),
    channelSelectCount: $('channelSelectCount'),
    channelSelectRenameBtn: $('channelSelectRenameBtn'),
    channelSelectDeleteBtn: $('channelSelectDeleteBtn'),

    userBadge: $('userBadge'),
    statusTray: $('statusTray'),
    statusPlaceholder: $('statusPlaceholder'),
    statusAddBtn: $('statusAddBtn'),
    postStatusBtn: $('postStatusBtn'),
    postStatusFab: $('postStatusFab'),
    backFromUpdates: $('backFromUpdates'),

    settingsAvatar: $('settingsAvatar'),
    settingsName: $('settingsName'),
    settingsEmail: $('settingsEmail'),
    settingsDisplayName: $('settingsDisplayName'),
    notifToggle: $('notifToggle'),
    darkToggle: $('darkToggle'),
    adminSettingsCard: $('adminSettingsCard'),
    createChannelBtn: $('createChannelBtn'),
    signOutBtn: $('signOutBtn'),

    adminCreateUserCard: $('adminCreateUserCard'),
    adminUserManagementCard: $('adminUserManagementCard'),
    newUserUsername: $('newUserUsername'),
    newUserDisplayName: $('newUserDisplayName'),
    newUserRole: $('newUserRole'),
    newUserPassword: $('newUserPassword'),
    generatePasswordBtn: $('generatePasswordBtn'),
    createUserBtn: $('createUserBtn'),
    
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

    backFromChat: $('backFromChat'),
    chatDetailHeader: document.querySelector('.chat-detail-header'),
    chatDetailTitleBtn: $('chatDetailTitleBtn'),
    chatDetailName: $('chatDetailName'),
    chatDetailSub: $('chatDetailSub'),
    msgSelectHeader: $('msgSelectHeader'),
    msgSelectCloseBtn: $('msgSelectCloseBtn'),
    msgSelectCount: $('msgSelectCount'),
    msgSelectReplyBtn: $('msgSelectReplyBtn'),
    msgSelectForwardBtn: $('msgSelectForwardBtn'),
    msgSelectCopyBtn: $('msgSelectCopyBtn'),
    msgSelectDeleteBtn: $('msgSelectDeleteBtn'),
    msgSelectInfoBtn: $('msgSelectInfoBtn'),
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

    backFromMembers: $('backFromMembers'),
    memberSearchInput: $('memberSearchInput'),
    adminAddMemberRow: $('adminAddMemberRow'),
    assignStudentInput: $('assignStudentInput'),
    registeredUsersList: $('registeredUsersList'),
    assignRoleSelect: $('assignRoleSelect'),
    assignStudentBtn: $('assignStudentBtn'),
    channelMembersList: $('channelMembersList'),
    alphaIndex: $('alphaIndex'),

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
    
    adminDescEdit: $('adminDescEdit'),
    channelDescInput: $('channelDescInput'),
    updateDescBtn: $('updateDescBtn'),

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

  function unlockAudioContext() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ignore — playNotifySound() will retry and log if needed */ }
    ['click', 'keydown', 'touchstart'].forEach((evt) => window.removeEventListener(evt, unlockAudioContext));
  }
  ['click', 'keydown', 'touchstart'].forEach((evt) => window.addEventListener(evt, unlockAudioContext, { once: false }));

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
      console.warn('Role cache unavailable:', error);
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

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function formatDayLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildDayDivider(dk, label) {
    const el = document.createElement('div');
    el.className = 'day-divider';
    el.dataset.day = dk;
    el.innerHTML = `<span class="day-divider-label">${escapeHtml(label)}</span>`;
    return el;
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

  function getFileNameFromUrl(url) {
    if (!url) return 'File';
    try {
      const path = url.split('?')[0];
      const last = path.substring(path.lastIndexOf('/') + 1);
      const decoded = decodeURIComponent(last);
      return decoded.replace(/^\d{10,}-/, '') || 'File';
    } catch {
      return 'File';
    }
  }

  function getFileExt(name) {
    const match = /\.([a-z0-9]+)$/i.exec(name || '');
    return match ? match[1].toUpperCase() : '';
  }

  function getFileIconClass(ext) {
    const e = (ext || '').toLowerCase();
    if (e === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx'].includes(e)) return 'fa-file-word';
    if (['xls', 'xlsx', 'csv'].includes(e)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(e)) return 'fa-file-powerpoint';
    if (['zip', 'rar', '7z'].includes(e)) return 'fa-file-zipper';
    if (['txt', 'md'].includes(e)) return 'fa-file-lines';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'fa-file-audio';
    return 'fa-file';
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
  // 6a. REALTIME CONNECTION STATUS BANNER (NEW)
  // ============================================================
  // FIX: "chat doesn't update live" / "unread numbers don't clear" almost
  // always trace back to Realtime silently failing to deliver events — most
  // commonly because Realtime replication isn't switched on for a table in
  // the Supabase dashboard (Database → Replication), or a Row Level
  // Security policy is quietly blocking the SELECT/INSERT Realtime needs.
  // Previously the ONLY sign of this was a console.warn — completely
  // invisible to the person actually using the app, who just sees "it
  // doesn't work" with nothing to go on. This adds a small, auto-clearing
  // banner that appears once a realtime channel has failed to (re)connect
  // repeatedly, and disappears the moment it recovers. It is purely
  // additive: it builds its own DOM node with inline styles at runtime, so
  // it cannot depend on (or break) anything in index.html/styles.css, and
  // it does not alter any existing reconnect/badge/message logic — it only
  // observes the outcomes those already report.
  const connectionIssues = new Set();
  let connectionBannerEl = null;

  function setConnectionIssue(key, hasIssue) {
    const had = connectionIssues.has(key);
    if (hasIssue) connectionIssues.add(key);
    else connectionIssues.delete(key);
    if (had !== connectionIssues.has(key)) renderConnectionBanner();
  }

  function renderConnectionBanner() {
    if (connectionIssues.size === 0) {
      if (connectionBannerEl) {
        connectionBannerEl.remove();
        connectionBannerEl = null;
      }
      return;
    }
    if (!connectionBannerEl) {
      connectionBannerEl = document.createElement('div');
      connectionBannerEl.setAttribute('role', 'status');
      connectionBannerEl.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
        'z-index:99999', 'max-width:min(92vw,440px)',
        'background:#E24C43', 'color:#fff', 'font:600 12.5px/1.4 -apple-system,system-ui,sans-serif',
        'padding:10px 14px', 'border-radius:12px',
        'box-shadow:0 8px 24px -6px rgba(0,0,0,0.35)',
        'display:flex', 'align-items:center', 'gap:10px',
      ].join(';');
      document.body.appendChild(connectionBannerEl);
    }
    connectionBannerEl.innerHTML =
      '<span style="flex:1;">⚠️ Live updates aren’t connecting — new messages and unread counts may be delayed. Try refreshing the page.</span>' +
      '<button type="button" aria-label="Dismiss" style="flex-shrink:0;background:rgba(255,255,255,0.18);border:none;color:#fff;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:13px;line-height:1;">✕</button>';
    connectionBannerEl.querySelector('button').addEventListener('click', () => {
      connectionBannerEl.remove();
      connectionBannerEl = null;
    });
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

  // FIX: "is this channel actually being looked at right now" — used to
  // decide whether an incoming/backlogged message is allowed to be marked
  // delivered/seen (which clears its unread badge). Being `state.currentChannel`
  // is NOT enough: that flag stays set after the user backs out to the chat
  // list (or on the very first auto-selected channel on load), so relying on
  // it alone silently marked chats "read" while nobody was looking at them —
  // that's why unread numbers were disappearing for chats that were never
  // opened. On mobile the chat is only visible while the chatDetail screen is
  // showing; on desktop the chat pane stays visible alongside the list on any
  // chat-group screen (see goToScreen above), so that counts as visible too.
  function isChatDetailVisible(channelId) {
    if (!state.currentChannel || String(state.currentChannel.id) !== String(channelId)) return false;
    if (isDesktopLayout()) {
      return CHAT_GROUP_SCREENS.includes(state.currentScreen);
    }
    return state.currentScreen === 'chatDetail';
  }

  function updateChatEmptyState() {
    if (!DOM.screenChatDetail) return;
    DOM.screenChatDetail.classList.toggle('no-chat', !state.currentChannel);
  }

  function goToScreen(name) {
    if (name !== 'chatDetail' && typeof exitMessageSelection === 'function') exitMessageSelection();
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

    if (name === 'settings' && typeof syncNotificationToggleState === 'function') {
      syncNotificationToggleState();
    }

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

  // FIX: Close lightbox when back button is pressed
  function closeLightboxIfOpen() {
    if (state.activeLightbox) {
      state.activeLightbox.remove();
      state.activeLightbox = null;
      // Update history to current screen
      if (state.currentScreen && history.replaceState) {
        history.replaceState({ orbitScreen: state.currentScreen }, '', '#' + state.currentScreen);
      }
      return true;
    }
    return false;
  }

  function handleBackNavigation(event) {
    // FIX: Check lightbox first
    if (closeLightboxIfOpen()) {
      return;
    }
    
    // Existing status modal check
    if (DOM.statusModal && !DOM.statusModal.classList.contains('hidden')) {
      closeStatusViewer();
      if (state.currentScreen) pushScreenState(state.currentScreen);
      return;
    }
    
    // Existing video container check
    if (DOM.videoContainer && !DOM.videoContainer.classList.contains('hidden')) {
      DOM.videoContainer.classList.add('hidden');
      DOM.videoIframe.src = '';
      state.videoActive = false;
      if (state.currentScreen) pushScreenState(state.currentScreen);
      return;
    }

    const targetScreen = event.state && event.state.orbitScreen;

    if (targetScreen && SCREEN_EL[targetScreen]) {
      isBackNavigation = true;
      const idx = screenHistory.lastIndexOf(targetScreen);
      screenHistory = idx !== -1 ? screenHistory.slice(0, idx + 1) : [targetScreen];
      goToScreen(targetScreen);
      isBackNavigation = false;
      return;
    }

    // FIX: If no overlay and no screen state, go to chats (home)
    if (state.currentScreen && state.currentScreen !== 'chats') {
      isBackNavigation = true;
      goToScreen('chats');
      isBackNavigation = false;
    }
  }

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
        throw new Error('This account is waiting on an email confirmation. Ask your admin to turn off "Confirm email" in Supabase.');
      }
      throw new Error('Incorrect School ID or password.');
    }
  }

  // ============================================================
  // 8. CHANNELS (CRUD)
  // ============================================================
  async function createChannel(name) {
    if (!name || !name.trim()) return;

    const basePayload = {
      name: name.trim(),
      created_by: state.currentUser?.username,
      created_at: new Date().toISOString()
    };

    let { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.CHANNELS)
      .insert(basePayload)
      .select();

    if (error && /created_by.*schema cache/i.test(error.message || '')) {
      console.warn('channels.created_by column missing — retrying insert without it.');
      const { created_by, ...fallbackPayload } = basePayload;
      ({ data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.CHANNELS)
        .insert(fallbackPayload)
        .select());
    }

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
      state.myMemberships = new Map();
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
      .select('id, channel_id')
      .eq('username', state.currentUser.username);

    if (memberError) {
      console.warn('Membership lookup failed:', memberError);
      return [];
    }

    // FIX: remember which members-row id corresponds to which channel for
    // THIS user, so a realtime DELETE on the members table can be matched
    // precisely to "was I the one removed?" rather than guessing.
    state.myMemberships = new Map((memberships || []).map((m) => [String(m.channel_id), m.id]));

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
      // FIX: this auto-pick of the first channel is here so a desktop split
      // view (chat list + chat pane side-by-side) has something to show in
      // the pane on load — on desktop that pane really is visible, so
      // marking it delivered/seen is correct. On mobile there is no chat
      // pane on screen yet (the user is looking at the chat list), so this
      // must NOT mark it as read — that was the cause of a chat's unread
      // number disappearing before it was ever tapped open.
      selectChannel(channels[0], { markSeenNow: isDesktopLayout() });
    }
  }

  function renderChatList(channels) {
    exitChannelSelection();
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
      `;
      if (state.isAdmin) {
        row.addEventListener('touchstart', () => startChannelLongPress(row, ch), { passive: true });
        ['touchend', 'touchmove', 'touchcancel'].forEach((evt) => {
          row.addEventListener(evt, clearChannelLongPressTimer);
        });
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          selectChannelForActions(row, ch);
        });
      }
      row.addEventListener('pointerup', (e) => {
        if (e.button === 2) return;
        if (channelLongPressFired) { channelLongPressFired = false; return; }
        openChannel(ch);
      });
      DOM.channelList.appendChild(row);
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
    requestAnimationFrame(scrollToBottom);
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
      teardownMessagesSubscription();
    }
    await renderChannels();
  }

  let channelLongPressTimer = null;
  let channelLongPressFired = false;
  let selectedChannel = null;

  function clearChannelLongPressTimer() {
    if (channelLongPressTimer) { clearTimeout(channelLongPressTimer); channelLongPressTimer = null; }
  }

  function startChannelLongPress(row, ch) {
    clearChannelLongPressTimer();
    channelLongPressTimer = setTimeout(() => {
      channelLongPressFired = true;
      selectChannelForActions(row, ch);
    }, 500);
  }

  function selectChannelForActions(row, ch) {
    exitChannelSelection();
    selectedChannel = ch;
    row.classList.add('active');

    if (DOM.brandHeader) DOM.brandHeader.classList.add('hidden');
    if (DOM.channelSelectHeader) DOM.channelSelectHeader.classList.remove('hidden');
    if (DOM.channelSelectCount) DOM.channelSelectCount.textContent = ch.name;
  }

  function exitChannelSelection() {
    if (!selectedChannel) return;
    selectedChannel = null;

    if (DOM.channelSelectHeader) DOM.channelSelectHeader.classList.add('hidden');
    if (DOM.brandHeader) DOM.brandHeader.classList.remove('hidden');
    highlightActiveChatRow();
  }

  if (DOM.channelSelectCloseBtn) DOM.channelSelectCloseBtn.addEventListener('click', exitChannelSelection);

  if (DOM.channelSelectRenameBtn) {
    DOM.channelSelectRenameBtn.addEventListener('click', () => {
      const ch = selectedChannel;
      exitChannelSelection();
      if (ch) renameChannel(ch.id);
    });
  }

  if (DOM.channelSelectDeleteBtn) {
    DOM.channelSelectDeleteBtn.addEventListener('click', () => {
      const ch = selectedChannel;
      exitChannelSelection();
      if (ch) deleteChannel(ch.id);
    });
  }

  // ============================================================
  // UNREAD BADGE REFRESH (FIXED)
  // ============================================================
  async function refreshUnreadBadges() {
    if (!state.currentUser) return;

    try {
      // FIX: scope to channels the user can actually see/open.
      // Previously this queried the messages table with no channel filter
      // at all, so it counted messages from channels the user isn't even
      // a member of (not in allChannels). Those messages can never be
      // opened/marked seen, so part of the badge total was permanently
      // stuck — the badge could never reach 0 no matter how many real
      // messages the user read. allChannels already reflects exactly the
      // channels this user has access to (see loadChannels/renderChannels).
      const channelIds = allChannels.map((c) => c.id);

      if (!channelIds.length) {
        state.unreadByChannel = {};
        DOM.navChatsBadge.textContent = '0';
        DOM.navChatsBadge.classList.add('hidden');
        renderChatList(allChannels);
        return;
      }

      // Get all messages from others that are not deleted, restricted to
      // channels this user actually belongs to.
      const { data: fromOthers, error: msgError } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('id, channel_id')
        .in('channel_id', channelIds)
        .neq('username', state.currentUser.username)
        .is('deleted_at', null);

      if (msgError) {
        console.warn('Failed to fetch messages for badge:', msgError);
        // FIX: a failed query here (commonly an RLS SELECT policy blocking
        // it) previously just bailed out silently, leaving the unread badge
        // stuck wherever it last was — indistinguishable from "the badge
        // never clears". Surface it instead of hiding it. See
        // setConnectionIssue near the top of the file.
        setConnectionIssue('badges', true);
        return;
      }
      setConnectionIssue('badges', false);

      // Get user's read receipts
      const { data: myReads, error: readsError } = await supabase
        .from('message_reads')
        .select('message_id')
        .eq('username', state.currentUser.username);

      if (readsError) {
        console.warn('Failed to fetch read receipts for badge:', readsError);
        setConnectionIssue('badges', true);
        return;
      }
      setConnectionIssue('badges', false);

      const readIds = new Set((myReads || []).map((r) => r.message_id));
      const counts = {};
      
      (fromOthers || []).forEach((row) => {
        if (!readIds.has(row.id)) {
          counts[row.channel_id] = (counts[row.channel_id] || 0) + 1;
        }
      });
      
      state.unreadByChannel = counts;

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      DOM.navChatsBadge.textContent = total > 99 ? '99+' : String(total);
      DOM.navChatsBadge.classList.toggle('hidden', total === 0);

      // FIX: whenever the unread count changes there is, by definition, a
      // channel whose "last message" may have changed too — but this
      // function had no idea what that message actually was, so it just
      // re-rendered the list with whatever state.channelPreviews already
      // held. That silently decoupled the two: the badge (computed fresh
      // from the DB right here, every time) always ended up correct, while
      // the preview text stayed however-stale-it-was until some other,
      // separate code path happened to refresh it. Since this function is
      // the one thing proven to run reliably whenever a message arrives
      // (it's what was updating the badge live), pull fresh previews here
      // too so the two can never show inconsistent results again.
      state.channelPreviews = await loadChannelPreviews(channelIds);

      // Update the chat list to show/hide unread badges
      renderChatList(allChannels);

      console.log(`🔔 Badge updated: ${total} unread messages`);
    } catch (e) {
      console.warn('Error refreshing unread badges:', e);
    }
  }

  // ============================================================
  // GLOBAL CHANNEL-LIST REALTIME
  // ============================================================
  let channelListSubscription = null;

  function isKnownChannelId(channelId) {
    return allChannels.some((c) => String(c.id) === String(channelId));
  }

  function handleGlobalMessageInsert(msg) {
    if (!msg || !isKnownChannelId(msg.channel_id)) return;

    const existing = state.channelPreviews[msg.channel_id];
    if (!existing || new Date(msg.created_at) >= new Date(existing.created_at || 0)) {
      state.channelPreviews[msg.channel_id] = msg;
    }

    // FIX: was `state.currentChannel?.id === msg.channel_id`, which stays
    // true after the user backs out of a chat back to the list (currentChannel
    // is never cleared on "back"). That made this incoming-message counter
    // skip incrementing the badge for a chat that was actually closed on
    // screen, so its unread count silently stayed at 0. Use the same
    // "genuinely on screen right now" check the per-channel handler uses.
    const isOpenChannel = isChatDetailVisible(msg.channel_id);
    if (!isOpenChannel && msg.username !== state.currentUser?.username) {
      state.unreadByChannel[msg.channel_id] = (state.unreadByChannel[msg.channel_id] || 0) + 1;
      const total = Object.values(state.unreadByChannel).reduce((a, b) => a + b, 0);
      DOM.navChatsBadge.textContent = total > 99 ? '99+' : String(total);
      DOM.navChatsBadge.classList.toggle('hidden', total === 0);
    }

    renderChatList(allChannels);
  }

  // FIX: When an admin removes this user from a group (members row delete),
  // that channel must disappear from their chat list immediately — not just
  // on next login/refresh — and if they currently have it open, they must
  // be kicked out of it right away rather than staying on a screen for a
  // group they no longer belong to.
  //
  // Pulled out of handleMembershipRemoved() so the same cleanup can also be
  // triggered from sendMessage()'s pre-send membership check below — that
  // path already knows the channel id, it doesn't need to reverse-lookup it
  // from a realtime payload.
  async function expelFromChannel(removedChannelId, { showAlert = true } = {}) {
    if (!removedChannelId) return;
    removedChannelId = String(removedChannelId);

    console.log(`🚪 Removed from channel ${removedChannelId}, updating UI.`);

    state.myMemberships.delete(removedChannelId);
    allChannels = allChannels.filter((c) => String(c.id) !== removedChannelId);
    delete state.unreadByChannel[removedChannelId];
    delete state.channelPreviews[removedChannelId];

    const wasOpen = state.currentChannel && String(state.currentChannel.id) === removedChannelId;
    if (wasOpen) {
      teardownMessagesSubscription();
      teardownReadsSubscription();
      if (scheduleSubscription) {
        supabase.removeChannel(scheduleSubscription);
        scheduleSubscription = null;
      }
      state.currentChannel = null;
      state.messages = [];
      state.currentMembers = [];
      goToScreen('chats');
      if (showAlert) alert('You were removed from this group.');
    }

    renderChatList(allChannels);
    await refreshUnreadBadges();
  }

  async function handleMembershipRemoved(oldRow) {
    if (!oldRow || !state.currentUser) return;

    // Match by the membership row id we recorded for this user (works
    // regardless of the table's REPLICA IDENTITY setting, since the primary
    // key is always present on delete payloads). Fall back to matching by
    // username if the row happens to include it (REPLICA IDENTITY FULL).
    let removedChannelId = null;
    for (const [channelId, membershipId] of state.myMemberships.entries()) {
      if (String(membershipId) === String(oldRow.id)) {
        removedChannelId = channelId;
        break;
      }
    }
    if (!removedChannelId && oldRow.username &&
        normalizeUsername(oldRow.username) === state.currentUser.username) {
      removedChannelId = String(oldRow.channel_id);
    }
    if (!removedChannelId) return; // not this user's membership — ignore

    await expelFromChannel(removedChannelId);
  }

  // FIX: Root cause of "a removed user can still send messages" — sendMessage()
  // previously trusted whatever state.currentChannel/state.currentUser already
  // held, with zero re-check against the members table. The only thing that
  // was supposed to stop a removed user from posting was the realtime DELETE
  // listener above (handleMembershipRemoved), but that listener can miss the
  // event entirely: the channel-list-updates subscription had no reconnect
  // logic (see subscribeToChannelListUpdates below) and would just log a
  // warning and stay dead after any CHANNEL_ERROR/TIMED_OUT/CLOSED, and even
  // a healthy subscription drops events while the tab is backgrounded/offline.
  // In both cases state.currentChannel silently stays set to a group the user
  // is no longer in, and the composer keeps working. This does a fresh,
  // authoritative membership check immediately before every send.
  //
  // Note: this is a UX safety net, not the real security boundary — that has
  // to live in a Supabase Row Level Security policy on the messages table's
  // INSERT rule (e.g. requiring EXISTS (SELECT 1 FROM members WHERE
  // channel_id = messages.channel_id AND username = <auth user>)), since a
  // client-side check can always be bypassed by calling the Supabase API
  // directly. Verify that policy is in place server-side alongside this fix.
  async function verifyChannelMembership(channelId) {
    try {
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MEMBERS)
        .select('id')
        .eq('channel_id', channelId)
        .eq('username', state.currentUser.username)
        .maybeSingle();

      if (error) {
        // Fail open on a transient/network error so flaky connectivity
        // doesn't block legitimate members from sending — the realtime
        // listener and the next successful check will still catch an
        // actual removal.
        console.warn('Membership verification failed, allowing send:', error);
        return true;
      }
      return !!data;
    } catch (e) {
      console.warn('Membership verification error, allowing send:', e);
      return true;
    }
  }

  // FIX: Realtime account-deletion detection. admin_delete_user removes this
  // user's row from user_roles (loadRoleCache() already reads this table for
  // everyone, and the client already assumes the row is gone post-delete —
  // see the `delete state.roleCache[username]` call in deleteUserAccount()).
  // Subscribing to DELETE on it means we don't have to wait for a token
  // refresh failure or the next watchdog poll — this fires the moment the
  // row is removed, typically within a second.
  function handleAccountDeleted(oldRow) {
    if (!oldRow || !state.currentUser) return;
    const deletedUsername = normalizeUsername(oldRow.username || '');
    if (deletedUsername && deletedUsername === state.currentUser.username) {
      console.warn('🚫 Realtime: this account was deleted, signing out.');
      forceSignOut('Your account has been removed. You have been signed out.');
    }
  }

  // FIX: This subscription is the only realtime signal that tells a user
  // "you were removed" or "your account was deleted" — but previously, once
  // it hit CHANNEL_ERROR/TIMED_OUT/CLOSED (a dropped websocket, a network
  // blip, a mobile tab coming back from the background), it just logged a
  // warning and stayed dead for the rest of the session. From that point on
  // an admin removing the user would go completely unnoticed client-side
  // until the next full reload. Mirrors the reconnect-with-backoff pattern
  // already used by subscribeToMessages()/scheduleReconnect() above.
  let channelListReconnectTimer = null;
  let channelListReconnectAttempts = 0;
  let channelListIntentionalTeardown = false;

  function scheduleChannelListReconnect() {
    if (channelListReconnectTimer || !state.currentUser) return;
    channelListReconnectAttempts += 1;
    const delay = Math.min(30000, 2000 * Math.pow(2, channelListReconnectAttempts - 1));
    console.log(`🔁 channel-list-updates reconnect attempt ${channelListReconnectAttempts} in ${delay / 1000}s...`);
    channelListReconnectTimer = setTimeout(() => {
      channelListReconnectTimer = null;
      if (state.currentUser) subscribeToChannelListUpdates();
    }, delay);
  }

  function subscribeToChannelListUpdates() {
    if (channelListReconnectTimer) {
      clearTimeout(channelListReconnectTimer);
      channelListReconnectTimer = null;
    }
    if (channelListSubscription) {
      channelListIntentionalTeardown = true;
      supabase.removeChannel(channelListSubscription);
      channelListIntentionalTeardown = false;
      channelListSubscription = null;
    }
    if (!state.currentUser) return;

    channelListSubscription = supabase
      .channel('channel-list-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: CONFIG.SUPABASE.TABLES.MESSAGES,
      }, (payload) => handleGlobalMessageInsert(payload.new))
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: CONFIG.SUPABASE.TABLES.MEMBERS,
      }, (payload) => handleMembershipRemoved(payload.old))
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'user_roles',
      }, (payload) => handleAccountDeleted(payload.old))
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          channelListReconnectAttempts = 0;
          setConnectionIssue('channel-list', false);
          console.log('✅ Subscribed to channel-list updates');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (channelListIntentionalTeardown) return;
          console.warn(`⚠️ channel-list-updates: ${status}`, err || '');
          if (channelListSubscription) {
            channelListSubscription = null;
            scheduleChannelListReconnect();
            // FIX: surface repeated failures to the user (see setConnectionIssue
            // above) instead of only logging — this channel is what delivers new
            // chat previews/unread counts and "removed from group" notices, so a
            // silent failure here looks exactly like "chat doesn't update live".
            if (channelListReconnectAttempts >= 5) {
              setConnectionIssue('channel-list', true);
            }
          }
        }
      });
  }

  function unsubscribeFromChannelListUpdates() {
    if (channelListReconnectTimer) {
      clearTimeout(channelListReconnectTimer);
      channelListReconnectTimer = null;
    }
    if (channelListSubscription) {
      channelListIntentionalTeardown = true;
      supabase.removeChannel(channelListSubscription);
      channelListIntentionalTeardown = false;
      channelListSubscription = null;
    }
  }

  // ============================================================
  // CHAT-LIST PREVIEW POLLING FALLBACK
  // ============================================================
  // FIX: "closed chats never get a live last-message preview" persisted even
  // after fixing the tab-refocus reconnect gap above — because the
  // `channel-list-updates` postgres_changes subscription can sit at a happy
  // "SUBSCRIBED" status forever while still never delivering a single event.
  // That happens when the `messages` table hasn't been added to the
  // `supabase_realtime` publication (Database → Replication in the Supabase
  // dashboard), or when its RLS SELECT policy silently excludes the event
  // for this user — Realtime evaluates that policy per-row server-side, and
  // a mismatch there produces no error on the client at all, just permanent
  // silence. subscribeToMessages()/subscribeToChannelListUpdates() can only
  // ever detect and recover from a *dropped connection*; they have no way to
  // detect "connected but nothing is arriving".
  //
  // This is a belt-and-suspenders fallback: independent of whether the
  // realtime socket is actually delivering anything, periodically re-pull
  // each known channel's latest message straight via REST and re-render the
  // list if anything changed. It guarantees the "last message" preview and
  // unread badge for a closed chat catch up within one poll interval even
  // on a Supabase project where Realtime is misconfigured — while the
  // instant realtime path above still gives immediate updates whenever it
  // does work correctly.
  let channelPreviewPollTimer = null;
  const CHANNEL_PREVIEW_POLL_INTERVAL = 12000;

  async function pollChannelPreviews() {
    if (!state.currentUser || !allChannels.length) return;
    try {
      const fresh = await loadChannelPreviews(allChannels.map((c) => c.id));
      let changed = false;
      allChannels.forEach((ch) => {
        const incoming = fresh[ch.id];
        const existing = state.channelPreviews[ch.id];
        if (incoming && (!existing || incoming.id !== existing.id)) {
          changed = true;
        }
      });
      state.channelPreviews = fresh;
      if (changed) {
        console.log('🔄 Preview poll found new messages — refreshing chat list.');
        renderChatList(allChannels);
        await refreshUnreadBadges();
      }
    } catch (e) {
      console.warn('Channel preview poll failed:', e);
    }
  }

  function startChannelPreviewPolling() {
    stopChannelPreviewPolling();
    channelPreviewPollTimer = setInterval(pollChannelPreviews, CHANNEL_PREVIEW_POLL_INTERVAL);
  }

  function stopChannelPreviewPolling() {
    if (channelPreviewPollTimer) {
      clearInterval(channelPreviewPollTimer);
      channelPreviewPollTimer = null;
    }
  }

  // ============================================================
  // DELIVERED / SEEN TRACKING (FIXED)
  // ============================================================
  async function markDelivered(channelId) {
    if (!state.currentUser) return;
    
    try {
      console.log(`📬 Marking messages as delivered for channel ${channelId}`);
      
      const { error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .update({ 
          delivered_at: new Date().toISOString() 
        })
        .eq('channel_id', channelId)
        .neq('username', state.currentUser.username)
        .is('delivered_at', null);
        
      if (error) {
        console.warn('Failed to mark delivered:', error);
      } else {
        console.log('✅ Messages marked as delivered');
      }
    } catch (e) {
      console.warn('Mark delivered error:', e);
    }
  }

  async function markSeen(channelId) {
    // FIX: document.hasFocus() checks OS-level window focus, which is
    // frequently false even while the user is actively viewing the chat
    // (PWAs/home-screen webviews, embedded browsers, clicking outside the
    // window, etc). That caused read receipts to never be written, so the
    // nav badge kept showing "unread" messages the user had already seen.
    // document.hidden reflects tab/app *visibility*, which is what actually
    // matters here.
    if (!state.currentUser || document.hidden) {
      console.log('⏭️ Skipping markSeen - no user or tab not visible');
      return;
    }
    
    try {
      console.log(`👁️ Marking messages as seen for channel ${channelId}`);
      
      // First, get all unread messages from others in this channel
      const { data: unreadMsgs, error: unreadError } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('id')
        .eq('channel_id', channelId)
        .neq('username', state.currentUser.username)
        .is('deleted_at', null);

      if (unreadError) {
        console.warn('Failed to get unread messages:', unreadError);
      } else if (unreadMsgs && unreadMsgs.length) {
        // Record read receipts for each unread message
        const rows = unreadMsgs.map((m) => ({
          message_id: m.id,
          channel_id: channelId,
          username: state.currentUser.username,
        }));
        const { error: readsError } = await supabase
          .from('message_reads')
          .upsert(rows, { onConflict: 'message_id,username', ignoreDuplicates: true });
        if (readsError) {
          console.warn('Failed to record read receipts:', readsError);
          // FIX: this write is what actually clears the unread badge — if
          // it fails (typically an RLS INSERT policy on message_reads
          // blocking it), refreshUnreadBadges() below will re-derive the
          // count from the database and find these messages still unread,
          // so the badge silently never clears no matter how many times the
          // chat is opened. Make that visible instead of leaving it as a
          // console-only warning.
          setConnectionIssue('badges', true);
        } else {
          console.log(`✅ Recorded ${rows.length} read receipts`);
          setConnectionIssue('badges', false);
        }
      }

      // Also update the seen_at on the messages table for backward compatibility
      const { error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .update({ 
          seen_at: new Date().toISOString(),
          seen_by: state.currentUser.username
        })
        .eq('channel_id', channelId)
        .neq('username', state.currentUser.username)
        .is('seen_at', null);
        
      if (error) {
        console.warn('Failed to mark seen:', error);
      } else {
        console.log('✅ Messages marked as seen');
      }

      // FIX: Refresh the badge after marking messages as seen
      await refreshUnreadBadges();
      
    } catch (e) {
      console.warn('Mark seen error:', e);
      // Even if there's an error, try to refresh the badge
      try {
        await refreshUnreadBadges();
      } catch (badgeError) {
        console.warn('Failed to refresh badge after error:', badgeError);
      }
    }
  }

  // ============================================================
  // GROUP READ RECEIPTS
  // ============================================================
  async function loadMessageReads(channelId) {
    const { data, error } = await supabase
      .from('message_reads')
      .select('message_id, username, seen_at')
      .eq('channel_id', channelId);

    state.messageReads = new Map();
    if (error) {
      console.warn('Failed to load read receipts:', error);
      return;
    }
    (data || []).forEach((row) => {
      const list = state.messageReads.get(row.message_id) || [];
      list.push({ username: row.username, seen_at: row.seen_at });
      state.messageReads.set(row.message_id, list);
    });
  }

  function teardownReadsSubscription() {
    if (!state.readsSubscription) return;
    supabase.removeChannel(state.readsSubscription);
    state.readsSubscription = null;
  }

  function subscribeToMessageReads(channelId) {
    teardownReadsSubscription();
    state.readsSubscription = supabase
      .channel(`message_reads:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reads',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        const row = payload.new;
        const list = state.messageReads.get(row.message_id) || [];
        if (!list.some((r) => r.username === row.username)) {
          list.push({ username: row.username, seen_at: row.seen_at });
          state.messageReads.set(row.message_id, list);
        }
      })
      .subscribe();
  }

  // ============================================================
  // SAFE MESSAGE MERGING
  // ============================================================
  function mergeMessagesSafely(newMessages) {
    if (state.isMerging) {
      console.log('⏳ Merge already in progress, skipping');
      return;
    }
    
    state.isMerging = true;
    
    try {
      const messagesToAdd = Array.isArray(newMessages) ? newMessages : [newMessages];
      
      const messageMap = new Map();
      
      state.messages.forEach(msg => {
        messageMap.set(msg.id, msg);
      });
      
      messagesToAdd.forEach(msg => {
        if (msg && msg.id) {
          if (msg.id.startsWith('temp_') || msg.isPending) {
            const realVersion = messagesToAdd.find(m => 
              !m.isPending && m.client_id === msg.client_id
            );
            if (realVersion) {
              messageMap.set(realVersion.id, realVersion);
              messageMap.delete(msg.id);
              return;
            }
          }
          messageMap.set(msg.id, msg);
        }
      });
      
      const mergedMessages = Array.from(messageMap.values());
      
      mergedMessages.sort((a, b) => {
        const dateA = new Date(a.created_at || a.createdAt || 0);
        const dateB = new Date(b.created_at || b.createdAt || 0);
        return dateA - dateB;
      });
      
      state.messages = mergedMessages;
      
      if (state.currentChannel) {
        saveCachedMessages(state.currentChannel.id, mergedMessages);
      }
      
      scheduleRenderMessages();
      
      console.log(`✅ Merged ${messagesToAdd.length} messages, total: ${mergedMessages.length}`);
      
    } catch (error) {
      console.error('Error merging messages:', error);
    } finally {
      state.isMerging = false;
    }
  }

  // ============================================================
  // CACHED MESSAGES
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
  // FETCH FRESH HISTORY
  // ============================================================
  async function fetchFreshHistory(channelId) {
    if (!channelId) return;
    
    try {
      console.log('🔄 Fetching fresh message history...');
      
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('Failed to fetch fresh history:', error);
        return;
      }

      if (data && data.length > 0) {
        mergeMessagesSafely(data);
        console.log(`✅ Fetched ${data.length} fresh messages`);
      }
      
      updateProfileScreen();
      
    } catch (error) {
      console.error('Error fetching fresh history:', error);
    }
  }

  // ============================================================
  // 8b. REALTIME MESSAGE SYNC
  // ============================================================
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let isIntentionalTeardown = false;

  function teardownMessagesSubscription() {
    if (!state.messagesSubscription) return;
    isIntentionalTeardown = true;
    supabase.removeChannel(state.messagesSubscription);
    isIntentionalTeardown = false;
    state.messagesSubscription = null;
  }

  function scheduleReconnect(channelId) {
    if (reconnectTimer) return;
    if (!state.currentChannel || state.currentChannel.id !== channelId) return;

    reconnectAttempts += 1;
    const delay = Math.min(30000, 2000 * Math.pow(2, reconnectAttempts - 1));
    console.log(`🔁 Reconnect attempt ${reconnectAttempts} in ${delay / 1000}s...`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (state.currentChannel && state.currentChannel.id === channelId) {
        subscribeToMessages(channelId);
      }
    }, delay);
  }

  function subscribeToMessages(channelId) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    teardownMessagesSubscription();

    let thisChannel;

    thisChannel = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: CONFIG.SUPABASE.TABLES.MESSAGES, 
        filter: `channel_id=eq.${channelId}` 
      }, async (payload) => {
        const newMessage = payload.new;
        
        if (state.messages.some(msg => msg.id === newMessage.id)) {
          console.log(`✋ Message ${newMessage.id} already exists, skipping`);
          return;
        }
        
        if (newMessage.client_id) {
          const optimisticIndex = state.messages.findIndex(m => 
            m.client_id === newMessage.client_id || 
            (m.isPending && m.id && m.id.includes('temp_'))
          );
          
          if (optimisticIndex !== -1) {
            console.log(`✅ Replacing optimistic message (clientId: ${newMessage.client_id})`);
            state.messages[optimisticIndex] = newMessage;
            delete state.messages[optimisticIndex].isPending;
            scheduleRenderMessages();
            saveCachedMessages(channelId, state.messages);

            // FIX: root cause of "badge/unread count updates live, but the
            // chat-list preview text doesn't" — this per-channel subscription
            // only ever touched state.messages (the open conversation), never
            // state.channelPreviews (what the chat LIST renders). Whether the
            // list's preview text updated at all depended entirely on the
            // separate global channel-list-updates subscription's handler
            // (handleGlobalMessageInsert) also firing and winning whatever
            // race exists between the two. This channel already has the full
            // new message in hand — update the list's preview directly and
            // unconditionally, so it's correct immediately regardless of
            // whether that other subscription fires, races, or is delayed.
            if (isKnownChannelId(channelId)) {
              state.channelPreviews[channelId] = newMessage;
              renderChatList(allChannels);
            }

            if (newMessage.username !== state.currentUser?.username) {
              console.log('🔔 New message from someone else - marking delivered');
              playNotifySound();
              // FIX: only mark delivered/seen if this chat is actually the
              // one on screen right now — see isChatDetailVisible above.
              // Previously this fired just because it belonged to
              // `state.currentChannel`, which stays set after backing out to
              // the chat list, so messages arriving in a chat that was
              // closed on screen were being auto-marked "seen" and never
              // showed an unread badge.
              if (isChatDetailVisible(channelId)) {
                await markDelivered(channelId);
                await markSeen(channelId);
              }
            }
            return;
          }
        }
        
        console.log(`📥 Adding new message (ID: ${newMessage.id})`);
        mergeMessagesSafely(newMessage);

        // FIX: same root cause as the optimistic branch above — update the
        // chat list's preview for this channel directly from the payload we
        // already have, instead of leaving it entirely up to the separate
        // global channel-list-updates subscription (which may race with, or
        // simply never deliver as reliably as, this filtered per-channel
        // subscription). See the longer comment above.
        if (isKnownChannelId(channelId)) {
          state.channelPreviews[channelId] = newMessage;
          renderChatList(allChannels);
        }

        // Refresh unread badges for new messages.
        // FIX: this must be awaited. It was previously fired without
        // awaiting, which could race with the refreshUnreadBadges() call
        // inside markSeen() below and, depending on network timing,
        // resolve *after* it and stomp the just-cleared badge count back
        // to a stale "unread" value.
        await refreshUnreadBadges();
        
        if (newMessage.username !== state.currentUser?.username) {
          console.log('🔔 New message from someone else - marking delivered');
          playNotifySound();
          // FIX: same as above — only mark seen if the chat is genuinely
          // open on screen right now, not just "the last chat we visited".
          if (isChatDetailVisible(channelId)) {
            await markDelivered(channelId);
            await markSeen(channelId);
          }
        }

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
          scheduleRenderMessages();
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
          scheduleRenderMessages();
          saveCachedMessages(channelId, state.messages);
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          reconnectAttempts = 0;
          state.isChannelActive = true;
          setConnectionIssue('messages', false);
          console.log(`✅ Subscribed to channel ${channelId}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (isIntentionalTeardown) {
            console.log(`↩️ Channel ${status} for ${channelId} — intentional teardown, not reconnecting`);
            return;
          }

          if (err) console.error(`❌ Channel ${status} for ${channelId}:`, err.message || err);
          else console.error(`❌ Channel ${status} for ${channelId}`);
          state.isChannelActive = false;

          if (state.messagesSubscription === thisChannel) {
            state.messagesSubscription = null;
            scheduleReconnect(channelId);

            if (reconnectAttempts === 5) {
              console.warn(
                '⚠️ Realtime channel has failed to stay connected 5 times in a row. ' +
                'This usually means Realtime replication is not enabled for the ' +
                `"${CONFIG.SUPABASE.TABLES.MESSAGES}" table in the Supabase dashboard ` +
                '(Database → Replication), or a Row Level Security policy is blocking it — ' +
                'not a transient network issue. Still retrying, but check that config.'
              );
              // FIX: make this visible to the actual user, not just the
              // console — this is the exact failure mode behind "chat
              // doesn't update live". See setConnectionIssue above.
              setConnectionIssue('messages', true);
            }
          }
        }
      });

    state.messagesSubscription = thisChannel;
  }

  // ============================================================
  // LOAD MESSAGES
  // ============================================================
  async function loadMessages(channelId) {
    if (!channelId) return;

    try {
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
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

  // ============================================================
  // RENDER MESSAGES
  // ============================================================
  function messageSignature(msg) {
    return JSON.stringify([
      msg.content, msg.file_url, msg.reply_to, msg.reply_username, msg.reply_content,
      msg.username, msg.created_at, msg.seen_at, msg.delivered_at, msg.isPending,
      msg.deleted_at, msg.deleted_by
    ]);
  }

  function buildMessageEl(msg, signature) {
    const isMine = msg.username === state.currentUser?.username;
    const wrap = document.createElement('div');
    wrap.className = `msg ${isMine ? 'msg-mine' : 'msg-theirs'}`;
    wrap.dataset.id = msg.id;
    wrap.dataset.role = roleKey(msg.username);
    wrap.dataset.sig = signature;

    let replyHtml = '';
    if (msg.reply_to) {
      replyHtml = `
        <div class="msg-reply-quote">
          <span class="reply-author">${escapeHtml(getDisplayName(msg.reply_username || 'Message'))}</span>
          <span class="reply-text">${escapeHtml(truncate(msg.reply_content || '', 60))}</span>
        </div>
      `;
    }

    const ticksMarkup = (isMine && !msg.deleted_at) ? ticksHtml(msg) : '';
    const hasAttachment = !!msg.file_url && !msg.deleted_at;

    let bubbleHtml = '';
    if (msg.deleted_at) {
      bubbleHtml = `<div class="msg-bubble msg-deleted"><i class="fas fa-ban"></i> This message was deleted by Nous Complex admin</div>`;
    } else if (msg.content) {
      const inlineTicks = (!hasAttachment && ticksMarkup) ? `<span class="msg-bubble-ticks">${ticksMarkup}</span>` : '';
      bubbleHtml += `<div class="msg-bubble">${replyHtml}${escapeHtml(msg.content)}${inlineTicks}</div>`;
    } else if (replyHtml) {
      const inlineTicks = (!hasAttachment && ticksMarkup) ? `<span class="msg-bubble-ticks">${ticksMarkup}</span>` : '';
      bubbleHtml += `<div class="msg-bubble">${replyHtml}${inlineTicks}</div>`;
    }
    if (hasAttachment) {
      const cornerTicks = ticksMarkup ? `<span class="msg-corner-ticks">${ticksMarkup}</span>` : '';
      if (isImageFile(msg.file_url)) {
        bubbleHtml += `
          <div class="msg-media-preview" data-media-url="${escapeHtml(msg.file_url)}">
            <img class="msg-media-img" src="${escapeHtml(msg.file_url)}" alt="Attached image" loading="lazy">
            <span class="msg-media-expand"><i class="fas fa-expand"></i></span>
            ${cornerTicks}
          </div>
        `;
      } else if (isVideoFile(msg.file_url)) {
        bubbleHtml += `
          <div class="msg-media-preview msg-media-video-wrap">
            <video class="msg-media-img" src="${escapeHtml(msg.file_url)}" controls preload="metadata"></video>
            ${cornerTicks}
          </div>
        `;
      } else {
        const fileName = getFileNameFromUrl(msg.file_url);
        const ext = getFileExt(fileName);
        const inlineTicks = ticksMarkup ? `<span class="msg-inline-ticks">${ticksMarkup}</span>` : '';
        bubbleHtml += `
          <a href="${escapeHtml(msg.file_url)}" target="_blank" rel="noopener" class="msg-doc-card">
            <span class="msg-doc-icon"><i class="fas ${getFileIconClass(ext)}"></i></span>
            <span class="msg-doc-info">
              <span class="msg-doc-name">${escapeHtml(fileName)}</span>
              <span class="msg-doc-ext">${escapeHtml(ext || 'FILE')}</span>
            </span>
            <span class="msg-doc-download"><i class="fas fa-download"></i></span>
            ${inlineTicks}
          </a>
        `;
      }
    }

    const displayName = getDisplayName(msg.username);
    wrap.innerHTML = `
      ${avatarHtml(msg.username, 'sm')}
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-author">${escapeHtml(displayName)}</span>
          <span class="msg-time">${formatDate(msg.created_at)}</span>
        </div>
        ${bubbleHtml}
      </div>
    `;
    return wrap;
  }

  function renderMessages(forceScrollBottom) {
    if (!DOM.chatMessages) return;

    if (!state.messages.length) {
      DOM.chatMessages.innerHTML = '<div class="empty-note center-text" style="width:100%;">No messages yet — say hello</div>';
      return;
    }

    if (!DOM.chatMessages.querySelector('.msg')) {
      DOM.chatMessages.innerHTML = '';
    }

    const existingNodes = new Map();
    DOM.chatMessages.querySelectorAll('.msg, .day-divider').forEach((el) => {
      const key = el.classList.contains('day-divider') ? `day:${el.dataset.day}` : `msg:${el.dataset.id}`;
      existingNodes.set(key, el);
    });

    const wasNearBottom = forceScrollBottom || !DOM.chatContainer || (
      DOM.chatContainer.scrollHeight - DOM.chatContainer.scrollTop - DOM.chatContainer.clientHeight < 80
    );

    let prevNode = null;
    let changed = false;
    let lastDayKey = null;

    state.messages.forEach((msg) => {
      const dk = dayKey(msg.created_at);
      if (dk !== lastDayKey) {
        lastDayKey = dk;
        const dividerKey = `day:${dk}`;
        let dividerNode = existingNodes.get(dividerKey);
        if (dividerNode) {
          existingNodes.delete(dividerKey);
        } else {
          dividerNode = buildDayDivider(dk, formatDayLabel(msg.created_at));
          changed = true;
        }
        const desiredNext = prevNode ? prevNode.nextSibling : DOM.chatMessages.firstChild;
        if (desiredNext !== dividerNode) {
          DOM.chatMessages.insertBefore(dividerNode, desiredNext);
          changed = true;
        }
        prevNode = dividerNode;
      }

      const key = `msg:${msg.id}`;
      const signature = messageSignature(msg);
      let node = existingNodes.get(key);

      if (node && node.dataset.sig === signature) {
        existingNodes.delete(key);
      } else {
        const freshNode = buildMessageEl(msg, signature);
        if (node) {
          node.replaceWith(freshNode);
          existingNodes.delete(key);
        }
        node = freshNode;
        changed = true;
      }

      const desiredNext = prevNode ? prevNode.nextSibling : DOM.chatMessages.firstChild;
      if (desiredNext !== node) {
        DOM.chatMessages.insertBefore(node, desiredNext);
        changed = true;
      }
      prevNode = node;
    });

    existingNodes.forEach((el) => { el.remove(); changed = true; });

    if (changed && wasNearBottom && DOM.chatContainer) {
      DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
    }

    reapplySelectionHighlight();
  }

  let renderMessagesQueued = false;
  let renderMessagesForceScroll = false;

  function scheduleRenderMessages(forceScrollBottom) {
    if (forceScrollBottom) renderMessagesForceScroll = true;
    if (renderMessagesQueued) return;
    renderMessagesQueued = true;
    requestAnimationFrame(() => {
      renderMessagesQueued = false;
      const force = renderMessagesForceScroll;
      renderMessagesForceScroll = false;
      renderMessages(force);
    });
  }

  function scrollToBottom() {
    if (DOM.chatContainer) {
      DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
    }
  }

  async function deleteMessage(messageId) {
    if (!confirm('Delete this message for everyone?')) return;

    const deletedAt = new Date().toISOString();
    const deletedBy = state.currentUser?.username || 'admin';

    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .update({
        content: null,
        file_url: null,
        deleted_at: deletedAt,
        deleted_by: deletedBy,
      })
      .eq('id', messageId)
      .select();

    if (error) { alert('Delete failed: ' + error.message); return; }
    if (!data || data.length === 0) {
      alert('Delete failed: the server didn\'t allow this change (likely a permissions/RLS issue) — the message was NOT deleted. Check that the admin-only UPDATE policy on messages is set up correctly (see soft_delete_messages.sql) and that this account\'s role is exactly "admin".');
      return;
    }

    const idx = state.messages.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      state.messages[idx] = {
        ...state.messages[idx],
        content: null,
        file_url: null,
        deleted_at: deletedAt,
        deleted_by: deletedBy,
      };
    }
    renderMessages();
    if (state.currentChannel) {
      saveCachedMessages(state.currentChannel.id, state.messages);
    }
  }

  let longPressTimer = null;
  let selectedMessageId = null;

  function clearLongPressTimer() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function startLongPress(e) {
    const bubbleWrap = e.target.closest('.msg');
    if (!bubbleWrap || !bubbleWrap.dataset.id || bubbleWrap.querySelector('.msg-deleted')) return;
    if (e.target.closest('.msg-media-preview, .msg-doc-card')) return;
    clearLongPressTimer();
    longPressTimer = setTimeout(() => {
      selectMessageForInfo(bubbleWrap);
    }, 500);
  }

  DOM.chatMessages.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.msg')) e.preventDefault();
  });

  DOM.chatMessages.addEventListener('touchstart', startLongPress, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((evt) => {
    DOM.chatMessages.addEventListener(evt, clearLongPressTimer);
  });

  DOM.chatMessages.addEventListener('click', (e) => {
    if (!isDesktopLayout()) return;
    const bubbleWrap = e.target.closest('.msg');
    if (!bubbleWrap || !bubbleWrap.dataset.id) return;
    if (bubbleWrap.querySelector('.msg-deleted')) return;
    if (e.target.closest('.msg-media-preview, .msg-doc-card')) return;
    selectMessageForInfo(bubbleWrap);
  });

  function selectMessageForInfo(bubbleWrap) {
    const msg = state.messages.find((m) => m.id === bubbleWrap.dataset.id);
    if (!msg || msg.deleted_at) return;
    const isMine = msg.username === state.currentUser?.username;

    exitMessageSelection();
    selectedMessageId = bubbleWrap.dataset.id;
    bubbleWrap.classList.add('msg-selected');

    if (DOM.chatDetailHeader) DOM.chatDetailHeader.classList.add('hidden');
    if (DOM.msgSelectHeader) DOM.msgSelectHeader.classList.remove('hidden');
    if (DOM.msgSelectCount) DOM.msgSelectCount.textContent = '1 selected';

    if (DOM.msgSelectCopyBtn) DOM.msgSelectCopyBtn.classList.toggle('hidden', !msg.content);
    if (DOM.msgSelectDeleteBtn) DOM.msgSelectDeleteBtn.classList.toggle('hidden', !state.isAdmin);
    if (DOM.msgSelectInfoBtn) DOM.msgSelectInfoBtn.classList.toggle('hidden', !isMine);
  }

  function exitMessageSelection() {
    if (!selectedMessageId) return;
    const prev = DOM.chatMessages.querySelector('.msg-selected');
    if (prev) prev.classList.remove('msg-selected');
    selectedMessageId = null;

    if (DOM.msgSelectHeader) DOM.msgSelectHeader.classList.add('hidden');
    if (DOM.chatDetailHeader) DOM.chatDetailHeader.classList.remove('hidden');
  }

  function reapplySelectionHighlight() {
    if (!selectedMessageId) return;
    const el = DOM.chatMessages.querySelector(`.msg[data-id="${CSS.escape(selectedMessageId)}"]`);
    if (el) el.classList.add('msg-selected');
  }

  function getSelectedMessage() {
    return state.messages.find((m) => m.id === selectedMessageId) || null;
  }

  if (DOM.msgSelectCloseBtn) DOM.msgSelectCloseBtn.addEventListener('click', exitMessageSelection);

  if (DOM.msgSelectInfoBtn) {
    DOM.msgSelectInfoBtn.addEventListener('click', () => {
      const msg = getSelectedMessage();
      exitMessageSelection();
      if (msg) openMessageInfoModal(msg);
    });
  }

  if (DOM.msgSelectReplyBtn) {
    DOM.msgSelectReplyBtn.addEventListener('click', () => {
      const msg = getSelectedMessage();
      exitMessageSelection();
      startReplyTo(msg);
    });
  }

  if (DOM.msgSelectCopyBtn) {
    DOM.msgSelectCopyBtn.addEventListener('click', async () => {
      const msg = getSelectedMessage();
      exitMessageSelection();
      if (!msg || !msg.content) return;
      try {
        await navigator.clipboard.writeText(msg.content);
      } catch (e) {
        console.warn('Clipboard write failed:', e);
        alert('Could not copy automatically — your browser blocked clipboard access.');
      }
    });
  }

  if (DOM.msgSelectDeleteBtn) {
    DOM.msgSelectDeleteBtn.addEventListener('click', () => {
      const msg = getSelectedMessage();
      exitMessageSelection();
      if (msg) deleteMessage(msg.id);
    });
  }

  if (DOM.msgSelectForwardBtn) {
    DOM.msgSelectForwardBtn.addEventListener('click', () => {
      const msg = getSelectedMessage();
      exitMessageSelection();
      if (msg) openForwardPicker(msg);
    });
  }

  function openForwardPicker(msg) {
    const targets = allChannels.filter((c) => !state.currentChannel || c.id !== state.currentChannel.id);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-title"><i class="fas fa-share"></i> Forward to</div>
        <div class="forward-channel-list">
          ${targets.length
            ? targets.map((c) => `
                <button class="forward-channel-row" data-channel-id="${escapeHtml(String(c.id))}">
                  <i class="fas fa-hashtag" style="color:var(--chat-accent);"></i>
                  <span class="forward-channel-name">${escapeHtml(c.name)}</span>
                </button>
              `).join('')
            : `<div class="empty-note">No other channels to forward to</div>`}
        </div>
        <button class="btn-secondary msg-info-close" style="width:100%;">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.msg-info-close').addEventListener('click', close);

    overlay.querySelectorAll('.forward-channel-row').forEach((row) => {
      row.addEventListener('click', async () => {
        close();
        await forwardMessageToChannel(msg, row.dataset.channelId);
      });
    });
  }

  async function forwardMessageToChannel(msg, targetChannelId) {
    if (!state.currentUser) return;
    const payload = {
      channel_id: targetChannelId,
      username: state.currentUser.username,
      content: msg.content || '',
      file_url: msg.file_url || null,
      client_id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.MESSAGES).insert(payload);
    if (error) {
      console.error('Forward failed:', error);
      alert('Forward failed: ' + error.message);
      return;
    }
    const targetName = allChannels.find((c) => String(c.id) === String(targetChannelId))?.name || 'the channel';
    alert(`Forwarded to ${targetName}.`);
  }

  function openMessageInfoModal(msg) {
    const reads = (state.messageReads.get(msg.id) || [])
      .slice()
      .sort((a, b) => new Date(a.seen_at) - new Date(b.seen_at));
    const readUsernames = new Set(reads.map((r) => r.username));

    const others = state.currentMembers.filter((m) => m.username !== state.currentUser?.username);
    const delivered = [];
    const notDelivered = [];
    others.forEach((m) => {
      if (readUsernames.has(m.username)) return;
      if (state.onlineUsers.has((m.username || '').toLowerCase())) {
        delivered.push(m.username);
      } else {
        notDelivered.push(m.username);
      }
    });

    const rowHtml = (username, timeHtml) => `
      <div class="msg-info-row">
        ${avatarHtml(username, 'sm')}
        <span class="msg-info-name">${escapeHtml(getDisplayName(username))}</span>
        ${timeHtml}
      </div>
    `;

    const readRows = reads.length
      ? reads.map((r) => rowHtml(r.username, `<span class="msg-info-time">${escapeHtml(formatFullDate(r.seen_at))}</span>`)).join('')
      : `<div class="empty-note">No one yet</div>`;

    const deliveredRows = delivered.length
      ? delivered.map((u) => rowHtml(u, `<span class="msg-info-time">Delivered</span>`)).join('')
      : `<div class="empty-note">No one in this state</div>`;

    const notDeliveredRows = notDelivered.length
      ? notDelivered.map((u) => rowHtml(u, `<span class="msg-info-time msg-info-notdelivered">Not delivered</span>`)).join('')
      : `<div class="empty-note">No one in this state</div>`;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-title"><i class="fas fa-circle-info"></i> Message info</div>
        <div class="msg-info-section-label">Seen (${reads.length})</div>
        <div class="msg-info-list">${readRows}</div>
        <div class="msg-info-section-label">Delivered, not seen (${delivered.length})</div>
        <div class="msg-info-list">${deliveredRows}</div>
        <div class="msg-info-section-label">Not delivered (${notDelivered.length})</div>
        <div class="msg-info-list">${notDeliveredRows}</div>
        <button class="btn-secondary msg-info-close" style="width:100%; margin-top:14px;">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.msg-info-close').addEventListener('click', close);
  }

  function startReplyTo(msg) {
    if (!msg) return;
    state.replyingTo = msg;
    DOM.replyPreviewAuthor.textContent = getDisplayName(msg.username);
    DOM.replyPreviewText.textContent = msg.content || (msg.file_url ? 'Attached file' : '');
    DOM.replyPreview.classList.remove('hidden');
    DOM.messageInput.focus();
  }

  DOM.chatMessages.addEventListener('click', (e) => {
    const mediaPreview = e.target.closest('.msg-media-preview:not(.msg-media-video-wrap)');
    if (mediaPreview) {
      openImageLightbox(mediaPreview.dataset.mediaUrl);
      return;
    }
  });

  // FIX: Store reference to lightbox overlay for back button handling
  function openImageLightbox(url) {
    if (!url) return;
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button class="lightbox-close" aria-label="Close"><i class="fas fa-times"></i></button>
      <img class="lightbox-img" src="${escapeHtml(url)}" alt="Attached image, full size">
    `;
    document.body.appendChild(overlay);
    
    // Store reference so back button can close it
    state.activeLightbox = overlay;
    
    const close = () => {
      if (state.activeLightbox === overlay) {
        state.activeLightbox = null;
      }
      overlay.remove();
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.lightbox-close').addEventListener('click', close);
  }

  DOM.replyPreviewCancel.addEventListener('click', () => {
    state.replyingTo = null;
    DOM.replyPreview.classList.add('hidden');
  });

  // ============================================================
  // 9. SEND MESSAGE
  // ============================================================
  async function sendMessage(content, file) {
    if (!state.currentChannel || !state.currentUser) {
      alert('Please select a channel first.');
      return;
    }

    // FIX: see verifyChannelMembership() above — this is what actually stops
    // a removed user from posting when the realtime "you were removed"
    // signal was missed. Admins aren't rows in `members` (loadChannels()
    // gives them every channel unconditionally), so they're exempt here too.
    if (!state.isAdmin) {
      const stillMember = await verifyChannelMembership(state.currentChannel.id);
      if (!stillMember) {
        await expelFromChannel(state.currentChannel.id);
        return;
      }
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
    
    mergeMessagesSafely(optimisticMessage);
    console.log(`✉️ Message added (optimistic, clientId: ${clientId})`);

    const { error, data } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .insert(newMessage)
      .select();

    if (error) {
      console.error('Send error:', error);
      alert('Failed to send message.');
      state.messages = state.messages.filter((m) => m.id !== tempId);
      renderMessages();
      console.log('❌ Message rolled back');
    } else if (data && data[0]) {
      const realMessage = data[0];
      
      const index = state.messages.findIndex((m) => m.id === tempId);
      if (index !== -1) {
        state.messages[index] = realMessage;
        delete state.messages[index].isPending;
        renderMessages();
        console.log(`✅ Message replaced: ${tempId} → ${realMessage.id}`);
      } else {
        mergeMessagesSafely(realMessage);
      }
      
      state.channelPreviews = await loadChannelPreviews(allChannels.map((c) => c.id));
      renderChatList(allChannels);
      
      if (state.currentChannel) {
        saveCachedMessages(state.currentChannel.id, state.messages);
      }
    }

    state.replyingTo = null;
    DOM.replyPreview.classList.add('hidden');
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
  // 8a. CHANNEL DESCRIPTION
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
    DOM.sharedMediaGrid.innerHTML = shown.map((m) => `<img src="${escapeHtml(m.file_url)}" alt="Shared media" loading="lazy">`).join('');
    DOM.profileSeeAllMedia.classList.toggle('hidden', media.length <= 6);
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
      DOM.statusModalMedia.innerHTML = `<video src="${escapeHtml(status.media_url)}" controls autoplay muted playsinline></video>`;
    } else if (status.media_url) {
      DOM.statusModalMedia.innerHTML = `<img src="${escapeHtml(status.media_url)}" alt="Status media">`;
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

  // FIX: Update history state after closing status
  function closeStatusViewer() {
    DOM.statusModal.classList.add('hidden');
    if (state.progressInterval) { clearInterval(state.progressInterval); state.progressInterval = null; }
    statusPaused = false;
    DOM.statusModalMedia.innerHTML = '';
    // Clear the URL fragment after closing status so back button works correctly
    if (state.currentScreen && history.replaceState) {
      history.replaceState({ orbitScreen: state.currentScreen }, '', '#' + state.currentScreen);
    }
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
  // 7c. ADMIN: USER MANAGEMENT
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
        const { error: roleError, count } = await supabase
          .from('user_roles')
          .update({
            username: newUsername,
            role: newRole,
            display_name: newDisplayName || newUsername
          }, { count: 'exact' })
          .eq('username', username);

        if (roleError) {
          if (roleError.code === '23505' || /duplicate key/i.test(roleError.message || '')) {
            throw new Error(`Username "${newUsername}" is already taken by another user.`);
          }
          throw roleError;
        }
        if (count === 0) {
          throw new Error(`User "${username}" not found (already renamed or deleted?).`);
        }
        
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

  async function callAdminDeleteUserFunction(targetUsername, removeData) {
    const { data, error } = await supabase.rpc('admin_delete_user', {
      target_username: targetUsername,
      remove_data: removeData,
    });
    if (error) return { error };
    return { error: null, data };
  }

  function openDeleteUserChoiceModal(username) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-card">
          <h3 class="modal-title"><i class="fas fa-trash" style="color:var(--danger);"></i> Delete "${escapeHtml(username)}"</h3>
          <p class="modal-body" style="margin-bottom:16px;">
            This removes their login and role permanently. Choose what happens to the messages, statuses, and schedule entries they created:
          </p>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <button id="deleteUserKeepDataBtn" class="btn-secondary" style="width:100%;">
              Delete user only — keep their messages
            </button>
            <button id="deleteUserWipeDataBtn" class="btn-danger" style="width:100%;">
              Delete user and all their chat data
            </button>
            <button id="deleteUserCancelBtn" class="btn-secondary" style="width:100%;">
              Cancel
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const cleanup = (result) => { modal.remove(); resolve(result); };
      modal.querySelector('#deleteUserKeepDataBtn').addEventListener('click', () => cleanup(false));
      modal.querySelector('#deleteUserWipeDataBtn').addEventListener('click', () => cleanup(true));
      modal.querySelector('#deleteUserCancelBtn').addEventListener('click', () => cleanup(null));
      modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(null); });
    });
  }

  async function deleteUserAccount(username) {
    username = normalizeUsername(username);
    if (!username) { alert('No user selected.'); return; }

    const removeData = await openDeleteUserChoiceModal(username);
    if (removeData === null) return;

    try {
      const { error: authError } = await callAdminDeleteUserFunction(username, removeData);
      if (authError) throw authError;
      
      delete state.roleCache[username];
      delete state.displayNameCache[username];
      alert(removeData ? 'User and their data deleted successfully!' : 'User deleted — their messages were kept.');
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
  // 5g. INACTIVITY DISCONNECTION MANAGEMENT
  // ============================================================
  function setupInactivityManager() {
    cleanupInactivityManager();

    function resetInactivityTimer() {
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
      }
      
      const needsReconnect = state.isTabFocused && state.currentChannel && (
        !state.messagesSubscription ||
        state.messagesSubscription.state === 'closed' ||
        state.messagesSubscription.state === 'errored'
      );
      if (needsReconnect) {
        console.log("🔄 User active! Reconnecting...");
        subscribeToMessages(state.currentChannel.id);
      }

      state.inactivityTimer = setTimeout(() => {
        if (state.messagesSubscription && state.isTabFocused) {
          console.log("⏰ 5 min idle. Disconnecting to save resources.");
          teardownMessagesSubscription();
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

    state.connectionWatchdog = setInterval(() => {
      if (!state.currentChannel) return;

      const sub = state.messagesSubscription;
      // FIX: this used to require sub.state === 'joined' to count as healthy,
      // which also treats 'joining' (still connecting) and 'leaving' as
      // "unhealthy" and immediately tears the channel down and recreates it
      // via subscribeToMessages(). On a slower connection a join can easily
      // take longer than this 20s tick, so the channel got killed mid-join,
      // over and over, and could go the whole session without ever reaching
      // a stable subscribed state — messages sent by others would never
      // render live in the open chat, even though nothing else looked
      // "broken" (loadMessages()/markSeen() are plain REST calls, and the
      // separate global channel-list-updates subscription, which has no
      // watchdog fighting it, kept the chat list previews/unread badges
      // updating fine). Only actually-dead states should trigger a rebuild;
      // 'joining'/'leaving' are transient and will resolve to 'joined' or
      // 'errored' on their own — the existing SUBSCRIBED/CHANNEL_ERROR/
      // TIMED_OUT/CLOSED handling in subscribeToMessages() takes it from there.
      const isDead = !sub || sub.state === 'closed' || sub.state === 'errored';

      if (isDead && !reconnectTimer) {
        console.log('🩺 Watchdog: connection unhealthy, reconnecting...', sub ? sub.state : 'no subscription');
        subscribeToMessages(state.currentChannel.id);
      }
    }, 20000);

    state._inactivityCleanup = function() {
      if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
      }
      if (state.connectionWatchdog) {
        clearInterval(state.connectionWatchdog);
        state.connectionWatchdog = null;
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
    cleanupTabFocusManager();

    if (state.currentChannel) {
      state.tabChannel = supabase.channel(`tab-focus-${state.currentChannel.id}`);
      state.tabChannel.subscribe();
    }

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log("🔴 Tab hidden. Keeping message connection alive for background notifications.");
        state.isTabFocused = false;

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

        // FIX: root cause of "chat list preview doesn't update live" — the
        // global `channel-list-updates` realtime subscription (see
        // subscribeToChannelListUpdates above) is what streams new-message
        // previews/unread counts into the chat list, completely separately
        // from the per-open-chat `messages:<id>` subscription. Mobile
        // browsers routinely suspend or silently drop background websockets
        // without ever firing CHANNEL_ERROR/TIMED_OUT/CLOSED, so
        // scheduleChannelListReconnect() never triggers and the socket comes
        // back from the background "open" but zombied — no more INSERT
        // events arrive, so chat-row previews/timestamps freeze even though
        // reopening a chat (which rebuilds messagesSubscription above) looks
        // fine again. Unconditionally rebuild it here, the same way the
        // per-chat subscription is rebuilt, and immediately re-pull previews
        // in case anything was missed while it was down.
        if (state.currentUser) {
          subscribeToChannelListUpdates();
          try {
            state.channelPreviews = await loadChannelPreviews(allChannels.map((c) => c.id));
            renderChatList(allChannels);
          } catch (e) {
            console.warn('Failed to refresh chat list previews on refocus:', e);
          }
        }

        if (state.currentChannel && !state.isRefreshing) {
          state.isRefreshing = true;
          console.log("📥 Catching up on messages missed while tab was inactive...");
          try {
            // FIX: while the tab was hidden, the channel-list realtime
            // subscription could easily have missed a "you were removed"
            // DELETE event (mobile browsers routinely suspend/drop the
            // websocket in the background). Re-check membership as soon as
            // the tab is visible again instead of leaving the removed user
            // sitting in a group they can no longer see updates for but can
            // still type into until their next send attempt gets rejected.
            const reopenedChannel = state.currentChannel;
            if (!state.isAdmin) {
              const stillMember = await verifyChannelMembership(reopenedChannel.id);
              if (!stillMember) {
                await expelFromChannel(reopenedChannel.id);
                return;
              }
            }

            await fetchFreshHistory(state.currentChannel.id);
            console.log("✅ Catch-up complete!");

            // FIX: messages that arrived while the tab was hidden were
            // never marked delivered/seen (markSeen bails out while
            // document.hidden is true). Now that the tab is visible again
            // and the channel is still open, catch those up so the nav
            // badge actually clears instead of staying stuck on "unread".
            // Guarded by isChatDetailVisible: `state.currentChannel` can be
            // set to a chat the user backed out of (it's never cleared on
            // "back"), so without this check simply refocusing the browser
            // tab — while sitting on the chat list — would wrongly mark that
            // chat's messages as seen and drop its unread number.
            if (isChatDetailVisible(state.currentChannel.id)) {
              await markDelivered(state.currentChannel.id);
              await markSeen(state.currentChannel.id);
            }
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
  // SELECT CHANNEL (FIXED)
  // ============================================================
  // FIX: added the `markSeenNow` option (defaults to true, i.e. unchanged
  // behavior for every real call site — the user actually tapping/clicking
  // a chat open). It only gets set to false by the auto-select-first-channel
  // path in renderChannels(), so that loading the app doesn't silently mark
  // a chat's messages as delivered/seen before the user has ever looked at
  // it. See isChatDetailVisible above for the full explanation.
  async function selectChannel(channel, { markSeenNow = true } = {}) {
    if (typeof exitMessageSelection === 'function') exitMessageSelection();
    state.currentChannel = channel;
    updateChatEmptyState();
    highlightActiveChatRow();

    const cachedMessages = getCachedMessages(channel.id);
    state.messages = cachedMessages || [];
    renderMessages(true);
    if (cachedMessages) {
      console.log(`⚡ Instant load: ${cachedMessages.length} messages from cache`);
    }

    await loadMessages(channel.id);
    await loadMembers(channel.id);
    subscribeToMessages(channel.id);
    await loadMessageReads(channel.id);
    subscribeToMessageReads(channel.id);
    if (markSeenNow) {
      await markDelivered(channel.id);
      await markSeen(channel.id);
    }
    await loadSchedule(channel.id);
    subscribeToSchedule(channel.id);
    updateChatDetailHeader();
    updateProfileScreen();

    // FIX: Force refresh the badge after marking messages as seen
    // This ensures the badge clears immediately when opening a channel
    await refreshUnreadBadges();

    setupInactivityManager();
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
  // 14. LOGIN FLOW
  // ============================================================
  async function completeLogin(username, user) {
    console.log('🔐 Completing login for:', username);
    
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
    startSessionWatchdog();
    await requestMediaPermissions();
    await renderChannels();
    subscribeToChannelListUpdates();
    startChannelPreviewPolling();
    // FIX: previously the nav badge was only ever set by refreshUnreadBadges()
    // as a side effect of selectChannel(), which itself only runs when
    // channels.length > 0 (see renderChannels). A user with zero channels
    // (not added to any group) never hit that path, so the badge could be
    // left showing a stale count from a previous session on the same tab.
    // Call it explicitly here so every login always gets a correct badge,
    // including the "0 channels → 0 unread" case.
    await refreshUnreadBadges();
    await loadStatuses();
    
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('✅ Notification permission granted');
        }
      }
    } catch (e) {
      console.warn('Notification permission request failed:', e);
    }

    syncNotificationToggleState();

    // FIX: Reset history and go to chats (home screen)
    screenHistory = [];
    goToScreen('chats');
    
    console.log('✅ Login complete!');
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
      console.log('🔄 Checking for existing session...');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user || !session.user.email) {
        console.log('No active session found');
        return;
      }

      const suffix = CONFIG.AUTH.EMAIL_SUFFIX;
      if (!session.user.email.endsWith(suffix)) {
        console.log('Session email does not match expected suffix');
        return;
      }

      const username = normalizeUsername(session.user.email.slice(0, -suffix.length));
      console.log('🔄 Restoring session for:', username);
      await completeLogin(username, session.user);
    } catch (e) {
      console.warn('Session restore skipped:', e);
    }
  }

  // FIX: Backstop only — account deletion is now caught in realtime via the
  // user_roles DELETE subscription above. This watchdog just re-verifies
  // the session against the auth server periodically in case the realtime
  // socket ever drops silently (network blips, tab throttling, etc.), so
  // the account never stays "logged in" indefinitely on a dead session.
  const SESSION_CHECK_INTERVAL = 60000;

  function startSessionWatchdog() {
    stopSessionWatchdog();
    state.sessionWatchdog = setInterval(async () => {
      if (!state.currentUser) return;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data || !data.user) {
          console.warn('🚫 Session watchdog: account no longer valid, signing out.', error);
          await forceSignOut('Your account is no longer available. You have been signed out.');
        }
      } catch (e) {
        console.warn('Session watchdog check failed:', e);
      }
    }, SESSION_CHECK_INTERVAL);
  }

  function stopSessionWatchdog() {
    if (state.sessionWatchdog) {
      clearInterval(state.sessionWatchdog);
      state.sessionWatchdog = null;
    }
  }

  // Shared teardown used by both a normal, user-initiated sign-out and a
  // forced sign-out (deleted account / invalidated session).
  async function performSignOutCleanup() {
    try { 
      await supabase.auth.signOut(); 
    } catch (e) { 
      console.warn('Sign out error:', e); 
    }

    stopSessionWatchdog();
    teardownMessagesSubscription();
    teardownReadsSubscription();
    unsubscribeFromChannelListUpdates();
    stopChannelPreviewPolling();
    if (scheduleSubscription) { 
      supabase.removeChannel(scheduleSubscription); 
      scheduleSubscription = null; 
    }
    teardownPresence();
    cleanupInactivityManager();
    cleanupTabFocusManager();

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

    // FIX: previously none of this was reset on sign-out. If a device is
    // shared between users in one tab (e.g. an admin signs out and a
    // student signs in without reloading the page), the nav badge and
    // channel list were left showing the PREVIOUS user's stale unread
    // count. A student with zero channels never triggers
    // refreshUnreadBadges() on their own (selectChannel only runs when
    // channels.length > 0), so that leftover badge would never clear —
    // it looked like they had unread notifications for a group they were
    // never even added to.
    allChannels = [];
    state.unreadByChannel = {};
    state.channelPreviews = {};
    state.messageReads = new Map();
    state.myMemberships = new Map();
    DOM.navChatsBadge.textContent = '0';
    DOM.navChatsBadge.classList.add('hidden');

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

    DOM.dashboard.classList.add('hidden');
    DOM.videoContainer.classList.add('hidden');
    DOM.authCard.classList.remove('hidden');
    DOM.usernameInput.value = '';
    DOM.passwordInput.value = '';
    hideError();
    
    screenHistory = [];
  }

  // User-initiated sign-out (Settings → Sign Out button).
  async function handleSignOut() {
    if (!confirm('Sign out?')) return;
    await performSignOutCleanup();
  }

  // FIX: Sign-out triggered by the app itself — the account was deleted,
  // removed, or the session was otherwise invalidated. No confirm() dialog
  // (there's nothing left for the user to confirm), and we surface why.
  async function forceSignOut(message) {
    if (!state.currentUser) return; // already signed out, avoid duplicate alerts
    await performSignOutCleanup();
    if (message) alert(message);
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
        return { ok: false, reason: 'not_supported' };
      }

      if (!CONFIG.PUSH || !CONFIG.PUSH.VAPID_PUBLIC_KEY) {
        console.warn('No VAPID public key configured — push sync skipped.');
        return { ok: false, reason: 'not_configured' };
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.warn('Could not get user UUID:', userError);
        return { ok: false, reason: 'no_auth_user', detail: userError?.message };
      }
      
      const userUuid = userData.user.id;
      console.log(`🔑 Using user UUID: ${userUuid}`);

      let registration;
      try {
        registration = await navigator.serviceWorker.ready;
      } catch (swErr) {
        console.error('Service worker never became ready:', swErr);
        return { ok: false, reason: 'sw_not_ready', detail: swErr?.message };
      }

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(CONFIG.PUSH.VAPID_PUBLIC_KEY)
          });
        } catch (subErr) {
          console.error('pushManager.subscribe() failed:', subErr);
          return { ok: false, reason: 'push_subscribe_failed', detail: subErr?.message };
        }
      }

      if (!subscription) {
        console.warn('Could not create push subscription');
        return { ok: false, reason: 'push_subscribe_failed' };
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

      if (error) {
        console.error('Failed to save push subscription to Supabase:', error);
        return { ok: false, reason: 'db_error', detail: error.message };
      }

      console.log("✅ VAPID Push Subscription safely stored in Supabase.");
      return { ok: true };

    } catch (err) {
      console.error("Failed to sync push configurations:", err);
      return { ok: false, reason: 'error', detail: err?.message };
    }
  }

  async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported on this browser/device.');
      return { ok: false, reason: 'not_supported' };
    }
    if (!CONFIG.PUSH || !CONFIG.PUSH.VAPID_PUBLIC_KEY) {
      console.warn('No VAPID public key configured — push notifications disabled.');
      return { ok: false, reason: 'not_configured' };
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted.');
        return { ok: false, reason: 'permission_denied' };
      }

      return await syncVapidSubscriptionOnLogin(state.currentUser.username);
    } catch (e) {
      console.warn('Push subscription failed:', e);
      return { ok: false, reason: 'error', detail: e?.message };
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

  const PUSH_FAILURE_MESSAGES = {
    not_supported: 'Push notifications are not supported on this browser/device.',
    not_configured: 'Push notifications are not configured for this app yet.',
    permission_denied: 'Notification permission was not granted. Enable notifications for this site in your browser settings and try again.',
    no_auth_user: 'Could not verify your account. Try signing out and back in.',
    sw_not_ready: 'The background service worker never started. Check that sw.js is deployed and registers without errors (see the console).',
    push_subscribe_failed: 'The browser rejected the push subscription — this usually means the VAPID public key is wrong or missing.',
    db_error: 'Could not save your notification subscription to the database.',
    error: 'Something went wrong turning on notifications. Please try again.',
  };

  async function syncNotificationToggleState() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        DOM.notifToggle.checked = false;
        DOM.notifToggle.disabled = true;
        return;
      }
      DOM.notifToggle.disabled = false;

      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        DOM.notifToggle.checked = false;
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      DOM.notifToggle.checked = !!subscription;
    } catch (e) {
      console.warn('Could not check notification status:', e);
    }
  }

  async function setNotificationsEnabled(enabled) {
    DOM.notifToggle.disabled = true;

    try {
      if (enabled) {
        const { ok, reason, detail } = await subscribeToPush();

        DOM.notifToggle.checked = ok;
        if (!ok) {
          const base = PUSH_FAILURE_MESSAGES[reason] || PUSH_FAILURE_MESSAGES.error;
          alert(detail ? `${base}\n\nDetails: ${detail}` : base);
        }
      } else {
        await unsubscribeFromPush();
        DOM.notifToggle.checked = false;
      }
    } finally {
      DOM.notifToggle.disabled = false;
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
    if (state.inactivityTimer) {
      clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
  });

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

  DOM.updateUserBtn.addEventListener('click', async () => {
    const currentUser = DOM.editUsername.value;
    const newUser = DOM.editNewUsername.value || currentUser;
    const displayName = DOM.editDisplayName.value || currentUser;
    const role = DOM.editRole.value;
    const password = DOM.editPassword.value;

    DOM.updateUserBtn.disabled = true;
    try {
      await updateUserAccount(currentUser, newUser, displayName, role, password);
    } finally {
      DOM.updateUserBtn.disabled = false;
    }
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
