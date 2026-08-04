// ============================================================
// Nous Complex Orbit — Application Logic v2.0
// Features: WhatsApp ticks, reply-to, notifications, admin CRUD
// ============================================================

(function() {
  "use strict";

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
  console.log("[APP] Script loaded successfully");
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
    statuses: [],
    messages: [],
    isAdmin: false,
    isTeacher: false,
    videoActive: false,
    progressInterval: null,
    messagesSubscription: null,
    // NEW v2.0 state
    replyingTo: null,
    unreadCounts: {},
    contextMenuTarget: null,
    adminData: { users: [], channels: [], members: [], messages: [] },
    lastReadMessageId: {},
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
    channelList: $('channelList'),
    userBadge: $('userBadge'),
    adminPanel: $('adminPanel'),
    statusTray: $('statusTray'),
    statusPlaceholder: $('statusPlaceholder'),
    statusAddBtn: $('statusAddBtn'),
    postStatusBtn: $('postStatusBtn'),
    chatMessages: $('chatMessages'),
    chatContainer: $('chatContainer'),
    messageInput: $('messageInput'),
    fileInput: $('fileInput'),
    sendMsgBtn: $('sendMsgBtn'),
    joinLiveBtn: $('joinLiveBtn'),
    liveBtnText: $('liveBtnText'),
    videoContainer: $('videoContainer'),
    videoIframe: $('videoIframe'),
    closeVideoBtn: $('closeVideoBtn'),
    statusModal: $('statusModal'),
    statusModalTitle: $('statusModalTitle'),
    statusModalContent: $('statusModalContent'),
    statusProgress: $('statusProgress'),
    closeStatusModal: $('closeStatusModal'),
    fileUploadStatus: $('fileUploadStatus'),
    filePreview: $('filePreview'),
    filePreviewName: $('filePreviewName'),
    filePreviewRemove: $('filePreviewRemove'),
    createChannelBtn: $('createChannelBtn'),
    rosterGenBtn: $('rosterGenBtn'),
    exportAttendanceBtn: $('exportAttendanceBtn'),
    assignStudentBtn: $('assignStudentBtn'),
    assignStudentInput: $('assignStudentInput'),
    authLogo: $('authLogo'),
    sidebarLogo: $('sidebarLogo'),
    // NEW v2.0 DOM refs
    notificationSound: $('notificationSound'),
    globalNotificationBadge: $('globalNotificationBadge'),
    replyPreview: $('replyPreview'),
    replyPreviewAuthor: $('replyPreviewAuthor'),
    replyPreviewText: $('replyPreviewText'),
    cancelReplyBtn: $('cancelReplyBtn'),
    msgContextMenu: $('msgContextMenu'),
    ctxReplyBtn: $('ctxReplyBtn'),
    ctxDeleteBtn: $('ctxDeleteBtn'),
    adminFullPanel: $('adminFullPanel'),
    closeAdminPanelBtn: $('closeAdminPanelBtn'),
    openAdminPanelBtn: $('openAdminPanelBtn'),
    adminTabs: document.querySelectorAll('.admin-tab'),
    adminTabContents: document.querySelectorAll('.admin-tab-content'),
    adminUserName: $('adminUserName'),
    adminUserFullName: $('adminUserFullName'),
    adminUserRole: $('adminUserRole'),
    adminAddUserBtn: $('adminAddUserBtn'),
    adminUsersList: $('adminUsersList'),
    adminChannelName: $('adminChannelName'),
    adminAddChannelBtn: $('adminAddChannelBtn'),
    adminChannelsList: $('adminChannelsList'),
    adminMemberChannel: $('adminMemberChannel'),
    adminMemberUser: $('adminMemberUser'),
    adminMemberRole: $('adminMemberRole'),
    adminAddMemberBtn: $('adminAddMemberBtn'),
    adminMembersList: $('adminMembersList'),
    adminMsgChannel: $('adminMsgChannel'),
    adminRefreshMessagesBtn: $('adminRefreshMessagesBtn'),
    adminMessagesList: $('adminMessagesList'),
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
  // 6. UTILITY FUNCTIONS
  // ============================================================
  function getRoleFromUsername(username) {
    if (!username) return CONFIG.AUTH.ROLES.STUDENT;
    const lower = username.toLowerCase();
    if (lower.includes(CONFIG.AUTH.ROLES.ADMIN)) return CONFIG.AUTH.ROLES.ADMIN;
    if (lower.includes(CONFIG.AUTH.ROLES.TEACHER)) return CONFIG.AUTH.ROLES.TEACHER;
    return CONFIG.AUTH.ROLES.STUDENT;
  }

  // Role → identity system helpers (the app's signature visual device)
  function roleKey(username) {
    const role = getRoleFromUsername(username);
    if (role === CONFIG.AUTH.ROLES.ADMIN) return 'admin';
    if (role === CONFIG.AUTH.ROLES.TEACHER) return 'teacher';
    return 'student';
  }

  function avatarHtml(username, size) {
    const key = roleKey(username);
    const initial = (username || '?').charAt(0).toUpperCase();
    const sizeClass = size === 'sm' ? ' sm' : '';
    return `<div class="avatar avatar-${key}${sizeClass}">${initial}</div>`;
  }

  function generateEmail(username) {
    return `${username}${CONFIG.AUTH.EMAIL_SUFFIX}`;
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDateFull(ts) {
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
  // 7. NOTIFICATIONS & BADGES
  // ============================================================
  function playNotificationSound() {
    if (DOM.notificationSound) {
      DOM.notificationSound.currentTime = 0;
      DOM.notificationSound.play().catch(() => {});
    }
  }

  function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: CONFIG.BRANDING.LOGO.PATH });
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function incrementUnread(channelId) {
    if (!channelId) return;
    state.unreadCounts[channelId] = (state.unreadCounts[channelId] || 0) + 1;
    updateNotificationBadges();
  }

  function clearUnread(channelId) {
    if (!channelId) return;
    state.unreadCounts[channelId] = 0;
    updateNotificationBadges();
  }

  function getTotalUnread() {
    return Object.values(state.unreadCounts).reduce((a, b) => a + b, 0);
  }

  function updateNotificationBadges() {
    const total = getTotalUnread();
    if (total > 0) {
      DOM.globalNotificationBadge.textContent = total > 99 ? '99+' : total;
      DOM.globalNotificationBadge.classList.remove('hidden');
    } else {
      DOM.globalNotificationBadge.classList.add('hidden');
    }
    // Update channel list badges
    document.querySelectorAll('.channel-badge').forEach(badge => {
      const chId = badge.dataset.channelId;
      const count = state.unreadCounts[chId] || 0;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });
  }

  // ============================================================
  // 8. AUTHENTICATION
  // ============================================================
  async function loginWithUsername(username) {
    const email = generateEmail(username);
    const password = CONFIG.AUTH.DEFAULT_PASSWORD;

    console.log('[AUTH] Attempting login for:', username);
    console.log('[AUTH] Email:', email);
    console.log('[AUTH] Supabase URL:', CONFIG.SUPABASE.URL);
    console.log('[AUTH] Key prefix:', CONFIG.SUPABASE.ANON_KEY.substring(0, 20) + '...');

    try {
      console.log('[AUTH] Step 1: signUp...');
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });

      console.log('[AUTH] signUp result:', { user: !!signUpData?.user, session: !!signUpData?.session, error: signUpError?.message || 'none' });

      const isAlreadyRegistered =
        signUpError &&
        (signUpError.status === 400 ||
          signUpError.status === 409 ||
          signUpError.status === 422 ||
          /already registered|already exists|user already registered/i.test(signUpError.message || ''));

      if (signUpError && !isAlreadyRegistered) {
        console.error('[AUTH] signUp failed with unexpected error:', signUpError);
        throw new Error(`Sign up failed: ${signUpError.message}`);
      }

      if (signUpError && isAlreadyRegistered) {
        console.log('[AUTH] User already registered, proceeding to sign in...');
      }

      console.log('[AUTH] Step 2: signInWithPassword...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      console.log('[AUTH] signIn result:', { user: !!data?.user, session: !!data?.session, error: error?.message || 'none' });

      if (error) {
        if (error.message?.includes('Email not confirmed') || error.message?.includes('not confirmed')) {
          console.error('[AUTH] Email not confirmed. Disable "Confirm email" in Supabase Auth settings.');
          throw new Error('Account pending email confirmation. Ask your admin to disable "Confirm email" in Supabase Auth settings.');
        }
        throw error;
      }

      if (!data.user) {
        throw new Error('No user returned from sign in');
      }

      console.log('[AUTH] Login successful! User ID:', data.user.id);
      return data.user;
    } catch (e) {
      console.error('[AUTH] Fatal auth error:', e);
      const msg = e.message || '';
      if (msg.includes('Email signups are disabled') || msg.includes('Email logins are disabled')) {
        throw new Error('Email authentication is disabled in Supabase. Go to Authentication → Providers → Email and turn it ON.');
      }
      if (msg.includes('not confirmed')) {
        throw new Error('Email confirmation is required. Turn OFF "Confirm email" in Supabase Auth settings.');
      }
      throw new Error(e.message || 'Login failed. Please check your School ID and Supabase configuration.');
    }
  }

  // ============================================================
  // 9. CHANNELS (CRUD)
  // ============================================================
  async function loadChannels() {
    if (!state.currentUser) return [];

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

  async function renderChannels() {
    const channels = await loadChannels();
    DOM.channelList.innerHTML = '';

    if (!channels || channels.length === 0) {
      DOM.channelList.innerHTML = '<div class="empty-note">No channels yet</div>';
      return;
    }

    channels.forEach((ch) => {
      const div = document.createElement('div');
      div.className = `channel-item ${state.currentChannel?.id === ch.id ? 'active' : ''}`;
      div.innerHTML = `
        <span style="flex:1;">${escapeHtml(ch.name)}</span>
        <span class="channel-badge hidden" data-channel-id="${ch.id}">0</span>
      div.dataset.id = ch.id;
      div.addEventListener('click', () => selectChannel(ch));
      DOM.channelList.appendChild(div);
    });

    updateNotificationBadges();

    if (!state.currentChannel && channels.length) {
      selectChannel(channels[0]);
    }
  }

  async function selectChannel(channel) {
    state.currentChannel = channel;
    clearUnread(channel.id);
    await renderChannels();
    await loadMessages(channel.id);
    await loadStatuses();
    subscribeToMessages(channel.id);
  }

  // ============================================================
  // 10. REALTIME MESSAGE SYNC
  // ============================================================
  function subscribeToMessages(channelId) {
    if (state.messagesSubscription) {
      supabase.removeChannel(state.messagesSubscription);
      state.messagesSubscription = null;
    }

    state.messagesSubscription = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: CONFIG.SUPABASE.TABLES.MESSAGES,
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const exists = state.messages.some((m) => m.id === payload.new.id);
          if (!exists) {
            state.messages.push(payload.new);
            renderMessages();
            // Notification logic
            if (payload.new.username !== state.currentUser?.username) {
              playNotificationSound();
              if (document.hidden) {
                showBrowserNotification(
                  `${payload.new.username} in ${state.currentChannel?.name || 'channel'}`,
                  payload.new.content || 'Sent an attachment'
                );
              }
              if (state.currentChannel?.id !== channelId) {
                incrementUnread(channelId);
              }
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime message sync unavailable — falling back to manual refresh.');
        }
      });
  }

  async function createChannel(name) {
    if (!name) return;
    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.CHANNELS)
      .insert({ name });
    if (error) {
      alert('Error creating channel: ' + error.message);
      return;
    }
    await renderChannels();
  }

  // ============================================================
  // 11. MESSAGE STATUS (Ticks) & READ RECEIPTS
  // ============================================================
  async function markMessagesAsRead(channelId) {
    if (!state.currentUser || !channelId) return;
    // Mark all messages in channel as read by current user
    const messagesToMark = state.messages.filter(
      m => m.username !== state.currentUser.username && m.status !== 'read'
    );
    for (const msg of messagesToMark) {
      // Update global message status
      const { error } = await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .update({ status: 'read', seen_at: new Date().toISOString() })
        .eq('id', msg.id);
      if (!error) {
        msg.status = 'read';
        msg.seen_at = new Date().toISOString();
      }
      // Also insert into message_reads for accurate tracking
      await supabase
        .from('message_reads')
        .upsert({
          message_id: msg.id,
          username: state.currentUser.username,
          read_at: new Date().toISOString()
        }, { onConflict: 'message_id,username' });
    }
    renderMessages();
  }

  function getTickHtml(msg) {
    if (msg.username !== state.currentUser?.username) return '';
    let tickClass = 'tick-single';
    let readClass = '';
    if (msg.status === 'read') {
      tickClass = 'tick-double';
      readClass = 'read';
    } else if (msg.status === 'delivered') {
      tickClass = 'tick-double';
    }
    return `<span class="msg-ticks ${readClass} ${tickClass}" title="${msg.status}"></span>`;
  }

  function getSeenTimeHtml(msg) {
    if (!msg.seen_at || msg.username !== state.currentUser?.username) return '';
    return `<div class="msg-seen-time">Seen ${formatDateFull(msg.seen_at)}</div>`;
  }

  // ============================================================
  // 12. MESSAGES
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
      state.messages = [
        { id: '1', content: 'Welcome to the channel!', username: 'system', created_at: Date.now(), status: 'sent' }
      ];
    } else {
      state.messages = data || [];
    }

    // Mark non-self messages as delivered if they were just sent
    const otherMessages = state.messages.filter(
      m => m.username !== state.currentUser?.username && m.status === 'sent'
    );
    for (const msg of otherMessages) {
      await supabase
        .from(CONFIG.SUPABASE.TABLES.MESSAGES)
        .update({ status: 'delivered' })
        .eq('id', msg.id);
      msg.status = 'delivered';
    }

    renderMessages();
    // After rendering, mark as read
    setTimeout(() => markMessagesAsRead(channelId), 500);
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

      // Reply bubble
      let replyHtml = '';
      if (msg.reply_to) {
        const parent = state.messages.find(m => m.id === msg.reply_to);
        if (parent) {
          replyHtml = `
            <div class="msg-reply">
              <div class="reply-preview-author">${escapeHtml(parent.username)}</div>
              <div>${escapeHtml(truncate(parent.content, 60))}</div>
            </div>
        }
      }

      let bubbleHtml = '';
      if (msg.content) {
        bubbleHtml += `<div class="msg-bubble">${replyHtml}${escapeHtml(msg.content)}</div>`;
      }
      if (msg.file_url) {
        bubbleHtml += `
          <a href="${msg.file_url}" target="_blank" rel="noopener" class="msg-file">
            <i class="fas fa-paperclip"></i> Attached file
          </a>
      }

      wrap.innerHTML = `
        ${avatarHtml(msg.username, 'sm')}
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-author">${escapeHtml(msg.username || 'unknown')}</span>
            <span class="msg-time">${formatDate(msg.created_at)} ${getTickHtml(msg)}</span>
          </div>
          ${bubbleHtml}
          ${getSeenTimeHtml(msg)}
        </div>

      // Context menu events
      wrap.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, msg);
      });
      wrap.addEventListener('click', (e) => {
        if (DOM.msgContextMenu) DOM.msgContextMenu.classList.add('hidden');
      });

      DOM.chatMessages.appendChild(wrap);
    });

    DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
  }

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
        const { data, error } = await supabase.storage
          .from(CONFIG.SUPABASE.STORAGE_BUCKET)
          .upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage
          .from(CONFIG.SUPABASE.STORAGE_BUCKET)
          .getPublicUrl(path);
        fileUrl = urlData.publicUrl;
        DOM.fileUploadStatus.textContent = `📎 ${file.name} uploaded`;
        DOM.fileUploadStatus.classList.remove('hidden');
        setTimeout(() => DOM.fileUploadStatus.classList.add('hidden'), 4000);
      } catch (e) {
        console.error('Upload error:', e);
        alert(`File upload failed: ${e.message || 'unknown error'}`);
        return;
      }
    }

    const insertData = {
      channel_id: state.currentChannel.id,
      username: state.currentUser.username,
      content: content || '',
      file_url: fileUrl,
      reply_to: state.replyingTo || null,
      status: 'sent',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .insert(insertData);

    if (error) {
      console.error('Send error:', error);
      alert('Failed to send message.');
      return;
    }

    // Clear reply state
    state.replyingTo = null;
    DOM.replyPreview.classList.add('hidden');

    await loadMessages(state.currentChannel.id);
  }

  // ============================================================
  // 13. REPLY-TO FUNCTIONALITY
  // ============================================================
  function showContextMenu(e, msg) {
    state.contextMenuTarget = msg;
    const menu = DOM.msgContextMenu;
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.classList.remove('hidden');
  }

  function hideContextMenu() {
    DOM.msgContextMenu.classList.add('hidden');
    state.contextMenuTarget = null;
  }

  function startReply(msg) {
    state.replyingTo = msg.id;
    DOM.replyPreviewAuthor.textContent = msg.username;
    DOM.replyPreviewText.textContent = msg.content || 'Attachment';
    DOM.replyPreview.classList.remove('hidden');
    DOM.messageInput.focus();
    hideContextMenu();
  }

  function cancelReply() {
    state.replyingTo = null;
    DOM.replyPreview.classList.add('hidden');
  }

  // ============================================================
  // 14. STATUS UPDATES
  // ============================================================
  async function loadStatuses() {
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.STATUSES)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      state.statuses = [
        { id: '1', content: 'Welcome to Nous Complex Orbit!', username: 'admin', created_at: Date.now() }
      ];
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
        item.className = 'status-item';
        item.innerHTML = `
          ${avatarHtml(st.username)}
          <span class="status-name">${escapeHtml(truncate(st.username || 'User', 10))}</span>
        item.addEventListener('click', () => showStatusModal(st));
        DOM.statusTray.appendChild(item);
      });
    }

    if (state.isAdmin || state.isTeacher) {
      DOM.statusAddBtn.classList.remove('hidden');
    } else {
      DOM.statusAddBtn.classList.add('hidden');
    }
  }

  async function postStatus(content) {
    if (!state.currentUser) return;
    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.STATUSES)
      .insert({
        username: state.currentUser.username,
        content: content,
        created_at: new Date().toISOString(),
      });
    if (error) {
      console.error('Status error:', error);
      alert('Failed to post status.');
    }
    await loadStatuses();
  }

  function showStatusModal(status) {
    DOM.statusModalTitle.innerHTML = `<i class="fas fa-bullhorn" style="color:var(--accent); font-size:14px;"></i> ${escapeHtml(status.username || 'Announcement')}`;
    DOM.statusModalContent.textContent = status.content || '';
    DOM.statusProgress.style.width = '0%';
    DOM.statusModal.classList.remove('hidden');

    let progress = 0;
    if (state.progressInterval) clearInterval(state.progressInterval);
    state.progressInterval = setInterval(() => {
      progress += 2;
      if (progress >= 100) {
        clearInterval(state.progressInterval);
        state.progressInterval = null;
      }
      DOM.statusProgress.style.width = Math.min(progress, 100) + '%';
    }, 50);
  }

  // ============================================================
  // 15. VIDEO / LIVEKIT
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
    if (!state.currentUser || !state.currentChannel) {
      alert('Please select a channel first.');
      return;
    }
    if (CONFIG.FEATURES.ENABLE_ATTENDANCE_LOGGING) {
      try {
        await supabase
          .from(CONFIG.SUPABASE.TABLES.ATTENDANCE)
          .insert({
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
    DOM.liveBtnText.textContent = state.isTeacher ? 'Start live classroom' : 'Join live class';
  }

  // ============================================================
  // 16. ADMIN FUNCTIONS (Legacy)
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
        await supabase.from('profiles').insert({
          username: uid,
          full_name: uid,
          role: 'student',
          email: generateEmail(uid)
        });
      } catch (e) {
        // Ignore duplicate errors
      }
    }

    let csv = 'Username,Password
    students.forEach(s => csv += `${s.username},${s.password}
