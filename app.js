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
    activeOverlay: null // Tracking modal context for Back behavior
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
  // 5. HISTORY NAVIGATION (FIXED FOR MODALS & MOBILE BACK BUTTON)
  // ============================================================
  let screenHistory = [];
  let isBackNavigation = false;

  function pushScreenState(screenName, isOverlay = false) {
    if (screenHistory.length === 0 || screenHistory[screenHistory.length - 1] !== screenName) {
      screenHistory.push(screenName);
      if (history.pushState) {
        history.pushState({ orbitScreen: screenName, isOverlay: isOverlay }, '', '#' + screenName);
      }
    }
  }

  function handleBackNavigation(event) {
    if (state.activeOverlay) {
      state.activeOverlay.remove();
      state.activeOverlay = null;
      return;
    }

    if (DOM.statusModal && !DOM.statusModal.classList.contains('hidden')) {
      closeStatusViewer(true);
      return;
    }

    if (DOM.videoContainer && !DOM.videoContainer.classList.contains('hidden')) {
      DOM.videoContainer.classList.add('hidden');
      DOM.videoIframe.src = '';
      state.videoActive = false;
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
  }

  window.addEventListener('popstate', handleBackNavigation);

  // ============================================================
  // 6. MODALS & STATUS VIEW FIXES
  // ============================================================
  function showStatusModal(st) {
    if (!DOM.statusModal) return;
    DOM.statusModal.classList.remove('hidden');
    DOM.statusModalTitle.textContent = getDisplayName(st.username);
    DOM.statusModalTime.textContent = formatTimeAgo(st.created_at);
    DOM.statusModalContent.textContent = st.content || '';

    if (st.media_url) {
      DOM.statusModalMedia.src = st.media_url;
      DOM.statusModalMedia.classList.remove('hidden');
    } else {
      DOM.statusModalMedia.classList.add('hidden');
    }

    pushScreenState('statusModal', true);
  }

  function closeStatusViewer(fromPopState = false) {
    if (!DOM.statusModal) return;
    DOM.statusModal.classList.add('hidden');
    if (!fromPopState && history.state?.orbitScreen === 'statusModal') {
      history.back();
    }
  }

  if (DOM.closeStatusModal) {
    DOM.closeStatusModal.addEventListener('click', () => closeStatusViewer());
  }

  function openImageLightbox(url) {
    if (!url) return;
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <button class="lightbox-close" aria-label="Close"><i class="fas fa-times"></i></button>
      <img class="lightbox-img" src="${escapeHtml(url)}" alt="Attached image, full size">
    `;
    document.body.appendChild(overlay);
    state.activeOverlay = overlay;

    pushScreenState('lightbox', true);

    const close = () => {
      if (state.activeOverlay === overlay) state.activeOverlay = null;
      overlay.remove();
      if (history.state?.orbitScreen === 'lightbox') {
        history.back();
      }
    };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.lightbox-close').addEventListener('click', close);
  }

  // ============================================================
  // 7. SCREEN NAVIGATION
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

  function goToScreen(name) {
    if (name !== 'chatDetail' && typeof exitMessageSelection === 'function') exitMessageSelection();
    const isDesktop = isDesktopLayout();
    const keepChatsVisible = isDesktop && CHAT_GROUP_SCREENS.includes(name);

    Object.entries(SCREEN_EL).forEach(([key, el]) => {
      if (!el) return;
      let shouldBeVisible = (key === name) || (isDesktop && key === 'chats' && keepChatsVisible);
      
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
    DOM.bottomNav.classList.toggle('hidden', !isRoot && !isDesktop);

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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatTimeAgo(ts) {
    if (!ts) return '';
    const diffMs = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function getDisplayName(username) {
    if (!username) return username;
    return state.displayNameCache[username.toLowerCase()] || username;
  }

  // ============================================================
  // 8. AUTHENTICATION HANDLERS
  // ============================================================
  async function handleLogin(e) {
    if (e) e.preventDefault();
    if (DOM.authError) DOM.authError.classList.add('hidden');

    const username = DOM.usernameInput.value.trim().toLowerCase();
    const password = DOM.passwordInput.value;

    if (!username || !password) {
      showAuthError("Please enter both username and password.");
      return;
    }

    if (DOM.loginBtn) {
      DOM.loginBtn.disabled = true;
      DOM.loginBtn.textContent = 'Signing in...';
    }

    // Convert username to internal email format if user didn't enter full email
    const email = username.includes('@') ? username : `${username}@nous.edu`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (DOM.loginBtn) {
      DOM.loginBtn.disabled = false;
      DOM.loginBtn.textContent = 'Sign In';
    }

    if (error) {
      showAuthError(error.message);
      return;
    }

    // Successful login triggered automatically via onAuthStateChange
  }

  function showAuthError(msg) {
    if (DOM.authError && DOM.authErrorText) {
      DOM.authErrorText.textContent = msg;
      DOM.authError.classList.remove('hidden');
    } else {
      alert(msg);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    state.currentUser = null;
    DOM.dashboard.classList.add('hidden');
    DOM.authCard.classList.remove('hidden');
    if (DOM.passwordInput) DOM.passwordInput.value = '';
  }

  // Bind Login Listener
  if (DOM.loginBtn) {
    DOM.loginBtn.addEventListener('click', handleLogin);
  }
  if (DOM.passwordInput) {
    DOM.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin(e);
    });
  }
  if (DOM.signOutBtn) {
    DOM.signOutBtn.addEventListener('click', handleSignOut);
  }

  // ============================================================
  // 9. SUPABASE AUTH STATE OBSERVER
  // ============================================================
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      state.currentUser = session.user;
      
      // Hide Auth UI, show App Dashboard
      if (DOM.authCard) DOM.authCard.classList.add('hidden');
      if (DOM.dashboard) DOM.dashboard.classList.remove('hidden');

      // Initialize workspace
      goToScreen('chats');
    } else {
      state.currentUser = null;
      if (DOM.dashboard) DOM.dashboard.classList.add('hidden');
      if (DOM.authCard) DOM.authCard.classList.remove('hidden');
    }
  });

})();
