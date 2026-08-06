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
    onlineUsers: new Set(),
    currentTab: 'chats',
    screenReturn: 'chats',
    currentScreen: 'chats',
  };

  // ============================================================
  // 4. DOM REFS
  // ============================================================
  const $ = (id) => document.getElementById(id);

  const DOM = {
    authCard: $('authCard'),
    dashboard: $('dashboard'),
    usernameInput: $('usernameInput'),
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
    createChannelFab: $('createChannelFab'),

    // updates
    userBadge: $('userBadge'),
    statusTray: $('statusTray'),
    statusPlaceholder: $('statusPlaceholder'),
    statusAddBtn: $('statusAddBtn'),
    postStatusBtn: $('postStatusBtn'),

    // settings
    settingsAvatar: $('settingsAvatar'),
    settingsName: $('settingsName'),
    settingsEmail: $('settingsEmail'),
    notifToggle: $('notifToggle'),
    darkToggle: $('darkToggle'),
    adminSettingsCard: $('adminSettingsCard'),
    createChannelBtn: $('createChannelBtn'),
    signOutBtn: $('signOutBtn'),

    // admin: create teacher/student account
    adminCreateUserCard: $('adminCreateUserCard'),
    newUserUsername: $('newUserUsername'),
    newUserRole: $('newUserRole'),
    newUserPassword: $('newUserPassword'),
    generatePasswordBtn: $('generatePasswordBtn'),
    createUserBtn: $('createUserBtn'),

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

    // status viewer
    statusModal: $('statusModal'),
    statusSegments: $('statusSegments'),
    statusProgress: $('statusProgress'),
    closeStatusModal: $('closeStatusModal'),
    statusViewerAvatar: $('statusViewerAvatar'),
    statusModalTitle: $('statusModalTitle'),
    statusModalTime: $('statusModalTime'),
    statusModalContent: $('statusModalContent'),
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
  // 5c. PUSH NOTIFICATIONS (works even when phone is locked)
  // ============================================================
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
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

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(CONFIG.PUSH.VAPID_PUBLIC_KEY),
        });
      }

      const json = subscription.toJSON();
      await supabase.from('push_subscriptions').upsert(
        {
          username: state.currentUser.username,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: 'endpoint' }
      );
      return true;
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
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
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

  async function loadRoleCache() {
    const { data, error } = await supabase.from('user_roles').select('username, role');
    if (error) {
      console.warn('Role cache unavailable, using username-based fallback:', error);
      return;
    }
    (data || []).forEach((row) => {
      state.roleCache[row.username.toLowerCase()] = row.role;
    });
  }

  function roleKey(username) {
    const role = getRoleFromUsername(username);
    if (role === CONFIG.AUTH.ROLES.ADMIN) return 'admin';
    if (role === CONFIG.AUTH.ROLES.TEACHER) return 'teacher';
    return 'student';
  }

  function avatarHtml(username, size) {
    const key = roleKey(username);
    const initial = (username || '?').charAt(0).toUpperCase();
    const sizeClass = size === 'sm' ? ' sm' : size === 'lg' ? ' lg' : '';
    const online = state.onlineUsers.has((username || '').toLowerCase());
    return `<div class="avatar avatar-${key}${sizeClass}">${initial}<span class="avatar-dot${online ? ' online' : ''}"></span></div>`;
  }

  // Deterministic decorative color for a channel avatar (channels aren't role-typed)
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
    el.className = `avatar avatar-${key}${extraClass ? ' ' + extraClass : ''}`;
    el.textContent = (username || '?').charAt(0).toUpperCase();
  }

  function generateEmail(username) {
    return `${username}${CONFIG.AUTH.EMAIL_SUFFIX}`;
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

  // Screens that are conceptually "inside" the Chats tab — on desktop the
  // channel list stays visible as a permanent left pane alongside these,
  // instead of being replaced full-screen like it is on mobile.
  const CHAT_GROUP_SCREENS = ['chats', 'chatDetail', 'members', 'profile'];
  const isDesktopLayout = () => window.matchMedia('(min-width: 1024px)').matches;

  function goToScreen(name) {
    const keepChatsVisible = isDesktopLayout() && CHAT_GROUP_SCREENS.includes(name);

    Object.entries(SCREEN_EL).forEach(([key, el]) => {
      if (!el) return;
      if (keepChatsVisible && key === 'chats') return; // leave the groups panel showing
      el.classList.add('hidden');
    });
    if (SCREEN_EL[name]) SCREEN_EL[name].classList.remove('hidden');

    const isRoot = ROOT_TABS.includes(name);
    DOM.bottomNav.classList.toggle('hidden', !isRoot);
    if (isRoot) {
      state.currentTab = name;
      DOM.bottomNav.querySelectorAll('.nav-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === name);
      });
    }
    state.currentScreen = name;
  }

  // Re-apply the layout when crossing the desktop breakpoint (e.g. resizing
  // a laptop window), so the groups panel appears/disappears correctly
  // without needing another click.
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
  async function loginWithUsername(username) {
    const email = generateEmail(username);
    const password = CONFIG.AUTH.DEFAULT_PASSWORD;

    try {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });

      const isAlreadyRegistered =
        signUpError &&
        (signUpError.status === 400 ||
          signUpError.status === 409 ||
          signUpError.status === 422 ||
          /already registered|already exists/i.test(signUpError.message || ''));

      if (signUpError && !isAlreadyRegistered) {
        throw signUpError;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.user;
    } catch (e) {
      console.error('Auth error:', e);
      throw new Error('Login failed. Please check your School ID.');
    }
  }

  // ============================================================
  // 7a. ADMIN: CREATE TEACHER / STUDENT ACCOUNT
  // ============================================================
  async function createUserAccount(username, role, password) {
    if (!username) { alert('Enter a username.'); return; }
    if (!password) { alert('Enter or generate a password.'); return; }

    const email = generateEmail(username);

    try {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });

      const isAlreadyRegistered =
        signUpError &&
        (signUpError.status === 400 ||
          signUpError.status === 409 ||
          signUpError.status === 422 ||
          /already registered|already exists/i.test(signUpError.message || ''));

      if (signUpError && !isAlreadyRegistered) throw signUpError;

      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ username, role }, { onConflict: 'username' });
      if (roleError) throw roleError;

      state.roleCache[username.toLowerCase()] = role;

      alert(`Account created for "${username}" (${role}).\n\nPassword: ${password}\n\nShare this with them securely — it won't be shown again.`);
      DOM.newUserUsername.value = '';
      DOM.newUserPassword.value = '';
      DOM.newUserRole.value = 'student';
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
    DOM.createChannelFab.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));

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
      const previewAuthor = preview && preview.username ? `${escapeHtml(preview.username)}: ` : '';
      const time = preview ? formatTimeAgo(preview.created_at) : '';

      const row = document.createElement('div');
      row.className = 'chat-row';
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
      row.addEventListener('click', (e) => {
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
    await loadMessages(channel.id);
    await loadMembers(channel.id);
    subscribeToMessages(channel.id);
    await markDelivered(channel.id);
    await markSeen(channel.id);
    await loadSchedule(channel.id);
    subscribeToSchedule(channel.id);
    updateChatDetailHeader();
    updateProfileScreen();
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
  // 8e. CLASS SCHEDULING (admin sets teacher's class time)
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
    DOM.scheduleBannerText.textContent = `Class with ${schedule.teacher_username} scheduled for ${formatted} (${schedule.duration_minutes} min)`;
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
    if (!teacherUsername || !datetimeLocal) { alert('Enter a teacher username and a date/time.'); return; }

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
    state.currentMembers = data || [];
    renderMembers();
    updateChatDetailSubtitle();
    updateProfileMeta();
  }

  function renderMembers() {
    DOM.adminAddMemberRow.classList.toggle('hidden', !state.isAdmin);

    const query = (DOM.memberSearchInput.value || '').trim().toLowerCase();
    const members = [...state.currentMembers]
      .filter((m) => !query || m.username.toLowerCase().includes(query))
      .sort((a, b) => a.username.localeCompare(b.username));

    if (!members.length) {
      DOM.channelMembersList.innerHTML = `<div class="empty-note">${state.currentChannel ? 'No members yet' : 'Select a channel'}</div>`;
      DOM.alphaIndex.innerHTML = '';
      return;
    }

    let html = '';
    let lastLetter = '';
    members.forEach((m) => {
      const letter = m.username.charAt(0).toUpperCase();
      if (letter !== lastLetter) {
        html += `<div class="member-group-letter" id="memberLetter-${letter}">${letter}</div>`;
        lastLetter = letter;
      }
      const online = state.onlineUsers.has(m.username.toLowerCase());
      html += `
        <div class="member-row" id="member-${m.id}">
          ${avatarHtml(m.username, 'sm')}
          <div style="flex:1; min-width:0;">
            <div class="member-name">${escapeHtml(m.username)}</div>
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

    // Alphabet index
    const present = new Set(members.map((m) => m.username.charAt(0).toUpperCase()));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    DOM.alphaIndex.innerHTML = alphabet.map((l) => `<span data-letter="${l}" class="${present.has(l) ? '' : 'hidden'}">${l}</span>`).join('');
    DOM.alphaIndex.querySelectorAll('span').forEach((span) => {
      span.addEventListener('click', () => {
        const target = document.getElementById(`memberLetter-${span.dataset.letter}`);
        if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  }

  async function addMemberToChannel(username, role) {
    if (!username || !state.currentChannel) { alert('Enter a username and select a channel.'); return; }

    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MEMBERS)
      .upsert(
        { channel_id: state.currentChannel.id, username, role, added_by: state.currentUser.username },
        { onConflict: 'channel_id,username' }
      );

    if (error) { alert('Could not add member: ' + error.message); return; }

    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({ username, role, updated_at: new Date().toISOString() }, { onConflict: 'username' });

    if (roleError) {
      console.warn('Could not persist authoritative role:', roleError);
    } else {
      state.roleCache[username.toLowerCase()] = role;
    }

    await loadMembers(state.currentChannel.id);
  }

  async function removeMember(memberId) {
    if (!confirm('Remove this person from the group?')) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.MEMBERS).delete().eq('id', memberId);
    if (error) { alert('Remove failed: ' + error.message); return; }
    await loadMembers(state.currentChannel.id);
  }

  // ============================================================
  // 8b. REALTIME MESSAGE SYNC
  // ============================================================
  function subscribeToMessages(channelId) {
    if (state.messagesSubscription) {
      supabase.removeChannel(state.messagesSubscription);
      state.messagesSubscription = null;
    }

    state.messagesSubscription = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: CONFIG.SUPABASE.TABLES.MESSAGES, filter: `channel_id=eq.${channelId}` }, (payload) => {
        const exists = state.messages.some((m) => m.id === payload.new.id);
        if (!exists) {
          state.messages.push(payload.new);
          renderMessages();
          refreshUnreadBadges();

          if (payload.new.username !== state.currentUser?.username) {
            playNotifySound();
            markDelivered(channelId);
            markSeen(channelId);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: CONFIG.SUPABASE.TABLES.MESSAGES, filter: `channel_id=eq.${channelId}` }, (payload) => {
        const idx = state.messages.findIndex((m) => m.id === payload.new.id);
        if (idx !== -1) { state.messages[idx] = payload.new; renderMessages(); }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: CONFIG.SUPABASE.TABLES.MESSAGES, filter: `channel_id=eq.${channelId}` }, (payload) => {
        state.messages = state.messages.filter((m) => m.id !== payload.old.id);
        renderMessages();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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
  // 9. MESSAGES
  // ============================================================
  async function loadMessages(channelId) {
    if (!channelId) return;

    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Messages fallback:', error);
      state.messages = [{ id: '1', content: 'Welcome to the channel!', username: 'system', created_at: Date.now() }];
    } else {
      state.messages = data || [];
    }
    renderMessages();
    updateProfileScreen();
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
            <span class="reply-author">${escapeHtml(msg.reply_username || 'Message')}</span>
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

      wrap.innerHTML = `
        ${avatarHtml(msg.username, 'sm')}
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-author">${escapeHtml(msg.username || 'unknown')}</span>
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
  }

  DOM.chatMessages.addEventListener('click', (e) => {
    const btn = e.target.closest('.msg-reply-btn');
    if (!btn) return;

    if (btn.dataset.deleteId) { deleteMessage(btn.dataset.deleteId); return; }

    const id = btn.dataset.replyId;
    const msg = state.messages.find((m) => m.id === id);
    if (!msg) return;

    state.replyingTo = msg;
    DOM.replyPreviewAuthor.textContent = msg.username;
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
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.STATUSES)
      .select('*')
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
        item.innerHTML = `
          ${avatarHtml(st.username)}
          <div class="update-row-body">
            <div class="update-row-name">${escapeHtml(st.username || 'User')}</div>
            <div class="update-row-preview">${escapeHtml(truncate(st.content || '', 46))}</div>
          </div>
          <div class="update-row-time">${formatTimeAgo(st.created_at)}</div>
        `;
        item.addEventListener('click', () => showStatusModal(st));
        DOM.statusTray.appendChild(item);
      });
    }

    DOM.statusAddBtn.classList.toggle('hidden', !(state.isAdmin || state.isTeacher));
  }

  async function postStatus(content) {
    if (!state.currentUser) return;
    const { error } = await supabase.from(CONFIG.SUPABASE.TABLES.STATUSES).insert({
      username: state.currentUser.username,
      content: content,
      created_at: new Date().toISOString(),
    });
    if (error) { console.error('Status error:', error); alert('Failed to post status.'); }
    await loadStatuses();
  }

  function showStatusModal(status) {
    setAvatarEl(DOM.statusViewerAvatar, status.username, 'sm status-viewer-avatar');
    DOM.statusModalTitle.textContent = status.username || 'Announcement';
    DOM.statusModalTime.textContent = formatFullDate(status.created_at);
    DOM.statusModalContent.textContent = status.content || '';
    DOM.statusProgress.style.width = '0%';
    DOM.statusModal.classList.remove('hidden');

    let progress = 0;
    if (state.progressInterval) clearInterval(state.progressInterval);

    state.progressInterval = setInterval(() => {
      progress += 1.2;
      if (progress >= 100) {
        clearInterval(state.progressInterval);
        state.progressInterval = null;
        DOM.statusModal.classList.add('hidden');
      }
      DOM.statusProgress.style.width = Math.min(progress, 100) + '%';
    }, 50);
  }

  function closeStatusViewer() {
    DOM.statusModal.classList.add('hidden');
    if (state.progressInterval) { clearInterval(state.progressInterval); state.progressInterval = null; }
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
    DOM.profileChannelDesc.textContent = `Group workspace for ${state.currentChannel.name}. Share updates, chat with the group, and join live sessions together.`;
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

    state.currentUser = { id: user.id, username: username, email: user.email, role: role };
    state.isAdmin = role === CONFIG.AUTH.ROLES.ADMIN;
    state.isTeacher = role === CONFIG.AUTH.ROLES.TEACHER || state.isAdmin;

    DOM.authCard.classList.add('hidden');
    DOM.dashboard.classList.remove('hidden');

    DOM.userBadge.textContent = username;
    DOM.userBadge.className = `role-chip role-${key}-chip`;

    setAvatarEl(DOM.settingsAvatar, username, 'lg');
    DOM.settingsName.textContent = username;
    DOM.settingsEmail.textContent = user.email || generateEmail(username);

    DOM.adminSettingsCard.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));
    DOM.adminCreateUserCard.classList.toggle('hidden', !(state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE));
    DOM.adminProfileSchedule.classList.toggle('hidden', !state.isAdmin);

    setupPresence();
    await requestMediaPermissions();
    await renderChannels();
    await loadStatuses();
    subscribeToPush().then((ok) => { DOM.notifToggle.checked = !!ok; });

    goToScreen('chats');
  }

  async function handleLogin() {
    const username = DOM.usernameInput.value.trim();
    if (!username) { showError('Please enter your School ID.'); return; }
    hideError();

    try {
      const user = await loginWithUsername(username);
      await completeLogin(username, user);
    } catch (e) {
      showError(e.message || 'Login error. Please try again.');
    }
  }

  async function restoreSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user || !session.user.email) return;

      const suffix = CONFIG.AUTH.EMAIL_SUFFIX;
      if (!session.user.email.endsWith(suffix)) return;

      const username = session.user.email.slice(0, -suffix.length);
      await completeLogin(username, session.user);
    } catch (e) {
      console.warn('Session restore skipped:', e);
    }
  }

  async function handleSignOut() {
    if (!confirm('Sign out?')) return;

    try { await supabase.auth.signOut(); } catch (e) { console.warn('Sign out error:', e); }

    if (state.messagesSubscription) { supabase.removeChannel(state.messagesSubscription); state.messagesSubscription = null; }
    if (scheduleSubscription) { supabase.removeChannel(scheduleSubscription); scheduleSubscription = null; }
    teardownPresence();

    state.currentUser = null;
    state.currentChannel = null;
    state.currentMembers = [];
    state.isAdmin = false;
    state.isTeacher = false;
    state.messages = [];
    state.statuses = [];
    state.replyingTo = null;

    DOM.dashboard.classList.add('hidden');
    DOM.videoContainer.classList.add('hidden');
    DOM.authCard.classList.remove('hidden');
    DOM.usernameInput.value = '';
    hideError();
  }

  // ============================================================
  // 15. EVENT BINDINGS
  // ============================================================
  DOM.loginBtn.addEventListener('click', handleLogin);
  DOM.usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
  });

  // Bottom nav
  DOM.bottomNav.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => goToScreen(btn.dataset.tab));
  });

  // Chat search
  DOM.chatSearchInput.addEventListener('input', () => filterChatList(DOM.chatSearchInput.value));

  // Chat detail navigation
  DOM.backFromChat.addEventListener('click', () => goToScreen('chats'));
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
  });

  DOM.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); DOM.sendMsgBtn.click(); }
  });

  DOM.postStatusBtn.addEventListener('click', async () => {
    if (!CONFIG.FEATURES.ENABLE_STATUS_UPDATES) { alert('Status updates are disabled.'); return; }
    const content = prompt('Share a status update:');
    if (content) await postStatus(content);
  });

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
  DOM.createChannelFab.addEventListener('click', handleCreateChannel);

  DOM.generatePasswordBtn.addEventListener('click', () => {
    DOM.newUserPassword.value = generatePassword();
  });
  DOM.createUserBtn.addEventListener('click', () => {
    createUserAccount(
      DOM.newUserUsername.value.trim(),
      DOM.newUserRole.value,
      DOM.newUserPassword.value.trim()
    );
  });

  // (rosterGenBtn / exportAttendanceBtn have no corresponding elements in
  // index.html — generateRoster()/exportAttendance() are kept below in case
  // a future UI wires them up, but no listener is bound here.)

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

  // Members screen
  DOM.backFromMembers.addEventListener('click', () => goToScreen('profile'));
  DOM.memberSearchInput.addEventListener('input', () => renderMembers());
  DOM.profileMembersBtn.addEventListener('click', () => {
    if (!state.currentChannel) { alert('Select a channel first.'); return; }
    renderMembers();
    goToScreen('members');
  });

  // Profile screen
  DOM.backFromProfile.addEventListener('click', () => goToScreen('chatDetail'));
  DOM.profileSeeAllMedia.addEventListener('click', (e) => {
    e.preventDefault();
    DOM.sharedMediaGrid.dataset.showAll = 'true';
    updateProfileScreen();
  });

  // Status viewer
  DOM.closeStatusModal.addEventListener('click', closeStatusViewer);
  DOM.statusModal.addEventListener('click', (e) => { if (e.target === DOM.statusModal) closeStatusViewer(); });

  // Settings toggles
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
  restoreSession();
  console.log('✅ Application initialized successfully.');

})();
