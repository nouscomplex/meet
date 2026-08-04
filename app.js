// ============================================================
// Nous Complex Orbit — Application Logic
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
  // 7. AUTHENTICATION
  // ============================================================
  async function loginWithUsername(username) {
    const email = generateEmail(username);
    const password = CONFIG.AUTH.DEFAULT_PASSWORD;

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      const isAlreadyRegistered =
        signUpError &&
        (signUpError.status === 400 ||
          signUpError.status === 409 ||
          signUpError.status === 422 ||
          /already registered|already exists/i.test(signUpError.message || ''));

      if (signUpError && !isAlreadyRegistered) {
        throw signUpError;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      return data.user;
    } catch (e) {
      console.error('Auth error:', e);
      throw new Error('Login failed. Please check your School ID.');
    }
  }

  // ============================================================
  // 8. CHANNELS (CRUD)
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
      div.textContent = ch.name;
      div.dataset.id = ch.id;
      div.addEventListener('click', () => selectChannel(ch));
      DOM.channelList.appendChild(div);
    });

    if (!state.currentChannel && channels.length) {
      selectChannel(channels[0]);
    }
  }

  async function selectChannel(channel) {
    state.currentChannel = channel;
    await renderChannels();
    await loadMessages(channel.id);
    await loadStatuses();
    subscribeToMessages(channel.id);
  }

  // ============================================================
  // 8b. REALTIME MESSAGE SYNC
  // ============================================================
  function subscribeToMessages(channelId) {
    // Drop any previous subscription (e.g. from the last channel)
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
          // Guard against duplicating a message we already rendered
          // optimistically or via our own insert's follow-up reload.
          const exists = state.messages.some((m) => m.id === payload.new.id);
          if (!exists) {
            state.messages.push(payload.new);
            renderMessages();
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
      state.messages = [
        {
          id: '1',
          content: 'Welcome to the channel!',
          username: 'system',
          created_at: Date.now()
        }
      ];
    } else {
      state.messages = data || [];
    }
    renderMessages();
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

      let bubbleHtml = '';
      if (msg.content) {
        bubbleHtml += `<div class="msg-bubble">${escapeHtml(msg.content)}</div>`;
      }
      if (msg.file_url) {
        bubbleHtml += `
          <a href="${msg.file_url}" target="_blank" rel="noopener" class="msg-file">
            <i class="fas fa-paperclip"></i> Attached file
          </a>
        `;
      }

      wrap.innerHTML = `
        ${avatarHtml(msg.username, 'sm')}
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-author">${escapeHtml(msg.username || 'unknown')}</span>
            <span class="msg-time">${formatDate(msg.created_at)}</span>
          </div>
          ${bubbleHtml}
        </div>
      `;
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
        alert(`File upload failed: ${e.message || 'unknown error — check console for details.'}`);
        return;
      }
    }

    const { error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.MESSAGES)
      .insert({
        channel_id: state.currentChannel.id,
        username: state.currentUser.username,
        content: content || '',
        file_url: fileUrl,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Send error:', error);
      alert('Failed to send message.');
    }

    await loadMessages(state.currentChannel.id);
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
      state.statuses = [
        {
          id: '1',
          content: 'Welcome to Nous Complex Orbit!',
          username: 'admin',
          created_at: Date.now()
        }
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
        `;
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
        await supabase.auth.signUp({
          email: generateEmail(uid),
          password: pass
        });
      } catch (e) {
        // Ignore duplicate errors
      }
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
    const { data, error } = await supabase
      .from(CONFIG.SUPABASE.TABLES.ATTENDANCE)
      .select('*');

    if (error) {
      alert('No attendance data found.');
      return;
    }

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
  // 13. PERMISSION HANDLING
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
      `;
      document.body.appendChild(modal);
    }
  }

  // ============================================================
  // 14. LOGIN FLOW
  // ============================================================
  async function handleLogin() {
    const username = DOM.usernameInput.value.trim();

    if (!username) {
      showError('Please enter your School ID.');
      return;
    }

    hideError();

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

      await requestMediaPermissions();
      await renderChannels();
      await loadStatuses();

      DOM.liveBtnText.textContent = state.isTeacher ? 'Start live classroom' : 'Join live class';

    } catch (e) {
      showError(e.message || 'Login error. Please try again.');
    }
  }

  // ============================================================
  // 15. EVENT BINDINGS
  // ============================================================
  DOM.loginBtn.addEventListener('click', handleLogin);
  DOM.usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLogin();
    }
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
    if (e.key === 'Enter') {
      e.preventDefault();
      DOM.sendMsgBtn.click();
    }
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
    if (!file) {
      DOM.filePreview.classList.add('hidden');
      return;
    }
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

  // ============================================================
  // 16. BOOTSTRAP
  // ============================================================
  setupLogos();
  console.log('✅ Application initialized successfully.');

})();
