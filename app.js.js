// ============================================================
// COMPLETE JAVASCRIPT - School Hub Application
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
  console.log(`📌 Logo: ${CONFIG.BRANDING.LOGO.PATH}`);

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
    
    if (DOM.authLogo) {
      DOM.authLogo.src = logoPath;
      DOM.authLogo.alt = altText;
      DOM.authLogo.style.width = CONFIG.BRANDING.LOGO.WIDTH;
      DOM.authLogo.style.height = CONFIG.BRANDING.LOGO.HEIGHT;
    }
    
    if (DOM.sidebarLogo) {
      DOM.sidebarLogo.src = logoPath;
      DOM.sidebarLogo.alt = altText;
    }
    
    const logoElements = [DOM.authLogo, DOM.sidebarLogo];
    logoElements.forEach(el => {
      if (el) {
        el.addEventListener('error', function() {
          console.warn('Logo image failed to load. Using fallback icon.');
          this.style.display = 'none';
          const fallback = document.createElement('i');
          fallback.className = 'fas fa-graduation-cap text-[#67b3f9]';
          fallback.style.fontSize = '2rem';
          this.parentNode.insertBefore(fallback, this);
        });
      }
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

  function showError(message) {
    DOM.authError.textContent = message;
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
      
      if (signUpError && signUpError.status !== 409) {
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
      DOM.channelList.innerHTML = '<div class="text-xs text-gray-400">No channels</div>';
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
      DOM.chatMessages.innerHTML = '<div class="text-center text-xs text-gray-400">No messages</div>';
      return;
    }

    state.messages.forEach((msg) => {
      const div = document.createElement('div');
      div.className = `msg-enter text-sm ${msg.username === state.currentUser?.username ? 'text-right' : ''}`;
      
      let contentHtml = `
        <span class="font-semibold text-[#0e1c76]">${msg.username || 'unknown'}</span>
        <span class="text-xs text-gray-400">${formatDate(msg.created_at)}</span>
        <br/>
      `;
      
      if (msg.content) {
        contentHtml += `<span class="bg-white/30 px-2 py-0.5 rounded-lg inline-block">${msg.content}</span>`;
      }
      
      if (msg.file_url) {
        contentHtml += `
          <a href="${msg.file_url}" target="_blank" class="text-[#67b3f9] text-xs underline ml-1">
            <i class="fas fa-file"></i> file
          </a>
        `;
      }
      
      div.innerHTML = contentHtml;
      DOM.chatMessages.appendChild(div);
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
      const { data, error } = await supabase.storage
        .from(CONFIG.SUPABASE.STORAGE_BUCKET)
        .upload(path, file);
      
      if (error) {
        console.error('Upload error:', error);
        alert('File upload failed.');
        return;
      }

      const { data: urlData } = supabase.storage
        .from(CONFIG.SUPABASE.STORAGE_BUCKET)
        .getPublicUrl(path);
      fileUrl = urlData.publicUrl;

      DOM.fileUploadStatus.textContent = `📎 ${file.name} uploaded`;
      DOM.fileUploadStatus.classList.remove('hidden');
      setTimeout(() => DOM.fileUploadStatus.classList.add('hidden'), 4000);
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
          content: 'Welcome to School Hub!', 
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
      DOM.statusTray.innerHTML = '<div class="text-sm text-gray-400">No updates</div>';
      return;
    }

    state.statuses.forEach((st) => {
      const ring = document.createElement('div');
      ring.className = 'flex flex-col items-center cursor-pointer min-w-[60px] transition-transform hover:scale-105';
      ring.innerHTML = `
        <div class="w-12 h-12 rounded-full status-ring flex items-center justify-center bg-white/40 text-[#0e1c76] font-bold">
          ${st.username?.charAt(0).toUpperCase() || 'U'}
        </div>
        <span class="text-[10px] truncate w-12 text-center text-gray-700">${truncate(st.username || 'User', 8)}</span>
      `;
      ring.addEventListener('click', () => showStatusModal(st));
      DOM.statusTray.appendChild(ring);
    });

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
    DOM.statusModalTitle.textContent = status.username || 'Announcement';
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
    DOM.liveBtnText.textContent = state.isTeacher ? '🎬 Start Live Classroom' : 'Join Live Class';
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
      modal.className = 'fixed inset-0 modal-overlay flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="glass max-w-sm w-full rounded-3xl p-6 shadow-2xl">
          <h3 class="font-bold text-[#0e1c76] flex items-center gap-2">
            <i class="fas fa-exclamation-triangle text-yellow-500"></i> Permissions Required
          </h3>
          <p class="my-3 text-gray-700 text-sm">
            Camera and microphone access are blocked. Please allow permissions in your browser settings, then reload the page.
          </p>
          <button onclick="this.closest('.modal-overlay').remove()" class="w-full glass py-2 rounded-xl text-sm hover:bg-white/40">
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
      
      state.currentUser = {
        id: user.id,
        username: username,
        email: user.email,
        role: getRoleFromUsername(username),
      };
      
      state.isAdmin = state.currentUser.role === CONFIG.AUTH.ROLES.ADMIN;
      state.isTeacher = state.currentUser.role === CONFIG.AUTH.ROLES.TEACHER || state.isAdmin;
      
      DOM.authCard.classList.add('hidden');
      DOM.dashboard.classList.remove('hidden');
      DOM.userBadge.textContent = username;
      
      if (state.isAdmin && CONFIG.FEATURES.ENABLE_ADMIN_CONSOLE) {
        DOM.adminPanel.classList.remove('hidden');
      }
      
      await requestMediaPermissions();
      await renderChannels();
      await loadStatuses();
      
      DOM.liveBtnText.textContent = state.isTeacher ? '🎬 Start Live Classroom' : 'Join Live Class';
      
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
    if (this.files[0] && this.files[0].size > CONFIG.UPLOAD.MAX_FILE_SIZE) {
      alert(`File exceeds ${CONFIG.UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
      this.value = '';
    }
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
  console.log(`📌 Supabase URL: ${CONFIG.SUPABASE.URL}`);
  console.log(`📌 LiveKit URL: ${CONFIG.LIVEKIT.URL}`);
  console.log(`🖼️ Logo: ${CONFIG.BRANDING.LOGO.PATH}`);

  // Auto-login for demo (uncomment to enable)
  // DOM.usernameInput.value = 'teacher005';
  // handleLogin();

})();