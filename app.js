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
    const loader = document.getElementById('appLoading');
    const authCardEl = document.getElementById('authCard');
    if (loader) loader.classList.add('hidden');
    if (authCardEl) authCardEl.classList.remove('hidden');
    alert('Configuration file not found. Please check your setup.');
    return;
  }

  console.log(`🏫 ${CONFIG.BRANDING.NAME} v${CONFIG.BRANDING.VERSION}`);
  console.log(`🔧 Environment: ${CONFIG.ENV}`);

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
    // FIX: root cause of "user can't see the buttons for minimizing/
    // maximizing in live meeting so they can text in group when needed" —
    // there was no minimized state at all; #videoContainer was always
    // either full-screen or fully hidden (see closeLiveSession(), which
    // tears down videoIframe.src entirely). This flag tracks the new
    // in-between state — call still connected, panel shrunk to a corner
    // pip — toggled by setVideoMinimized() below and reflected in the DOM
    // via the .video-panel-minimized class (styles.css).
    videoMinimized: false,
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
    statusViews: new Map(),
    statusViewsSubscription: null,
    activeLightbox: null,
    sharedMediaUrls: [],
    myMemberships: new Map(),
    sessionWatchdog: null,
    myUserRoleId: null,
    currentSchedule: null,
    activeCallScheduleId: null,
    activeCallIsHost: false,
    lastTypingBroadcastAt: 0,
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
    navUpdatesBadge: $('navUpdatesBadge'),

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
    minimizeVideoBtn: $('minimizeVideoBtn'),

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
    statusLinkPreview: $('statusLinkPreview'),
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

  // ============================================================
  // LINK DETECTION (chat messages + updates)
  // ============================================================
  const COMMON_TLDS = 'com|net|org|io|co|dev|app|edu|gov|mil|info|biz|me|xyz|ai|tv|so|gg|pk|in|uk|us|ca|au|de|fr|jp|nl|ru|br|es|it|ch|se|no|dk|fi|pl|tech|online|store|site|shop|live|news|blog';
  const URL_REGEX = new RegExp(
    '\\b(' +
      'https?://[^\\s<>"\']+' +
      '|www\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)*(?:/[^\\s<>"\']*)?' +
      `|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.(?:${COMMON_TLDS})(?:/[^\\s<>"\']*)?` +
    ')\\b',
    'gi'
  );
  const TRAILING_PUNCT = /[.,:;!?'")\]]+$/;

  function normalizeUrlHref(raw) {
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  function linkifyText(text) {
    if (!text) return '';
    const parts = String(text).split(URL_REGEX);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        let raw = parts[i];
        const precededByAt = i > 0 && /@$/.test(parts[i - 1]);
        if (precededByAt) { html += escapeHtml(raw); continue; }
        let trail = '';
        const m = raw.match(TRAILING_PUNCT);
        if (m) {
          trail = m[0];
          raw = raw.slice(0, -trail.length);
        }
        if (!raw) { html += escapeHtml(parts[i]); continue; }
        const safeHref = escapeHtml(normalizeUrlHref(raw));
        const safeText = escapeHtml(raw);
        html += `<a href="${safeHref}" rel="noopener" class="msg-link">${safeText}</a>${escapeHtml(trail)}`;
      } else {
        html += escapeHtml(parts[i]);
      }
    }
    return html;
  }

  function firstUrlIn(text) {
    if (!text) return null;
    const str = String(text);
    URL_REGEX.lastIndex = 0;
    let m;
    while ((m = URL_REGEX.exec(str))) {
      if (m.index > 0 && str[m.index - 1] === '@') continue;
      return normalizeUrlHref(m[0].replace(TRAILING_PUNCT, ''));
    }
    return null;
  }

  let lastOpenedExternalUrl = null;
  let lastOpenedExternalAt = 0;

  function openExternalLink(url) {
    if (!url) return;
    const now = Date.now();
    if (url === lastOpenedExternalUrl && (now - lastOpenedExternalAt) < 800) return;
    lastOpenedExternalUrl = url;
    lastOpenedExternalAt = now;

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  // ============================================================
  // CLIENT-SIDE IMAGE COMPRESSION (before upload)
  // ============================================================
  const IMAGE_COMPRESS_MAX_DIMENSION = 1600;
  const IMAGE_COMPRESS_QUALITY = 0.82;
  const IMAGE_COMPRESS_SKIP_UNDER_BYTES = 300 * 1024;

  function isCompressibleImageType(file) {
    return !!file && !!file.type && file.type.startsWith('image/') &&
      file.type !== 'image/gif' && file.type !== 'image/svg+xml';
  }

  function shouldCompressImage(file) {
    return isCompressibleImageType(file) && file.size > IMAGE_COMPRESS_SKIP_UNDER_BYTES;
  }

  function compressImageFile(file) {
    return new Promise((resolve) => {
      if (!shouldCompressImage(file)) { resolve(file); return; }

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      const cleanupAndResolve = (result) => {
        URL.revokeObjectURL(objectUrl);
        resolve(result);
      };

      img.onload = () => {
        try {
          let { width, height } = img;
          const longestEdge = Math.max(width, height);
          if (longestEdge > IMAGE_COMPRESS_MAX_DIMENSION) {
            const scale = IMAGE_COMPRESS_MAX_DIMENSION / longestEdge;
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { cleanupAndResolve(file); return; }
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob || blob.size >= file.size) { cleanupAndResolve(file); return; }
            const newName = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
            const compressed = new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
            cleanupAndResolve(compressed);
          }, 'image/jpeg', IMAGE_COMPRESS_QUALITY);
        } catch (e) {
          console.warn('Image compression failed, sending original file:', e);
          cleanupAndResolve(file);
        }
      };
      img.onerror = () => cleanupAndResolve(file);
      img.src = objectUrl;
    });
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
  // 6a. REALTIME CONNECTION STATUS BANNER
  // ============================================================
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
      '<span style="flex:1;">⚠️ Live updates aren\'t connecting — new messages and unread counts may be delayed. Try refreshing the page.</span>' +
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

  let suppressChatOpenClicksUntil = 0;
  let suppressStatusOpenClicksUntil = 0;

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

  function closeLightboxIfOpen() {
    if (state.activeLightbox) {
      if (typeof state.activeLightbox._lightboxCleanup === 'function') {
        state.activeLightbox._lightboxCleanup();
      }
      state.activeLightbox.remove();
      state.activeLightbox = null;
      if (state.currentScreen && history.replaceState) {
        history.replaceState({ orbitScreen: state.currentScreen }, '', '#' + state.currentScreen);
      }
      return true;
    }
    return false;
  }

  function handleBackNavigation(event) {
    if (closeLightboxIfOpen()) {
      return;
    }
    
    if (DOM.statusModal && !DOM.statusModal.classList.contains('hidden')) {
      closeStatusViewer();
      if (state.currentScreen) pushScreenState(state.currentScreen);
      return;
    }
    
    // FIX: only force-close the call here while it's full-screen — that's
    // the state where it would otherwise swallow every back gesture with
    // no other way out. Once minimized (see setVideoMinimized()) the call
    // is already out of the way and the composer/chat list are usable, so
    // back should behave normally (e.g. leave the chat screen) instead of
    // also disconnecting a call the user deliberately kept running.
    if (DOM.videoContainer && !DOM.videoContainer.classList.contains('hidden') && !state.videoMinimized) {
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
  let allGroupsCache = [];
  let registeredUserMemberships = new Map();
  let registeredUsersListHasData = false;
  let registeredUsersListLoading = false;

  async function renderChannels() {
    const channels = await loadChannels();
    allChannels = channels;
    state.channelPreviews = await loadChannelPreviews(channels.map((c) => c.id));
    renderChatList(channels);

    if (!state.currentChannel && channels.length) {
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
      const previewLinkUrl = preview && preview.content ? firstUrlIn(preview.content) : null;
      const previewText = preview
        ? (preview.content
            ? (previewLinkUrl
                ? `<a href="${escapeHtml(previewLinkUrl)}" rel="noopener" class="msg-link">${escapeHtml(truncate(preview.content, 42))}</a>`
                : escapeHtml(truncate(preview.content, 42)))
            : (preview.file_url ? '📎 Attachment' : ''))
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
        if (e.target.closest('a.msg-link')) return;
        e.preventDefault();
        openChannel(ch);
      });
      row.addEventListener('click', (e) => {
        const link = e.target.closest('a.msg-link');
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        openExternalLink(link.getAttribute('href'));
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
    suppressChatOpenClicksUntil = Date.now() + 80;
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
  // UNREAD BADGE REFRESH
  // ============================================================
  async function refreshUnreadBadges() {
    if (!state.currentUser) return;

    try {
      const channelIds = allChannels.map((c) => c.id);

      if (!channelIds.length) {
        state.unreadByChannel = {};
        DOM.navChatsBadge.textContent = '0';
        DOM.navChatsBadge.classList.add('hidden');
        renderChatList(allChannels);
        return;
      }

      const { data: fromOthers, error: msgError } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('id, channel_id')
        .in('channel_id', channelIds)
        .neq('username', state.currentUser.username)
        .is('deleted_at', null);

      if (msgError) {
        console.warn('Failed to fetch messages for badge:', msgError);
        setConnectionIssue('badges', true);
        return;
      }
      setConnectionIssue('badges', false);

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

      state.channelPreviews = await loadChannelPreviews(channelIds);
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

    const isOpenChannel = isChatDetailVisible(msg.channel_id);
    if (!isOpenChannel && msg.username !== state.currentUser?.username) {
      state.unreadByChannel[msg.channel_id] = (state.unreadByChannel[msg.channel_id] || 0) + 1;
      const total = Object.values(state.unreadByChannel).reduce((a, b) => a + b, 0);
      DOM.navChatsBadge.textContent = total > 99 ? '99+' : String(total);
      DOM.navChatsBadge.classList.toggle('hidden', total === 0);
    }

    renderChatList(allChannels);
  }

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
    if (!removedChannelId) return;

    await expelFromChannel(removedChannelId);
  }

  async function verifyChannelMembership(channelId) {
    try {
      const { data, error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MEMBERS)
        .select('id')
        .eq('channel_id', channelId)
        .eq('username', state.currentUser.username)
        .maybeSingle();

      if (error) {
        console.warn('Membership verification failed, allowing send:', error);
        return true;
      }
      return !!data;
    } catch (e) {
      console.warn('Membership verification error, allowing send:', e);
      return true;
    }
  }

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
  // DELIVERED / SEEN TRACKING
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
    if (!state.currentUser || document.hidden) {
      console.log('⏭️ Skipping markSeen - no user or tab not visible');
      return;
    }
    
    try {
      console.log(`👁️ Marking messages as seen for channel ${channelId}`);
      
      const { data: unreadMsgs, error: unreadError } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .select('id')
        .eq('channel_id', channelId)
        .neq('username', state.currentUser.username)
        .is('deleted_at', null);

      if (unreadError) {
        console.warn('Failed to get unread messages:', unreadError);
      } else if (unreadMsgs && unreadMsgs.length) {
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
          setConnectionIssue('badges', true);
        } else {
          console.log(`✅ Recorded ${rows.length} read receipts`);
          setConnectionIssue('badges', false);
        }
      }

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

      await refreshUnreadBadges();
      
    } catch (e) {
      console.warn('Mark seen error:', e);
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
  function mergeMessagesSafely(newMessages, forceScroll) {
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
      
      scheduleRenderMessages(forceScroll);

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
            m.client_id === newMessage.client_id
          );

          if (optimisticIndex !== -1) {
            console.log(`✅ Replacing optimistic message (clientId: ${newMessage.client_id})`);
            state.messages[optimisticIndex] = newMessage;
            delete state.messages[optimisticIndex].isPending;
            state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            scheduleRenderMessages();
            saveCachedMessages(channelId, state.messages);

            if (isKnownChannelId(channelId)) {
              state.channelPreviews[channelId] = newMessage;
              renderChatList(allChannels);
            }

            if (newMessage.username !== state.currentUser?.username) {
              console.log('🔔 New message from someone else - marking delivered');
              playNotifySound();
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

        if (isKnownChannelId(channelId)) {
          state.channelPreviews[channelId] = newMessage;
          renderChatList(allChannels);
        }

        await refreshUnreadBadges();
        
        if (newMessage.username !== state.currentUser?.username) {
          console.log('🔔 New message from someone else - marking delivered');
          playNotifySound();
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
      .on('broadcast', { event: 'typing' }, (payload) => {
        handleIncomingTyping(channelId, payload.payload);
      })
      .on('broadcast', { event: 'stopped_typing' }, (payload) => {
        handleIncomingStoppedTyping(channelId, payload.payload);
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
              setConnectionIssue('messages', true);
            }
          }
        }
      });

    state.messagesSubscription = thisChannel;
  }

  // ============================================================
  // 8c. REAL-TIME "TYPING…" INDICATOR
  // ============================================================
  const typingTimers = new Map();

  function getTypingUsernames(channelId) {
    const prefix = `${channelId}:`;
    return [...typingTimers.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }

  function handleIncomingTyping(channelId, payload) {
    if (!payload || !payload.username) return;
    if (payload.username === state.currentUser?.username) return;
    const key = `${channelId}:${payload.username}`;
    if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));
    typingTimers.set(key, setTimeout(() => {
      typingTimers.delete(key);
      renderTypingIndicator(channelId);
    }, 3000));
    renderTypingIndicator(channelId);
  }

  function broadcastStoppedTyping() {
    if (!state.currentChannel || !state.messagesSubscription || !state.currentUser) return;
    state.lastTypingBroadcastAt = 0;
    state.messagesSubscription.send({
      type: 'broadcast',
      event: 'stopped_typing',
      payload: { username: state.currentUser.username },
    });
  }

  function handleIncomingStoppedTyping(channelId, payload) {
    if (!payload || !payload.username) return;
    if (payload.username === state.currentUser?.username) return;
    const key = `${channelId}:${payload.username}`;
    if (!typingTimers.has(key)) return;
    clearTimeout(typingTimers.get(key));
    typingTimers.delete(key);
    renderTypingIndicator(channelId);
  }

  function renderTypingIndicator(channelId) {
    if (!state.currentChannel || state.currentChannel.id !== channelId) return;
    if (!DOM.chatDetailSub) return;
    const names = getTypingUsernames(channelId).map(getDisplayName);
    if (names.length === 0) {
      updateChatDetailSubtitle();
      return;
    }
    DOM.chatDetailSub.textContent = names.length === 1
      ? `${names[0]} is typing…`
      : `${names.length} people are typing…`;
    DOM.chatDetailSub.classList.add('typing-active');
  }

  function clearTypingIndicator(channelId) {
    const prefix = `${channelId}:`;
    [...typingTimers.keys()]
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => {
        clearTimeout(typingTimers.get(key));
        typingTimers.delete(key);
      });
  }

  function broadcastTyping() {
    if (!state.currentChannel || !state.messagesSubscription || !state.currentUser) return;
    const now = Date.now();
    if (now - state.lastTypingBroadcastAt < 2000) return;
    state.lastTypingBroadcastAt = now;
    state.messagesSubscription.send({
      type: 'broadcast',
      event: 'typing',
      payload: { username: state.currentUser.username },
    });
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
        renderMessages(true);
        return;
      }

      if (data && data.length > 0) {
        mergeMessagesSafely(data, true);
        console.log(`📥 Loaded ${data.length} messages from Supabase`);
      } else if (state.messages.length === 0) {
        state.messages = [];
        renderMessages(true);
      }

      updateProfileScreen();
    } catch (error) {
      console.error('Error loading messages:', error);
      if (state.messages.length === 0) {
        state.messages = [{ id: '1', content: 'Welcome to the channel!', username: 'system', created_at: Date.now() }];
        renderMessages(true);
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
    // FIX: root cause of "media that's aged past the 168h auto-expiry
    // window keeps showing as a live image/video/file instead of the
    // 'no longer available' placeholder" — renderMessages() below only
    // rebuilds a message's DOM node when its signature changes (see the
    // `node.dataset.sig === signature` check). Expiry is purely a function
    // of "how much time has passed since created_at", so a message that
    // was already on screen before it expired had an identical signature
    // before and after crossing the 7-day line — nothing about the
    // message itself changed, so the diff considered it unchanged and
    // left the stale (now actually-expired) media bubble in place
    // indefinitely, even once the underlying file was gone. Folding
    // isMessageMediaExpired(msg) into the signature means the moment that
    // boolean flips, the signature changes too, so the next renderMessages()
    // pass (see startMediaExpiryWatcher() below, which exists specifically
    // to make sure a pass actually happens) rebuilds this message and shows
    // the placeholder.
    return JSON.stringify([
      msg.content, msg.file_url, msg.reply_to, msg.reply_username, msg.reply_content,
      msg.username, msg.created_at, msg.seen_at, msg.delivered_at, msg.isPending,
      msg.deleted_at, msg.deleted_by, isMessageMediaExpired(msg)
    ]);
  }

  // ============================================================
  // PDF THUMBNAIL PREVIEW
  // ============================================================
  const pdfThumbCache = new Map();
  const pdfThumbInFlight = new Map();

  function getPdfThumbnail(url) {
    if (pdfThumbCache.has(url)) return Promise.resolve(pdfThumbCache.get(url));
    if (pdfThumbInFlight.has(url)) return pdfThumbInFlight.get(url);
    if (!window.pdfjsLib) return Promise.resolve(null);

    const promise = pdfjsLib.getDocument(url).promise
      .then((pdf) => pdf.getPage(1))
      .then((page) => {
        const baseViewport = page.getViewport({ scale: 1 });
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
        console.warn(`PDF thumbnail failed for ${url}:`, err);
        pdfThumbCache.set(url, null);
        pdfThumbInFlight.delete(url);
        return null;
      });

    pdfThumbInFlight.set(url, promise);
    return promise;
  }

  function stickToBottomOnMediaLoad(mediaEl, eventName, pinToBottom) {
    if (!mediaEl || !pinToBottom) return;
    mediaEl.addEventListener(eventName, () => {
      if (DOM.chatContainer) DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
    }, { once: true });
  }

  function hydratePdfThumb(wrapEl, url, pinToBottom) {
    const thumbEl = wrapEl.querySelector('.msg-pdf-thumb');
    if (!thumbEl) return;
    getPdfThumbnail(url).then((dataUrl) => {
      if (!dataUrl || !thumbEl.isConnected) return;
      const img = document.createElement('img');
      img.className = 'msg-media-img';
      img.alt = 'PDF preview';
      img.loading = 'lazy';
      stickToBottomOnMediaLoad(img, 'load', pinToBottom);
      img.src = dataUrl;
      thumbEl.innerHTML = '';
      thumbEl.appendChild(img);
      thumbEl.classList.add('loaded');
    });
  }

  // ============================================================
  // LINK PREVIEW THUMBNAILS
  // ============================================================
  const LINK_PREVIEW_NEGATIVE_TTL_MS = 10 * 60 * 1000;
  const linkPreviewCache = new Map();
  const linkPreviewInFlight = new Map();

  function getLinkPreview(url) {
    const cached = linkPreviewCache.get(url);
    if (cached) {
      const stale = cached.value === null && (Date.now() - cached.ts) >= LINK_PREVIEW_NEGATIVE_TTL_MS;
      if (!stale) return Promise.resolve(cached.value);
      linkPreviewCache.delete(url);
    }
    if (linkPreviewInFlight.has(url)) return linkPreviewInFlight.get(url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const promise = fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          console.warn(`Link preview request for ${url} failed: HTTP ${res.status} ${res.statusText} (Microlink's free tier is rate-limited — this is expected if it's been called a lot recently; it will retry automatically in ${Math.round(LINK_PREVIEW_NEGATIVE_TTL_MS / 60000)} min)`);
        }
        return res.json();
      })
      .then((json) => {
        const data = json && json.status === 'success' ? json.data : null;
        const image = data && data.image && data.image.url;
        const logo = data && data.logo && data.logo.url;
        const preview = (data && (image || data.title)) ? {
          title: data.title || '',
          image: image || logo || null,
          siteName: (() => {
            try { return new URL(url).hostname.replace(/^www\./, ''); }
            catch { return ''; }
          })(),
        } : null;
        linkPreviewCache.set(url, { value: preview, ts: Date.now() });
        return preview;
      })
      .catch((err) => {
        console.warn(`Link preview failed for ${url}:`, err);
        linkPreviewCache.set(url, { value: null, ts: Date.now() });
        return null;
      })
      .finally(() => {
        clearTimeout(timeoutId);
        linkPreviewInFlight.delete(url);
      });

    linkPreviewInFlight.set(url, promise);
    return promise;
  }

  function hydrateLinkPreview(slotEl, url, pinToBottom) {
    if (!slotEl) return;
    getLinkPreview(url).then((preview) => {
      if (!preview || !slotEl.isConnected) return;
      slotEl.classList.remove('hidden');
      slotEl.innerHTML = `
        <a href="${escapeHtml(url)}" rel="noopener" class="msg-link-preview">
          ${preview.image ? `<img class="msg-link-preview-img" src="${escapeHtml(preview.image)}" alt="" loading="lazy">` : ''}
          <span class="msg-link-preview-body">
            ${preview.title ? `<span class="msg-link-preview-title">${escapeHtml(truncate(preview.title, 90))}</span>` : ''}
            <span class="msg-link-preview-site">${escapeHtml(preview.siteName)}</span>
          </span>
        </a>
      `;
      const img = slotEl.querySelector('img.msg-link-preview-img');
      if (img) stickToBottomOnMediaLoad(img, 'load', pinToBottom);
    });
  }

  const MESSAGE_MEDIA_EXPIRY_MS = 168 * 60 * 60 * 1000;

  function isMessageMediaExpired(msg) {
    if (!msg || !msg.created_at) return false;
    return (Date.now() - new Date(msg.created_at).getTime()) >= MESSAGE_MEDIA_EXPIRY_MS;
  }

  // FIX: the placeholder text below used to read "Can't view this media
  // because it's no longer on your device" — the media was never on the
  // viewer's device to begin with (it lived in Supabase Storage), so that
  // wording was actively misleading about what happened. It's the file
  // itself that's gone after the 168h retention window, so say that.
  const MESSAGE_MEDIA_EXPIRED_TEXT = "The file is no longer available for downloading";

  // FIX: root cause of "the expired-media message never shows up, media
  // just silently stays broken" — isMessageMediaExpired() is a pure
  // function of the current time vs. created_at, but nothing was ever
  // re-evaluating it *as time passed*. renderMessages() only runs when
  // something else changes the message list (a new message arrives, a
  // read receipt updates, a reconnect happens, etc.), so a chat opened
  // and then just left sitting (or an already-rendered message nobody
  // touches again) would never get re-checked once the 7-day mark
  // actually passed — the DOM kept showing the same image/video/file link
  // it always had, now pointing at a deleted file, forever. This timer
  // exists purely to make sure a renderMessages() pass actually happens
  // periodically while a chat is open, so the messageSignature() change
  // above (which now flips once isMessageMediaExpired(msg) flips) has a
  // chance to take effect close to when it actually should. A 60s tick is
  // more than fine against a 7-day window.
  const MEDIA_EXPIRY_WATCH_INTERVAL = 60 * 1000;
  let mediaExpiryWatcherTimer = null;

  function startMediaExpiryWatcher() {
    stopMediaExpiryWatcher();
    mediaExpiryWatcherTimer = setInterval(() => {
      if (!state.currentChannel || !state.messages.length) return;
      if (!DOM.screenChatDetail || DOM.screenChatDetail.classList.contains('hidden')) return;
      renderMessages();
    }, MEDIA_EXPIRY_WATCH_INTERVAL);
  }

  function stopMediaExpiryWatcher() {
    if (mediaExpiryWatcherTimer) {
      clearInterval(mediaExpiryWatcherTimer);
      mediaExpiryWatcherTimer = null;
    }
  }

  function buildMessageEl(msg, signature, pinToBottom, skipEnterAnim) {
    const isMine = msg.username === state.currentUser?.username;
    const wrap = document.createElement('div');
    wrap.className = `msg ${isMine ? 'msg-mine' : 'msg-theirs'}${skipEnterAnim ? ' msg-no-enter-anim' : ''}`;
    wrap.dataset.id = msg.id;
    wrap.dataset.role = roleKey(msg.username);
    wrap.dataset.sig = signature;
    wrap.dataset.clientId = msg.client_id || '';

    let replyHtml = '';
    if (msg.reply_to) {
      replyHtml = `
        <div class="msg-reply-quote" data-reply-to-id="${escapeHtml(String(msg.reply_to))}" role="button" tabindex="0">
          <span class="reply-author">${escapeHtml(getDisplayName(msg.reply_username || 'Message'))}</span>
          <span class="reply-text">${escapeHtml(truncate(msg.reply_content || '', 60))}</span>
        </div>
      `;
    }

    const ticksMarkup = (isMine && !msg.deleted_at) ? ticksHtml(msg) : '';
    const hasAttachment = !!msg.file_url && !msg.deleted_at;
    const mediaExpired = hasAttachment && isMessageMediaExpired(msg);

    const linkUrl = (!hasAttachment && msg.content) ? firstUrlIn(msg.content) : null;

    let bubbleHtml = '';
    if (msg.deleted_at) {
      bubbleHtml = `<div class="msg-bubble msg-deleted"><i class="fas fa-ban"></i> This message was deleted by Nous Complex admin</div>`;
    } else if (msg.content) {
      const inlineTicks = (!hasAttachment && ticksMarkup) ? `<span class="msg-bubble-ticks">${ticksMarkup}</span>` : '';
      bubbleHtml += `<div class="msg-bubble">${replyHtml}${linkifyText(msg.content)}${inlineTicks}</div>`;
      if (linkUrl) bubbleHtml += `<div class="msg-link-preview-slot hidden"></div>`;
    } else if (replyHtml) {
      const inlineTicks = (!hasAttachment && ticksMarkup) ? `<span class="msg-bubble-ticks">${ticksMarkup}</span>` : '';
      bubbleHtml += `<div class="msg-bubble">${replyHtml}${inlineTicks}</div>`;
    }
    if (hasAttachment) {
      const cornerTicks = ticksMarkup ? `<span class="msg-corner-ticks">${ticksMarkup}</span>` : '';
      if (mediaExpired) {
        const inlineTicks = ticksMarkup ? `<span class="msg-inline-ticks">${ticksMarkup}</span>` : '';
        bubbleHtml += `
          <div class="msg-bubble msg-media-expired">
            <i class="fas fa-file-circle-xmark"></i> ${escapeHtml(MESSAGE_MEDIA_EXPIRED_TEXT)}${inlineTicks}
          </div>
        `;
      } else if (isImageFile(msg.file_url)) {
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

    // FIX: safety net for rows the *old* purge function already nulled
    // out before this fix — those messages have no file_url, no content,
    // and no reply left, so nothing above produces any bubble at all
    // (this is exactly the "just sender name is showing" bug). There's
    // no way to recover what those rows used to contain (file_url was
    // the only record of it), but a message can never be sent with
    // neither text nor a file (see the `if (!content && !file) return;`
    // guard on the composer's send handler), so any message that still
    // ends up with a fully empty bubbleHtml here is guaranteed to be one
    // of these already-purged rows rather than a legitimate empty
    // message. Show the same placeholder instead of leaving it blank.
    if (!bubbleHtml) {
      const inlineTicks = ticksMarkup ? `<span class="msg-inline-ticks">${ticksMarkup}</span>` : '';
      bubbleHtml = `
        <div class="msg-bubble msg-media-expired">
          <i class="fas fa-file-circle-xmark"></i> ${escapeHtml(MESSAGE_MEDIA_EXPIRED_TEXT)}${inlineTicks}
        </div>
      `;
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

    if (hasAttachment && !mediaExpired && isPdfFile(msg.file_url)) {
      hydratePdfThumb(wrap, msg.file_url, pinToBottom);
    } else if (hasAttachment && !mediaExpired && isImageFile(msg.file_url)) {
      stickToBottomOnMediaLoad(wrap.querySelector('img.msg-media-img'), 'load', pinToBottom);
    } else if (hasAttachment && !mediaExpired && isVideoFile(msg.file_url)) {
      stickToBottomOnMediaLoad(wrap.querySelector('video.msg-media-img'), 'loadedmetadata', pinToBottom);
    }

    if (linkUrl) {
      hydrateLinkPreview(wrap.querySelector('.msg-link-preview-slot'), linkUrl, pinToBottom);
    }

    return wrap;
  }

  let chatNeedsInitialPaint = false;

  function renderMessages(forceScrollBottom) {
    if (!DOM.chatMessages) return;

    const isInitialPaint = chatNeedsInitialPaint;

    if (!state.messages.length) {
      DOM.chatMessages.innerHTML = '<div class="empty-note center-text" style="width:100%;">No messages yet — say hello</div>';
      return;
    }

    if (!DOM.chatMessages.querySelector('.msg')) {
      DOM.chatMessages.innerHTML = '';
    }

    const existingNodes = new Map();
    const existingByClientId = new Map();
    DOM.chatMessages.querySelectorAll('.msg, .day-divider').forEach((el) => {
      if (el.classList.contains('day-divider')) {
        existingNodes.set(`day:${el.dataset.day}`, el);
        return;
      }
      const key = `msg:${el.dataset.id}`;
      existingNodes.set(key, el);
      if (el.dataset.clientId) {
        existingByClientId.set(`client:${el.dataset.clientId}`, key);
      }
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

      let key = `msg:${msg.id}`;
      const signature = messageSignature(msg);
      let node = existingNodes.get(key);
      let alreadyOnScreen = !!node;

      if (!node && msg.client_id) {
        const fallbackKey = existingByClientId.get(`client:${msg.client_id}`);
        if (fallbackKey) {
          node = existingNodes.get(fallbackKey);
          key = fallbackKey;
          alreadyOnScreen = true;
        }
      }

      if (node && node.dataset.sig === signature) {
        existingNodes.delete(key);
      } else {
        const freshNode = buildMessageEl(msg, signature, wasNearBottom, isInitialPaint || alreadyOnScreen);
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

    chatNeedsInitialPaint = false;

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
    if (Date.now() < suppressChatOpenClicksUntil) return;
    if (!isDesktopLayout()) return;
    const bubbleWrap = e.target.closest('.msg');
    if (!bubbleWrap || !bubbleWrap.dataset.id) return;
    if (bubbleWrap.querySelector('.msg-deleted')) return;
    if (e.target.closest('.msg-media-preview, .msg-doc-card')) return;
    if (e.target.closest('a.msg-link, a.msg-link-preview')) return;
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
    // FIX: forwarding an already-expired attachment used to carry its
    // (now purged) file_url straight into the new message row. The new
    // message gets a fresh created_at, so isMessageMediaExpired() sees it
    // as brand new and buildMessageEl tries to render it as live media —
    // pointing at either the EXPIRED_MARKER sentinel or a deleted storage
    // object, i.e. a broken link, instead of correctly showing nothing/
    // the expired placeholder. Don't carry forward a file_url that's
    // already past its expiry window.
    const forwardableFileUrl = (msg.file_url && !isMessageMediaExpired(msg)) ? msg.file_url : null;
    const payload = {
      channel_id: targetChannelId,
      username: state.currentUser.username,
      content: msg.content || '',
      file_url: forwardableFileUrl,
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

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

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
    if (Date.now() < suppressChatOpenClicksUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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

    const docCard = e.target.closest('.msg-doc-card');
    if (docCard) {
      e.preventDefault();
      const url = docCard.getAttribute('href');
      const fileName = docCard.dataset.fileName || getFileNameFromUrl(url);
      openDocViewer(url, fileName);
      return;
    }

    const sharedLink = e.target.closest('a.msg-link, a.msg-link-preview');
    if (sharedLink) {
      e.preventDefault();
      e.stopPropagation();
      openExternalLink(sharedLink.getAttribute('href'));
      return;
    }
  });

  DOM.chatMessages.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const replyQuote = e.target.closest('.msg-reply-quote[data-reply-to-id]');
    if (replyQuote) {
      e.preventDefault();
      jumpToMessage(replyQuote.dataset.replyToId);
    }
  });

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
      window.open(url, '_blank', 'noopener');
    }
  }

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
      <div class="lightbox-spinner" aria-hidden="true"></div>
      <img class="lightbox-img" src="${escapeHtml(hasGallery ? gallery[index] : url)}" alt="Attached image, full size">
    `;
    document.body.appendChild(overlay);

    state.activeLightbox = overlay;

    const imgEl = overlay.querySelector('.lightbox-img');
    const spinnerEl = overlay.querySelector('.lightbox-spinner');

    const showSpinner = () => { imgEl.classList.add('loading'); if (spinnerEl) spinnerEl.classList.remove('hidden'); };
    const hideSpinner = () => { imgEl.classList.remove('loading'); if (spinnerEl) spinnerEl.classList.add('hidden'); };
    imgEl.addEventListener('load', hideSpinner);
    imgEl.addEventListener('error', () => {
      hideSpinner();
      imgEl.classList.add('hidden');
      let brokenEl = overlay.querySelector('.lightbox-broken');
      if (!brokenEl) {
        brokenEl = document.createElement('div');
        brokenEl.className = 'lightbox-broken';
        brokenEl.innerHTML = '<i class="fas fa-image"></i><span>Couldn\'t load this media</span>';
        overlay.appendChild(brokenEl);
      }
      brokenEl.classList.remove('hidden');
    });
    if (imgEl.complete && imgEl.naturalWidth > 0) hideSpinner(); else showSpinner();

    const showAt = (newIndex) => {
      if (!hasGallery) return;
      index = ((newIndex % gallery.length) + gallery.length) % gallery.length;
      const brokenEl = overlay.querySelector('.lightbox-broken');
      if (brokenEl) brokenEl.classList.add('hidden');
      imgEl.classList.remove('hidden');
      showSpinner();
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
    overlay._lightboxCleanup = () => document.removeEventListener('keydown', onKeydown);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.lightbox-close').addEventListener('click', close);

    if (hasGallery) {
      overlay.querySelector('.lightbox-prev').addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
      overlay.querySelector('.lightbox-next').addEventListener('click', (e) => { e.stopPropagation(); showNext(); });

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
  let isSendingMessage = false;

  async function sendMessage(content, file) {
    if (isSendingMessage) {
      console.log('✋ Send already in progress, ignoring duplicate call');
      return false;
    }
    if (!state.currentChannel || !state.currentUser) {
      alert('Please select a channel first.');
      return false;
    }

    isSendingMessage = true;
    if (DOM.sendMsgBtn) DOM.sendMsgBtn.disabled = true;
    let tempId = null;

    try {
      if (!state.isAdmin) {
        const stillMember = await verifyChannelMembership(state.currentChannel.id);
        if (!stillMember) {
          await expelFromChannel(state.currentChannel.id);
          return false;
        }
      }

      let fileUrl = null;

      if (file) {
        const uploadFile = await compressImageFile(file);

        if (uploadFile.size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
          alert(`File exceeds ${CONFIG.UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
          return false;
        }

        const path = generateStoragePath(state.currentChannel.id, uploadFile.name);

        try {
          const { error } = await supabase.storage.from(CONFIG.SUPABASE.STORAGE_BUCKET).upload(path, uploadFile);
          if (error) throw error;

          const { data: urlData } = supabase.storage.from(CONFIG.SUPABASE.STORAGE_BUCKET).getPublicUrl(path);
          fileUrl = urlData.publicUrl;

          DOM.fileUploadStatus.textContent = `📎 ${uploadFile.name} uploaded`;
          DOM.fileUploadStatus.classList.remove('hidden');
          setTimeout(() => DOM.fileUploadStatus.classList.add('hidden'), 4000);
        } catch (e) {
          console.error('Upload error:', e);
          alert(`File upload failed: ${e.message}`);
          return false;
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

      tempId = `temp_${clientId}`;
      const lastKnownMessage = state.messages[state.messages.length - 1];
      const lastKnownTs = lastKnownMessage ? new Date(lastKnownMessage.created_at || 0).getTime() : 0;
      const optimisticTs = Math.max(Date.now(), (Number.isFinite(lastKnownTs) ? lastKnownTs : 0) + 1);
      const optimisticMessage = {
        id: tempId,
        ...newMessage,
        created_at: new Date(optimisticTs).toISOString(),
        isPending: true
      };

      mergeMessagesSafely(optimisticMessage, true);
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
        return false;
      } else if (data && data[0]) {
        const realMessage = data[0];

        const index = state.messages.findIndex((m) => m.id === tempId);
        if (index !== -1) {
          state.messages[index] = realMessage;
          delete state.messages[index].isPending;
          state.messages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
          renderMessages(true);
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
      return true;
    } catch (err) {
      console.error('Send error (network/exception):', err);
      alert('Failed to send message.');
      if (tempId) {
        state.messages = state.messages.filter((m) => m.id !== tempId);
        renderMessages();
        console.log('❌ Message rolled back (exception)');
      }
      return false;
    } finally {
      isSendingMessage = false;
      if (DOM.sendMsgBtn) DOM.sendMsgBtn.disabled = false;
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
      .filter((m) => !query || m.username.toLowerCase().includes(query) || getDisplayName(m.username).toLowerCase().includes(query))
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
            <div class="member-name">${escapeHtml(displayName)}</div>
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

  const MAX_SESSION_DURATION_MINUTES = 8 * 60;

  let scheduleExpiryTimer = null;
  const SCHEDULE_EXPIRY_WATCHDOG_MAX_MS = 20 * 24 * 60 * 60 * 1000;

  function clearScheduleExpiryTimer() {
    if (scheduleExpiryTimer) {
      clearTimeout(scheduleExpiryTimer);
      scheduleExpiryTimer = null;
    }
  }

  async function loadSchedule(channelId) {
    const { data, error } = await supabase
      .from('class_schedule')
      .select('*')
      .eq('channel_id', channelId)
      .gte('scheduled_time', new Date(Date.now() - MAX_SESSION_DURATION_MINUTES * 60000).toISOString())
      .order('scheduled_time', { ascending: true })
      .limit(50);

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

    if (state.videoActive && state.activeCallScheduleId) {
      const stillCurrent = current && String(current.id) === String(state.activeCallScheduleId);
      if (!stillCurrent) {
        closeLiveSession('This live session has ended.');
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

  // ============================================================
  // FIX: TEACHER "JOIN LIVE SESSION" VS "START LIVE SESSION"
  // The issue was that getLiveButtonMode() wasn't properly
  // distinguishing between teachers and other users, or the
  // teacher's role wasn't being correctly loaded.
  // ============================================================
  function getLiveButtonMode() {
    const schedule = state.currentSchedule;
    if (!schedule || !state.currentUser) return 'hidden';

    const now = Date.now();
    const startsAt = new Date(schedule.scheduled_time).getTime();
    const endsAt = startsAt + (schedule.duration_minutes || 45) * 60000;
    const isWithinWindow = now >= startsAt && now < endsAt;
    if (!isWithinWindow) return 'hidden';

    const currentUsername = normalizeUsername(state.currentUser.username);
    const teacherUsername = normalizeUsername(schedule.teacher_username);
    const isConcernedTeacher = currentUsername === teacherUsername;
    const isLive = schedule.is_live === true;

    // FIX: Teachers should see 'start' if they are the scheduled teacher
    // (regardless of whether is_live is true or false - they can start it)
    if (isConcernedTeacher) {
      console.log(`🎓 Teacher ${currentUsername} is the scheduled teacher → showing 'start'`);
      return 'start';
    }

    // Admins can start a session if no one has started it yet
    if (state.isAdmin && !isLive) {
      console.log(`👑 Admin ${currentUsername} is starting the session → showing 'start'`);
      return 'start';
    }

    // Admins can join if the session is already live
    if (state.isAdmin && isLive) {
      console.log(`👑 Admin ${currentUsername} is joining an active session → showing 'join'`);
      return 'join';
    }

    // Anyone else can join if the session is live
    if (isLive) {
      console.log(`👤 ${currentUsername} is joining an active session → showing 'join'`);
      return 'join';
    }

    console.log(`🔒 ${currentUsername} has no access to this session → hidden`);
    return 'hidden';
  }

  function updateLiveButtonState() {
    if (!DOM.joinLiveBtn) return;
    const mode = getLiveButtonMode();
    const isInactive = mode === 'hidden';

    DOM.joinLiveBtn.disabled = isInactive;
    DOM.joinLiveBtn.classList.toggle('btn-live-pill-dead', isInactive);
    DOM.joinLiveBtn.setAttribute('aria-disabled', String(isInactive));

    if (DOM.liveBtnText) {
      // FIX: root cause of "teacher sees Join Live Session on the grey/
      // disabled button instead of Start Live Session" — getLiveButtonMode()
      // correctly returns 'hidden' (button stays disabled/grey) for the
      // whole stretch BEFORE the scheduled start time, for every viewer
      // including the concerned teacher — that's correct, it's not time
      // yet. But the label used to be driven off that same 'hidden' mode
      // and just fell back to 'Join Live Session' whenever mode wasn't
      // exactly 'start' — so the teacher's own upcoming session showed
      // "Join" (implying someone else has to start it) right up until the
      // instant it became clickable. The label is now decided
      // independently of whether the button is currently clickable: a
      // schedule that exists and belongs to this user (or any admin) is
      // always labelled "Start Live Session", grey/disabled or not; it
      // only ever reads "Join Live Session" for someone who isn't the one
      // who starts it.
      let label = 'Join Live Session';
      if (mode === 'start') {
        label = 'Start Live Session';
      } else {
        const schedule = state.currentSchedule;
        if (schedule && state.currentUser) {
          const currentUsername = normalizeUsername(state.currentUser.username);
          const teacherUsername = normalizeUsername(schedule.teacher_username);
          const isConcernedTeacher = currentUsername === teacherUsername;
          if (isConcernedTeacher || state.isAdmin) {
            label = 'Start Live Session';
          }
        }
      }
      DOM.liveBtnText.textContent = label;
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
        loadGroupScheduleList(channelId);
      })
      .subscribe();
  }

  let groupScheduleEditingId = null;
  let groupScheduleCache = new Map();
  let groupScheduleLoading = new Set();

  async function loadGroupScheduleList(channelId) {
    if (!DOM.groupScheduleList) return;
    if (groupScheduleLoading.has(channelId)) return;
    groupScheduleLoading.add(channelId);

    const cachedRows = groupScheduleCache.get(channelId);
    if (cachedRows) {
      renderGroupScheduleRows(channelId, cachedRows);
    } else {
      DOM.groupScheduleList.innerHTML = '<div class="empty-note">Loading…</div>';
    }

    try {
      const { data, error } = await supabase
        .from('class_schedule')
        .select('*')
        .eq('channel_id', channelId)
        .gte('scheduled_time', new Date(Date.now() - MAX_SESSION_DURATION_MINUTES * 60000).toISOString())
        .order('scheduled_time', { ascending: true })
        .limit(30);

      if (!state.currentChannel || String(state.currentChannel.id) !== String(channelId)) return;

      if (error) {
        console.warn('loadGroupScheduleList failed:', error);
        if (!cachedRows) DOM.groupScheduleList.innerHTML = '<div class="empty-note">Could not load the schedule.</div>';
        return;
      }

      groupScheduleCache.set(channelId, data || []);
      renderGroupScheduleRows(channelId, data || []);
    } finally {
      groupScheduleLoading.delete(channelId);
    }
  }

  function renderGroupScheduleRows(channelId, rows) {
    if (!DOM.groupScheduleList) return;
    if (!state.currentChannel || String(state.currentChannel.id) !== String(channelId)) return;

    const now = Date.now();
    const upcoming = (rows || []).filter((row) => {
      const endsAt = new Date(row.scheduled_time).getTime() + (row.duration_minutes || 45) * 60000;
      return endsAt > now;
    });

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
        renderGroupScheduleRows(channelId, groupScheduleCache.get(channelId) || []);
      });
    });
    DOM.groupScheduleList.querySelectorAll('.gs-edit-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        groupScheduleEditingId = null;
        renderGroupScheduleRows(channelId, groupScheduleCache.get(channelId) || []);
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

    const { error } = await supabase
      .from('class_schedule')
      .update({ scheduled_time: start.toISOString(), duration_minutes: duration, is_live: false })
      .eq('id', id);

    if (error) { alert('Could not update the session: ' + error.message); return false; }
    return true;
  }

  async function deleteScheduledSession(id) {
    if (!confirm('Delete this scheduled session? This can\'t be undone.')) return false;
    const { error } = await supabase.from('class_schedule').delete().eq('id', id);
    if (error) { alert('Could not delete: ' + error.message); return false; }
    return true;
  }

  async function endScheduledSessionNow(id, scheduledTimeIso) {
    if (!confirm('End this live session now for everyone in the group?')) return;
    const startedAt = scheduledTimeIso ? new Date(scheduledTimeIso).getTime() : null;
    let duration = startedAt
      ? Math.max(1, Math.ceil((Date.now() - startedAt) / 60000))
      : null;

    if (duration === null) {
      const { data, error } = await supabase.from('class_schedule').select('scheduled_time').eq('id', id).maybeSingle();
      if (error || !data) { alert('Could not find that session.'); return; }
      duration = Math.max(1, Math.ceil((Date.now() - new Date(data.scheduled_time).getTime()) / 60000));
    }

    const { error } = await supabase.from('class_schedule').update({ duration_minutes: duration, is_live: false }).eq('id', id);
    if (error) { alert('Could not end the session: ' + error.message); return; }
  }

  const MAX_SCHEDULE_OCCURRENCES = 200;
  let scheduleCalendarViewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let scheduleSelectedDates = new Set();
  let schedulePerDateOverrides = new Map();
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
  let calendarSubscription = null;
  let calendarHasData = false;
  let calendarLoadInFlight = false;

  async function loadAllSchedules() {
    if (calendarLoadInFlight) return;
    calendarLoadInFlight = true;

    if (DOM.calendarList && !calendarHasData) {
      DOM.calendarList.innerHTML = '<div class="empty-note">Loading schedule…</div>';
    }

    try {
      const { data, error } = await supabase
        .from('class_schedule')
        .select('*')
        .gte('scheduled_time', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('scheduled_time', { ascending: true });

      if (error) {
        console.warn('loadAllSchedules failed:', error);
        if (DOM.calendarList && !calendarHasData) {
          DOM.calendarList.innerHTML = '<div class="empty-note">Could not load the schedule.</div>';
        }
        return;
      }
      calendarHasData = true;
      renderCalendarList(data || []);
    } finally {
      calendarLoadInFlight = false;
    }
  }

  function renderCalendarList(rows) {
    if (!DOM.calendarList) return;

    if (!rows.length) {
      DOM.calendarList.innerHTML = '<div class="empty-note">No live sessions scheduled in any group yet.</div>';
      return;
    }

    const channelNameById = new Map(allChannels.map((c) => [String(c.id), c.name]));

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
  function loadChannelDescription(channelId) {
    if (!channelId || !state.currentChannel || state.currentChannel.id !== channelId) return;

    const fallback = `Group workspace for ${state.currentChannel?.name || 'this group'}. Share updates, chat with the group, and join live sessions together.`;
    const desc = state.currentChannel.description || fallback;
    DOM.profileChannelDesc.textContent = desc;
    DOM.channelDescInput.value = state.currentChannel.description || '';

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

    if (state.currentChannel && state.currentChannel.id === channelId) {
      state.currentChannel.description = description;
    }
    loadChannelDescription(channelId);
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
    loadGroupScheduleList(state.currentChannel.id);

    if (DOM.scheduleCalGrid && scheduleCalendarChannelId !== state.currentChannel.id) {
      scheduleCalendarChannelId = state.currentChannel.id;
      resetScheduleSelection();
      renderScheduleCalendar();
      renderScheduleSelectedDates();
      renderSchedulePerDateList();
    }

    const media = state.messages.filter((m) => isImageFile(m.file_url) && !isMessageMediaExpired(m));
    if (!media.length) {
      DOM.sharedMediaGrid.innerHTML = '<div class="empty-note">No shared media yet</div>';
      DOM.profileSeeAllMedia.classList.add('hidden');
      return;
    }
    const showAll = DOM.sharedMediaGrid.dataset.showAll === 'true';
    const shown = showAll ? media : media.slice(-6);
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
    await loadStatusViews(state.statuses.map((s) => s.id));
    subscribeToStatusViews();
    renderStatuses();
    updateStatusNavBadge();
  }

  function updateStatusNavBadge() {
    if (!DOM.navUpdatesBadge || !state.currentUser) return;
    const me = state.currentUser.username;
    const hasUnseen = state.statuses.some((st) => {
      if (normalizeUsername(st.username) === me) return false;
      const viewers = state.statusViews.get(st.id) || [];
      return !viewers.some((v) => v.username === me);
    });
    DOM.navUpdatesBadge.classList.toggle('hidden', !hasUnseen);
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
      updateStatusNavBadge();
    }
  }

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
        const statusPreviewLinkUrl = st.content ? firstUrlIn(st.content) : null;
        const preview = st.content
          ? (statusPreviewLinkUrl
              ? `<a href="${escapeHtml(statusPreviewLinkUrl)}" rel="noopener" class="msg-link">${escapeHtml(truncate(st.content, 46))}</a>`
              : escapeHtml(truncate(st.content, 46)))
          : (st.media_url ? '<i class="fas fa-camera"></i> Photo/video' : '');
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
          if (e.target.closest('a.msg-link')) return;
          e.preventDefault();
          showStatusModal(st);
        });
        item.addEventListener('click', (e) => {
          const link = e.target.closest('a.msg-link');
          if (!link) return;
          e.preventDefault();
          e.stopPropagation();
          openExternalLink(link.getAttribute('href'));
        });
        DOM.statusTray.appendChild(item);
      });
    }

    const shouldShow = state.isAdmin && CONFIG.FEATURES.ENABLE_STATUS_UPDATES;
    DOM.statusAddBtn.classList.toggle('hidden', !shouldShow);
    if (DOM.postStatusFab) DOM.postStatusFab.classList.add('hidden');
  }

  async function deleteStatus(statusId) {
    if (!confirm('Delete this status update?')) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.STATUSES).delete().eq('id', statusId);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await loadStatuses();
  }

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
      const uploadFile = await compressImageFile(file);

      if (uploadFile.size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
        alert(`File exceeds ${CONFIG.UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
        return;
      }
      const path = generateStatusStoragePath(state.currentUser.username, uploadFile.name);
      try {
        const { error: uploadError } = await supabase.storage.from(CONFIG.SUPABASE.STORAGE_BUCKET).upload(path, uploadFile);
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
  let statusMediaLoading = false;
  let statusMediaLoadingSafetyTimer = null;
  let currentStatusVideoEl = null;

  function showStatusModal(status) {
    suppressStatusOpenClicksUntil = Date.now() + 80;

    recordStatusView(status);

    setAvatarEl(DOM.statusViewerAvatar, status.username, 'sm status-viewer-avatar');
    DOM.statusModalTitle.textContent = getDisplayName(status.username);
    DOM.statusModalTime.textContent = formatFullDate(status.created_at);
    DOM.statusModalContent.innerHTML = linkifyText(status.content || '');

    if (DOM.statusLinkPreview) {
      const statusLinkUrl = firstUrlIn(status.content);
      if (statusLinkUrl) {
        DOM.statusLinkPreview.innerHTML = '';
        hydrateLinkPreview(DOM.statusLinkPreview, statusLinkUrl, false);
      } else {
        DOM.statusLinkPreview.classList.add('hidden');
        DOM.statusLinkPreview.innerHTML = '';
      }
    }

    statusMediaLoading = !!status.media_url;
    if (statusMediaLoadingSafetyTimer) { clearTimeout(statusMediaLoadingSafetyTimer); statusMediaLoadingSafetyTimer = null; }
    currentStatusVideoEl = null;

    const removeMediaSpinner = () => {
      const spinnerEl = DOM.statusModalMedia.querySelector('.status-media-spinner');
      if (spinnerEl) spinnerEl.remove();
    };
    const markMediaReady = () => { statusMediaLoading = false; removeMediaSpinner(); };
    const markMediaBroken = () => {
      statusMediaLoading = false;
      DOM.statusModalMedia.innerHTML = '<div class="status-media-broken"><i class="fas fa-image"></i><span>Couldn\'t load this media</span></div>';
    };

    if (status.media_url && isVideoFile(status.media_url)) {
      DOM.statusModalMedia.innerHTML = `<video src="${escapeHtml(status.media_url)}" autoplay playsinline></video>`;
      const videoEl = DOM.statusModalMedia.querySelector('video');
      videoEl.muted = false;
      videoEl.volume = 1;
      videoEl.addEventListener('loadeddata', markMediaReady, { once: true });
      videoEl.addEventListener('error', markMediaBroken, { once: true });
      const statusVideoPlayPromise = videoEl.play();
      if (statusVideoPlayPromise && typeof statusVideoPlayPromise.catch === 'function') {
        statusVideoPlayPromise.catch(() => {
          videoEl.muted = true;
          videoEl.play().catch(() => {});
        });
      }
      DOM.statusModalMedia.insertAdjacentHTML('beforeend', '<div class="status-media-spinner" aria-hidden="true"></div>');

      currentStatusVideoEl = videoEl;
      videoEl.addEventListener('timeupdate', () => {
        if (videoEl.duration) {
          DOM.statusProgress.style.width = Math.min((videoEl.currentTime / videoEl.duration) * 100, 100) + '%';
        }
      });
      videoEl.addEventListener('ended', closeStatusViewer);
    } else if (status.media_url) {
      DOM.statusModalMedia.innerHTML = `<img src="${escapeHtml(status.media_url)}" alt="Status media">`;
      const imgEl = DOM.statusModalMedia.querySelector('img');
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        markMediaReady();
      } else {
        imgEl.addEventListener('load', markMediaReady, { once: true });
        imgEl.addEventListener('error', markMediaBroken, { once: true });
        DOM.statusModalMedia.insertAdjacentHTML('beforeend', '<div class="status-media-spinner" aria-hidden="true"></div>');
      }
    } else {
      DOM.statusModalMedia.innerHTML = '';
    }
    if (statusMediaLoading) {
      statusMediaLoadingSafetyTimer = setTimeout(() => { statusMediaLoading = false; removeMediaSpinner(); }, 8000);
    }

    if (DOM.statusViewerBody) {
      DOM.statusViewerBody.classList.toggle('has-media', !!status.media_url);
    }

    DOM.statusProgress.style.width = '0%';
    DOM.statusModal.classList.remove('hidden');

    statusProgressValue = 0;
    statusPaused = false;
    updateStatusPauseIcon();
    if (state.progressInterval) clearInterval(state.progressInterval);

    if (!currentStatusVideoEl) {
      state.progressInterval = setInterval(() => {
        if (statusPaused || statusMediaLoading) return;
        statusProgressValue += 1.2;
        if (statusProgressValue >= 100) {
          clearInterval(state.progressInterval);
          state.progressInterval = null;
          DOM.statusModal.classList.add('hidden');
        }
        DOM.statusProgress.style.width = Math.min(statusProgressValue, 100) + '%';
      }, 50);
    }
  }

  function toggleStatusPause() {
    statusPaused = !statusPaused;
    if (currentStatusVideoEl) {
      if (statusPaused) {
        currentStatusVideoEl.pause();
      } else {
        currentStatusVideoEl.play().catch(() => {});
      }
    }
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
    if (statusMediaLoadingSafetyTimer) { clearTimeout(statusMediaLoadingSafetyTimer); statusMediaLoadingSafetyTimer = null; }
    statusMediaLoading = false;
    statusPaused = false;
    if (currentStatusVideoEl) {
      currentStatusVideoEl.pause();
      currentStatusVideoEl = null;
    }
    DOM.statusModalMedia.innerHTML = '';
    if (state.currentScreen && history.replaceState) {
      history.replaceState({ orbitScreen: state.currentScreen }, '', '#' + state.currentScreen);
    }
  }

  // ============================================================
  // 11. VIDEO / PLUGNMEET
  // ============================================================
  async function getLiveJoinUrl() {
    const { data, error } = await supabase.functions.invoke(CONFIG.PLUGNMEET.EDGE_FUNCTION, {
      body: {
        schedule_id: state.currentSchedule ? state.currentSchedule.id : null,
        channel_id: state.currentChannel ? state.currentChannel.id : null,
      },
    });
    if (error || !data?.join_url) {
      const serverMessage = data?.error || error?.message || 'Unknown error';
      throw new Error(serverMessage);
    }
    return data.join_url;
  }

  let liveSessionAutoCloseTimer = null;

  function clearLiveSessionAutoCloseTimer() {
    if (liveSessionAutoCloseTimer) {
      clearTimeout(liveSessionAutoCloseTimer);
      liveSessionAutoCloseTimer = null;
    }
  }

  // FIX: root cause of "user can't see the buttons for minimizing/
  // maximizing in live meeting so they can text in group when needed" —
  // this is the piece that never existed. Minimizing only ever meant
  // closeLiveSession() below, which sets videoIframe.src = '' and tears
  // the call down completely — there was no way to shrink #videoContainer
  // out of the way while keeping the meeting connected. This toggles the
  // .video-panel-minimized class (styles.css positions/resizes the panel
  // into a small corner pip instead of covering the whole screen) without
  // touching videoIframe.src or state.videoActive at all, so the call
  // keeps running in the background and #chatContainer/.composer
  // underneath become reachable again. Wired to #minimizeVideoBtn below.
  function setVideoMinimized(minimized) {
    state.videoMinimized = !!minimized;
    DOM.videoContainer.classList.toggle('video-panel-minimized', state.videoMinimized);
    if (DOM.minimizeVideoBtn) {
      DOM.minimizeVideoBtn.innerHTML = state.videoMinimized
        ? '<i class="fas fa-expand"></i>'
        : '<i class="fas fa-compress"></i>';
      DOM.minimizeVideoBtn.title = state.videoMinimized
        ? 'Expand call'
        : 'Minimize call (keep chatting)';
    }
  }

  function closeLiveSession(message) {
    const wasActive = state.videoActive;
    clearLiveSessionAutoCloseTimer();
    DOM.videoContainer.classList.add('hidden');
    DOM.videoIframe.src = '';
    state.videoActive = false;
    state.activeCallScheduleId = null;
    state.activeCallIsHost = false;
    setVideoMinimized(false);
    if (DOM.endLiveSessionBtn) DOM.endLiveSessionBtn.classList.add('hidden');
    if (message && wasActive) alert(message);
  }

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
    closeLiveSession('You ended this live session for everyone.');
  }

  async function joinLiveClass() {
    if (!state.currentUser || !state.currentChannel) { alert('Please select a channel first.'); return; }

    const mode = getLiveButtonMode();
    if (mode === 'hidden') { return; }

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

    let liveUrl;
    DOM.joinLiveBtn.disabled = true;
    try {
      liveUrl = await getLiveJoinUrl();
    } catch (e) {
      console.error('Could not get PlugNmeet join URL:', e);
      alert('Could not start the video call: ' + e.message);
      updateLiveButtonState();
      return;
    }

    DOM.videoContainer.classList.remove('hidden');
    setVideoMinimized(false);
    DOM.videoIframe.src = liveUrl;
    state.videoActive = true;
    state.activeCallScheduleId = state.currentSchedule ? state.currentSchedule.id : null;
    state.activeCallIsHost = mode === 'start';
    updateLiveButtonState();
    if (DOM.endLiveSessionBtn) {
      DOM.endLiveSessionBtn.classList.toggle('hidden', !(state.isAdmin && state.activeCallScheduleId));
    }

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

  async function loadRegisteredUsersList() {
    if (!DOM.registeredUsersListView || !state.isAdmin) return;

    if (registeredUsersListLoading) return;
    registeredUsersListLoading = true;

    if (registeredUsersListHasData) {
      renderRegisteredUsersList();
    } else {
      DOM.registeredUsersListView.innerHTML = '<div class="empty-note">Loading users…</div>';
    }

    try {
      await loadRoleCache();

      const [membersRes, channelsRes] = await Promise.all([
        supabase.from(CONFIG.SUPABASE.TABLES.MEMBERS).select('username, channel_id, role'),
        supabase.from(CONFIG.SUPABASE.TABLES.CHANNELS).select('id, name').order('name'),
      ]);

      if (membersRes.error || channelsRes.error) {
        console.warn('Could not load user assignments:', membersRes.error || channelsRes.error);
        if (!registeredUsersListHasData) {
          DOM.registeredUsersListView.innerHTML = '<div class="empty-note">Could not load users</div>';
        }
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
      registeredUsersListHasData = true;
      renderRegisteredUsersList();
    } finally {
      registeredUsersListLoading = false;
    }
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

  async function openGroupAssignmentModal(username) {
    username = normalizeUsername(username);
    if (!username || !state.isAdmin) return;

    if (!allGroupsCache.length) {
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
  // SELECT CHANNEL
  // ============================================================
  async function selectChannel(channel, { markSeenNow = true } = {}) {
    if (typeof exitMessageSelection === 'function') exitMessageSelection();
    chatNeedsInitialPaint = true;
    if (state.currentChannel && state.currentChannel.id !== channel.id) {
      clearTypingIndicator(state.currentChannel.id);
    }
    state.currentChannel = channel;
    updateChatEmptyState();
    highlightActiveChatRow();

    const cachedMessages = getCachedMessages(channel.id);
    state.messages = cachedMessages || [];
    renderMessages(true);
    if (cachedMessages) {
      console.log(`⚡ Instant load: ${cachedMessages.length} messages from cache`);
    }

    const messagesReady = loadMessages(channel.id).then(() => subscribeToMessages(channel.id));
    const membersReady = loadMembers(channel.id);
    const readsReady = loadMessageReads(channel.id).then(() => subscribeToMessageReads(channel.id));
    const scheduleReady = loadSchedule(channel.id).then(() => subscribeToSchedule(channel.id));

    await Promise.all([messagesReady, membersReady, readsReady, scheduleReady]);

    updateChatDetailHeader();
    updateProfileScreen();

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
    if (getTypingUsernames(state.currentChannel.id).length > 0) return;
    if (DOM.chatDetailSub) DOM.chatDetailSub.classList.remove('typing-active');
    const total = state.currentMembers.length;
    const online = state.currentMembers.filter((m) => state.onlineUsers.has((m.username || '').toLowerCase())).length;
    DOM.chatDetailSub.textContent = total ? `${total} member${total === 1 ? '' : 's'} · ${online} online` : '';
  }

  // ============================================================
  // 14. LOGIN FLOW
  // ============================================================
  async function completeLogin(username, user) {
    console.log('🔐 Completing login for:', username);

    hideAppLoading();
    DOM.authCard.classList.add('hidden');
    DOM.dashboard.classList.remove('hidden');

    screenHistory = [];
    goToScreen('chats');

    // FIX: Ensure role cache is loaded BEFORE setting user state
    // This is critical for teachers to be properly detected
    await loadRoleCache();
    
    const role = getRoleFromUsername(username);
    const key = roleKey(username);
    const displayName = getDisplayName(username);

    state.currentUser = { id: user.id, username: username, email: user.email, role: role };
    state.isAdmin = role === CONFIG.AUTH.ROLES.ADMIN;
    state.isTeacher = role === CONFIG.AUTH.ROLES.TEACHER || state.isAdmin;

    console.log(`👤 User role: ${role}, isTeacher: ${state.isTeacher}, isAdmin: ${state.isAdmin}`);

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

    DOM.userBadge.textContent = displayName;
    DOM.userBadge.className = `role-chip role-${key}-chip`;

    setAvatarEl(DOM.settingsAvatar, username, 'lg');
    DOM.settingsName.textContent = displayName;
    DOM.settingsEmail.textContent = user.email || generateEmail(username);
    DOM.settingsDisplayName.textContent = `Username: ${username}`;

    DOM.adminSettingsCard.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));
    if (DOM.viewCalendarBtn) DOM.viewCalendarBtn.classList.toggle('hidden', !state.isAdmin);
    DOM.adminProfileSchedule.classList.toggle('hidden', !state.isAdmin);

    if (state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE) {
      loadRegisteredUsersList();
    }

    setupPresence();
    startSessionWatchdog();
    requestMediaPermissions();
    await renderChannels();
    subscribeToChannelListUpdates();
    startChannelPreviewPolling();
    startMediaExpiryWatcher();
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
      hideAppLoading();
      if (DOM.dashboard.classList.contains('hidden')) {
        DOM.authCard.classList.remove('hidden');
      }
    }
  }

  const SESSION_CHECK_INTERVAL = 60000;
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
    stopMediaExpiryWatcher();
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

    allChannels = [];
    state.unreadByChannel = {};
    state.channelPreviews = {};
    state.messageReads = new Map();
    state.statusViews = new Map();
    state.myMemberships = new Map();
    state.myUserRoleId = null;
    DOM.navChatsBadge.textContent = '0';
    DOM.navChatsBadge.classList.add('hidden');
    if (DOM.navUpdatesBadge) DOM.navUpdatesBadge.classList.add('hidden');

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
    closeLiveSession();
    DOM.authCard.classList.remove('hidden');
    DOM.usernameInput.value = '';
    DOM.passwordInput.value = '';
    hideError();
    
    screenHistory = [];
  }

  async function handleSignOut() {
    if (!confirm('Sign out?')) return;
    await performSignOutCleanup();
  }

  async function forceSignOut(message) {
    if (!state.currentUser) return;
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

  DOM.sendMsgBtn.addEventListener('mousedown', (e) => e.preventDefault());

  DOM.sendMsgBtn.addEventListener('click', async () => {
    const content = DOM.messageInput.value.trim();
    const file = DOM.fileInput.files[0];
    if (!content && !file) return;
    broadcastStoppedTyping();

    DOM.messageInput.value = '';
    DOM.fileInput.value = '';
    DOM.filePreview.classList.add('hidden');

    const sent = await sendMessage(content, file);

    if (!sent && content) {
      DOM.messageInput.value = content;
    }

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

  DOM.messageInput.addEventListener('input', () => {
    broadcastTyping();
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
    if (state.activeCallIsHost) {
      endLiveSessionForEveryone();
    } else {
      closeLiveSession();
    }
  });

  if (DOM.endLiveSessionBtn) {
    DOM.endLiveSessionBtn.addEventListener('click', () => endLiveSessionForEveryone());
  }

  // FIX: root cause of "user can't see the buttons for minimizing/
  // maximizing in live meeting so they can text in group when needed" —
  // #minimizeVideoBtn didn't exist before, so there was nothing to wire
  // up. This just flips state.videoMinimized via setVideoMinimized() —
  // same button doubles as "maximize" once minimized (see its icon swap
  // in setVideoMinimized()) — leaving the call itself completely alone.
  if (DOM.minimizeVideoBtn) {
    DOM.minimizeVideoBtn.addEventListener('click', () => {
      setVideoMinimized(!state.videoMinimized);
    });
  }

  DOM.fileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) { DOM.filePreview.classList.add('hidden'); return; }
    if (!isCompressibleImageType(file) && file.size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
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

  if (DOM.closeUserEditBtn) {
    DOM.closeUserEditBtn.addEventListener('click', () => {
      closeUserEditForm();
    });
  }

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

  DOM.sharedMediaGrid.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-media-url]');
    if (img) {
      const idx = parseInt(img.dataset.mediaIndex, 10);
      openImageLightbox(img.dataset.mediaUrl, state.sharedMediaUrls, Number.isNaN(idx) ? undefined : idx);
    }
  });

  DOM.closeStatusModal.addEventListener('click', closeStatusViewer);
  DOM.statusModal.addEventListener('click', (e) => {
    if (Date.now() < suppressStatusOpenClicksUntil) return;
    if (e.target === DOM.statusModal) closeStatusViewer();
  });
  DOM.statusPauseBtn.addEventListener('click', toggleStatusPause);

  if (DOM.statusViewerBody) {
    DOM.statusViewerBody.addEventListener('click', (e) => {
      if (Date.now() < suppressStatusOpenClicksUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const sharedLink = e.target.closest('a.msg-link, a.msg-link-preview');
      if (sharedLink) {
        e.preventDefault();
        e.stopPropagation();
        openExternalLink(sharedLink.getAttribute('href'));
      }
    });
  }

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