`);
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
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.ATTENDANCE)
      .select('*');
    if (error) {
      alert('No attendance data found.');
      return;
    }
    let csv = 'Student,Channel,Join Time,Status
    data.forEach(r => csv += `${r.student_name},${r.channel_id},${r.join_time},${r.status}
`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'attendance_log.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function assignStudentToChannel() {
    const student = DOM.assignStudentInput.value.trim();
    if (!student || !state.currentChannel) {
      alert('Enter student ID and select a channel.');
      return;
    }
    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MEMBERS)
      .insert({
        channel_id: state.currentChannel.id,
        username: student,
      });
    if (error) {
      alert('Assignment failed: ' + error.message);
    } else {
      alert(`✅ ${student} assigned to ${state.currentChannel.name}`);
      DOM.assignStudentInput.value = '';
    }
  }

  // ============================================================
  // 17. FULL ADMIN PANEL (CRUD)
  // ============================================================
  function openAdminPanel() {
    DOM.adminFullPanel.classList.remove('hidden');
    loadAdminData();
  }

  function closeAdminPanel() {
    DOM.adminFullPanel.classList.add('hidden');
  }

  function switchAdminTab(tabName) {
    DOM.adminTabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    DOM.adminTabContents.forEach(c => {
      c.classList.toggle('active', c.id === `tab-${tabName}`);
    });
  }

  async function loadAdminData() {
    await Promise.all([
      loadAdminUsers(),
      loadAdminChannels(),
      loadAdminMembers(),
    ]);
    populateAdminSelects();
  }

  async function loadAdminUsers() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) {
      DOM.adminUsersList.innerHTML = '<div class="empty-note">Error loading users</div>';
      return;
    }
    state.adminData.users = data || [];
    renderAdminUsers();
  }

  function renderAdminUsers() {
    const list = DOM.adminUsersList;
    if (!state.adminData.users.length) {
      list.innerHTML = '<div class="empty-note">No users found</div>';
      return;
    }
    list.innerHTML = state.adminData.users.map(u => `
      <div class="admin-list-item">
        <div class="item-info">
          <div class="item-title">${escapeHtml(u.username)} <span style="color:var(--ink-faint); font-weight:400;">(${u.role})</span></div>
          <div class="item-sub">${escapeHtml(u.full_name || '')} · ${u.email || ''}</div>
        </div>
        <div class="item-actions">
          <button class="btn-icon-sm danger" onclick="window.deleteAdminUser('${u.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  async function addAdminUser() {
    const username = DOM.adminUserName.value.trim();
    const fullName = DOM.adminUserFullName.value.trim();
    const role = DOM.adminUserRole.value;
    if (!username) { alert('Username required'); return; }

    const email = generateEmail(username);
    const password = CONFIG.AUTH.DEFAULT_PASSWORD;

    try {
      await supabase.auth.signUp({ email, password });
    } catch (e) {
      // may already exist
    }

    const { error } = await supabase.from('profiles').insert({
      username,
      full_name: fullName || username,
      role,
      email
    });
    if (error) {
      alert('Error adding user: ' + error.message);
      return;
    }
    DOM.adminUserName.value = '';
    DOM.adminUserFullName.value = '';
    await loadAdminUsers();
    alert(`✅ User ${username} added as ${role}`);
  }

  window.deleteAdminUser = async function(id) {
    if (!confirm('Delete this user?')) return;
    await supabase.from('profiles').delete().eq('id', id);
    await loadAdminUsers();
  };

  async function loadAdminChannels() {
    const { data, error } = await supabase.from('channels').select('*').order('name');
    if (error) {
      DOM.adminChannelsList.innerHTML = '<div class="empty-note">Error loading channels</div>';
      return;
    }
    state.adminData.channels = data || [];
    renderAdminChannels();
  }

  function renderAdminChannels() {
    const list = DOM.adminChannelsList;
    if (!state.adminData.channels.length) {
      list.innerHTML = '<div class="empty-note">No channels found</div>';
      return;
    }
    list.innerHTML = state.adminData.channels.map(c => `
      <div class="admin-list-item">
        <div class="item-info">
          <div class="item-title"># ${escapeHtml(c.name)}</div>
          <div class="item-sub">${c.id}</div>
        </div>
        <div class="item-actions">
          <button class="btn-icon-sm" onclick="window.editAdminChannel('${c.id}', '${escapeHtml(c.name)}')" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="btn-icon-sm danger" onclick="window.deleteAdminChannel('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  async function addAdminChannel() {
    const name = DOM.adminChannelName.value.trim();
    if (!name) { alert('Channel name required'); return; }
    const { error } = await supabase.from('channels').insert({ name });
    if (error) { alert('Error: ' + error.message); return; }
    DOM.adminChannelName.value = '';
    await loadAdminChannels();
    await renderChannels();
  }

  window.editAdminChannel = async function(id, currentName) {
    const newName = prompt('Rename channel:', currentName);
    if (!newName || newName === currentName) return;
    await supabase.from('channels').update({ name: newName }).eq('id', id);
    await loadAdminChannels();
    await renderChannels();
  };

  window.deleteAdminChannel = async function(id) {
    if (!confirm('Delete this channel? All messages will be lost.')) return;
    await supabase.from('channels').delete().eq('id', id);
    await loadAdminChannels();
    await renderChannels();
  };

  async function loadAdminMembers() {
    const { data, error } = await supabase.from('members').select('*, channels(name)').order('created_at', { ascending: false });
    if (error) {
      DOM.adminMembersList.innerHTML = '<div class="empty-note">Error loading members</div>';
      return;
    }
    state.adminData.members = data || [];
    renderAdminMembers();
  }

  function renderAdminMembers() {
    const list = DOM.adminMembersList;
    if (!state.adminData.members.length) {
      list.innerHTML = '<div class="empty-note">No assignments found</div>';
      return;
    }
    list.innerHTML = state.adminData.members.map(m => `
      <div class="admin-list-item">
        <div class="item-info">
          <div class="item-title">${escapeHtml(m.username)} <span style="color:var(--ink-faint); font-weight:400;">→ ${escapeHtml(m.channels?.name || m.channel_id)}</span></div>
          <div class="item-sub">Role: ${m.role || 'student'}</div>
        </div>
        <div class="item-actions">
          <button class="btn-icon-sm danger" onclick="window.deleteAdminMember('${m.id}')" title="Remove"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  async function addAdminMember() {
    const channelId = DOM.adminMemberChannel.value;
    const username = DOM.adminMemberUser.value;
    const role = DOM.adminMemberRole.value;
    if (!channelId || !username) { alert('Select channel and user'); return; }
    const { error } = await supabase.from('members').insert({ channel_id: channelId, username, role });
    if (error) { alert('Error: ' + error.message); return; }
    await loadAdminMembers();
  }

  window.deleteAdminMember = async function(id) {
    if (!confirm('Remove this member?')) return;
    await supabase.from('members').delete().eq('id', id);
    await loadAdminMembers();
  };

  async function loadAdminMessages() {
    const channelId = DOM.adminMsgChannel.value;
    let query = supabase.from('messages').select('*, channels(name)').order('created_at', { ascending: false }).limit(50);
    if (channelId) query = query.eq('channel_id', channelId);
    const { data, error } = await query;
    if (error) {
      DOM.adminMessagesList.innerHTML = '<div class="empty-note">Error loading messages</div>';
      return;
    }
    state.adminData.messages = data || [];
    renderAdminMessages();
  }

  function renderAdminMessages() {
    const list = DOM.adminMessagesList;
    if (!state.adminData.messages.length) {
      list.innerHTML = '<div class="empty-note">No messages found</div>';
      return;
    }
    list.innerHTML = state.adminData.messages.map(m => `
      <div class="admin-list-item">
        <div class="item-info">
          <div class="item-title">${escapeHtml(m.username)} <span style="color:var(--ink-faint); font-weight:400;">in ${escapeHtml(m.channels?.name || m.channel_id)}</span></div>
          <div class="item-sub">${escapeHtml(truncate(m.content, 60))} · ${formatDateFull(m.created_at)}</div>
        </div>
        <div class="item-actions">
          <button class="btn-icon-sm danger" onclick="window.deleteAdminMessage('${m.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  window.deleteAdminMessage = async function(id) {
    if (!confirm('Delete this message?')) return;
    await supabase.from('messages').delete().eq('id', id);
    await loadAdminMessages();
    if (state.currentChannel) await loadMessages(state.currentChannel.id);
  };

  function populateAdminSelects() {
    // Channel select
    const chOpts = state.adminData.channels.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    DOM.adminMemberChannel.innerHTML = '<option value="">Select channel</option>' + chOpts;
    DOM.adminMsgChannel.innerHTML = '<option value="">All channels</option>' + chOpts;
    // User select
    const userOpts = state.adminData.users.map(u => `<option value="${u.username}">${escapeHtml(u.username)} (${u.role})</option>`).join('');
    DOM.adminMemberUser.innerHTML = '<option value="">Select user</option>' + userOpts;
  }

  // ============================================================
  // 18. PERMISSION HANDLING
  // ============================================================
  async function requestMediaPermissions() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      console.log('Media permissions granted.');
    } catch (e) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:50; padding:16px;';
      modal.innerHTML = `
        <div class="modal-card">
          <h3 class="modal-title">
            <i class="fas fa-triangle-exclamation" style="color:var(--role-admin); font-size:14px;"></i> Permissions required
          </h3>
          <p class="modal-body">
            Camera and microphone access are blocked. Allow permissions in your browser settings, then reload the page.
          </p>
          <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-ghost btn-block">
            Got it
          </button>
        </div>
      document.body.appendChild(modal);
    }
  }

  // ============================================================
  // 19. LOGIN FLOW
  // ============================================================
  async function handleLogin() {
    const username = DOM.usernameInput.value.trim();
    console.log('[LOGIN] Button clicked, username:', username);
    if (!username) {
      showError('Please enter your School ID.');
      return;
    }
    hideError();
    DOM.loginBtn.disabled = true;
    DOM.loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';

    try {
      const user = await loginWithUsername(username);
      const role = getRoleFromUsername(username);
      const key = roleKey(username);

      state.currentUser = {
        id: user.id,
        username: username,
        email: user.email,
        role: role,
      };

      state.isAdmin = role === CONFIG.AUTH.ROLES.ADMIN;
      state.isTeacher = role === CONFIG.AUTH.ROLES.TEACHER || state.isAdmin;

      DOM.authCard.classList.add('hidden');
      DOM.dashboard.classList.remove('hidden');

      DOM.userBadge.textContent = username;
      DOM.userBadge.className = `role-chip role-${key}-chip`;

      if (state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE) {
        DOM.adminPanel.classList.remove('hidden');
      }

      requestNotificationPermission();
      await requestMediaPermissions();
      await renderChannels();
      await loadStatuses();

      DOM.liveBtnText.textContent = state.isTeacher ? 'Start live classroom' : 'Join live class';

    } catch (e) {
      console.error('[LOGIN] Login failed:', e);
      showError(e.message || 'Login error. Please try again.');
    } finally {
      DOM.loginBtn.disabled = false;
      DOM.loginBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Enter Hub';
    }
  }

  // ============================================================
  // 20. EVENT BINDINGS
  // ============================================================
  DOM.loginBtn.addEventListener('click', handleLogin);
  DOM.usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
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
    if (!CONFIG.FEATURES.ENABLE_STATUS_UPDATES) {
      alert('Status updates are disabled.');
      return;
    }
    const content = prompt('Share a status update:');
    if (content) await postStatus(content);
  });

  DOM.joinLiveBtn.addEventListener('click', () => {
    if (!CONFIG.FEATURES.ENABLE_VIDEO_CONFERENCE) {
      alert('Video conferencing is disabled.');
      return;
    }
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

  DOM.createChannelBtn.addEventListener('click', async () => {
    const name = prompt('Enter new channel name:');
    if (name) await createChannel(name);
  });

  DOM.rosterGenBtn.addEventListener('click', generateRoster);
  DOM.exportAttendanceBtn.addEventListener('click', exportAttendance);
  DOM.assignStudentBtn.addEventListener('click', assignStudentToChannel);

  DOM.closeStatusModal.addEventListener('click', () => {
    DOM.statusModal.classList.add('hidden');
    if (state.progressInterval) clearInterval(state.progressInterval);
  });

  DOM.statusModal.addEventListener('click', (e) => {
    if (e.target === DOM.statusModal) {
      DOM.statusModal.classList.add('hidden');
      if (state.progressInterval) clearInterval(state.progressInterval);
    }
  });

  // NEW v2.0 Event Bindings
  DOM.cancelReplyBtn.addEventListener('click', cancelReply);

  DOM.ctxReplyBtn.addEventListener('click', () => {
    if (state.contextMenuTarget) startReply(state.contextMenuTarget);
  });

  DOM.ctxDeleteBtn.addEventListener('click', async () => {
    if (!state.contextMenuTarget) return;
    if (!confirm('Delete this message?')) { hideContextMenu(); return; }
    await supabase.from('messages').delete().eq('id', state.contextMenuTarget.id);
    hideContextMenu();
    if (state.currentChannel) await loadMessages(state.currentChannel.id);
  });

  document.addEventListener('click', (e) => {
    if (!DOM.msgContextMenu.contains(e.target)) hideContextMenu();
  });

  DOM.openAdminPanelBtn.addEventListener('click', openAdminPanel);
  DOM.closeAdminPanelBtn.addEventListener('click', closeAdminPanel);

  DOM.adminTabs.forEach(tab => {
    tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
  });

  DOM.adminAddUserBtn.addEventListener('click', addAdminUser);
  DOM.adminAddChannelBtn.addEventListener('click', addAdminChannel);
  DOM.adminAddMemberBtn.addEventListener('click', addAdminMember);
  DOM.adminRefreshMessagesBtn.addEventListener('click', loadAdminMessages);
  DOM.adminMsgChannel.addEventListener('change', loadAdminMessages);

  DOM.adminFullPanel.addEventListener('click', (e) => {
    if (e.target === DOM.adminFullPanel) closeAdminPanel();
  });

  // ============================================================
  // 21. BOOTSTRAP
  // ============================================================
  setupLogos();
  console.log('✅ Application v2.0 initialized successfully.');

})();
