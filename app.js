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
    // FIX: this used to bail out leaving #appLoading (the "checking
    // session" spinner) on screen forever — indistinguishable from a hung
    // app. Fall back to the login card so there's at least a visible,
    // non-broken-looking screen before the alert.
    const loader = document.getElementById('appLoading');
    const authCardEl = document.getElementById('authCard');
    if (loader) loader.classList.add('hidden');
    if (authCardEl) authCardEl.classList.remove('hidden');
    alert('Configuration file not found. Please check your setup.');
    return;
  }

  console.log(`🏫 ${CONFIG.BRANDING.NAME} v${CONFIG.BRANDING.VERSION}`);
  console.log(`🔧 Environment: ${CONFIG.ENV}`);

  // FIX: PDF.js needs its worker script pointed at explicitly (it doesn't
  // infer it from the main <script> tag). Without this, getDocument() on
  // every shared PDF was failing silently (console-only warning), which is
  // why PDFs never got a page preview and fell straight back to a bare
  // file-icon card — see getPdfThumbnail() below.
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  } else {
    console.warn('pdf.js failed to load — shared PDFs will fall back to a plain file icon (no page preview).');
  }

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
      forceSignOut('Signed Out Successfully');
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
    // FIX: "who has seen this update" tracking for the Updates/Status tray.
    // Mirrors messageReads/readsSubscription above but keyed by status id —
    // see loadStatusViews()/recordStatusView()/subscribeToStatusViews() and
    // openStatusInfoModal() further down. This never existed before, which
    // is why admins had no way to see who had viewed a posted update.
    statusViews: new Map(),
    statusViewsSubscription: null,
    // FIX: Track active lightbox overlay for back button handling
    activeLightbox: null,
    // FIX: Track the ordered list of shared-media URLs currently rendered in
    // the profile screen's grid, so the lightbox can swipe next/prev through
    // them (see updateProfileScreen() / openImageLightbox() below).
    sharedMediaUrls: [],
    // FIX: Track this user's own membership row ids (channel_id -> members.id)
    // so we can detect exactly when THEY are removed from a group via realtime,
    // and a periodic watchdog handle to detect the account itself being deleted.
    myMemberships: new Map(),
    sessionWatchdog: null,
    // FIX: this user's own `user_roles` row id, captured at login — see
    // handleAccountDeleted() below for why this is needed.
    myUserRoleId: null,
    // FIX: the currently-open channel's next/live class_schedule row (or
    // null if none is set). Drives whether the "Join/Start Live Session"
    // button is clickable — see updateLiveButtonState() below. Previously
    // there was no equivalent of this, which is why the button was always
    // active even for channels with no session scheduled at all.
    currentSchedule: null,
    // FIX: which class_schedule row (by id) the CURRENTLY OPEN video call
    // belongs to, if any. Lets loadSchedule() recognize when that specific
    // row has been edited/deleted/force-ended and close this client's call
    // immediately rather than waiting on its original auto-close timer —
    // see the FIX note inside loadSchedule() and endLiveSessionForEveryone().
    activeCallScheduleId: null,
  };

  // ============================================================
  // 4. DOM REFS
  // ============================================================
  const $ = (id) => document.getElementById(id);

  const DOM = {
    appLoading: $('appLoading'),
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
    updatesScreenHeader: $('updatesScreenHeader'),
    statusSelectHeader: $('statusSelectHeader'),
    statusSelectCloseBtn: $('statusSelectCloseBtn'),
    statusSelectCount: $('statusSelectCount'),
    statusSelectInfoBtn: $('statusSelectInfoBtn'),
    statusSelectDeleteBtn: $('statusSelectDeleteBtn'),
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
    viewCalendarBtn: $('viewCalendarBtn'),
    signOutBtn: $('signOutBtn'),

    screenCalendar: $('screenCalendar'),
    backFromCalendar: $('backFromCalendar'),
    calendarList: $('calendarList'),

    adminCreateUserCard: $('adminCreateUserCard'),
    adminUserManagementCard: $('adminUserManagementCard'),
    addUserToggleBtn: $('addUserToggleBtn'),
    manageUsersToggleBtn: $('manageUsersToggleBtn'),
    newUserUsername: $('newUserUsername'),
    newUserDisplayName: $('newUserDisplayName'),
    newUserRole: $('newUserRole'),
    newUserPassword: $('newUserPassword'),
    generatePasswordBtn: $('generatePasswordBtn'),
    createUserBtn: $('createUserBtn'),
    
    manageUserSearch: $('manageUserSearch'),
    loadUserBtn: $('loadUserBtn'),
    registeredUsersListWrap: $('registeredUsersListWrap'),
    registeredUsersListView: $('registeredUsersListView'),
    userEditForm: $('userEditForm'),
    closeUserEditBtn: $('closeUserEditBtn'),
    editUsername: $('editUsername'),
    editDisplayName: $('editDisplayName'),
    editNewUsername: $('editNewUsername'),
    editPassword: $('editPassword'),
    editRole: $('editRole'),
    manageUserGroupsBtn: $('manageUserGroupsBtn'),
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
    endLiveSessionBtn: $('endLiveSessionBtn'),
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
    scheduleCalPrevBtn: $('scheduleCalPrevBtn'),
    scheduleCalNextBtn: $('scheduleCalNextBtn'),
    scheduleCalMonthLabel: $('scheduleCalMonthLabel'),
    scheduleCalGrid: $('scheduleCalGrid'),
    scheduleSelectedDates: $('scheduleSelectedDates'),
    scheduleStartTimeInput: $('scheduleStartTimeInput'),
    scheduleDurationInput: $('scheduleDurationInput'),
    scheduleEndPreview: $('scheduleEndPreview'),
    scheduleSameTimeCheckbox: $('scheduleSameTimeCheckbox'),
    schedulePerDateList: $('schedulePerDateList'),
    setScheduleBtn: $('setScheduleBtn'),
    groupScheduleList: $('groupScheduleList'),
    
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
    statusViewerBody: $('statusViewerBody'),
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

  function isPdfFile(url) {
    return !!url && /\.pdf$/i.test(url.split('?')[0]);
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

  // FIX: see #appLoading in index.html — this is the "checking session"
  // splash that covers the gap between page load and the app knowing
  // whether to show the login card or the dashboard. hideAppLoading() also
  // cancels the inline fallback timer index.html sets up in case app.js
  // never gets this far at all (script error, blocked CDN, etc.).
  function hideAppLoading() {
    if (DOM.appLoading) DOM.appLoading.classList.add('hidden');
    if (window.__orbitLoadingFallback) {
      clearTimeout(window.__orbitLoadingFallback);
      window.__orbitLoadingFallback = null;
    }
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
    calendar: DOM.screenCalendar,
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
    // FIX: leaving the Updates screen (e.g. tapping another bottom-nav tab)
    // previously left an update stuck "selected" with its header swapped
    // out — renderStatuses() only cleared this on the next re-render, not
    // on navigation. Clear it explicitly whenever Updates isn't the active
    // screen, same safety net exitMessageSelection() gives chat selection.
    if (name !== 'updates' && typeof exitStatusSelection === 'function') exitStatusSelection();
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
    if (name === 'settings' && state.isAdmin) {
      loadRegisteredUsersList();
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
      // FIX: run the lightbox's own cleanup (removes its keydown listener
      // for gallery navigation) before tearing down the overlay, so a
      // swipeable gallery closed via the back button doesn't leak a
      // document-level keydown handler.
      if (typeof state.activeLightbox._lightboxCleanup === 'function') {
        state.activeLightbox._lightboxCleanup();
      }
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
      // FIX: route through closeLiveSession() so the back button also
      // cancels the auto-close timer armed in joinLiveClass() — otherwise
      // it could still fire later and pop the "session is up" alert after
      // the admin/student had already left the screen.
      closeLiveSession();
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

  // Every group/session that exists ([{id, name}, ...]), admin-only.
  // Rebuilt by loadRegisteredUsersList(); read by openGroupAssignmentModal()
  // so the "manage groups" checklist doesn't need its own round trip.
  let allGroupsCache = [];

  // username (lowercase) -> array of {channelId, channelName, role} for
  // every group that user belongs to. Rebuilt by loadRegisteredUsersList();
  // read by renderRegisteredUsersList() (search re-filters instantly
  // without refetching) and by openGroupAssignmentModal() (to pre-check
  // groups and pre-select each one's role).
  let registeredUserMemberships = new Map();

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
    // FIX (chat takes time to open, #2): previously this awaited the
    // *entire* selectChannel() chain — 8+ sequential network round trips
    // (messages, members, read receipts, delivered/seen writes, schedule,
    // badge refresh) — before switching the screen to chatDetail. The
    // messages a user actually needs to see are rendered from cache
    // synchronously inside selectChannel() before any of those awaits, so
    // there's no reason the screen transition should wait on the network
    // too. Fire selectChannel() and flip the screen immediately; fresh
    // data fills in a moment later once it arrives.
    selectChannel(channel);
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
      if (showAlert) alert('You were removed from This Session.');
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
  //
  // FIX (root cause of "delete user is not being signed out automatically"):
  // this used to match purely on `oldRow.username`. Postgres/Supabase
  // Realtime only guarantees the PRIMARY KEY columns are present on a
  // DELETE payload's `old` row unless the table has REPLICA IDENTITY FULL
  // explicitly set — and `user_roles` almost certainly has a separate `id`
  // primary key, with `username` just a unique column. Under the default
  // replica identity (the vast majority of Supabase projects never change
  // this), `oldRow.username` is simply undefined on delete, so the old
  // check silently never matched — this realtime path never fired for
  // anyone, on any deletion, and sign-out depended entirely on the slower
  // session-watchdog backstop. Match against this user's own row id
  // (captured at login — see completeLogin()) instead, which is always
  // present regardless of replica identity, with the username check kept
  // as a fallback for projects that do have REPLICA IDENTITY FULL set.
  function handleAccountDeleted(oldRow) {
    if (!oldRow || !state.currentUser) return;
    const matchesById = state.myUserRoleId != null && String(oldRow.id) === String(state.myUserRoleId);
    const deletedUsername = normalizeUsername(oldRow.username || '');
    const matchesByUsername = !!deletedUsername && deletedUsername === state.currentUser.username;
    if (matchesById || matchesByUsername) {
      console.warn('🚫 Realtime: this account was removed, Signing Out.');
      forceSignOut('Your account has been removed. You have been Signed Out.');
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

  // ============================================================
  // PDF THUMBNAIL PREVIEW (NEW)
  // ============================================================
  // FIX: "why can't I see the shared PDF half-opened like in WhatsApp" —
  // previously every non-image/video attachment (including PDFs) rendered
  // as a bare icon + filename card (see the generic .msg-doc-card branch
  // below), with no visual preview at all. WhatsApp renders a cropped
  // thumbnail of the document's first page in the bubble, the same "shown
  // half until you tap" treatment .msg-media-preview already gives images
  // (see that CSS comment in styles.css). This renders page 1 of the PDF
  // to a canvas with pdf.js and reuses that exact same cropped-preview
  // look for PDFs. Thumbnails are cached by URL so re-renders (e.g. from
  // realtime updates re-running buildMessageEl) and repeated shares of the
  // same file don't re-download/re-render the PDF every time.
  const pdfThumbCache = new Map();   // file_url -> dataURL string | null (null = failed, don't retry)
  const pdfThumbInFlight = new Map(); // file_url -> in-progress Promise<string|null>

  function getPdfThumbnail(url) {
    if (pdfThumbCache.has(url)) return Promise.resolve(pdfThumbCache.get(url));
    if (pdfThumbInFlight.has(url)) return pdfThumbInFlight.get(url);
    if (!window.pdfjsLib) return Promise.resolve(null);

    const promise = pdfjsLib.getDocument(url).promise
      .then((pdf) => pdf.getPage(1))
      .then((page) => {
        const baseViewport = page.getViewport({ scale: 1 });
        // Render at a fixed target width — plenty sharp for a chat-bubble
        // thumbnail while staying cheap for long/large PDFs.
        const targetWidth = 360;
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        return page.render({ canvasContext: ctx, viewport }).promise
          .then(() => canvas.toDataURL('image/jpeg', 0.82));
      })
      .then((dataUrl) => {
        pdfThumbCache.set(url, dataUrl);
        pdfThumbInFlight.delete(url);
        return dataUrl;
      })
      .catch((err) => {
        // Most common cause: the storage bucket doesn't send CORS headers
        // for cross-origin fetch (pdf.js needs to read the bytes, unlike a
        // plain <img>/<a> tag which doesn't). Fails soft to the file-icon
        // placeholder already in the markup rather than breaking the chat.
        console.warn(`PDF thumbnail failed for ${url}:`, err);
        pdfThumbCache.set(url, null);
        pdfThumbInFlight.delete(url);
        return null;
      });

    pdfThumbInFlight.set(url, promise);
    return promise;
  }

  function hydratePdfThumb(wrapEl, url) {
    const thumbEl = wrapEl.querySelector('.msg-pdf-thumb');
    if (!thumbEl) return;
    getPdfThumbnail(url).then((dataUrl) => {
      // Bail if the message node was replaced/removed while we were
      // rendering (e.g. renderMessages() swapped it for a fresh node).
      if (!dataUrl || !thumbEl.isConnected) return;
      const img = document.createElement('img');
      img.className = 'msg-media-img';
      img.alt = 'PDF preview';
      img.loading = 'lazy';
      img.src = dataUrl;
      thumbEl.innerHTML = '';
      thumbEl.appendChild(img);
      thumbEl.classList.add('loaded');
    });
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
      // FIX: "clicking the reply message doesn't do anything" — tag the
      // quote with the original message's id so the delegated click
      // handler below (see jumpToMessage()) knows what to scroll to.
      replyHtml = `
        <div class="msg-reply-quote" data-reply-to-id="${escapeHtml(String(msg.reply_to))}" role="button" tabindex="0">
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
      } else if (isPdfFile(msg.file_url)) {
        // WhatsApp-style PDF card: cropped page-1 thumbnail on top (filled
        // in asynchronously by hydratePdfThumb() below, once wrap.innerHTML
        // is actually set) with the filename/download bar underneath.
        const fileName = getFileNameFromUrl(msg.file_url);
        const inlineTicks = ticksMarkup ? `<span class="msg-inline-ticks">${ticksMarkup}</span>` : '';
        bubbleHtml += `
          <a href="${escapeHtml(msg.file_url)}" data-file-name="${escapeHtml(fileName)}" target="_blank" rel="noopener" class="msg-doc-card msg-pdf-card">
            <div class="msg-pdf-thumb"><i class="fas fa-file-pdf"></i></div>
            <div class="msg-pdf-info-bar">
              <span class="msg-doc-icon"><i class="fas fa-file-pdf"></i></span>
              <span class="msg-doc-info">
                <span class="msg-doc-name">${escapeHtml(fileName)}</span>
                <span class="msg-doc-ext">PDF</span>
              </span>
              <span class="msg-doc-download"><i class="fas fa-download"></i></span>
              ${inlineTicks}
            </div>
          </a>
        `;
      } else {
        const fileName = getFileNameFromUrl(msg.file_url);
        const ext = getFileExt(fileName);
        const inlineTicks = ticksMarkup ? `<span class="msg-inline-ticks">${ticksMarkup}</span>` : '';
        bubbleHtml += `
          <a href="${escapeHtml(msg.file_url)}" data-file-name="${escapeHtml(fileName)}" target="_blank" rel="noopener" class="msg-doc-card">
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

    if (hasAttachment && isPdfFile(msg.file_url)) {
      hydratePdfThumb(wrap, msg.file_url);
    }

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

  // FIX: "clicking the reply message doesn't do anything" — jumps to the
  // original message the quote points at (via the data-reply-to-id set in
  // buildMessageEl() above) and briefly highlights it so it's easy to spot.
  // loadMessages() only keeps the last 50 messages per channel, so an
  // older replied-to message may not currently be in the DOM — in that
  // case this just tells the user instead of silently doing nothing.
  function jumpToMessage(id) {
    if (!id) return;
    const target = DOM.chatMessages.querySelector(`.msg[data-id="${cssEscape(id)}"]`);
    if (!target) {
      showToast("Original message isn't loaded");
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('msg-highlight');
    setTimeout(() => target.classList.remove('msg-highlight'), 1500);
  }

  // CSS.escape isn't available in every embedded webview this app runs in
  // (e.g. some older Android WebViews), so fall back to a manual escape
  // rather than letting an unusual message id throw inside a selector.
  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  // Small auto-dismissing pill, used for lightweight non-blocking notices
  // like "original message isn't loaded" (an alert() would be too heavy
  // for this).
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  DOM.chatMessages.addEventListener('click', (e) => {
    const replyQuote = e.target.closest('.msg-reply-quote[data-reply-to-id]');
    if (replyQuote) {
      jumpToMessage(replyQuote.dataset.replyToId);
      return;
    }

    const mediaPreview = e.target.closest('.msg-media-preview:not(.msg-media-video-wrap)');
    if (mediaPreview) {
      openImageLightbox(mediaPreview.dataset.mediaUrl);
      return;
    }

    // FIX: "why does opening the attached file show the supabase link" —
    // doc cards (both the PDF card and the generic file card) were plain
    // <a href="<raw storage URL>" target="_blank"> tags, so a click made
    // the browser navigate a new tab straight to that URL — the backend
    // storage link is exactly what ends up in the address bar. Intercept
    // the click and open an in-app viewer instead (see openDocViewer()),
    // the same way images/videos already stay inside the app rather than
    // navigating anywhere.
    const docCard = e.target.closest('.msg-doc-card');
    if (docCard) {
      e.preventDefault();
      const url = docCard.getAttribute('href');
      const fileName = docCard.dataset.fileName || getFileNameFromUrl(url);
      openDocViewer(url, fileName);
      return;
    }
  });

  // Keyboard equivalent of the reply-quote click above (role="button"
  // tabindex="0" on .msg-reply-quote makes it focusable).
  DOM.chatMessages.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const replyQuote = e.target.closest('.msg-reply-quote[data-reply-to-id]');
    if (replyQuote) {
      e.preventDefault();
      jumpToMessage(replyQuote.dataset.replyToId);
    }
  });

  // FIX: see the click-handler comment above. Opens documents (PDFs get an
  // inline preview via iframe; other types get a "download it" prompt
  // since browsers can't render .docx/.xlsx/.zip/etc. inline) in an
  // overlay that never navigates the page away from this app, so the raw
  // Supabase storage URL never appears in the address bar. Reuses
  // state.activeLightbox so the mobile hardware/back-gesture button that
  // already closes the image lightbox (see closeLightboxIfOpen()) closes
  // this too.
  function openDocViewer(url, fileName) {
    if (!url) return;
    const canPreviewInline = isPdfFile(url);
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay doc-viewer-overlay';
    overlay.innerHTML = `
      <div class="doc-viewer-panel">
        <div class="doc-viewer-header">
          <span class="doc-viewer-name">${escapeHtml(fileName)}</span>
          <div class="doc-viewer-actions">
            <button type="button" class="icon-btn doc-viewer-download" title="Download" aria-label="Download"><i class="fas fa-download"></i></button>
            <button type="button" class="icon-btn doc-viewer-close" title="Close" aria-label="Close"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="doc-viewer-body">
          ${canPreviewInline
            ? `<iframe class="doc-viewer-frame" src="${escapeHtml(url)}" title="${escapeHtml(fileName)}"></iframe>`
            : `<div class="doc-viewer-no-preview"><i class="fas fa-file"></i><p>Preview isn't available for this file type.</p></div>`
          }
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    state.activeLightbox = overlay;

    const close = () => {
      if (state.activeLightbox === overlay) state.activeLightbox = null;
      overlay.remove();
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.doc-viewer-close').addEventListener('click', close);
    overlay.querySelector('.doc-viewer-download').addEventListener('click', () => downloadAttachment(url, fileName));
  }

  // Fetches the file as a blob and triggers a same-document download
  // instead of navigating to it — this is also what recovers the real
  // filename (Supabase's storage path is a timestamp-prefixed slug, not
  // the name the user originally attached) instead of whatever name the
  // browser would've guessed from the raw URL.
  async function downloadAttachment(url, fileName) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (e) {
      console.warn('Blob download failed, falling back to a direct link:', e);
      // Last resort — this one does briefly show the raw storage URL, but
      // only if the fetch above (same URL the iframe/img tags already load
      // fine) unexpectedly failed, e.g. a CORS-blocked bucket.
      window.open(url, '_blank', 'noopener');
    }
  }

  // FIX: Store reference to lightbox overlay for back button handling
  //
  // FIX: "in shared media section when I open the media it doesn't allow me
  // to move on next by swiping left or right" — the lightbox only ever
  // rendered the single tapped image with no concept of "next"/"previous".
  // Now accepts an optional ordered `mediaList` (+ `startIndex`) — when
  // there's more than one image, it renders prev/next arrow buttons, wires
  // up left/right arrow keys, and supports touch swipe (swipe left = next,
  // swipe right = previous) to move through the gallery without closing it.
  // Called with just a url (e.g. a single chat-bubble image) it behaves
  // exactly as before.
  function openImageLightbox(url, mediaList, startIndex) {
    if (!url) return;
    const gallery = Array.isArray(mediaList) ? mediaList.filter(Boolean) : [];
    const hasGallery = gallery.length > 1;
    let index = hasGallery
      ? (Number.isInteger(startIndex) && startIndex >= 0 && startIndex < gallery.length ? startIndex : Math.max(0, gallery.indexOf(url)))
      : 0;

    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button class="lightbox-close" aria-label="Close"><i class="fas fa-times"></i></button>
      ${hasGallery ? `
        <button class="lightbox-nav lightbox-prev" aria-label="Previous image"><i class="fas fa-chevron-left"></i></button>
        <button class="lightbox-nav lightbox-next" aria-label="Next image"><i class="fas fa-chevron-right"></i></button>
      ` : ''}
      <img class="lightbox-img" src="${escapeHtml(hasGallery ? gallery[index] : url)}" alt="Attached image, full size">
    `;
    document.body.appendChild(overlay);

    // Store reference so back button can close it
    state.activeLightbox = overlay;

    const imgEl = overlay.querySelector('.lightbox-img');

    const showAt = (newIndex) => {
      if (!hasGallery) return;
      index = ((newIndex % gallery.length) + gallery.length) % gallery.length;
      imgEl.src = gallery[index];
    };
    const showNext = () => showAt(index + 1);
    const showPrev = () => showAt(index - 1);

    const onKeydown = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (!hasGallery) return;
      if (e.key === 'ArrowRight') showNext();
      else if (e.key === 'ArrowLeft') showPrev();
    };
    document.addEventListener('keydown', onKeydown);

    const close = () => {
      if (state.activeLightbox === overlay) {
        state.activeLightbox = null;
      }
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
    };
    // Let closeLightboxIfOpen() (mobile back-button handler) clean up the
    // keydown listener too, since it removes the overlay directly rather
    // than calling this close().
    overlay._lightboxCleanup = () => document.removeEventListener('keydown', onKeydown);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.lightbox-close').addEventListener('click', close);

    if (hasGallery) {
      overlay.querySelector('.lightbox-prev').addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
      overlay.querySelector('.lightbox-next').addEventListener('click', (e) => { e.stopPropagation(); showNext(); });

      // Touch swipe: left = next, right = previous. Ignores mostly-vertical
      // drags so it doesn't fight a pinch/scroll gesture.
      let touchStartX = null;
      let touchStartY = null;
      const SWIPE_THRESHOLD = 40;
      overlay.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      overlay.addEventListener('touchend', (e) => {
        if (touchStartX === null) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        touchStartX = null;
        touchStartY = null;
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) showNext(); else showPrev();
        }
      }, { passive: true });
    }
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
    // Keep Settings → Manage Users' assigned/unassigned view in sync —
    // this person just moved from "Unassigned" into a group.
    loadRegisteredUsersList();
  }

  async function removeMember(memberId) {
    if (!confirm('Remove this person from the group?')) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.MEMBERS).delete().eq('id', memberId);
    if (error) { alert('Remove failed: ' + error.message); return; }
    await loadMembers(state.currentChannel.id);
    loadRegisteredUsersList();
  }

  // ============================================================
  // 8e. CLASS SCHEDULING
  // ============================================================
  let scheduleSubscription = null;

  // Safety ceiling on how long any one session can run — used both to
  // bound the loadSchedule() lookback window below and to sanity-check the
  // start/end times an admin enters in setClassSchedule(). 8 hours is
  // generous for any live class.
  const MAX_SESSION_DURATION_MINUTES = 8 * 60;

  // FIX: root cause of "the live session should automatically disappear on
  // ending time" — the schedule banner + Join/Start button only ever
  // re-checked whether a session was still current when something ELSE
  // triggered a reload (opening the group, a realtime DB change). If an
  // admin just sat on the chat screen watching the clock tick past a
  // session's end time with nothing else happening, the banner and the
  // active button stayed exactly as they were — nothing was watching the
  // clock itself. This timer is armed for the exact moment the currently
  // shown session ends and simply re-runs loadSchedule() then, which
  // naturally hides the banner / deactivates the button (or rolls over to
  // the next scheduled session) with no page reload or navigation needed.
  let scheduleExpiryTimer = null;
  // setTimeout delays are unreliable (and in some engines fire immediately)
  // past ~24.8 days (a 32-bit ms count) — stay well under that. A session
  // farther out than this doesn't need a live watchdog yet anyway; it'll
  // get one once it becomes the nearest schedule and this reloads again.
  const SCHEDULE_EXPIRY_WATCHDOG_MAX_MS = 20 * 24 * 60 * 60 * 1000;

  function clearScheduleExpiryTimer() {
    if (scheduleExpiryTimer) {
      clearTimeout(scheduleExpiryTimer);
      scheduleExpiryTimer = null;
    }
  }

  async function loadSchedule(channelId) {
    // FIX: root cause of the live-session button going "dead" partway
    // through a longer class. This used to look back a flat 1 hour and
    // take whatever row that found — so a session that *started* more than
    // an hour ago dropped out of view even if it was still running (e.g. a
    // 90-minute class, 70 minutes in). Look back far enough to catch any
    // session that could still be in progress (MAX_SESSION_DURATION_MINUTES),
    // then pick the first row — in ascending start-time order — whose real
    // end time (start + its own duration) hasn't passed yet. That's the
    // "current or next" session regardless of how long it runs.
    const { data, error } = await supabase
      .from('class_schedule')
      .select('*')
      .eq('channel_id', channelId)
      .gte('scheduled_time', new Date(Date.now() - MAX_SESSION_DURATION_MINUTES * 60000).toISOString())
      .order('scheduled_time', { ascending: true })
      .limit(50);

    // Every call clears any previously-armed watchdog first — including
    // one left over from a DIFFERENT channel the admin has since switched
    // away from — since selectChannel() always calls loadSchedule() again
    // on every channel switch, this guarantees only ever one timer is live
    // at a time, and it's always for the channel actually being viewed.
    clearScheduleExpiryTimer();

    if (error) {
      state.currentSchedule = null;
      DOM.scheduleBanner.classList.add('hidden');
      updateLiveButtonState();
      return;
    }

    const now = Date.now();
    const current = (data || []).find((row) => {
      const endsAt = new Date(row.scheduled_time).getTime() + (row.duration_minutes || 45) * 60000;
      return endsAt > now;
    });

    // FIX: root cause of "let admin end a live session anytime, even
    // during the session" actually taking effect for whoever is ON the
    // call. Editing/deleting a schedule row, or the dedicated "End for
    // everyone"/"End now" actions (see endLiveSessionForEveryone() /
    // endScheduledSessionNow() below), all just mutate class_schedule —
    // realtime pushes that change to every client with this channel open,
    // which re-runs loadSchedule() right here. If THIS client currently
    // has a call open (state.videoActive) for the schedule that no longer
    // comes back as `current` (because it was moved to end now, or
    // deleted outright), force-close it immediately instead of leaving it
    // running until its stale, already-armed auto-close timer eventually
    // fires — that timer was set for the OLD end time and would otherwise
    // let the call run right through the early end.
    if (state.videoActive && state.activeCallScheduleId) {
      const stillCurrent = current && String(current.id) === String(state.activeCallScheduleId);
      if (!stillCurrent) {
        closeLiveSession('This live session was ended by an admin.');
      }
    }

    if (!current) {
      state.currentSchedule = null;
      DOM.scheduleBanner.classList.add('hidden');
      updateLiveButtonState();
      return;
    }
    state.currentSchedule = current;
    renderScheduleBanner(current);
    updateLiveButtonState();

    // FIX: the button now depends on whether `now` has reached
    // scheduled_time (see getLiveButtonMode() above), not just on this row
    // existing — so this watchdog has to wake up for THAT moment too, not
    // only for the session's end. Otherwise a session scheduled for later
    // today would stay hidden until the next unrelated reload happened to
    // run loadSchedule() again, rather than flipping on by itself right at
    // start time. Whichever boundary (start or end) is next just re-runs
    // loadSchedule(), which re-arms the timer for whichever is next after
    // that — so only one timer is ever needed at a time.
    const startsAt = new Date(current.scheduled_time).getTime();
    const endsAt = startsAt + (current.duration_minutes || 45) * 60000;
    const msUntilStart = startsAt - now;
    const msUntilEnd = endsAt - now;
    const msUntilNextBoundary = msUntilStart > 0 ? msUntilStart : msUntilEnd;
    if (msUntilNextBoundary > 0 && msUntilNextBoundary <= SCHEDULE_EXPIRY_WATCHDOG_MAX_MS) {
      scheduleExpiryTimer = setTimeout(() => loadSchedule(channelId), msUntilNextBoundary + 500);
    }
  }

  function renderScheduleBanner(schedule) {
    const start = new Date(schedule.scheduled_time);
    const end = new Date(start.getTime() + (schedule.duration_minutes || 45) * 60000);
    const startFormatted = start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const endFormatted = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    DOM.scheduleBannerText.textContent = `Class with ${getDisplayName(schedule.teacher_username)} scheduled for ${startFormatted}–${endFormatted}`;
    DOM.scheduleBanner.classList.remove('hidden');
  }

  // FIX: root cause of "the live session button gets activated the moment a
  // session is scheduled instead of at its scheduled date/time, and is
  // visible to every teacher/student instead of just the concerned
  // teacher, then students". The previous version of this function only
  // ever checked whether state.currentSchedule was set — but loadSchedule()
  // intentionally keeps state.currentSchedule pointed at the next
  // upcoming-or-in-progress row (so the banner and "Scheduled Classes" list
  // can show it ahead of time), so "a schedule exists" was true from the
  // instant an admin saved it, days or weeks before it actually starts.
  // There was also no gating at all on WHO could see the button (every
  // teacher account, via state.isTeacher, and every student) and no notion
  // of the teacher actually having started the room versus a student just
  // walking in.
  //
  // This now computes three separate things and turns them into one of
  // three button states — hidden / start / join:
  //   - isWithinWindow: `now` is inside [scheduled_time, scheduled_time +
  //     duration) — i.e. it's actually the scheduled date & time, not just
  //     "some schedule row exists". Nothing is shown to anyone outside it.
  //   - isConcernedTeacher: the signed-in user is the exact
  //     schedule.teacher_username this row was booked for.
  //   - isLive: class_schedule.is_live is true — flipped on the moment
  //     someone actually presses Start (see joinLiveClass()). Requires an
  //     `is_live boolean not null default false` column on class_schedule —
  //     see the FIX note above setClassSchedule().
  //
  // "start": the concerned teacher (any time inside the window — starting
  //   again once already live is harmless, joinLiveClass() only flips
  //   is_live if it isn't already true), OR an admin when nobody has
  //   started it yet. Admins keep the same unrestricted access they had
  //   before this fix — able to start a session themselves (covering an
  //   absent teacher, testing, etc.) rather than being gated behind the
  //   concerned teacher — they just don't see a button outside the
  //   scheduled window either.
  // "join": everyone else (students, any other teacher account, and admins
  //   once the session is already live) once isLive is true AND still
  //   inside the scheduled window — they get "Join Live Session". Nobody
  //   who isn't the concerned teacher or an admin sees a button before the
  //   concerned teacher has actually started the class.
  // "hidden": every other case — the button doesn't just go "dead"
  //   looking, it's removed from the header entirely, per spec.
  function getLiveButtonMode() {
    const schedule = state.currentSchedule;
    if (!schedule || !state.currentUser) return 'hidden';

    const now = Date.now();
    const startsAt = new Date(schedule.scheduled_time).getTime();
    const endsAt = startsAt + (schedule.duration_minutes || 45) * 60000;
    const isWithinWindow = now >= startsAt && now < endsAt;
    if (!isWithinWindow) return 'hidden';

    const isConcernedTeacher = normalizeUsername(state.currentUser.username) === normalizeUsername(schedule.teacher_username);
    const isLive = schedule.is_live === true;

    if (state.isAdmin) return isLive ? 'join' : 'start';
    if (isConcernedTeacher) return 'start';
    if (isLive) return 'join';
    return 'hidden';
  }

  // FIX: switched from fully removing the button (display:none) back to
  // keeping it always visible but greyed out/unclickable outside its
  // active state — same .btn-live-pill-dead "dead" look this button
  // already had before the start/join gating work, just now driven by
  // getLiveButtonMode() instead of a plain "does a schedule exist" check.
  function updateLiveButtonState() {
    if (!DOM.joinLiveBtn) return;
    const mode = getLiveButtonMode();
    const isInactive = mode === 'hidden';

    DOM.joinLiveBtn.disabled = isInactive;
    DOM.joinLiveBtn.classList.toggle('btn-live-pill-dead', isInactive);
    DOM.joinLiveBtn.setAttribute('aria-disabled', String(isInactive));
    if (DOM.liveBtnText) {
      DOM.liveBtnText.textContent = mode === 'start' ? 'Start Live Session' : 'Join Live Session';
    }
    DOM.joinLiveBtn.title = isInactive
      ? (state.currentSchedule ? 'This live session hasn\'t started yet.' : 'No live session is scheduled for this group yet')
      : '';
  }

  function subscribeToSchedule(channelId) {
    if (scheduleSubscription) {
      supabase.removeChannel(scheduleSubscription);
      scheduleSubscription = null;
    }
    scheduleSubscription = supabase
      .channel(`schedule:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_schedule', filter: `channel_id=eq.${channelId}` }, () => {
        loadSchedule(channelId);
        // Keep the "Scheduled Classes" list on the Profile screen (see
        // loadGroupScheduleList() below) live too, so anyone looking at it
        // sees a newly-added/edited/removed session without reopening the
        // group.
        loadGroupScheduleList(channelId);
      })
      .subscribe();
  }

  // FIX: root cause of "show the list of scheduled classes in group
  // profile to all" — a group's scheduled sessions were only ever visible
  // one-at-a-time (the nearest one) via the chat header banner, and there
  // was no admin gate needed to see that banner, but there was also no
  // place to see the whole upcoming list. This renders every upcoming (or
  // still in-progress) session for the given channel into #groupScheduleList
  // in the Profile screen — no role check, every member sees it. Admins
  // additionally get edit/delete/"end now" controls on each row — see
  // groupScheduleItemHtml() / groupScheduleEditRowHtml() below.
  let groupScheduleEditingId = null;

  async function loadGroupScheduleList(channelId) {
    if (!DOM.groupScheduleList) return;
    DOM.groupScheduleList.innerHTML = '<div class="empty-note">Loading…</div>';

    const { data, error } = await supabase
      .from('class_schedule')
      .select('*')
      .eq('channel_id', channelId)
      .gte('scheduled_time', new Date(Date.now() - MAX_SESSION_DURATION_MINUTES * 60000).toISOString())
      .order('scheduled_time', { ascending: true })
      .limit(30);

    // The admin may have switched groups while this was in flight — don't
    // stomp the list with a now-stale channel's data.
    if (!state.currentChannel || String(state.currentChannel.id) !== String(channelId)) return;

    if (error) {
      console.warn('loadGroupScheduleList failed:', error);
      DOM.groupScheduleList.innerHTML = '<div class="empty-note">Could not load the schedule.</div>';
      return;
    }

    const now = Date.now();
    const upcoming = (data || []).filter((row) => {
      const endsAt = new Date(row.scheduled_time).getTime() + (row.duration_minutes || 45) * 60000;
      return endsAt > now;
    });

    // The row being edited may have just been deleted (by this admin or
    // another) or rolled off the "upcoming" list — don't leave the picker
    // pointed at a row that's no longer there.
    if (groupScheduleEditingId && !upcoming.some((row) => String(row.id) === String(groupScheduleEditingId))) {
      groupScheduleEditingId = null;
    }

    if (!upcoming.length) {
      DOM.groupScheduleList.innerHTML = '<div class="empty-note">No live sessions scheduled yet.</div>';
      return;
    }

    DOM.groupScheduleList.innerHTML = upcoming.map((row) => groupScheduleItemHtml(row)).join('');

    if (!state.isAdmin) return;

    DOM.groupScheduleList.querySelectorAll('.gs-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        groupScheduleEditingId = btn.dataset.id;
        loadGroupScheduleList(channelId);
      });
    });
    DOM.groupScheduleList.querySelectorAll('.gs-edit-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        groupScheduleEditingId = null;
        loadGroupScheduleList(channelId);
      });
    });
    DOM.groupScheduleList.querySelectorAll('.gs-edit-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.group-schedule-item');
        const ok = await updateScheduledSession(
          btn.dataset.id,
          row.querySelector('.gs-edit-date').value,
          row.querySelector('.gs-edit-start').value,
          row.querySelector('.gs-edit-duration').value
        );
        if (!ok) return;
        groupScheduleEditingId = null;
        loadGroupScheduleList(channelId);
      });
    });
    DOM.groupScheduleList.querySelectorAll('.gs-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await deleteScheduledSession(btn.dataset.id);
        if (ok) loadGroupScheduleList(channelId);
      });
    });
    DOM.groupScheduleList.querySelectorAll('.group-schedule-item-end-btn').forEach((btn) => {
      btn.addEventListener('click', () => endScheduledSessionNow(btn.dataset.id));
    });
  }

  function groupScheduleItemHtml(row) {
    if (state.isAdmin && groupScheduleEditingId && String(groupScheduleEditingId) === String(row.id)) {
      return groupScheduleEditRowHtml(row);
    }

    const start = new Date(row.scheduled_time);
    const durationMinutes = row.duration_minutes || 45;
    const end = new Date(start.getTime() + durationMinutes * 60000);
    const isLiveNow = Date.now() >= start.getTime() && Date.now() < end.getTime();
    const dateLabel = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const timeLabel = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // FIX: root cause of "add option for admin to edit, delete and end
    // live session anytime, even during the session" — these three
    // controls are admin-only (every role can see the list itself, but
    // only an admin can act on it). "End now" only shows while the
    // session is actually live, since ending an upcoming or already-past
    // one isn't a meaningful action.
    const adminActions = state.isAdmin ? `
      <div class="group-schedule-item-actions">
        ${isLiveNow ? `<button type="button" class="group-schedule-item-end-btn" data-id="${row.id}" title="End this live session now for everyone"><i class="fas fa-ban"></i> End now</button>` : ''}
        <button type="button" class="icon-btn gs-edit-btn" data-id="${row.id}" title="Edit"><i class="fas fa-pen"></i></button>
        <button type="button" class="icon-btn gs-delete-btn" data-id="${row.id}" title="Delete"><i class="fas fa-trash" style="color:var(--danger);"></i></button>
      </div>
    ` : '';

    return `
      <div class="group-schedule-item${isLiveNow ? ' is-live' : ''}">
        <div class="group-schedule-item-date">
          <span class="group-schedule-item-date-label">${escapeHtml(dateLabel)}${isLiveNow ? ' <span class="calendar-live-dot" title="Live now"></span>' : ''}</span>
          <span class="group-schedule-item-time-label">${escapeHtml(timeLabel)}</span>
        </div>
        <div class="group-schedule-item-teacher"><i class="fas fa-chalkboard-user"></i> ${escapeHtml(getDisplayName(row.teacher_username))}</div>
        ${adminActions}
      </div>
    `;
  }

  function groupScheduleEditRowHtml(row) {
    const start = new Date(row.scheduled_time);
    const pad = (n) => String(n).padStart(2, '0');
    const dateVal = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const timeVal = `${pad(start.getHours())}:${pad(start.getMinutes())}`;

    return `
      <div class="group-schedule-item is-editing">
        <div class="group-schedule-edit-fields">
          <input type="date" class="field-sm gs-edit-date" value="${dateVal}">
          <input type="time" class="field-sm gs-edit-start" value="${timeVal}">
          <input type="number" min="5" max="${MAX_SESSION_DURATION_MINUTES}" step="5" class="field-sm gs-edit-duration" value="${row.duration_minutes || 45}" title="Duration (minutes)">
        </div>
        <div class="group-schedule-edit-actions">
          <button type="button" class="btn-admin-sm gs-edit-save" data-id="${row.id}"><i class="fas fa-check"></i> Save</button>
          <button type="button" class="btn-admin-sm gs-edit-cancel"><i class="fas fa-xmark"></i> Cancel</button>
        </div>
      </div>
    `;
  }

  // NOTE: updateScheduledSession()/deleteScheduledSession()/
  // endScheduledSessionNow()/endLiveSessionForEveryone() below all target
  // a specific row via .eq('id', ...). This assumes class_schedule has the
  // standard Supabase auto-generated `id` primary key column, like every
  // other table this app already targets by id (members, channels, ...).
  // If your class_schedule table doesn't have one, these actions will
  // fail with a "column id does not exist" error — add an `id` primary
  // key column (uuid, default gen_random_uuid()) to fix it.
  //
  // FIX: root cause of "add option for admin to edit ... a scheduled
  // session" — previously the only way to change a session was to delete
  // it and recreate it from scratch via the calendar picker. This updates
  // the single row in place (same class_schedule columns as
  // setClassSchedule() writes — no schema change).
  async function updateScheduledSession(id, dateStr, startTimeStr, durationMinutes) {
    if (!dateStr || !startTimeStr) { alert('Pick a date and start time.'); return false; }
    const duration = Math.round(Number(durationMinutes));
    if (!Number.isFinite(duration) || duration <= 0) { alert('Enter a valid duration.'); return false; }
    if (duration > MAX_SESSION_DURATION_MINUTES) {
      alert(`A single session can't be longer than ${MAX_SESSION_DURATION_MINUTES / 60} hours.`);
      return false;
    }
    const start = new Date(`${dateStr}T${startTimeStr}`);
    if (Number.isNaN(start.getTime())) { alert('That date/time couldn\'t be understood.'); return false; }

    // FIX: reset is_live back to false whenever the time/duration changes —
    // otherwise a session the teacher had already started, then got
    // rescheduled to a later date/time, would still read as "live" and let
    // students straight into a room for a class that hasn't actually
    // started yet under its new time (see getLiveButtonMode()).
    const { error } = await supabase
      .from('class_schedule')
      .update({ scheduled_time: start.toISOString(), duration_minutes: duration, is_live: false })
      .eq('id', id);

    if (error) { alert('Could not update the session: ' + error.message); return false; }
    return true;
  }

  // FIX: root cause of "add option for admin to ... delete [a scheduled]
  // session". Deleting a currently-live session's row also ends it for
  // everyone on the call — loadSchedule() (see its FIX note above) notices
  // the row is gone and force-closes any open call tied to it.
  async function deleteScheduledSession(id) {
    if (!confirm('Delete this scheduled session? This can\'t be undone.')) return false;
    const { error } = await supabase.from('class_schedule').delete().eq('id', id);
    if (error) { alert('Could not delete: ' + error.message); return false; }
    return true;
  }

  // FIX: root cause of "end live session anytime, even during the
  // session" — the counterpart to endLiveSessionForEveryone() for when the
  // admin wants to end a session from a schedule list rather than from
  // inside the call itself. Pushes the row's end time to right now
  // (duration_minutes = however many minutes have actually elapsed since
  // it started); every connected client notices via realtime and closes
  // any call open against it — see loadSchedule()'s FIX note.
  async function endScheduledSessionNow(id, scheduledTimeIso) {
    if (!confirm('End this live session now for everyone in the group?')) return;
    const startedAt = scheduledTimeIso ? new Date(scheduledTimeIso).getTime() : null;
    const elapsedMinutes = startedAt
      ? Math.max(1, Math.ceil((Date.now() - startedAt) / 60000))
      : null;

    // The row's own scheduled_time wasn't always passed in by callers
    // (schedule list rows already know it from the DOM data, but let's not
    // require that) — fetch it if needed so the row genuinely ends "now"
    // rather than getting an arbitrary short duration.
    let duration = elapsedMinutes;
    if (duration === null) {
      const { data, error } = await supabase.from('class_schedule').select('scheduled_time').eq('id', id).maybeSingle();
      if (error || !data) { alert('Could not find that session.'); return; }
      duration = Math.max(1, Math.ceil((Date.now() - new Date(data.scheduled_time).getTime()) / 60000));
    }

    const { error } = await supabase.from('class_schedule').update({ duration_minutes: duration, is_live: false }).eq('id', id);
    if (error) { alert('Could not end the session: ' + error.message); return; }
  }

  // Safety ceiling on how many dates one "Set time" submission can insert.
  // Since dates are now picked by hand on the calendar (see below) rather
  // than generated by a repeat pattern, this is really just a guard
  // against something going wrong in the selection bookkeeping — nobody
  // taps 200 individual calendar cells on purpose.
  const MAX_SCHEDULE_OCCURRENCES = 200;

  // ------------------------------------------------------------
  // Multi-date calendar picker
  // ------------------------------------------------------------
  // FIX: root cause of "make it easy for an admin to select dates from a
  // calendar, with a starting time and duration that automatically sets
  // the end time" — scheduling used to take exactly one date (or a fixed
  // weekly/monthly repeat pattern) through native inputs, with the end
  // time typed in by hand. This is a real, tappable month calendar
  // (#scheduleCalGrid) — any combination of dates, across any number of
  // future months via the ‹/› nav — building a checklist-style set of
  // selected dates. A single Starts + Duration pair is entered once and
  // "Ends" is always computed, never typed (see updateScheduleEndPreview()
  // / computeScheduleEndLabel() below).
  let scheduleCalendarViewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let scheduleSelectedDates = new Set(); // 'YYYY-MM-DD' strings
  // FIX: root cause of "add a checkbox to finalize whether the class is on
  // the same time and duration, if not then set a different time" —
  // per-date Starts/Duration overrides, only used when
  // #scheduleSameTimeCheckbox is unchecked. Keyed by the same 'YYYY-MM-DD'
  // strings as scheduleSelectedDates; a date with no entry here just falls
  // back to the shared Starts/Duration fields.
  let schedulePerDateOverrides = new Map(); // 'YYYY-MM-DD' -> { start, duration }
  // Which channel the selection above belongs to — switching groups should
  // start the admin with a clean slate, not carry over another group's
  // half-built schedule.
  let scheduleCalendarChannelId = null;

  function scheduleDateKey(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function resetScheduleSelection() {
    scheduleSelectedDates = new Set();
    schedulePerDateOverrides = new Map();
    scheduleCalendarViewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  }

  function renderScheduleCalendar() {
    if (!DOM.scheduleCalGrid || !DOM.scheduleCalMonthLabel) return;
    const year = scheduleCalendarViewMonth.getFullYear();
    const month = scheduleCalendarViewMonth.getMonth();
    DOM.scheduleCalMonthLabel.textContent = scheduleCalendarViewMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = scheduleDateKey(new Date());
    const todayMidnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

    let cellsHtml = '';
    for (let i = 0; i < startWeekday; i++) {
      cellsHtml += '<span class="schedule-cal-cell is-empty"></span>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const key = scheduleDateKey(cellDate);
      const isPast = cellDate.getTime() < todayMidnight;
      const isSelected = scheduleSelectedDates.has(key);
      const isToday = key === todayKey;
      cellsHtml += `<button type="button" class="schedule-cal-cell${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}" data-date="${key}"${isPast ? ' disabled' : ''}>${day}</button>`;
    }
    DOM.scheduleCalGrid.innerHTML = cellsHtml;

    DOM.scheduleCalGrid.querySelectorAll('.schedule-cal-cell[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => toggleScheduleDate(cell.dataset.date));
    });
  }

  function toggleScheduleDate(dateKey) {
    if (scheduleSelectedDates.has(dateKey)) {
      scheduleSelectedDates.delete(dateKey);
      schedulePerDateOverrides.delete(dateKey);
    } else if (scheduleSelectedDates.size < MAX_SCHEDULE_OCCURRENCES) {
      scheduleSelectedDates.add(dateKey);
    } else {
      alert(`You can schedule at most ${MAX_SCHEDULE_OCCURRENCES} dates at once.`);
      return;
    }
    renderScheduleCalendar();
    renderScheduleSelectedDates();
    renderSchedulePerDateList();
  }

  function scheduleDateLabel(dateKey) {
    return new Date(`${dateKey}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function renderScheduleSelectedDates() {
    if (!DOM.scheduleSelectedDates) return;
    if (!scheduleSelectedDates.size) {
      DOM.scheduleSelectedDates.innerHTML = '<span class="empty-note">Tap dates above to schedule a session on each.</span>';
      return;
    }
    const sorted = Array.from(scheduleSelectedDates).sort();
    DOM.scheduleSelectedDates.innerHTML = sorted.map((key) => `
      <span class="schedule-date-chip">
        ${escapeHtml(scheduleDateLabel(key))}
        <button type="button" class="schedule-date-chip-remove" data-date="${key}" aria-label="Remove ${escapeHtml(scheduleDateLabel(key))}"><i class="fas fa-xmark"></i></button>
      </span>
    `).join('');

    DOM.scheduleSelectedDates.querySelectorAll('.schedule-date-chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => toggleScheduleDate(btn.dataset.date));
    });
  }

  // Combines an "HH:MM" time with a duration in minutes and returns the
  // resulting clock time as a display string — the "automatically set end
  // time from starting time" piece. Never lets the admin type an end time
  // directly; it's always derived.
  function computeScheduleEndLabel(startTimeStr, durationMinutes) {
    if (!startTimeStr || !durationMinutes) return '—';
    const [h, m] = startTimeStr.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
    const end = new Date(2000, 0, 1, h, m + durationMinutes);
    return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function updateScheduleEndPreview() {
    if (!DOM.scheduleEndPreview) return;
    const duration = parseInt(DOM.scheduleDurationInput.value, 10);
    DOM.scheduleEndPreview.textContent = computeScheduleEndLabel(DOM.scheduleStartTimeInput.value, duration);
  }

  // FIX: the checkbox this renders under — "Same start time & duration for
  // every date selected above" — is the "checkbox to finalize whether the
  // class is on the same time and duration" from the request. Checked
  // (default): the shared Starts/Duration fields apply to every selected
  // date and this list stays hidden. Unchecked: one row per selected date,
  // each with its own Starts/Duration (pre-filled from the shared values,
  // and only actually recorded in schedulePerDateOverrides once the admin
  // edits that row) — "if not then set a different time while selecting
  // dates".
  function renderSchedulePerDateList() {
    if (!DOM.schedulePerDateList) return;
    const sameTime = !DOM.scheduleSameTimeCheckbox || DOM.scheduleSameTimeCheckbox.checked;
    DOM.schedulePerDateList.classList.toggle('hidden', sameTime);
    if (sameTime) return;

    if (!scheduleSelectedDates.size) {
      DOM.schedulePerDateList.innerHTML = '<div class="empty-note">Select dates on the calendar above first.</div>';
      return;
    }

    const defaultStart = DOM.scheduleStartTimeInput.value || '09:00';
    const defaultDuration = parseInt(DOM.scheduleDurationInput.value, 10) || 45;
    const sorted = Array.from(scheduleSelectedDates).sort();

    DOM.schedulePerDateList.innerHTML = sorted.map((key) => {
      const override = schedulePerDateOverrides.get(key) || { start: defaultStart, duration: defaultDuration };
      return `
        <div class="schedule-per-date-row" data-date="${key}">
          <span class="schedule-per-date-label">${escapeHtml(scheduleDateLabel(key))}</span>
          <input type="time" class="field-sm schedule-per-date-start" data-date="${key}" value="${escapeHtml(override.start)}">
          <input type="number" min="5" max="${MAX_SESSION_DURATION_MINUTES}" step="5" class="field-sm schedule-per-date-duration" data-date="${key}" value="${override.duration}" title="Duration (minutes)">
          <span class="schedule-per-date-end" data-date="${key}">Ends ${escapeHtml(computeScheduleEndLabel(override.start, override.duration))}</span>
        </div>
      `;
    }).join('');

    DOM.schedulePerDateList.querySelectorAll('.schedule-per-date-start, .schedule-per-date-duration').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.date;
        const row = input.closest('.schedule-per-date-row');
        const startVal = row.querySelector('.schedule-per-date-start').value || defaultStart;
        const durationVal = parseInt(row.querySelector('.schedule-per-date-duration').value, 10) || defaultDuration;
        schedulePerDateOverrides.set(key, { start: startVal, duration: durationVal });
        row.querySelector('.schedule-per-date-end').textContent = `Ends ${computeScheduleEndLabel(startVal, durationVal)}`;
      });
    });
  }

  // occurrences: [{ dateKey: 'YYYY-MM-DD', start: 'HH:MM', duration: <minutes> }, ...]
  //
  // FIX: root cause of "no meeting ending time" — duration is entered once
  // (or per-date), and the real end clock time is always derived from it
  // here (never typed), giving joinLiveClass() an accurate moment to
  // auto-close the call at and loadSchedule() an accurate end time to
  // decide the live-session button is still "current".
  //
  // SCHEMA REQUIREMENT for the Start/Join gating in getLiveButtonMode() /
  // updateLiveButtonState() / joinLiveClass(): class_schedule needs an
  // `is_live` boolean column (default false) so the app can tell "a class
  // is scheduled for this window" apart from "the teacher has actually
  // pressed Start". Run this once in the Supabase SQL editor:
  //   alter table class_schedule add column if not exists is_live boolean not null default false;
  // New rows don't need to set it explicitly below — the column default
  // covers that — but it's spelled out here so it's obvious where it's
  // consumed.
  async function setClassSchedule(teacherUsername, occurrences) {
    if (!state.currentChannel) { alert('Select a channel first.'); return false; }
    teacherUsername = normalizeUsername(teacherUsername);
    if (!teacherUsername) { alert('Enter a teacher username.'); return false; }
    if (!occurrences || !occurrences.length) { alert('Tap at least one date on the calendar.'); return false; }

    const registeredRole = state.roleCache[teacherUsername.toLowerCase()];
    if (registeredRole !== CONFIG.AUTH.ROLES.TEACHER) {
      alert(`"${teacherUsername}" isn't a registered teacher account. Create it first from Settings → Add teacher or student.`);
      return false;
    }

    const rows = [];
    for (const occ of occurrences) {
      if (!occ.start) { alert(`Enter a start time for ${scheduleDateLabel(occ.dateKey)}.`); return false; }
      const duration = Math.round(Number(occ.duration));
      if (!Number.isFinite(duration) || duration <= 0) {
        alert(`Enter a valid duration for ${scheduleDateLabel(occ.dateKey)}.`);
        return false;
      }
      if (duration > MAX_SESSION_DURATION_MINUTES) {
        alert(`A single session can't be longer than ${MAX_SESSION_DURATION_MINUTES / 60} hours (${scheduleDateLabel(occ.dateKey)}).`);
        return false;
      }
      const start = new Date(`${occ.dateKey}T${occ.start}`);
      if (Number.isNaN(start.getTime())) {
        alert(`That date/time couldn't be understood for ${scheduleDateLabel(occ.dateKey)}.`);
        return false;
      }
      rows.push({
        channel_id: state.currentChannel.id,
        teacher_username: teacherUsername,
        scheduled_time: start.toISOString(),
        duration_minutes: duration,
        set_by: state.currentUser.username,
      });
    }

    const { error } = await supabase.from('class_schedule').insert(rows);

    if (error) { alert('Could not set schedule: ' + error.message); return false; }
    alert(
      rows.length === 1
        ? `✅ Class time set for ${teacherUsername}`
        : `✅ ${rows.length} sessions scheduled for ${teacherUsername}.`
    );
    await loadSchedule(state.currentChannel.id);
    return true;
  }

  // ============================================================
  // 8f. ADMIN — ALL-GROUPS LIVE SESSIONS CALENDAR
  // ============================================================
  // FIX: root cause of "admin can't see the calendar within every group to
  // decide who teaches when". Scheduling itself lived only inside a single
  // group's Profile screen (#adminProfileSchedule), one group at a time —
  // there was no view an admin could open to see every scheduled session,
  // in every group, together. This adds a dedicated admin-only screen
  // (#screenCalendar) that lists every class_schedule row across ALL
  // channels — grouped by day, sorted by time, each row showing group,
  // teacher and duration — so an admin can actually compare who's teaching
  // what, when, and for how long before deciding on a new time. Tapping a
  // row jumps straight into that group's Profile screen so the admin can
  // reschedule it right there.
  let calendarSubscription = null;

  async function loadAllSchedules() {
    if (DOM.calendarList) DOM.calendarList.innerHTML = '<div class="empty-note">Loading schedule…</div>';

    const { data, error } = await supabase
      .from('class_schedule')
      .select('*')
      .gte('scheduled_time', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.warn('loadAllSchedules failed:', error);
      if (DOM.calendarList) DOM.calendarList.innerHTML = '<div class="empty-note">Could not load the schedule.</div>';
      return;
    }
    renderCalendarList(data || []);
  }

  function renderCalendarList(rows) {
    if (!DOM.calendarList) return;

    if (!rows.length) {
      DOM.calendarList.innerHTML = '<div class="empty-note">No live sessions scheduled in any group yet.</div>';
      return;
    }

    const channelNameById = new Map(allChannels.map((c) => [String(c.id), c.name]));

    // Group rows by calendar day, preserving the ascending time order the
    // query already returned them in.
    const dayOrder = [];
    const dayGroups = new Map();
    rows.forEach((row) => {
      const dateKey = new Date(row.scheduled_time).toDateString();
      if (!dayGroups.has(dateKey)) {
        dayGroups.set(dateKey, []);
        dayOrder.push(dateKey);
      }
      dayGroups.get(dateKey).push(row);
    });

    const todayKey = new Date().toDateString();
    const tomorrowKey = new Date(Date.now() + 24 * 60 * 60 * 1000).toDateString();

    DOM.calendarList.innerHTML = dayOrder.map((dateKey) => {
      const dayRows = dayGroups.get(dateKey);
      let dayLabel;
      if (dateKey === todayKey) dayLabel = 'Today';
      else if (dateKey === tomorrowKey) dayLabel = 'Tomorrow';
      else dayLabel = new Date(dayRows[0].scheduled_time).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

      return `
        <div class="calendar-day-group">
          <div class="calendar-day-label">${escapeHtml(dayLabel)}</div>
          ${dayRows.map((row) => calendarItemHtml(row, channelNameById)).join('')}
        </div>
      `;
    }).join('');

    DOM.calendarList.querySelectorAll('.calendar-item-link').forEach((el) => {
      el.addEventListener('click', () => {
        const channel = allChannels.find((c) => String(c.id) === el.dataset.channelId);
        if (!channel) { alert('That group no longer exists.'); return; }
        selectChannel(channel);
        goToScreen('profile');
      });
    });
    // FIX: root cause of "add option for admin to ... delete and end live
    // session anytime" on the cross-group calendar — reuses the same
    // deleteScheduledSession()/endScheduledSessionNow() that power the
    // per-group Scheduled Classes list, so an admin can act on a session
    // right from this overview without navigating into the group first.
    // This screen is already admin-only (see viewCalendarBtn's gating), so
    // no extra role check is needed here.
    DOM.calendarList.querySelectorAll('.calendar-item-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await deleteScheduledSession(btn.dataset.id);
        if (ok) loadAllSchedules();
      });
    });
    DOM.calendarList.querySelectorAll('.calendar-item-end').forEach((btn) => {
      btn.addEventListener('click', () => endScheduledSessionNow(btn.dataset.id));
    });
  }

  function calendarItemHtml(row, channelNameById) {
    const start = new Date(row.scheduled_time);
    const durationMinutes = row.duration_minutes || 45;
    const end = new Date(start.getTime() + durationMinutes * 60000);
    const startLabel = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endLabel = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const groupName = channelNameById.get(String(row.channel_id)) || 'Unknown group';
    const isLiveNow = Date.now() >= start.getTime() && Date.now() < end.getTime();

    return `
      <div class="calendar-item${isLiveNow ? ' is-live' : ''}">
        <button type="button" class="calendar-item-link" data-channel-id="${escapeHtml(String(row.channel_id))}">
          <div class="calendar-item-time">
            <span class="calendar-item-time-start">${startLabel}</span>
            <span class="calendar-item-time-end">${endLabel}</span>
          </div>
          <div class="calendar-item-text">
            <div class="calendar-item-group">${escapeHtml(groupName)}</div>
            <div class="calendar-item-teacher"><i class="fas fa-chalkboard-user"></i> ${escapeHtml(getDisplayName(row.teacher_username))}</div>
          </div>
          <div class="calendar-item-duration">${isLiveNow ? '<span class="calendar-live-dot" title="Live now"></span>' : ''}${durationMinutes}m</div>
        </button>
        <div class="calendar-item-admin-actions">
          ${isLiveNow ? `<button type="button" class="icon-btn calendar-item-end" data-id="${row.id}" title="End this live session now for everyone"><i class="fas fa-ban" style="color:var(--danger);"></i></button>` : ''}
          <button type="button" class="icon-btn calendar-item-delete" data-id="${row.id}" title="Delete"><i class="fas fa-trash" style="color:var(--danger);"></i></button>
        </div>
      </div>
    `;
  }

  // FIX: the "Live now" marker on each row (see calendarItemHtml() above)
  // only ever got recomputed when a postgres_changes event fired or the
  // screen was reopened — so it wouldn't flip on/off by itself as the
  // clock crossed a session's start/end while an admin just sat looking at
  // the list. A light re-render every 30s (cheap — allChannels/rows are
  // already in memory, no extra network call) keeps it honest without
  // needing a dedicated timer per row.
  let calendarLiveRefreshInterval = null;

  function subscribeToAllSchedules() {
    if (calendarSubscription) {
      supabase.removeChannel(calendarSubscription);
      calendarSubscription = null;
    }
    calendarSubscription = supabase
      .channel('schedule:all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_schedule' }, () => loadAllSchedules())
      .subscribe();

    if (calendarLiveRefreshInterval) clearInterval(calendarLiveRefreshInterval);
    calendarLiveRefreshInterval = setInterval(() => loadAllSchedules(), 30000);
  }

  function unsubscribeFromAllSchedules() {
    if (calendarSubscription) {
      supabase.removeChannel(calendarSubscription);
      calendarSubscription = null;
    }
    if (calendarLiveRefreshInterval) {
      clearInterval(calendarLiveRefreshInterval);
      calendarLiveRefreshInterval = null;
    }
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
    // Visible to every role — see loadGroupScheduleList() in the CLASS
    // SCHEDULING section above.
    loadGroupScheduleList(state.currentChannel.id);

    // FIX: the admin's in-progress calendar selection (scheduleSelectedDates
    // etc.) is only ever meaningful for one group at a time. Without this
    // check, switching from group A (with 3 dates half-picked) to group B
    // would show B's schedule form still carrying A's selected dates —
    // and submitting would silently schedule them against the WRONG group.
    // Reset to a clean slate whenever the viewed channel actually changes.
    if (DOM.scheduleCalGrid && scheduleCalendarChannelId !== state.currentChannel.id) {
      scheduleCalendarChannelId = state.currentChannel.id;
      resetScheduleSelection();
      renderScheduleCalendar();
      renderScheduleSelectedDates();
      renderSchedulePerDateList();
    }

    const media = state.messages.filter((m) => isImageFile(m.file_url));
    if (!media.length) {
      DOM.sharedMediaGrid.innerHTML = '<div class="empty-note">No shared media yet</div>';
      DOM.profileSeeAllMedia.classList.add('hidden');
      return;
    }
    const showAll = DOM.sharedMediaGrid.dataset.showAll === 'true';
    const shown = showAll ? media : media.slice(-6);
    // FIX: "media in the Shared Media section can't be opened" — these <img>
    // tags were rendered with no click handling at all (unlike chat bubbles,
    // which are wired up via the DOM.chatMessages delegated listener +
    // openImageLightbox() below). Clicking a thumbnail here did nothing.
    // Give every thumbnail a data-media-url (+ data-media-index) so the
    // delegated click listener registered further down (see
    // DOM.sharedMediaGrid.addEventListener('click', ...)) can open it in
    // the same in-app lightbox the chat already uses.
    //
    // FIX: "in shared media section when I open the media it doesn't allow
    // me to move on next by swiping left or right" — stash the ordered URL
    // list so the lightbox opened from here knows the full gallery, not
    // just the single tapped image, and can swipe/arrow through it.
    state.sharedMediaUrls = shown.map((m) => m.file_url);
    DOM.sharedMediaGrid.innerHTML = shown.map((m, i) => `<img src="${escapeHtml(m.file_url)}" data-media-url="${escapeHtml(m.file_url)}" data-media-index="${i}" alt="Shared media" loading="lazy" style="cursor:pointer;">`).join('');
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
    // FIX: "admin can't see who has seen the updates" — this feature never
    // existed: showStatusModal() rendered a status but never recorded that
    // anyone had opened it, and there was no table/query backing a viewer
    // list. loadStatusViews() below fetches the status_views rows for the
    // statuses just loaded so renderStatuses() can show a seen count, and
    // subscribeToStatusViews() keeps that live as new views come in.
    await loadStatusViews(state.statuses.map((s) => s.id));
    subscribeToStatusViews();
    renderStatuses();
  }

  // ============================================================
  // 10b. UPDATE (STATUS) READ RECEIPTS — "seen by"
  // ============================================================
  async function loadStatusViews(statusIds) {
    state.statusViews = new Map();
    if (!statusIds || !statusIds.length) return;

    const { data, error } = await supabase
      .from('status_views')
      .select('status_id, username, viewed_at')
      .in('status_id', statusIds);

    if (error) {
      // FIX: same "make it visible, don't fail silently" approach as
      // refreshUnreadBadges()/loadMessageReads() — a missing status_views
      // table or a blocking RLS policy is the most likely reason an admin
      // sees zero viewers on every update.
      console.warn('Failed to load status views (create a `status_views` table with SELECT/INSERT policies if missing):', error);
      return;
    }
    (data || []).forEach((row) => {
      const list = state.statusViews.get(row.status_id) || [];
      list.push({ username: row.username, viewed_at: row.viewed_at });
      state.statusViews.set(row.status_id, list);
    });
  }

  function teardownStatusViewsSubscription() {
    if (!state.statusViewsSubscription) return;
    supabase.removeChannel(state.statusViewsSubscription);
    state.statusViewsSubscription = null;
  }

  function subscribeToStatusViews() {
    teardownStatusViewsSubscription();
    state.statusViewsSubscription = supabase
      .channel('status_views:all')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'status_views',
      }, (payload) => {
        const row = payload.new;
        const list = state.statusViews.get(row.status_id) || [];
        if (!list.some((r) => r.username === row.username)) {
          list.push({ username: row.username, viewed_at: row.viewed_at });
          state.statusViews.set(row.status_id, list);
          renderStatuses();
        }
      })
      .subscribe();
  }

  // Records that the current user opened this update, so an admin can later
  // see who has viewed it. Skips the poster's own view (an author doesn't
  // need to show up in their own "seen by" list) and non-logged-in states.
  async function recordStatusView(status) {
    if (!status || !state.currentUser) return;
    if (normalizeUsername(status.username) === state.currentUser.username) return;

    const row = { status_id: status.id, username: state.currentUser.username, viewed_at: new Date().toISOString() };
    const { error } = await supabase
      .from('status_views')
      .upsert(row, { onConflict: 'status_id,username', ignoreDuplicates: true });

    if (error) {
      console.warn('Failed to record status view (create a `status_views` table with an INSERT policy if missing):', error);
      return;
    }

    const list = state.statusViews.get(status.id) || [];
    if (!list.some((r) => r.username === row.username)) {
      list.push({ username: row.username, viewed_at: row.viewed_at });
      state.statusViews.set(status.id, list);
      if (state.isAdmin) renderStatuses();
    }
  }

  // Admin-only "Seen by" list for a single update — mirrors
  // openMessageInfoModal()'s read-receipt list further up in the file.
  //
  // FIX: "admin can't see who have seen from all users" — the first version
  // of this modal only listed the users who HAD viewed the update, so an
  // admin had no way to tell who among everyone still hadn't seen it. This
  // now shows the full roster: every registered user (state.roleCache,
  // populated by loadRoleCache() at login — see completeLogin()) split into
  // "Seen" and "Not seen yet", not just the viewers.
  function openStatusInfoModal(status) {
    if (!status) return;
    const views = (state.statusViews.get(status.id) || [])
      .slice()
      .sort((a, b) => new Date(a.viewed_at) - new Date(b.viewed_at));
    const seenUsernames = new Set(views.map((v) => v.username));

    const posterKey = normalizeUsername(status.username);
    const allOtherUsers = Object.keys(state.roleCache)
      .filter((u) => u !== posterKey)
      .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    const notSeen = allOtherUsers.filter((u) => !seenUsernames.has(u));

    const rowHtml = (username, timeHtml) => `
      <div class="msg-info-row">
        ${avatarHtml(username, 'sm')}
        <span class="msg-info-name">${escapeHtml(getDisplayName(username))}</span>
        ${timeHtml}
      </div>
    `;

    const seenRows = views.length
      ? views.map((v) => rowHtml(v.username, `<span class="msg-info-time">${escapeHtml(formatFullDate(v.viewed_at))}</span>`)).join('')
      : `<div class="empty-note">No one yet</div>`;

    const notSeenRows = notSeen.length
      ? notSeen.map((u) => rowHtml(u, `<span class="msg-info-time msg-info-notdelivered">Not seen</span>`)).join('')
      : `<div class="empty-note">Everyone has seen this</div>`;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-title"><i class="fas fa-eye"></i> Seen by</div>
        <div class="msg-info-section-label">Seen (${views.length})</div>
        <div class="msg-info-list">${seenRows}</div>
        <div class="msg-info-section-label">Not seen yet (${notSeen.length})</div>
        <div class="msg-info-list">${notSeenRows}</div>
        <button class="btn-secondary msg-info-close" style="width:100%; margin-top:14px;">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.msg-info-close').addEventListener('click', close);
  }

  function renderStatuses() {
    exitStatusSelection();
    DOM.statusTray.innerHTML = '';

    if (!state.statuses.length) {
      DOM.statusTray.innerHTML = '<div class="empty-note">No updates yet</div>';
    } else {
      state.statuses.forEach((st) => {
        const item = document.createElement('div');
        item.className = 'update-row';
        item.dataset.id = st.id;
        const displayName = getDisplayName(st.username);
        const preview = st.content
          ? escapeHtml(truncate(st.content, 46))
          : (st.media_url ? '<i class="fas fa-camera"></i> Photo/video' : '');
        // FIX: admin-visible "seen by N" count so it's clear at a glance who
        // has viewed an update, without needing to open each one — tapping
        // it (via long-press/right-click → the eye icon) opens the full
        // list in openStatusInfoModal().
        const seenCount = (state.statusViews.get(st.id) || []).length;
        const seenBadge = state.isAdmin
          ? `<span class="update-row-seen"><i class="fas fa-eye"></i> ${seenCount}</span>`
          : '';
        item.innerHTML = `
          ${avatarHtml(st.username)}
          <div class="update-row-body">
            <div class="update-row-name">${escapeHtml(displayName)}</div>
            <div class="update-row-preview">${preview}</div>
          </div>
          <div class="update-row-time">
            ${formatTimeAgo(st.created_at)}
            ${seenBadge}
          </div>
        `;
        // FIX: the trash icon that used to sit beside every row (visible
        // to admins at all times) is replaced by the same long-press
        // (mobile) / right-click (desktop) selection-header pattern used
        // for channels — see selectStatusForActions()/exitStatusSelection()
        // below and #channelSelectHeader in renderChatList().
        if (state.isAdmin) {
          item.addEventListener('touchstart', () => startStatusLongPress(item, st), { passive: true });
          ['touchend', 'touchmove', 'touchcancel'].forEach((evt) => {
            item.addEventListener(evt, clearStatusLongPressTimer);
          });
          item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            selectStatusForActions(item, st);
          });
        }
        item.addEventListener('pointerup', (e) => {
          if (e.button === 2) return;
          if (statusLongPressFired) { statusLongPressFired = false; return; }
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

  // FIX: long-press (mobile) / right-click (desktop) selection for a
  // status update, mirroring startChannelLongPress()/selectChannelForActions()
  // above — swaps the "Updates" header for a select bar with a Delete
  // action instead of showing a delete icon beside every row.
  let statusLongPressTimer = null;
  let statusLongPressFired = false;
  let selectedStatus = null;

  function clearStatusLongPressTimer() {
    if (statusLongPressTimer) { clearTimeout(statusLongPressTimer); statusLongPressTimer = null; }
  }

  function startStatusLongPress(row, st) {
    clearStatusLongPressTimer();
    statusLongPressTimer = setTimeout(() => {
      statusLongPressFired = true;
      selectStatusForActions(row, st);
    }, 500);
  }

  function selectStatusForActions(row, st) {
    exitStatusSelection();
    selectedStatus = st;
    row.classList.add('active');

    if (DOM.updatesScreenHeader) DOM.updatesScreenHeader.classList.add('hidden');
    if (DOM.statusSelectHeader) DOM.statusSelectHeader.classList.remove('hidden');
    if (DOM.statusSelectCount) DOM.statusSelectCount.textContent = getDisplayName(st.username);
  }

  function exitStatusSelection() {
    if (!selectedStatus) return;
    selectedStatus = null;

    if (DOM.statusSelectHeader) DOM.statusSelectHeader.classList.add('hidden');
    if (DOM.updatesScreenHeader) DOM.updatesScreenHeader.classList.remove('hidden');
    DOM.statusTray.querySelectorAll('.update-row.active').forEach((r) => r.classList.remove('active'));
  }

  if (DOM.statusSelectCloseBtn) DOM.statusSelectCloseBtn.addEventListener('click', exitStatusSelection);

  // FIX: wires up the new "Seen by" (eye) button in the update
  // selection header — long-press/right-click an update, then tap the eye
  // icon to see who has viewed it. See openStatusInfoModal() above.
  if (DOM.statusSelectInfoBtn) {
    DOM.statusSelectInfoBtn.addEventListener('click', () => {
      const st = selectedStatus;
      exitStatusSelection();
      if (st) openStatusInfoModal(st);
    });
  }

  if (DOM.statusSelectDeleteBtn) {
    DOM.statusSelectDeleteBtn.addEventListener('click', () => {
      const st = selectedStatus;
      exitStatusSelection();
      if (st) deleteStatus(st.id);
    });
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
    // FIX: this is the actual "seen" moment — record it so admins can see
    // who viewed this update (see recordStatusView()/openStatusInfoModal()).
    // Fire-and-forget: the viewer shouldn't wait on a network round trip to
    // watch their update.
    recordStatusView(status);

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

    // FIX: "display media in full screen not in small screen" — previously
    // the media (img/video) was always rendered inside the padded,
    // max-height:60vh box meant for text-only updates, so photos/videos
    // showed up as a small, letterboxed card instead of filling the
    // viewer. Toggle a class that lets styles.css switch the media element
    // to fill the whole viewer body edge-to-edge (see .status-viewer-body
    // .has-media rules) whenever this update actually has media; text-only
    // updates keep the original centered layout.
    if (DOM.statusViewerBody) {
      DOM.statusViewerBody.classList.toggle('has-media', !!status.media_url);
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

  // FIX: root cause of "meeting doesn't automatically close" — there was
  // no concept of a session end time anywhere in the video-call code path,
  // so a call just ran until someone remembered to tap the close button,
  // however long past its booked slot that was. Now that class_schedule
  // rows carry a real end time (start + duration_minutes — see
  // setClassSchedule()), joinLiveClass() can arm a timer for exactly when
  // *this* session is booked to end and close the call automatically.
  let liveSessionAutoCloseTimer = null;

  function clearLiveSessionAutoCloseTimer() {
    if (liveSessionAutoCloseTimer) {
      clearTimeout(liveSessionAutoCloseTimer);
      liveSessionAutoCloseTimer = null;
    }
  }

  function closeLiveSession(message) {
    // FIX: several code paths can now try to close the same call around
    // the same moment — the natural auto-close timer, loadSchedule()'s
    // force-close check, a manual tap of the close button — all racing
    // to call this. Only the FIRST one that finds a call actually active
    // should alert; capturing this before flipping state.videoActive off
    // stops the others from popping a duplicate "session ended" alert.
    const wasActive = state.videoActive;
    clearLiveSessionAutoCloseTimer();
    DOM.videoContainer.classList.add('hidden');
    DOM.videoIframe.src = '';
    state.videoActive = false;
    state.activeCallScheduleId = null;
    if (DOM.endLiveSessionBtn) DOM.endLiveSessionBtn.classList.add('hidden');
    if (message && wasActive) alert(message);
  }

  // FIX: root cause of "add option for admin to ... end live session
  // anytime, even during the session" — closing a call used to only ever
  // affect the person who tapped the local close button; there was no way
  // for an admin to end it for everyone else still on the call. This
  // pushes the session's end time to right now (reusing the same
  // class_schedule row + duration_minutes column everything else already
  // reads/writes — no schema change), which realtime pushes to every
  // client with this group open; each one independently notices (in
  // loadSchedule() above) that their open call's schedule is no longer
  // current and force-closes it. See the "End for everyone" button wired
  // to this in the video overlay, and endScheduledSessionNow() below for
  // the equivalent action from a schedule list row when the admin isn't
  // even on the call.
  async function endLiveSessionForEveryone() {
    if (!state.activeCallScheduleId) { closeLiveSession(); return; }
    if (!confirm('End this live session now for everyone in the group?')) return;

    const startedAt = state.currentSchedule && String(state.currentSchedule.id) === String(state.activeCallScheduleId)
      ? new Date(state.currentSchedule.scheduled_time).getTime()
      : Date.now();
    const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - startedAt) / 60000));

    const { error } = await supabase
      .from('class_schedule')
      .update({ duration_minutes: elapsedMinutes, is_live: false })
      .eq('id', state.activeCallScheduleId);

    if (error) { alert('Could not end the session: ' + error.message); return; }
    // Realtime will also reach every other participant's client and close
    // their call — but close this one immediately rather than waiting on
    // this client's own round trip back through the subscription.
    closeLiveSession('You ended this live session for everyone.');
  }

  async function joinLiveClass() {
    if (!state.currentUser || !state.currentChannel) { alert('Please select a channel first.'); return; }

    // FIX: belt-and-suspenders alongside the `disabled`/`hidden` state
    // updateLiveButtonState() keeps the button in — only actually open the
    // call if getLiveButtonMode() agrees this click was legitimate (either
    // the concerned teacher starting it inside the scheduled window, or
    // anyone joining a class that's already live). Stops a stale click
    // (e.g. one queued right as a schedule row got deleted/rescheduled)
    // from opening a call that shouldn't exist anymore.
    const mode = getLiveButtonMode();
    if (mode === 'hidden') { return; }

    // FIX: root cause of "students can join the moment a class is
    // scheduled, without the teacher ever pressing Start" — there was no
    // notion anywhere of the teacher having actually started the room.
    // class_schedule.is_live starts false (see the FIX note above
    // setClassSchedule() — requires that boolean column) and is flipped
    // true here, exactly once, the moment the concerned teacher presses
    // Start. Realtime (subscribeToSchedule() above) pushes that row change
    // to every other client with this group open, which re-runs
    // loadSchedule() → updateLiveButtonState() — that's what actually
    // reveals the Join button to students, not anything client-side.
    if (mode === 'start' && state.currentSchedule && !state.currentSchedule.is_live) {
      const { error: liveError } = await supabase
        .from('class_schedule')
        .update({ is_live: true })
        .eq('id', state.currentSchedule.id);
      if (liveError) {
        console.warn('Could not mark session live:', liveError);
      } else {
        state.currentSchedule.is_live = true;
      }
    }

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
    state.activeCallScheduleId = state.currentSchedule ? state.currentSchedule.id : null;
    // Button label now tracks the same start/join mode the header button
    // uses (see getLiveButtonMode()/updateLiveButtonState()), instead of
    // the old `state.isTeacher` check — that was true for every teacher and
    // every admin account, not just whoever actually started this session.
    updateLiveButtonState();
    if (DOM.endLiveSessionBtn) {
      DOM.endLiveSessionBtn.classList.toggle('hidden', !(state.isAdmin && state.activeCallScheduleId));
    }

    // Arm the auto-close timer against this specific session's real end
    // time. If somehow already past it (clock drift, a slow join right at
    // the wire), close immediately instead of leaving the call open with
    // no timer at all.
    clearLiveSessionAutoCloseTimer();
    if (state.currentSchedule) {
      const endsAt = new Date(state.currentSchedule.scheduled_time).getTime() + (state.currentSchedule.duration_minutes || 45) * 60000;
      const msRemaining = endsAt - Date.now();
      if (msRemaining <= 0) {
        closeLiveSession('⏰ This session\'s scheduled time is already up.');
      } else {
        liveSessionAutoCloseTimer = setTimeout(() => {
          closeLiveSession('⏰ This session\'s scheduled time is up — the call has been closed.');
        }, msRemaining);
      }
    }
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

  // FIX: admins had no way to see the full roster or tell who was in a
  // group vs. left dangling with no group at all — "Manage Users" was
  // just a blind search box (loadUserForEdit() below), and the members
  // list only ever showed ONE channel at a time (loadMembers()). Neither
  // gives a whole-school view. This renders every registered account
  // (from user_roles, via state.roleCache) split into two lists — anyone
  // with zero group memberships under "Unassigned", everyone else under
  // "Assigned" — so admins can see who needs attention at a glance and
  // tap a row to jump straight into editing it.
  //
  // registeredUserMemberships holds the *rich* membership rows (channel
  // id/name + the per-group role), not just names, so the "manage
  // groups" checklist modal (openGroupAssignmentModal()) can pre-check
  // and pre-select roles without a second round trip.
  async function loadRegisteredUsersList() {
    if (!DOM.registeredUsersListView || !state.isAdmin) return;

    DOM.registeredUsersListView.innerHTML = '<div class="empty-note">Loading users…</div>';

    // state.roleCache is otherwise filled in lazily (one user at a time,
    // see getRoleFromUsername()) — loadRoleCache() does a full table read
    // so the list below is complete, not just whoever's been looked up
    // so far this session.
    await loadRoleCache();

    const [membersRes, channelsRes] = await Promise.all([
      supabase.from(CONFIG.SUPABASE.TABLES.MEMBERS).select('username, channel_id, role'),
      supabase.from(CONFIG.SUPABASE.TABLES.CHANNELS).select('id, name').order('name'),
    ]);

    if (membersRes.error || channelsRes.error) {
      console.warn('Could not load user assignments:', membersRes.error || channelsRes.error);
      DOM.registeredUsersListView.innerHTML = '<div class="empty-note">Could not load users</div>';
      return;
    }

    allGroupsCache = channelsRes.data || [];
    const channelNameById = new Map(allGroupsCache.map((c) => [String(c.id), c.name]));

    const memberships = new Map();
    (membersRes.data || []).forEach((m) => {
      const key = (m.username || '').toLowerCase();
      if (!key) return;
      const entry = {
        channelId: String(m.channel_id),
        channelName: channelNameById.get(String(m.channel_id)) || 'Unknown session',
        role: m.role || 'student',
      };
      if (!memberships.has(key)) memberships.set(key, []);
      memberships.get(key).push(entry);
    });

    registeredUserMemberships = memberships;
    renderRegisteredUsersList();
  }

  function renderRegisteredUsersList() {
    if (!DOM.registeredUsersListView) return;

    const query = ((DOM.manageUserSearch && DOM.manageUserSearch.value) || '').trim().toLowerCase();
    const usernames = Object.keys(state.roleCache)
      .filter((u) => !query || u.includes(query))
      .sort();

    if (!usernames.length) {
      DOM.registeredUsersListView.innerHTML = `<div class="empty-note">${query ? 'No matching users' : 'No registered users'}</div>`;
      return;
    }

    const unassigned = [];
    const assigned = [];
    usernames.forEach((u) => {
      const memberships = registeredUserMemberships.get(u) || [];
      (memberships.length ? assigned : unassigned).push(u);
    });

    const renderRow = (username) => {
      const memberships = registeredUserMemberships.get(username) || [];
      const groupsLabel = memberships.length
        ? escapeHtml(memberships.map((m) => m.channelName).join(', '))
        : 'No groups yet';
      const role = state.roleCache[username];
      const displayName = getDisplayName(username);
      return `
        <div class="registered-user-row" data-username="${escapeHtml(username)}">
          ${avatarHtml(username, 'sm')}
          <div class="registered-user-info">
            <div class="registered-user-name">${escapeHtml(displayName)} <span class="member-display-name">(${escapeHtml(username)})</span></div>
            <div class="registered-user-groups${memberships.length ? '' : ' unassigned'}">${groupsLabel}</div>
          </div>
          <span class="role-chip role-${roleKey(username)}-chip member-role-chip">${escapeHtml(role || 'student')}</span>
          <button class="icon-btn registered-user-manage-btn" data-manage-groups="${escapeHtml(username)}" title="Manage groups" aria-label="Manage groups">
            <i class="fas fa-layer-group"></i>
          </button>
        </div>
      `;
    };

    const section = (label, iconClass, users, labelClass) => {
      if (!users.length) return '';
      return `
        <div class="registered-user-section">
          <div class="registered-user-section-label${labelClass ? ' ' + labelClass : ''}">
            <i class="fas ${iconClass}"></i> ${label} <span class="registered-user-count">(${users.length})</span>
          </div>
          <div class="registered-user-rows">${users.map(renderRow).join('')}</div>
        </div>
      `;
    };

    DOM.registeredUsersListView.innerHTML =
      section('Unassigned', 'fa-triangle-exclamation', unassigned, 'unassigned-label') +
      section('Assigned', 'fa-users', assigned, '');

    DOM.registeredUsersListView.querySelectorAll('.registered-user-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-manage-groups]')) return;
        const username = row.dataset.username;
        DOM.manageUserSearch.value = username;
        loadUserForEdit(username);
      });
    });

    DOM.registeredUsersListView.querySelectorAll('[data-manage-groups]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openGroupAssignmentModal(btn.dataset.manageGroups);
      });
    });
  }

  // Checklist modal: tick every group/session a user should belong to
  // and pick their role in each, then save all of it in one go. Replaces
  // the old one-at-a-time flow (open a channel → Members → type a
  // username → Add) for admins who need to put one person — e.g. a
  // teacher covering three classes — into several groups at once.
  async function openGroupAssignmentModal(username) {
    username = normalizeUsername(username);
    if (!username || !state.isAdmin) return;

    if (!allGroupsCache.length) {
      // Admin's channel list is normally warm already (loadRegisteredUsersList()
      // at login populates it), but fetch fresh if this is somehow opened
      // before that finished, or after channels changed elsewhere.
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.CHANNELS)
        .select('id, name')
        .order('name');
      if (!error) allGroupsCache = data || [];
    }

    if (!allGroupsCache.length) {
      alert('No groups/sessions exist yet — create one first from Settings → Create New Session.');
      return;
    }

    const existingMemberships = registeredUserMemberships.get(username) || [];
    const membershipByChannel = new Map(existingMemberships.map((m) => [m.channelId, m]));
    const defaultRole = getRoleFromUsername(username) === CONFIG.AUTH.ROLES.TEACHER ? 'teacher' : 'student';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card group-assign-modal">
        <h3 class="modal-title"><i class="fas fa-layer-group" style="color:var(--role-admin); font-size:14px;"></i> Groups for ${escapeHtml(getDisplayName(username))}</h3>
        <p class="modal-body" style="margin:8px 0 12px;">Check every session this user belongs to, and set their role in each one.</p>
        <div class="group-assign-list">
          ${allGroupsCache.map((ch) => {
            const existing = membershipByChannel.get(String(ch.id));
            const checked = !!existing;
            const role = existing ? existing.role : defaultRole;
            return `
              <label class="group-assign-row">
                <input type="checkbox" class="group-assign-check" data-channel-id="${escapeHtml(String(ch.id))}" ${checked ? 'checked' : ''}>
                <span class="group-assign-name">${escapeHtml(ch.name)}</span>
                <select class="field-sm group-assign-role" data-channel-id="${escapeHtml(String(ch.id))}">
                  <option value="student" ${role === 'student' ? 'selected' : ''}>Student</option>
                  <option value="teacher" ${role === 'teacher' ? 'selected' : ''}>Teacher</option>
                </select>
              </label>
            `;
          }).join('')}
        </div>
        <div style="display:flex; gap:8px; margin-top:16px;">
          <button id="groupAssignCancelBtn" class="btn-secondary" style="flex:1;">Cancel</button>
          <button id="groupAssignSaveBtn" class="btn-primary" style="flex:1;">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#groupAssignCancelBtn').addEventListener('click', close);

    modal.querySelector('#groupAssignSaveBtn').addEventListener('click', async () => {
      const saveBtn = modal.querySelector('#groupAssignSaveBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      const toUpsert = [];
      const toRemoveChannelIds = [];

      modal.querySelectorAll('.group-assign-check').forEach((checkbox) => {
        const channelId = checkbox.dataset.channelId;
        const roleSelect = modal.querySelector(`.group-assign-role[data-channel-id="${CSS.escape(channelId)}"]`);
        if (checkbox.checked) {
          toUpsert.push({
            channel_id: channelId,
            username,
            role: roleSelect ? roleSelect.value : defaultRole,
            added_by: state.currentUser.username,
          });
        } else if (membershipByChannel.has(channelId)) {
          toRemoveChannelIds.push(channelId);
        }
      });

      try {
        if (toUpsert.length) {
          const { error: upsertError } = await supabase
            .from(CONFIG.SUPABASE.TABLES.MEMBERS)
            .upsert(toUpsert, { onConflict: 'channel_id,username' });
          if (upsertError) throw upsertError;
        }
        if (toRemoveChannelIds.length) {
          const { error: deleteError } = await supabase
            .from(CONFIG.SUPABASE.TABLES.MEMBERS)
            .delete()
            .eq('username', username)
            .in('channel_id', toRemoveChannelIds);
          if (deleteError) throw deleteError;
        }

        close();
        if (state.currentChannel) await loadMembers(state.currentChannel.id);
        await loadRegisteredUsersList();
      } catch (e) {
        console.error('Group assignment error:', e);
        alert('Could not save group assignments: ' + (e.message || e));
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });
  }

  // FIX: admin couldn't hide the edit panel once it was opened — there was
  // no close/cancel control on #userEditForm, and it was only ever hidden
  // as a side effect of a successful Update/Delete. These two helpers give
  // it an explicit open/close lifecycle:
  //  - showUserEditForm() also hides the registered-users roster list
  //    (#registeredUsersListWrap) while editing, since both stacked on
  //    screen together (the list alone can run to 340px) pushed the
  //    Update/Delete buttons out of view on smaller screens.
  //  - closeUserEditForm() reverses that: hides the form, clears its
  //    fields, and brings the roster list back — wired to the new
  //    #closeUserEditBtn (✕) and reused by every path that used to just
  //    set `DOM.userEditForm.style.display = 'none'` directly.
  function showUserEditForm() {
    if (DOM.registeredUsersListWrap) DOM.registeredUsersListWrap.classList.add('hidden');
    DOM.userEditForm.style.display = 'flex';
  }

  function closeUserEditForm() {
    DOM.userEditForm.style.display = 'none';
    DOM.editUsername.value = '';
    DOM.editDisplayName.value = '';
    DOM.editNewUsername.value = '';
    DOM.editPassword.value = '';
    if (DOM.registeredUsersListWrap) DOM.registeredUsersListWrap.classList.remove('hidden');
  }

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
      closeUserEditForm();
      return;
    }

    DOM.editUsername.value = roleData.username;
    DOM.editDisplayName.value = roleData.display_name || roleData.username;
    DOM.editNewUsername.value = roleData.username;
    DOM.editRole.value = roleData.role;
    DOM.editPassword.value = '';
    showUserEditForm();
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
      closeUserEditForm();
      DOM.manageUserSearch.value = '';
      populateRegisteredUsersDatalist();
      await loadRoleCache();
      await loadRegisteredUsersList();

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
      closeUserEditForm();
      DOM.manageUserSearch.value = '';
      populateRegisteredUsersDatalist();
      await loadRoleCache();
      await loadRegisteredUsersList();

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

    // FIX (chat takes time to open, #2 cont.): these four reads
    // (messages/members/read-receipts/schedule) don't depend on each other,
    // but were previously `await`ed one at a time — four separate network
    // round trips stacked in series. Run them together; each still
    // subscribes to its own realtime channel as soon as its initial load
    // resolves, same as before.
    const messagesReady = loadMessages(channel.id).then(() => subscribeToMessages(channel.id));
    const membersReady = loadMembers(channel.id);
    const readsReady = loadMessageReads(channel.id).then(() => subscribeToMessageReads(channel.id));
    const scheduleReady = loadSchedule(channel.id).then(() => subscribeToSchedule(channel.id));

    await Promise.all([messagesReady, membersReady, readsReady, scheduleReady]);

    updateChatDetailHeader();
    updateProfileScreen();

    // FIX: marking messages delivered/seen (and the badge refresh that
    // follows) is bookkeeping nobody is looking at while it happens — it
    // updates ticks and the unread badge, not the chat content itself. It
    // used to be awaited here too, adding 2 more round trips (plus
    // markSeen()'s own internal refreshUnreadBadges() call, which made the
    // old code fetch the badge counts twice per open) before the chat was
    // considered "open". Let it happen in the background instead.
    if (markSeenNow) {
      markDelivered(channel.id).then(() => markSeen(channel.id));
    } else {
      refreshUnreadBadges();
    }

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

    // FIX: root cause of "opening the app / hard refresh shows the login
    // page instead of home". This used to run AFTER loadRoleCache() and
    // the own-role-id lookup below — two extra network round trips — so
    // the login form (or, on a session restore, the #appLoading spinner)
    // stayed on screen the whole time those were in flight. By the time we
    // get here, authentication has already succeeded (we were handed a
    // real `user`), so there's no reason to wait any longer to reveal the
    // dashboard shell. Everything below still fills in profile/role detail
    // once it's loaded; it doesn't need the screens switched to run.
    hideAppLoading();
    DOM.authCard.classList.add('hidden');
    DOM.dashboard.classList.remove('hidden');

    // FIX: root cause of "app opens showing Settings, then blinks to Home"
    // — the app should always land on Home on open, but this used to only
    // get set at the very END of completeLogin(), after awaiting role
    // lookups, the channel list, unread badges, statuses, and a
    // Notification-permission prompt. Nothing in that list needs the
    // screen already switched to run — every one of them populates its own
    // content once it loads, regardless of which screen is showing. On a
    // slow mobile connection that whole chain can take a moment, during
    // which a phone's own app-relaunch transition can still be showing
    // whatever screen was on screen when the app was last closed (often
    // Settings). Switching to Home the INSTANT the dashboard is revealed —
    // before any of that network work even starts — closes that window
    // instead of leaving it open until everything finishes loading.
    screenHistory = [];
    goToScreen('chats');

    await loadRoleCache();
    const role = getRoleFromUsername(username);
    const key = roleKey(username);
    const displayName = getDisplayName(username);

    state.currentUser = { id: user.id, username: username, email: user.email, role: role };
    state.isAdmin = role === CONFIG.AUTH.ROLES.ADMIN;
    state.isTeacher = role === CONFIG.AUTH.ROLES.TEACHER || state.isAdmin;

    // FIX: capture this user's own user_roles row id so handleAccountDeleted()
    // can reliably recognize "that deleted row was ME" from a realtime DELETE
    // payload — see the FIX note above handleAccountDeleted() for why matching
    // on username alone was broken. Best-effort: if this lookup fails for any
    // reason, handleAccountDeleted() still has the username fallback and the
    // session watchdog backstop still catches it eventually.
    try {
      const { data: ownRoleRow, error: ownRoleError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      state.myUserRoleId = ownRoleError ? null : (ownRoleRow ? ownRoleRow.id : null);
    } catch (e) {
      console.warn('Could not capture own user_roles id:', e);
      state.myUserRoleId = null;
    }

    // FIX: screens are already switched at the top of this function now —
    // see the comment there. (Left this spot marked so it's clear the
    // toggle wasn't just lost.)

    DOM.userBadge.textContent = displayName;
    DOM.userBadge.className = `role-chip role-${key}-chip`;

    setAvatarEl(DOM.settingsAvatar, username, 'lg');
    DOM.settingsName.textContent = displayName;
    DOM.settingsEmail.textContent = user.email || generateEmail(username);
    DOM.settingsDisplayName.textContent = `Username: ${username}`;

    DOM.adminSettingsCard.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));
    if (DOM.viewCalendarBtn) DOM.viewCalendarBtn.classList.toggle('hidden', !state.isAdmin);
    // FIX: "Add Teacher or Student" and "Manage Users" are now expandable
    // panels nested inside #adminSettingsCard (see index.html) rather than
    // their own always-visible cards, so they no longer need their own
    // role-based hidden toggle here — #adminSettingsCard already hides the
    // whole section (these panels included) from non-admins. Each panel
    // starts collapsed (its "hidden" class from the markup) and is only
    // opened by tapping its row — see the addUserToggleBtn/
    // manageUsersToggleBtn listeners below (toggleAdminPanel()).
    DOM.adminProfileSchedule.classList.toggle('hidden', !state.isAdmin);

    if (state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE) {
      loadRegisteredUsersList();
    }

    setupPresence();
    startSessionWatchdog();
    // FIX (chat takes time to open, #1): this was `await`ed, which blocked
    // the channel list — and everything after it — behind the browser's
    // camera/mic permission prompt on every single login AND every session
    // restore (i.e. basically every app open). If the prompt wasn't
    // answered instantly, or getUserMedia() was slow to spin up the camera,
    // the chat list simply could not appear until it resolved. Nothing
    // below actually depends on this: it doesn't even keep the returned
    // MediaStream anywhere, and live video calls run in an iframe that
    // negotiates its own camera/mic access when a session is actually
    // joined (see DOM.joinLiveBtn's handler). So it doesn't need to block —
    // let it run in the background while the chat list loads.
    requestMediaPermissions();
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

    // Home was already selected the instant the dashboard was revealed,
    // at the top of this function — see the FIX note up there.
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
    } finally {
      // FIX: whatever happened above — no session, a mismatched email, a
      // network error from getSession() itself (e.g. corrupted/blocked
      // localStorage), or an exception thrown partway through
      // completeLogin() — #appLoading must never be left on screen. If
      // completeLogin() already got far enough to reveal the dashboard,
      // this is a no-op; otherwise it's what actually shows the login
      // card, instead of the app just sitting on a spinner forever.
      hideAppLoading();
      if (DOM.dashboard.classList.contains('hidden')) {
        DOM.authCard.classList.remove('hidden');
      }
    }
  }

  // FIX: Backstop only — account deletion is now caught in realtime via the
  // user_roles DELETE subscription above. This watchdog just re-verifies
  // the session against the auth server periodically in case the realtime
  // socket ever drops silently (network blips, tab throttling, etc.), so
  // the account never stays "logged in" indefinitely on a dead session.
  const SESSION_CHECK_INTERVAL = 60000;

  // FIX: root cause of "it signs registered users out automatically after
  // some time" — this watchdog used to force-sign-out on the very FIRST
  // failed getUser() call, for ANY reason: a dropped wifi packet, a slow
  // response, a rate-limited request, or (most commonly) the tab having
  // been backgrounded for a while. supabase-js pauses autoRefreshToken
  // while a tab is hidden, so a backgrounded/idle tab's access token
  // routinely goes stale — that's normal and recoverable, not proof the
  // account is gone. getUser() calling the auth server with that stale
  // token then returns an error, and the old code treated that single
  // error as "the account no longer exists" and immediately logged a
  // perfectly valid, still-logged-in user out. This rewrite:
  //   1. Skips the check entirely while the tab is hidden or the device is
  //      offline — there's nothing to conclude from a check that can't
  //      succeed regardless of session validity.
  //   2. Requires several consecutive failures (not one) before treating
  //      the session as suspect, so a single blip can't trigger anything.
  //   3. Even then, tries an explicit refreshSession() first — if that
  //      succeeds the session was just stale, not invalid, and the user
  //      stays logged in. Only a failed refresh (refresh token itself
  //      rejected — the actual signal that the account/session is really
  //      gone) results in forceSignOut().
  const SESSION_CHECK_FAILURE_THRESHOLD = 3;
  let sessionCheckFailures = 0;

  function startSessionWatchdog() {
    stopSessionWatchdog();
    sessionCheckFailures = 0;
    state.sessionWatchdog = setInterval(async () => {
      if (!state.currentUser) return;

      if (document.hidden || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        console.log('⏭️ Session watchdog: tab hidden or offline, skipping this check.');
        return;
      }

      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data || !data.user) {
          sessionCheckFailures += 1;
          console.warn(`🩺 Session watchdog: check failed (${sessionCheckFailures}/${SESSION_CHECK_FAILURE_THRESHOLD}).`, error);

          if (sessionCheckFailures < SESSION_CHECK_FAILURE_THRESHOLD) return;

          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.warn('🚫 Session watchdog: refresh also failed, account/session is really gone — signing out.', refreshError);
            await forceSignOut('Your account is no longer available. You have been signed out.');
          } else {
            console.log('✅ Session watchdog: refresh succeeded — session was just stale, staying signed in.');
            sessionCheckFailures = 0;
          }
        } else {
          sessionCheckFailures = 0;
        }
      } catch (e) {
        // FIX: an exception here (fetch throwing on a dropped connection,
        // for example) is a network problem, not evidence the account is
        // gone — don't count it toward the failure threshold at all.
        console.warn('Session watchdog check failed (network):', e);
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
  //
  // FIX: root cause of "signing out on one device signs everyone else's
  // device out too" — supabase-js v2's auth.signOut() defaults to
  // { scope: 'global' }, which revokes the refresh token for EVERY active
  // session of this account server-side, not just the tab that clicked
  // Sign Out. Every other open device then either gets its own SIGNED_OUT
  // event or fails its next token refresh, and the onAuthStateChange
  // listener above (which force-logs-out on SIGNED_OUT) kicks it back to
  // the login screen too. Passing { scope: 'local' } signs out only this
  // browser's session and leaves every other device's session untouched,
  // which is what "sign out" should mean here — it does not affect
  // forceSignOut()'s own behavior (deleted account / already-invalidated
  // session), since that path already lost its session before this runs.
  async function performSignOutCleanup() {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('Sign out error:', e);
    }

    stopSessionWatchdog();
    teardownMessagesSubscription();
    teardownReadsSubscription();
    teardownStatusViewsSubscription();
    unsubscribeFromChannelListUpdates();
    stopChannelPreviewPolling();
    if (scheduleSubscription) {
      supabase.removeChannel(scheduleSubscription);
      scheduleSubscription = null;
    }
    clearScheduleExpiryTimer();
    unsubscribeFromAllSchedules();
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
    state.currentSchedule = null;
    updateLiveButtonState();

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
    state.statusViews = new Map();
    state.myMemberships = new Map();
    state.myUserRoleId = null;
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
    // FIX: clears liveSessionAutoCloseTimer too (via closeLiveSession()) so
    // a still-armed auto-close alert can't fire after sign-out.
    closeLiveSession();
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
      renderRegisteredUsersList();
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
    // FIX: safety net alongside the `disabled`/`hidden` state toggled by
    // updateLiveButtonState() — belt-and-suspenders in case this ever fires
    // outside the concerned-teacher-starts / anyone-joins-once-live window
    // (see getLiveButtonMode()). joinLiveClass() re-checks the same thing
    // itself, so this is just an early exit.
    if (getLiveButtonMode() === 'hidden') { return; }
    joinLiveClass();
  });

  if (DOM.viewCalendarBtn) {
    DOM.viewCalendarBtn.addEventListener('click', () => {
      goToScreen('calendar');
      subscribeToAllSchedules();
      loadAllSchedules();
    });
  }

  if (DOM.backFromCalendar) {
    DOM.backFromCalendar.addEventListener('click', () => {
      unsubscribeFromAllSchedules();
      goToScreen('settings');
    });
  }

  DOM.closeVideoBtn.addEventListener('click', () => {
    // FIX: goes through closeLiveSession() now so manually closing the
    // call also cancels its auto-close timer — without this, leaving a
    // call early still left the timer armed to pop the "session is up"
    // alert later on whatever screen the user had moved on to.
    closeLiveSession();
  });

  if (DOM.endLiveSessionBtn) {
    DOM.endLiveSessionBtn.addEventListener('click', () => endLiveSessionForEveryone());
  }

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

  // FIX: expand/collapse for the "Add Teacher or Student" / "Manage Users"
  // rows now nested inside the Admin tools card (see index.html) — tapping
  // the row shows/hides its panel in place and flips the chevron via
  // aria-expanded (styled in styles.css), instead of the panel always
  // being visible in its own separate card.
  function toggleAdminPanel(toggleBtn, panelEl) {
    if (!toggleBtn || !panelEl) return;
    const willShow = panelEl.classList.contains('hidden');
    panelEl.classList.toggle('hidden', !willShow);
    toggleBtn.setAttribute('aria-expanded', willShow ? 'true' : 'false');
  }
  if (DOM.addUserToggleBtn) {
    DOM.addUserToggleBtn.addEventListener('click', () => {
      toggleAdminPanel(DOM.addUserToggleBtn, DOM.adminCreateUserCard);
    });
  }
  if (DOM.manageUsersToggleBtn) {
    DOM.manageUsersToggleBtn.addEventListener('click', () => {
      toggleAdminPanel(DOM.manageUsersToggleBtn, DOM.adminUserManagementCard);
    });
  }

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

  // FIX: explicit close for the edit panel — see showUserEditForm()/
  // closeUserEditForm() above. Without this, once an admin tapped a user
  // to edit, the only way back to the roster list was to submit
  // Update/Delete; there was no way to just back out.
  if (DOM.closeUserEditBtn) {
    DOM.closeUserEditBtn.addEventListener('click', () => {
      closeUserEditForm();
    });
  }

  // Live-filter the registered users list as the admin types — no
  // refetch needed, renderRegisteredUsersList() just re-reads the
  // already-cached roster/assignments.
  DOM.manageUserSearch.addEventListener('input', () => {
    renderRegisteredUsersList();
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

  DOM.manageUserGroupsBtn.addEventListener('click', () => {
    openGroupAssignmentModal(DOM.editUsername.value);
  });

  DOM.setScheduleBtn.addEventListener('click', async () => {
    const sameTime = !DOM.scheduleSameTimeCheckbox || DOM.scheduleSameTimeCheckbox.checked;
    const defaultStart = DOM.scheduleStartTimeInput.value;
    const defaultDuration = parseInt(DOM.scheduleDurationInput.value, 10);

    const occurrences = Array.from(scheduleSelectedDates).sort().map((dateKey) => {
      if (sameTime) return { dateKey, start: defaultStart, duration: defaultDuration };
      const override = schedulePerDateOverrides.get(dateKey);
      return {
        dateKey,
        start: override ? override.start : defaultStart,
        duration: override ? override.duration : defaultDuration,
      };
    });

    const ok = await setClassSchedule(DOM.scheduleTeacherInput.value.trim(), occurrences);
    // FIX: previously the form was cleared unconditionally, even when
    // setClassSchedule() alerted a validation error and returned without
    // saving anything — the admin's typed teacher/selections vanished
    // right after being told to fix them. Only clear on an actual save.
    if (!ok) return;
    DOM.scheduleTeacherInput.value = '';
    DOM.scheduleStartTimeInput.value = '';
    DOM.scheduleDurationInput.value = '45';
    if (DOM.scheduleSameTimeCheckbox) DOM.scheduleSameTimeCheckbox.checked = true;
    resetScheduleSelection();
    renderScheduleCalendar();
    renderScheduleSelectedDates();
    renderSchedulePerDateList();
    updateScheduleEndPreview();
  });

  if (DOM.scheduleCalPrevBtn) {
    DOM.scheduleCalPrevBtn.addEventListener('click', () => {
      scheduleCalendarViewMonth = new Date(scheduleCalendarViewMonth.getFullYear(), scheduleCalendarViewMonth.getMonth() - 1, 1);
      renderScheduleCalendar();
    });
  }
  if (DOM.scheduleCalNextBtn) {
    DOM.scheduleCalNextBtn.addEventListener('click', () => {
      scheduleCalendarViewMonth = new Date(scheduleCalendarViewMonth.getFullYear(), scheduleCalendarViewMonth.getMonth() + 1, 1);
      renderScheduleCalendar();
    });
  }

  // FIX: the "Ends automatically at …" preview (see updateScheduleEndPreview()
  // in the CLASS SCHEDULING section) has to stay live as the admin types —
  // this is the "automatically set end time from starting time" part of
  // the request. Also re-renders the per-date override list so its
  // still-unedited rows (see renderSchedulePerDateList()) pick up new
  // shared defaults instead of showing stale ones.
  if (DOM.scheduleStartTimeInput && DOM.scheduleDurationInput) {
    ['input', 'change'].forEach((evt) => {
      DOM.scheduleStartTimeInput.addEventListener(evt, () => {
        updateScheduleEndPreview();
        renderSchedulePerDateList();
      });
      DOM.scheduleDurationInput.addEventListener(evt, () => {
        updateScheduleEndPreview();
        renderSchedulePerDateList();
      });
    });
  }

  // FIX: this checkbox is the "checkbox to finalize whether the class is
  // on the same time and duration" from the request — toggling it swaps
  // between one shared Starts/Duration for every selected date and a
  // per-date override list (see renderSchedulePerDateList()).
  if (DOM.scheduleSameTimeCheckbox) {
    DOM.scheduleSameTimeCheckbox.addEventListener('change', () => renderSchedulePerDateList());
  }

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

  // FIX: this is the missing piece — see the comment in updateProfileScreen()
  // above. Without this listener, tapping a Shared Media thumbnail was a
  // dead click; now it opens the same full-size in-app lightbox used by
  // images inside the chat itself.
  DOM.sharedMediaGrid.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-media-url]');
    if (img) {
      const idx = parseInt(img.dataset.mediaIndex, 10);
      openImageLightbox(img.dataset.mediaUrl, state.sharedMediaUrls, Number.isNaN(idx) ? undefined : idx);
    }
  });

  DOM.closeStatusModal.addEventListener('click', closeStatusViewer);
  DOM.statusModal.addEventListener('click', (e) => { if (e.target === DOM.statusModal) closeStatusViewer(); });
  DOM.statusPauseBtn.addEventListener('click', toggleStatusPause);

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
