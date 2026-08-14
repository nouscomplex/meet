// ============================================================
// NOUS COMPLEX ORBIT — Complete Application
// ============================================================

// ============================================================
// CONFIGURATION
// ============================================================
// These should be defined in config.js
// const SUPABASE_URL = 'your-supabase-url';
// const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

// ============================================================
// SUPABASE INITIALIZATION
// ============================================================
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let currentChannel = null;
let currentChannelMembers = [];
let allChannels = [];
let allUsers = [];
let messages = [];
let messageSubscription = null;
let channelSubscription = null;
let statusSubscription = null;
let selectedMessageId = null;
let replyToMessage = null;
let fileToSend = null;
let currentStatusIndex = 0;
let statusTimer = null;
let statusPaused = false;
let statusViewerOpen = false;

// Carousel state
let carouselMediaItems = [];
let currentCarouselIndex = 0;
let carouselTouchStartX = 0;
let carouselTouchEndX = 0;
let carouselTouchStartY = 0;
let carouselTouchEndY = 0;
let isCarouselDragging = false;
let carouselMouseDownX = 0;
let carouselMouseDownY = 0;
let carouselMouseIsDragging = false;

// ============================================================
// DOM REFS
// ============================================================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const authCard = $('authCard');
const dashboard = $('dashboard');
const usernameInput = $('usernameInput');
const passwordInput = $('passwordInput');
const loginBtn = $('loginBtn');
const authError = $('authError');
const authErrorText = $('authErrorText');

const screenChats = $('screenChats');
const screenUpdates = $('screenUpdates');
const screenSettings = $('screenSettings');
const screenChatDetail = $('screenChatDetail');
const screenMembers = $('screenMembers');
const screenProfile = $('screenProfile');

const channelList = $('channelList');
const chatMessages = $('chatMessages');
const messageInput = $('messageInput');
const sendMsgBtn = $('sendMsgBtn');
const fileInput = $('fileInput');
const filePreview = $('filePreview');
const filePreviewName = $('filePreviewName');
const filePreviewRemove = $('filePreviewRemove');
const fileUploadStatus = $('fileUploadStatus');
const replyPreview = $('replyPreview');
const replyPreviewAuthor = $('replyPreviewAuthor');
const replyPreviewText = $('replyPreviewText');
const replyPreviewCancel = $('replyPreviewCancel');

const chatDetailName = $('chatDetailName');
const chatDetailSub = $('chatDetailSub');
const backFromChat = $('backFromChat');
const backFromUpdates = $('backFromUpdates');
const backFromMembers = $('backFromMembers');
const backFromProfile = $('backFromProfile');

const chatSearchInput = $('chatSearchInput');
const memberSearchInput = $('memberSearchInput');

const channelMembersList = $('channelMembersList');
const alphaIndex = $('alphaIndex');
const adminAddMemberRow = $('adminAddMemberRow');
const assignStudentInput = $('assignStudentInput');
const assignRoleSelect = $('assignRoleSelect');
const assignStudentBtn = $('assignStudentBtn');
const registeredUsersList = $('registeredUsersList');

const profileChannelName = $('profileChannelName');
const profileChannelMeta = $('profileChannelMeta');
const profileChannelDesc = $('profileChannelDesc');
const profileMembersBtn = $('profileMembersBtn');
const profileSeeAllMedia = $('profileSeeAllMedia');

const adminDescEdit = $('adminDescEdit');
const channelDescInput = $('channelDescInput');
const updateDescBtn = $('updateDescBtn');
const adminProfileSchedule = $('adminProfileSchedule');
const scheduleTeacherInput = $('scheduleTeacherInput');
const scheduleTimeInput = $('scheduleTimeInput');
const scheduleDurationInput = $('scheduleDurationInput');
const setScheduleBtn = $('setScheduleBtn');
const scheduleBanner = $('scheduleBanner');
const scheduleBannerText = $('scheduleBannerText');

const settingsName = $('settingsName');
const settingsEmail = $('settingsEmail');
const settingsDisplayName = $('settingsDisplayName');
const settingsAvatar = $('settingsAvatar');
const signOutBtn = $('signOutBtn');
const darkToggle = $('darkToggle');
const notifToggle = $('notifToggle');
const adminSettingsCard = $('adminSettingsCard');
const adminCreateUserCard = $('adminCreateUserCard');
const adminUserManagementCard = $('adminUserManagementCard');
const createChannelBtn = $('createChannelBtn');
const newUserUsername = $('newUserUsername');
const newUserDisplayName = $('newUserDisplayName');
const newUserRole = $('newUserRole');
const newUserPassword = $('newUserPassword');
const generatePasswordBtn = $('generatePasswordBtn');
const createUserBtn = $('createUserBtn');
const manageUserSearch = $('manageUserSearch');
const loadUserBtn = $('loadUserBtn');
const userEditForm = $('userEditForm');
const editUsername = $('editUsername');
const editDisplayName = $('editDisplayName');
const editNewUsername = $('editNewUsername');
const editPassword = $('editPassword');
const editRole = $('editRole');
const updateUserBtn = $('updateUserBtn');
const deleteUserBtn = $('deleteUserBtn');

const userBadge = $('userBadge');
const statusTray = $('statusTray');
const statusPlaceholder = $('statusPlaceholder');
const statusAddBtn = $('statusAddBtn');
const postStatusBtn = $('postStatusBtn');
const postStatusFab = $('postStatusFab');

const statusModal = $('statusModal');
const statusSegments = $('statusSegments');
const statusProgress = $('statusProgress');
const closeStatusModal = $('closeStatusModal');
const statusViewerAvatar = $('statusViewerAvatar');
const statusModalTitle = $('statusModalTitle');
const statusModalTime = $('statusModalTime');
const statusPauseBtn = $('statusPauseBtn');
const statusModalMedia = $('statusModalMedia');
const statusModalContent = $('statusModalContent');

const videoContainer = $('videoContainer');
const videoIframe = $('videoIframe');
const closeVideoBtn = $('closeVideoBtn');

const msgSelectHeader = $('msgSelectHeader');
const msgSelectCount = $('msgSelectCount');
const msgSelectCloseBtn = $('msgSelectCloseBtn');
const msgSelectReplyBtn = $('msgSelectReplyBtn');
const msgSelectForwardBtn = $('msgSelectForwardBtn');
const msgSelectCopyBtn = $('msgSelectCopyBtn');
const msgSelectDeleteBtn = $('msgSelectDeleteBtn');
const msgSelectInfoBtn = $('msgSelectInfoBtn');

const channelSelectHeader = $('channelSelectHeader');
const channelSelectCount = $('channelSelectCount');
const channelSelectCloseBtn = $('channelSelectCloseBtn');
const channelSelectRenameBtn = $('channelSelectRenameBtn');
const channelSelectDeleteBtn = $('channelSelectDeleteBtn');

const navChatsBadge = $('navChatsBadge');
const joinLiveBtn = $('joinLiveBtn');
const liveBtnText = $('liveBtnText');

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

function formatFullDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getRoleClass(role) {
  if (role === 'admin') return 'avatar-admin';
  if (role === 'teacher') return 'avatar-teacher';
  return 'avatar-student';
}

function getRoleChipClass(role) {
  if (role === 'admin') return 'role-admin-chip';
  if (role === 'teacher') return 'role-teacher-chip';
  return 'role-student-chip';
}

function getRoleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'teacher') return 'Teacher';
  return 'Student';
}

function getUserDisplayName(user) {
  if (!user) return 'Unknown';
  return user.display_name || user.username || 'Unknown';
}

function getUserAvatarText(user) {
  return getInitials(getUserDisplayName(user));
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getChannelAvatarText(channel) {
  return getInitials(channel.name || 'Session');
}

function isImageFile(url) {
  if (!url) return false;
  const ext = url.split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) ||
         url.includes('data:image') ||
         url.includes('blob:');
}

function isPdfFile(url) {
  if (!url) return false;
  return url.toLowerCase().endsWith('.pdf') || url.includes('application/pdf');
}

function isVideoFile(url) {
  if (!url) return false;
  const ext = url.split('.').pop().toLowerCase();
  return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext) ||
         url.includes('video/');
}

function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getFileNameFromUrl(url) {
  if (!url) return 'file';
  const parts = url.split('/');
  const last = parts[parts.length - 1];
  const queryIndex = last.indexOf('?');
  return queryIndex > -1 ? last.substring(0, queryIndex) : last;
}

function generateRandomPassword(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function showError(message) {
  authError.classList.remove('hidden');
  authErrorText.textContent = message;
}

function hideError() {
  authError.classList.add('hidden');
}

function showToast(message, type = 'info') {
  // Simple toast implementation
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface);
    color: var(--ink);
    padding: 12px 20px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 100;
    font-size: 14px;
    max-width: 90%;
    border: 1px solid var(--border);
    animation: msgIn 0.3s ease-out;
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// AUTH FUNCTIONS
// ============================================================
async function login() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!username || !password) {
    showError('Please enter both Orbit ID and Password.');
    return;
  }
  
  hideError();
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  
  try {
    // First, get user by username
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (userError || !user) {
      showError('Invalid Orbit ID or Password.');
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Enter Orbit';
      return;
    }
    
    // Verify password (in production, use proper hashing)
    if (user.password !== password) {
      showError('Invalid Orbit ID or Password.');
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Enter Orbit';
      return;
    }
    
    currentUser = user;
    localStorage.setItem('orbit_user', JSON.stringify(user));
    
    // Show dashboard
    authCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    
    // Set user badge
    updateUserBadge();
    updateSettingsProfile();
    
    // Load data
    await loadChannels();
    await loadUsers();
    await loadStatuses();
    await loadUserChannels();
    
    // Show chats by default
    showScreen('chats');
    
  } catch (err) {
    console.error('Login error:', err);
    showError('An error occurred. Please try again.');
  }
  
  loginBtn.disabled = false;
  loginBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Enter Orbit';
}

function logout() {
  // Clean up subscriptions
  if (messageSubscription) {
    messageSubscription.unsubscribe();
    messageSubscription = null;
  }
  if (channelSubscription) {
    channelSubscription.unsubscribe();
    channelSubscription = null;
  }
  if (statusSubscription) {
    statusSubscription.unsubscribe();
    statusSubscription = null;
  }
  
  currentUser = null;
  currentChannel = null;
  currentChannelMembers = [];
  allChannels = [];
  messages = [];
  selectedMessageId = null;
  replyToMessage = null;
  fileToSend = null;
  
  localStorage.removeItem('orbit_user');
  
  // Reset UI
  dashboard.classList.add('hidden');
  authCard.classList.remove('hidden');
  usernameInput.value = '';
  passwordInput.value = '';
  hideError();
  
  // Close any open modals
  closeCarouselLightbox();
  statusModal.classList.add('hidden');
  statusViewerOpen = false;
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function checkAutoLogin() {
  const saved = localStorage.getItem('orbit_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      authCard.classList.add('hidden');
      dashboard.classList.remove('hidden');
      updateUserBadge();
      updateSettingsProfile();
      loadChannels();
      loadUsers();
      loadStatuses();
      loadUserChannels();
      showScreen('chats');
      return true;
    } catch (e) {
      localStorage.removeItem('orbit_user');
    }
  }
  return false;
}

function updateUserBadge() {
  if (!currentUser) return;
  userBadge.textContent = getRoleLabel(currentUser.role);
  userBadge.className = 'role-chip ' + getRoleChipClass(currentUser.role);
  
  // Show admin tools
  if (currentUser.role === 'admin') {
    adminSettingsCard.classList.remove('hidden');
    adminCreateUserCard.classList.remove('hidden');
    adminUserManagementCard.classList.remove('hidden');
  } else {
    adminSettingsCard.classList.add('hidden');
    adminCreateUserCard.classList.add('hidden');
    adminUserManagementCard.classList.add('hidden');
  }
}

function updateSettingsProfile() {
  if (!currentUser) return;
  settingsName.textContent = getUserDisplayName(currentUser);
  settingsEmail.textContent = currentUser.username;
  settingsDisplayName.textContent = currentUser.display_name || '';
  settingsAvatar.textContent = getUserAvatarText(currentUser);
  settingsAvatar.className = 'avatar avatar-student lg ' + getRoleClass(currentUser.role);
}

// ============================================================
// NAVIGATION
// ============================================================
function showScreen(screen) {
  // Hide all screens
  screenChats.classList.add('hidden');
  screenUpdates.classList.add('hidden');
  screenSettings.classList.add('hidden');
  screenChatDetail.classList.add('hidden');
  screenMembers.classList.add('hidden');
  screenProfile.classList.add('hidden');
  
  // Show selected
  if (screen === 'chats') {
    screenChats.classList.remove('hidden');
    // On desktop, show welcome if no channel selected
    if (!currentChannel && window.innerWidth >= 1024) {
      screenChatDetail.classList.add('no-chat');
      screenChatDetail.classList.remove('hidden');
      chatMessages.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon"><i class="fas fa-comments"></i></div>
          <div class="chat-welcome-title">Nous Complex Orbit</div>
          <div class="chat-welcome-sub">Select a session from the list to start messaging.</div>
        </div>
      `;
    }
  } else if (screen === 'updates') {
    screenUpdates.classList.remove('hidden');
  } else if (screen === 'settings') {
    screenSettings.classList.remove('hidden');
  } else if (screen === 'chat') {
    screenChatDetail.classList.remove('hidden');
    screenChatDetail.classList.remove('no-chat');
  } else if (screen === 'members') {
    screenMembers.classList.remove('hidden');
  } else if (screen === 'profile') {
    screenProfile.classList.remove('hidden');
  }
  
  // Update nav
  $$('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === screen);
  });
  
  // Update back buttons visibility on desktop
  if (window.innerWidth >= 1024) {
    // Back buttons are hidden via CSS on desktop
  }
}

// ============================================================
// CHANNEL / SESSION FUNCTIONS
// ============================================================
async function loadChannels() {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    allChannels = data || [];
    renderChatList();
  } catch (err) {
    console.error('Error loading channels:', err);
  }
}

async function loadUserChannels() {
  if (!currentUser) return;
  try {
    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', currentUser.id);
    
    if (error) throw error;
    // We already have all channels, just filter for rendering
    renderChatList();
  } catch (err) {
    console.error('Error loading user channels:', err);
  }
}

function renderChatList() {
  if (!channelList) return;
  
  const searchTerm = chatSearchInput ? chatSearchInput.value.toLowerCase() : '';
  const filtered = allChannels.filter(ch => 
    ch.name.toLowerCase().includes(searchTerm)
  );
  
  if (filtered.length === 0) {
    channelList.innerHTML = '<div class="empty-note">No sessions yet</div>';
    return;
  }
  
  channelList.innerHTML = filtered.map(ch => {
    const isActive = currentChannel && currentChannel.id === ch.id;
    const unread = ch.unread_count || 0;
    const time = ch.last_message_at ? formatTime(ch.last_message_at) : '';
    const preview = ch.last_message || 'No messages yet';
    const avatarText = getChannelAvatarText(ch);
    const roleClass = 'avatar-student'; // default
    
    return `
      <div class="chat-row ${isActive ? 'active' : ''}" data-channel-id="${ch.id}">
        <div class="avatar ${roleClass}">${avatarText}</div>
        <div class="chat-row-body">
          <div class="chat-row-top">
            <span class="chat-row-name">${escapeHtml(ch.name)}</span>
            <span class="chat-row-time">${time}</span>
          </div>
          <div class="chat-row-bottom">
            <span class="chat-row-preview">${escapeHtml(preview)}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  channelList.querySelectorAll('.chat-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.channelId;
      const channel = allChannels.find(c => c.id === id);
      if (channel) openChannel(channel);
    });
    
    // Long press for admin actions (mobile)
    let pressTimer = null;
    row.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        if (currentUser && currentUser.role === 'admin') {
          const id = row.dataset.channelId;
          const channel = allChannels.find(c => c.id === id);
          if (channel) selectChannelForActions(channel);
        }
      }, 600);
    });
    row.addEventListener('touchmove', () => {
      if (pressTimer) clearTimeout(pressTimer);
    });
    row.addEventListener('touchend', () => {
      if (pressTimer) clearTimeout(pressTimer);
    });
    
    // Right click for admin actions (desktop)
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (currentUser && currentUser.role === 'admin') {
        const id = row.dataset.channelId;
        const channel = allChannels.find(c => c.id === id);
        if (channel) selectChannelForActions(channel);
      }
    });
  });
}

async function openChannel(channel) {
  currentChannel = channel;
  
  // Update UI
  chatDetailName.textContent = channel.name;
  chatDetailSub.textContent = channel.description || 'Session';
  
  // Show chat screen
  showScreen('chat');
  
  // Load messages
  await loadMessages(channel.id);
  
  // Update channel list highlight
  renderChatList();
  
  // Load members for later
  await loadChannelMembers(channel.id);
  
  // Check schedule
  if (channel.scheduled_time) {
    scheduleBanner.classList.remove('hidden');
    const date = new Date(channel.scheduled_time);
    scheduleBannerText.textContent = `Scheduled: ${formatFullDate(date)} at ${formatTime(date)}`;
  } else {
    scheduleBanner.classList.add('hidden');
  }
  
  // Update live button
  if (channel.live_url) {
    liveBtnText.textContent = 'Join Live Session';
    joinLiveBtn.classList.remove('hidden');
  } else {
    liveBtnText.textContent = 'No Live Session';
    joinLiveBtn.classList.add('hidden');
  }
}

async function loadMessages(channelId) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    messages = data || [];
    renderMessages();
    scrollToBottom();
    
    // Subscribe to new messages
    setupMessageSubscription(channelId);
    
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

function setupMessageSubscription(channelId) {
  if (messageSubscription) {
    messageSubscription.unsubscribe();
    messageSubscription = null;
  }
  
  messageSubscription = supabase
    .channel(`messages:${channelId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `channel_id=eq.${channelId}`
    }, (payload) => {
      const msg = payload.new;
      messages.push(msg);
      renderMessages();
      scrollToBottom();
      updateChatListPreview(msg);
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `channel_id=eq.${channelId}`
    }, (payload) => {
      const updated = payload.new;
      const index = messages.findIndex(m => m.id === updated.id);
      if (index > -1) {
        messages[index] = updated;
        renderMessages();
      }
    })
    .subscribe();
}

function updateChatListPreview(msg) {
  const channel = allChannels.find(c => c.id === msg.channel_id);
  if (channel) {
    channel.last_message = msg.content || '📎 Attachment';
    channel.last_message_at = msg.created_at;
    if (msg.user_id !== currentUser.id) {
      channel.unread_count = (channel.unread_count || 0) + 1;
    }
    renderChatList();
  }
}

function renderMessages() {
  if (!chatMessages) return;
  
  if (messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon"><i class="fas fa-comments"></i></div>
        <div class="chat-welcome-title">${escapeHtml(currentChannel ? currentChannel.name : 'Session')}</div>
        <div class="chat-welcome-sub">Send the first message to start the conversation.</div>
      </div>
    `;
    return;
  }
  
  let html = '';
  let lastDate = null;
  
  messages.forEach((msg, index) => {
    const msgDate = new Date(msg.created_at);
    const dateKey = msgDate.toDateString();
    
    // Add day divider
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      const dateLabel = formatDate(msg.created_at);
      html += `<div class="day-divider"><span class="day-divider-label">${dateLabel}</span></div>`;
    }
    
    const isMine = msg.user_id === currentUser.id;
    const user = allUsers.find(u => u.id === msg.user_id);
    const displayName = user ? getUserDisplayName(user) : 'Unknown';
    const avatarText = user ? getUserAvatarText(user) : '?';
    const roleClass = user ? getRoleClass(user.role) : 'avatar-student';
    
    // Delivery status for own messages
    let statusHtml = '';
    if (isMine) {
      const status = msg.delivery_status || 'sent';
      statusHtml = `<span class="msg-delivery-status ${status}">
        ${status === 'sent' ? '<i class="fas fa-check"></i>' : ''}
        ${status === 'delivered' ? '<i class="fas fa-check-double"></i>' : ''}
        ${status === 'seen' ? '<i class="fas fa-check-double" style="color:var(--chat-blue);"></i>' : ''}
      </span>`;
    }
    
    // Message content
    let contentHtml = '';
    if (msg.content) {
      contentHtml = `<div class="msg-bubble">${escapeHtml(msg.content)}${isMine ? statusHtml : ''}</div>`;
    }
    
    // Attachments
    let attachmentHtml = '';
    if (msg.attachment_url) {
      const url = msg.attachment_url;
      const filename = msg.attachment_filename || getFileNameFromUrl(url);
      
      if (isImageFile(url)) {
        attachmentHtml = `
          <div class="msg-media-preview" onclick="openLightbox('${url}')">
            <img src="${url}" alt="Image" class="msg-media-img" loading="lazy">
            <div class="msg-media-expand"><i class="fas fa-expand"></i></div>
          </div>
        `;
      } else if (isVideoFile(url)) {
        attachmentHtml = `
          <div class="msg-media-preview msg-media-video-wrap">
            <video src="${url}" controls class="msg-media-img" preload="metadata"></video>
          </div>
        `;
      } else if (isPdfFile(url)) {
        // PDF will be rendered with thumbnail via getPdfThumbnail
        attachmentHtml = `
          <div class="msg-doc-card msg-pdf-card" onclick="openDocViewer('${url}', '${filename}')">
            <div class="msg-pdf-thumb" id="pdf-thumb-${msg.id}">
              <i class="fas fa-file-pdf"></i>
            </div>
            <div class="msg-pdf-info-bar">
              <div class="msg-doc-info">
                <span class="msg-doc-name">${escapeHtml(filename)}</span>
                <span class="msg-doc-ext">PDF</span>
              </div>
              <a href="${url}" download class="msg-doc-download"><i class="fas fa-download"></i></a>
            </div>
          </div>
        `;
        // Load thumbnail asynchronously
        setTimeout(() => getPdfThumbnail(url, `pdf-thumb-${msg.id}`), 100);
      } else {
        // Generic document
        const icon = getFileIcon(filename);
        attachmentHtml = `
          <div class="msg-doc-card" onclick="openDocViewer('${url}', '${filename}')">
            <div class="msg-doc-icon"><i class="fas ${icon}"></i></div>
            <div class="msg-doc-info">
              <span class="msg-doc-name">${escapeHtml(filename)}</span>
              <span class="msg-doc-ext">${getFileExtension(filename).toUpperCase()}</span>
            </div>
            <a href="${url}" download class="msg-doc-download"><i class="fas fa-download"></i></a>
          </div>
        `;
      }
    }
    
    // Reply quote
    let replyHtml = '';
    if (msg.reply_to) {
      const repliedMsg = messages.find(m => m.id === msg.reply_to);
      if (repliedMsg) {
        const repliedUser = allUsers.find(u => u.id === repliedMsg.user_id);
        const repliedName = repliedUser ? getUserDisplayName(repliedUser) : 'Unknown';
        replyHtml = `
          <div class="msg-reply-quote">
            <span class="reply-author">${escapeHtml(repliedName)}</span>
            <span class="reply-text">${escapeHtml(repliedMsg.content || '📎 Attachment')}</span>
          </div>
        `;
      }
    }
    
    html += `
      <div class="msg ${isMine ? 'msg-mine' : 'msg-theirs'}" data-msg-id="${msg.id}">
        ${!isMine ? `<div class="avatar sm ${roleClass}">${avatarText}</div>` : ''}
        <div class="msg-body">
          ${!isMine ? `<div class="msg-meta"><span class="msg-author">${escapeHtml(displayName)}</span></div>` : ''}
          ${replyHtml}
          ${contentHtml}
          ${attachmentHtml}
          <div class="msg-meta">
            ${!isMine ? '' : ''}
            <span class="msg-time">${formatTime(msg.created_at)}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  chatMessages.innerHTML = html;
  
  // Add click/long-press handlers for message selection
  chatMessages.querySelectorAll('.msg').forEach(el => {
    el.addEventListener('click', (e) => {
      // Don't trigger if clicking on a link or button inside
      if (e.target.closest('a') || e.target.closest('button')) return;
      if (window.innerWidth >= 1024) {
        const id = el.dataset.msgId;
        selectMessageForInfo(id);
      }
    });
    
    // Long press for mobile
    let pressTimer = null;
    el.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        const id = el.dataset.msgId;
        selectMessageForInfo(id);
      }, 500);
    });
    el.addEventListener('touchmove', () => {
      if (pressTimer) clearTimeout(pressTimer);
    });
    el.addEventListener('touchend', () => {
      if (pressTimer) clearTimeout(pressTimer);
    });
  });
}

function getFileIcon(filename) {
  const ext = getFileExtension(filename);
  const icons = {
    'doc': 'fa-file-word',
    'docx': 'fa-file-word',
    'xls': 'fa-file-excel',
    'xlsx': 'fa-file-excel',
    'ppt': 'fa-file-powerpoint',
    'pptx': 'fa-file-powerpoint',
    'txt': 'fa-file-lines',
    'zip': 'fa-file-zipper',
    'rar': 'fa-file-zipper',
    '7z': 'fa-file-zipper',
    'json': 'fa-file-code',
    'xml': 'fa-file-code',
    'html': 'fa-file-code',
    'css': 'fa-file-code',
    'js': 'fa-file-code',
  };
  return icons[ext] || 'fa-file';
}

async function getPdfThumbnail(url, containerId) {
  try {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) return;
    
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<img src="${canvas.toDataURL()}" class="msg-media-img" alt="PDF thumbnail">`;
    }
  } catch (err) {
    console.warn('PDF thumbnail generation failed:', err);
  }
}

function scrollToBottom() {
  const container = document.getElementById('chatContainer');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function getPdfThumbnail(url, containerId) {
  // This is a placeholder - the actual function is defined above
  // but we keep this for backward compatibility
}

// ============================================================
// MESSAGE SELECTION (WhatsApp-style)
// ============================================================
function selectMessageForInfo(msgId) {
  const msg = messages.find(m => m.id === msgId);
  if (!msg) return;
  
  selectedMessageId = msgId;
  
  // Show selection header
  msgSelectHeader.classList.remove('hidden');
  msgSelectCount.textContent = '1 selected';
  
  // Show delete button only for own messages or admin
  const isMine = msg.user_id === currentUser.id;
  const isAdmin = currentUser.role === 'admin';
  msgSelectDeleteBtn.classList.toggle('hidden', !(isMine || isAdmin));
  
  // Highlight selected message
  chatMessages.querySelectorAll('.msg').forEach(el => {
    el.classList.toggle('msg-selected', el.dataset.msgId === msgId);
  });
  
  // Hide the normal header
  const header = document.querySelector('.chat-detail-header');
  if (header) header.style.display = 'none';
}

function exitMessageSelection() {
  selectedMessageId = null;
  msgSelectHeader.classList.add('hidden');
  
  chatMessages.querySelectorAll('.msg').forEach(el => {
    el.classList.remove('msg-selected');
  });
  
  const header = document.querySelector('.chat-detail-header');
  if (header) header.style.display = '';
}

// Message selection actions
msgSelectCloseBtn.addEventListener('click', exitMessageSelection);

msgSelectReplyBtn.addEventListener('click', () => {
  if (!selectedMessageId) return;
  const msg = messages.find(m => m.id === selectedMessageId);
  if (msg) {
    replyToMessage = msg;
    const user = allUsers.find(u => u.id === msg.user_id);
    replyPreviewAuthor.textContent = user ? getUserDisplayName(user) : 'Unknown';
    replyPreviewText.textContent = msg.content || '📎 Attachment';
    replyPreview.classList.remove('hidden');
    exitMessageSelection();
    messageInput.focus();
  }
});

msgSelectForwardBtn.addEventListener('click', () => {
  if (!selectedMessageId) return;
  const msg = messages.find(m => m.id === selectedMessageId);
  if (msg) {
    showForwardDialog(msg);
  }
});

msgSelectCopyBtn.addEventListener('click', () => {
  if (!selectedMessageId) return;
  const msg = messages.find(m => m.id === selectedMessageId);
  if (msg && msg.content) {
    navigator.clipboard.writeText(msg.content).then(() => {
      showToast('Message copied');
      exitMessageSelection();
    }).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = msg.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showToast('Message copied');
      exitMessageSelection();
    });
  } else {
    showToast('Cannot copy attachment');
  }
});

msgSelectDeleteBtn.addEventListener('click', () => {
  if (!selectedMessageId) return;
  const msg = messages.find(m => m.id === selectedMessageId);
  if (!msg) return;
  
  const isMine = msg.user_id === currentUser.id;
  const isAdmin = currentUser.role === 'admin';
  
  if (!isMine && !isAdmin) return;
  
  if (confirm('Delete this message?')) {
    deleteMessage(selectedMessageId);
    exitMessageSelection();
  }
});

msgSelectInfoBtn.addEventListener('click', () => {
  if (!selectedMessageId) return;
  showMessageInfo(selectedMessageId);
});

async function deleteMessage(msgId) {
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', msgId);
    
    if (error) throw error;
    
    messages = messages.filter(m => m.id !== msgId);
    renderMessages();
    showToast('Message deleted');
  } catch (err) {
    console.error('Error deleting message:', err);
    showToast('Failed to delete message');
  }
}

function showForwardDialog(msg) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const card = document.createElement('div');
  card.className = 'modal-card';
  
  card.innerHTML = `
    <div class="modal-title"><i class="fas fa-share"></i> Forward to</div>
    <div class="forward-channel-list" id="forwardChannelList">
      ${allChannels.map(ch => `
        <button class="forward-channel-row" data-channel-id="${ch.id}">
          <div class="avatar avatar-student sm">${getChannelAvatarText(ch)}</div>
          <span class="forward-channel-name">${escapeHtml(ch.name)}</span>
        </button>
      `).join('')}
    </div>
    <button class="btn btn-secondary btn-block" id="forwardCancelBtn">Cancel</button>
  `;
  
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  
  overlay.querySelectorAll('.forward-channel-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const channelId = btn.dataset.channelId;
      forwardMessage(msg, channelId);
      overlay.remove();
    });
  });
  
  overlay.querySelector('#forwardCancelBtn').addEventListener('click', () => {
    overlay.remove();
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

async function forwardMessage(msg, channelId) {
  try {
    const newMsg = {
      channel_id: channelId,
      user_id: currentUser.id,
      content: msg.content || '',
      attachment_url: msg.attachment_url || null,
      attachment_filename: msg.attachment_filename || null,
      created_at: new Date().toISOString(),
      delivery_status: 'sent'
    };
    
    const { error } = await supabase
      .from('messages')
      .insert(newMsg);
    
    if (error) throw error;
    
    showToast('Message forwarded');
  } catch (err) {
    console.error('Error forwarding message:', err);
    showToast('Failed to forward message');
  }
}

function showMessageInfo(msgId) {
  const msg = messages.find(m => m.id === msgId);
  if (!msg) return;
  
  // Build list of users who have seen this message (simplified)
  const seenUsers = allUsers.filter(u => u.id !== msg.user_id);
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const card = document.createElement('div');
  card.className = 'modal-card';
  
  let seenHtml = '';
  if (seenUsers.length > 0) {
    seenHtml = `
      <div class="msg-info-section-label">Seen by</div>
      <div class="msg-info-list">
        ${seenUsers.map(u => `
          <div class="msg-info-row">
            <div class="avatar sm ${getRoleClass(u.role)}">${getUserAvatarText(u)}</div>
            <span class="msg-info-name">${escapeHtml(getUserDisplayName(u))}</span>
            <span class="msg-info-time">${formatTime(msg.created_at)}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    seenHtml = `
      <div class="msg-info-section-label">Seen by</div>
      <div class="msg-info-list">
        <div class="empty-note">No one has seen this message yet</div>
      </div>
    `;
  }
  
  const sender = allUsers.find(u => u.id === msg.user_id);
  const senderName = sender ? getUserDisplayName(sender) : 'Unknown';
  
  card.innerHTML = `
    <div class="modal-title"><i class="fas fa-circle-info"></i> Message Info</div>
    <div style="margin: 12px 0 8px;">
      <div style="font-size:12px; color:var(--ink-soft);">From</div>
      <div style="font-weight:600;">${escapeHtml(senderName)}</div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="font-size:12px; color:var(--ink-soft);">Sent</div>
      <div>${formatFullDate(msg.created_at)} at ${formatTime(msg.created_at)}</div>
    </div>
    ${msg.content ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px; color:var(--ink-soft);">Message</div>
        <div style="padding:8px 12px; background:var(--surface-sunken); border-radius:var(--radius-sm);">${escapeHtml(msg.content)}</div>
      </div>
    ` : ''}
    ${seenHtml}
    <button class="btn btn-secondary btn-block" id="msgInfoCloseBtn">Close</button>
  `;
  
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  
  overlay.querySelector('#msgInfoCloseBtn').addEventListener('click', () => {
    overlay.remove();
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ============================================================
// CHANNEL SELECTION FOR ADMIN ACTIONS
// ============================================================
function selectChannelForActions(channel) {
  if (currentUser.role !== 'admin') return;
  
  channelSelectHeader.classList.remove('hidden');
  channelSelectCount.textContent = `1 selected: ${channel.name}`;
  
  // Store selected channel ID
  channelSelectHeader.dataset.channelId = channel.id;
  
  // Hide brand header
  const brandHeader = document.getElementById('brandHeader');
  if (brandHeader) brandHeader.style.display = 'none';
}

channelSelectCloseBtn.addEventListener('click', () => {
  channelSelectHeader.classList.add('hidden');
  const brandHeader = document.getElementById('brandHeader');
  if (brandHeader) brandHeader.style.display = '';
  channelSelectHeader.dataset.channelId = '';
});

channelSelectRenameBtn.addEventListener('click', () => {
  const channelId = channelSelectHeader.dataset.channelId;
  const channel = allChannels.find(c => c.id === channelId);
  if (!channel) return;
  
  const newName = prompt('Rename session:', channel.name);
  if (newName && newName.trim()) {
    renameChannel(channelId, newName.trim());
  }
});

channelSelectDeleteBtn.addEventListener('click', () => {
  const channelId = channelSelectHeader.dataset.channelId;
  const channel = allChannels.find(c => c.id === channelId);
  if (!channel) return;
  
  if (confirm(`Delete session "${channel.name}"? This action cannot be undone.`)) {
    deleteChannel(channelId);
  }
});

async function renameChannel(channelId, newName) {
  try {
    const { error } = await supabase
      .from('channels')
      .update({ name: newName })
      .eq('id', channelId);
    
    if (error) throw error;
    
    const channel = allChannels.find(c => c.id === channelId);
    if (channel) channel.name = newName;
    
    renderChatList();
    showToast('Session renamed');
    channelSelectHeader.classList.add('hidden');
    const brandHeader = document.getElementById('brandHeader');
    if (brandHeader) brandHeader.style.display = '';
  } catch (err) {
    console.error('Error renaming channel:', err);
    showToast('Failed to rename session');
  }
}

async function deleteChannel(channelId) {
  try {
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('id', channelId);
    
    if (error) throw error;
    
    allChannels = allChannels.filter(c => c.id !== channelId);
    if (currentChannel && currentChannel.id === channelId) {
      currentChannel = null;
      showScreen('chats');
    }
    
    renderChatList();
    showToast('Session deleted');
    channelSelectHeader.classList.add('hidden');
    const brandHeader = document.getElementById('brandHeader');
    if (brandHeader) brandHeader.style.display = '';
  } catch (err) {
    console.error('Error deleting channel:', err);
    showToast('Failed to delete session');
  }
}

// ============================================================
// CHANNEL MEMBERS
// ============================================================
async function loadChannelMembers(channelId) {
  try {
    const { data, error } = await supabase
      .from('channel_members')
      .select('*')
      .eq('channel_id', channelId);
    
    if (error) throw error;
    
    // Get user details
    const userIds = data.map(m => m.user_id);
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .in('id', userIds);
    
    if (userError) throw userError;
    
    currentChannelMembers = users || [];
    renderMembers();
    
    // Show admin add row if admin
    if (currentUser.role === 'admin') {
      adminAddMemberRow.classList.remove('hidden');
      updateRegisteredUsersList();
    } else {
      adminAddMemberRow.classList.add('hidden');
    }
    
  } catch (err) {
    console.error('Error loading members:', err);
  }
}

function renderMembers() {
  if (!channelMembersList) return;
  
  const searchTerm = memberSearchInput ? memberSearchInput.value.toLowerCase() : '';
  const filtered = currentChannelMembers.filter(u => 
    u.username.toLowerCase().includes(searchTerm) ||
    (u.display_name && u.display_name.toLowerCase().includes(searchTerm))
  );
  
  if (filtered.length === 0) {
    channelMembersList.innerHTML = '<div class="empty-note">No members found</div>';
    return;
  }
  
  // Group by role
  const admins = filtered.filter(u => u.role === 'admin');
  const teachers = filtered.filter(u => u.role === 'teacher');
  const students = filtered.filter(u => u.role === 'student');
  
  let html = '';
  
  const renderGroup = (users, label) => {
    if (users.length === 0) return '';
    let groupHtml = `<div class="member-role-header">${label}</div>`;
    users.forEach(u => {
      const isSelf = u.id === currentUser.id;
      const canRemove = currentUser.role === 'admin' && !isSelf;
      groupHtml += `
        <div class="member-row">
          <div class="avatar sm ${getRoleClass(u.role)}">${getUserAvatarText(u)}</div>
          <div>
            <div class="member-name">${escapeHtml(getUserDisplayName(u))} ${isSelf ? ' (You)' : ''}</div>
            <div class="member-status online"><span class="dot"></span> Online</div>
          </div>
          ${canRemove ? `<button class="member-remove-btn icon-btn" onclick="removeMember('${u.id}')" title="Remove"><i class="fas fa-times"></i></button>` : ''}
        </div>
      `;
    });
    return groupHtml;
  };
  
  html += renderGroup(admins, 'Admins');
  html += renderGroup(teachers, 'Teachers');
  html += renderGroup(students, 'Students');
  
  channelMembersList.innerHTML = html;
}

function updateRegisteredUsersList() {
  const datalist = registeredUsersList;
  if (!datalist) return;
  
  datalist.innerHTML = allUsers
    .filter(u => u.id !== currentUser.id)
    .map(u => `<option value="${u.username}">${getUserDisplayName(u)}</option>`)
    .join('');
}

async function addMemberToChannel(username, role) {
  if (!currentChannel) return;
  
  try {
    // Find user
    const user = allUsers.find(u => u.username === username);
    if (!user) {
      showToast('User not found');
      return;
    }
    
    // Check if already member
    if (currentChannelMembers.some(m => m.id === user.id)) {
      showToast('User is already a member');
      return;
    }
    
    const { error } = await supabase
      .from('channel_members')
      .insert({
        channel_id: currentChannel.id,
        user_id: user.id,
        role: role
      });
    
    if (error) throw error;
    
    currentChannelMembers.push(user);
    renderMembers();
    showToast('Member added');
    assignStudentInput.value = '';
    
  } catch (err) {
    console.error('Error adding member:', err);
    showToast('Failed to add member');
  }
}

async function removeMember(userId) {
  if (!currentChannel) return;
  if (!confirm('Remove this member?')) return;
  
  try {
    const { error } = await supabase
      .from('channel_members')
      .delete()
      .eq('channel_id', currentChannel.id)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    currentChannelMembers = currentChannelMembers.filter(u => u.id !== userId);
    renderMembers();
    showToast('Member removed');
    
  } catch (err) {
    console.error('Error removing member:', err);
    showToast('Failed to remove member');
  }
}

// ============================================================
// PROFILE / GROUP INFO
// ============================================================
function showProfile() {
  if (!currentChannel) return;
  
  profileChannelName.textContent = currentChannel.name;
  profileChannelMeta.textContent = currentChannel.description || 'Session';
  profileChannelDesc.textContent = currentChannel.description || '';
  
  // Show admin description edit
  if (currentUser.role === 'admin') {
    adminDescEdit.classList.remove('hidden');
    channelDescInput.value = currentChannel.description || '';
  } else {
    adminDescEdit.classList.add('hidden');
  }
  
  // Show schedule for admin
  if (currentUser.role === 'admin') {
    adminProfileSchedule.classList.remove('hidden');
    if (currentChannel.scheduled_time) {
      scheduleTimeInput.value = currentChannel.scheduled_time.slice(0, 16);
    }
    if (currentChannel.scheduled_duration) {
      scheduleDurationInput.value = currentChannel.scheduled_duration;
    }
    if (currentChannel.scheduled_teacher) {
      const teacher = allUsers.find(u => u.id === currentChannel.scheduled_teacher);
      if (teacher) scheduleTeacherInput.value = teacher.username;
    }
  } else {
    adminProfileSchedule.classList.add('hidden');
  }
  
  // Load shared media
  loadSharedMedia();
  
  showScreen('profile');
}

async function loadSharedMedia() {
  if (!currentChannel) return;
  
  try {
    // Get all messages with attachments
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', currentChannel.id)
      .not('attachment_url', 'is', null);
    
    if (error) throw error;
    
    const mediaUrls = data.map(m => m.attachment_url).filter(url => url);
    renderSharedMediaCarousel(mediaUrls);
    
  } catch (err) {
    console.error('Error loading shared media:', err);
  }
}

// ============================================================
// SHARED MEDIA CAROUSEL
// ============================================================

/**
 * Renders the shared media carousel with swipe support
 */
function renderSharedMediaCarousel(mediaUrls) {
  const carousel = document.getElementById('sharedMediaCarousel');
  const track = document.getElementById('sharedMediaGrid');
  const dots = document.getElementById('carouselDots');
  const prevBtn = document.getElementById('mediaPrevBtn');
  const nextBtn = document.getElementById('mediaNextBtn');
  const seeAllLink = document.getElementById('profileSeeAllMedia');

  if (!carousel || !track) return;

  // Filter only image URLs (supports common image extensions)
  const imageUrls = (mediaUrls || []).filter(url => {
    if (!url) return false;
    const ext = url.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) ||
           url.includes('data:image') ||
           url.includes('blob:');
  });

  carouselMediaItems = imageUrls;

  if (imageUrls.length === 0) {
    carousel.classList.add('hidden');
    if (seeAllLink) seeAllLink.classList.add('hidden');
    track.innerHTML = '<div class="empty-note">No Shared Media Yet</div>';
    return;
  }

  carousel.classList.remove('hidden');
  if (seeAllLink) {
    seeAllLink.classList.remove('hidden');
    seeAllLink.href = '#';
    seeAllLink.onclick = (e) => {
      e.preventDefault();
      openCarouselLightbox(0);
    };
  }

  currentCarouselIndex = 0;

  // Build slides
  track.innerHTML = '';
  imageUrls.forEach((url, index) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    slide.dataset.index = index;
    
    const img = document.createElement('img');
    img.src = url;
    img.alt = `Shared media ${index + 1}`;
    img.loading = 'lazy';
    img.draggable = false;
    
    img.onerror = () => {
      img.style.display = 'none';
      slide.innerHTML = `
        <div class="no-media-placeholder">
          <i class="fas fa-image"></i>
          <span>Could not load image</span>
        </div>
      `;
    };
    
    slide.appendChild(img);
    
    // Tap to open lightbox
    slide.addEventListener('click', () => {
      openCarouselLightbox(index);
    });
    
    track.appendChild(slide);
  });

  // Build dots
  dots.innerHTML = '';
  if (imageUrls.length > 1) {
    imageUrls.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
      dot.dataset.index = index;
      dot.setAttribute('aria-label', `Go to media ${index + 1}`);
      dot.addEventListener('click', () => {
        goToCarouselSlide(index);
      });
      dots.appendChild(dot);
    });
  }

  // Show/hide navigation buttons
  updateCarouselNavButtons();
  updateCarouselPosition();

  // Set up touch events for swipe
  setupCarouselTouchEvents(track);
  
  // Set up navigation button events
  setupCarouselNavButtons();
}

/**
 * Navigate to a specific slide
 */
function goToCarouselSlide(index) {
  if (!carouselMediaItems.length) return;
  
  const total = carouselMediaItems.length;
  currentCarouselIndex = Math.max(0, Math.min(index, total - 1));
  
  updateCarouselPosition();
  updateCarouselDots();
  updateCarouselNavButtons();
}

/**
 * Update carousel position based on current index
 */
function updateCarouselPosition() {
  const track = document.getElementById('sharedMediaGrid');
  if (!track) return;
  
  const slides = track.querySelectorAll('.carousel-slide');
  if (!slides.length) return;
  
  const slideWidth = 100 / slides.length;
  const offset = -currentCarouselIndex * slideWidth;
  track.style.transform = `translateX(${offset}%)`;
}

/**
 * Update dot indicators
 */
function updateCarouselDots() {
  const dots = document.querySelectorAll('.carousel-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === currentCarouselIndex);
  });
}

/**
 * Show/hide navigation buttons
 */
function updateCarouselNavButtons() {
  const prevBtn = document.getElementById('mediaPrevBtn');
  const nextBtn = document.getElementById('mediaNextBtn');
  const total = carouselMediaItems.length;
  
  if (!prevBtn || !nextBtn) return;
  
  if (total <= 1) {
    prevBtn.classList.add('hidden');
    nextBtn.classList.add('hidden');
    return;
  }
  
  prevBtn.classList.toggle('hidden', currentCarouselIndex === 0);
  nextBtn.classList.toggle('hidden', currentCarouselIndex === total - 1);
}

/**
 * Set up touch events for swipe detection
 */
function setupCarouselTouchEvents(track) {
  if (!track) return;
  
  // Remove old listeners to avoid duplicates
  track.removeEventListener('touchstart', onCarouselTouchStart);
  track.removeEventListener('touchmove', onCarouselTouchMove);
  track.removeEventListener('touchend', onCarouselTouchEnd);
  
  track.addEventListener('touchstart', onCarouselTouchStart, { passive: true });
  track.addEventListener('touchmove', onCarouselTouchMove, { passive: true });
  track.addEventListener('touchend', onCarouselTouchEnd, { passive: true });
  
  // Also support mouse drag for desktop
  track.removeEventListener('mousedown', onCarouselMouseDown);
  document.removeEventListener('mousemove', onCarouselMouseMove);
  document.removeEventListener('mouseup', onCarouselMouseUp);
  
  track.addEventListener('mousedown', onCarouselMouseDown);
  document.addEventListener('mousemove', onCarouselMouseMove);
  document.addEventListener('mouseup', onCarouselMouseUp);
}

function onCarouselTouchStart(e) {
  const touch = e.touches[0];
  carouselTouchStartX = touch.clientX;
  carouselTouchStartY = touch.clientY;
  carouselTouchEndX = 0;
  carouselTouchEndY = 0;
  isCarouselDragging = true;
}

function onCarouselTouchMove(e) {
  if (!isCarouselDragging) return;
  const touch = e.touches[0];
  carouselTouchEndX = touch.clientX;
  carouselTouchEndY = touch.clientY;
}

function onCarouselTouchEnd() {
  if (!isCarouselDragging) return;
  isCarouselDragging = false;
  
  const diffX = carouselTouchEndX - carouselTouchStartX;
  const diffY = carouselTouchEndY - carouselTouchStartY;
  
  // Only handle horizontal swipes
  if (Math.abs(diffX) < Math.abs(diffY) || Math.abs(diffX) < 30) {
    return;
  }
  
  if (diffX < 0 && currentCarouselIndex < carouselMediaItems.length - 1) {
    goToCarouselSlide(currentCarouselIndex + 1);
  } else if (diffX > 0 && currentCarouselIndex > 0) {
    goToCarouselSlide(currentCarouselIndex - 1);
  }
}

function onCarouselMouseDown(e) {
  carouselMouseDownX = e.clientX;
  carouselMouseDownY = e.clientY;
  carouselMouseIsDragging = true;
}

function onCarouselMouseMove(e) {
  if (!carouselMouseIsDragging) return;
  const diffX = e.clientX - carouselMouseDownX;
  const diffY = e.clientY - carouselMouseDownY;
  
  // Only handle horizontal swipes
  if (Math.abs(diffX) < Math.abs(diffY) || Math.abs(diffX) < 30) {
    return;
  }
  
  carouselMouseIsDragging = false;
  
  if (diffX < 0 && currentCarouselIndex < carouselMediaItems.length - 1) {
    goToCarouselSlide(currentCarouselIndex + 1);
  } else if (diffX > 0 && currentCarouselIndex > 0) {
    goToCarouselSlide(currentCarouselIndex - 1);
  }
}

function onCarouselMouseUp() {
  carouselMouseIsDragging = false;
}

/**
 * Set up carousel navigation button events
 */
function setupCarouselNavButtons() {
  const prevBtn = document.getElementById('mediaPrevBtn');
  const nextBtn = document.getElementById('mediaNextBtn');
  
  if (prevBtn) {
    // Remove old listeners
    const newPrev = prevBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrev, prevBtn);
    newPrev.addEventListener('click', () => {
      if (currentCarouselIndex > 0) {
        goToCarouselSlide(currentCarouselIndex - 1);
      }
    });
  }
  
  if (nextBtn) {
    const newNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNext, nextBtn);
    newNext.addEventListener('click', () => {
      if (currentCarouselIndex < carouselMediaItems.length - 1) {
        goToCarouselSlide(currentCarouselIndex + 1);
      }
    });
  }
}

/**
 * Open carousel lightbox for a specific media item
 */
function openCarouselLightbox(index) {
  if (!carouselMediaItems.length) return;
  
  // Clamp index
  index = Math.max(0, Math.min(index, carouselMediaItems.length - 1));
  const url = carouselMediaItems[index];
  if (!url) return;
  
  // Close any existing lightbox first
  closeCarouselLightbox();
  
  const overlay = document.createElement('div');
  overlay.className = 'carousel-lightbox';
  overlay.id = 'carouselLightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  
  // Tap outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCarouselLightbox();
  });
  
  const img = document.createElement('img');
  img.src = url;
  img.alt = `Shared media ${index + 1}`;
  img.onerror = () => {
    img.alt = 'Failed to load image';
  };
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'lightbox-close';
  closeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
  closeBtn.setAttribute('aria-label', 'Close lightbox');
  closeBtn.addEventListener('click', closeCarouselLightbox);
  
  // Keyboard support
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeCarouselLightbox();
    } else if (e.key === 'ArrowLeft' && currentCarouselIndex > 0) {
      goToCarouselSlide(currentCarouselIndex - 1);
      updateLightboxImage(currentCarouselIndex);
    } else if (e.key === 'ArrowRight' && currentCarouselIndex < carouselMediaItems.length - 1) {
      goToCarouselSlide(currentCarouselIndex + 1);
      updateLightboxImage(currentCarouselIndex);
    }
  };
  
  document.addEventListener('keydown', onKeyDown);
  overlay.dataset.keydownHandler = 'true';
  
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
  
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

/**
 * Update lightbox image when navigating
 */
function updateLightboxImage(index) {
  const overlay = document.getElementById('carouselLightbox');
  if (!overlay) return;
  
  const img = overlay.querySelector('img');
  if (!img) return;
  
  const url = carouselMediaItems[index];
  if (!url) return;
  
  img.src = url;
  img.alt = `Shared media ${index + 1}`;
}

/**
 * Close carousel lightbox
 */
function closeCarouselLightbox() {
  const overlay = document.getElementById('carouselLightbox');
  if (!overlay) return;
  
  document.removeEventListener('keydown', closeCarouselLightbox);
  overlay.remove();
  document.body.style.overflow = '';
}

// ============================================================
// IMAGE LIGHTBOX (for chat images)
// ============================================================
function openLightbox(url) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.onclick = () => overlay.remove();
  
  const img = document.createElement('img');
  img.src = url;
  img.className = 'lightbox-img';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'lightbox-close';
  closeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    overlay.remove();
  };
  
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

// ============================================================
// DOCUMENT VIEWER
// ============================================================
function openDocViewer(url, filename) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay doc-viewer-overlay';
  
  const panel = document.createElement('div');
  panel.className = 'doc-viewer-panel';
  
  const ext = getFileExtension(filename);
  const isPdf = ext === 'pdf';
  const isImage = isImageFile(url);
  
  let bodyHtml = '';
  if (isPdf) {
    bodyHtml = `<iframe src="${url}" class="doc-viewer-frame"></iframe>`;
  } else if (isImage) {
    bodyHtml = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;">`;
  } else {
    bodyHtml = `
      <div class="doc-viewer-no-preview">
        <i class="fas fa-file"></i>
        <p>Preview not available for this file type.</p>
        <a href="${url}" download class="btn btn-primary">Download</a>
      </div>
    `;
  }
  
  panel.innerHTML = `
    <div class="doc-viewer-header">
      <span class="doc-viewer-name">${escapeHtml(filename)}</span>
      <div class="doc-viewer-actions">
        <a href="${url}" download class="icon-btn" title="Download"><i class="fas fa-download"></i></a>
        <button class="icon-btn" id="docViewerCloseBtn" title="Close"><i class="fas fa-xmark"></i></button>
      </div>
    </div>
    <div class="doc-viewer-body">
      ${bodyHtml}
    </div>
  `;
  
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  
  overlay.querySelector('#docViewerCloseBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ============================================================
// STATUS / UPDATES
// ============================================================
async function loadStatuses() {
  try {
    const { data, error } = await supabase
      .from('statuses')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    renderStatuses(data || []);
  } catch (err) {
    console.error('Error loading statuses:', err);
  }
}

function renderStatuses(statuses) {
  if (!statusTray) return;
  
  if (statuses.length === 0) {
    statusTray.innerHTML = '<div id="statusPlaceholder" class="empty-note">No updates yet</div>';
    statusAddBtn.classList.remove('hidden');
    postStatusFab.classList.remove('hidden');
    return;
  }
  
  let html = '';
  statuses.forEach(status => {
    const user = allUsers.find(u => u.id === status.user_id);
    const displayName = user ? getUserDisplayName(user) : 'Unknown';
    const avatarText = user ? getUserAvatarText(user) : '?';
    const roleClass = user ? getRoleClass(user.role) : 'avatar-student';
    const time = formatTime(status.created_at);
    
    html += `
      <div class="update-row" data-status-id="${status.id}">
        <div class="avatar sm ${roleClass}">${avatarText}</div>
        <div class="update-row-body">
          <div class="update-row-name">${escapeHtml(displayName)}</div>
          <div class="update-row-time">${time}</div>
          <div class="update-row-preview">${escapeHtml(status.content)}</div>
        </div>
      </div>
    `;
  });
  
  statusTray.innerHTML = html;
  statusAddBtn.classList.remove('hidden');
  postStatusFab.classList.remove('hidden');
  
  // Add click handlers for status viewing
  statusTray.querySelectorAll('.update-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.statusId;
      const status = statuses.find(s => s.id === id);
      if (status) openStatusViewer(statuses, id);
    });
  });
}

async function postStatus(content) {
  if (!content || !content.trim()) return;
  
  try {
    const { data, error } = await supabase
      .from('statuses')
      .insert({
        user_id: currentUser.id,
        content: content.trim(),
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;
    
    showToast('Update posted');
    await loadStatuses();
    
  } catch (err) {
    console.error('Error posting status:', err);
    showToast('Failed to post update');
  }
}

function openStatusViewer(statuses, startId) {
  if (statusViewerOpen) return;
  statusViewerOpen = true;
  
  const index = statuses.findIndex(s => s.id === startId);
  if (index === -1) return;
  
  currentStatusIndex = index;
  statusModal.classList.remove('hidden');
  renderStatusViewer(statuses, currentStatusIndex);
  startStatusTimer(statuses);
}

function renderStatusViewer(statuses, index) {
  const status = statuses[index];
  if (!status) return;
  
  const user = allUsers.find(u => u.id === status.user_id);
  const displayName = user ? getUserDisplayName(user) : 'Unknown';
  const avatarText = user ? getUserAvatarText(user) : '?';
  const roleClass = user ? getRoleClass(user.role) : 'avatar-student';
  
  statusViewerAvatar.textContent = avatarText;
  statusViewerAvatar.className = `avatar sm ${roleClass} status-viewer-avatar`;
  statusModalTitle.textContent = displayName;
  statusModalTime.textContent = formatTime(status.created_at);
  statusModalContent.textContent = status.content;
  statusModalMedia.innerHTML = '';
  
  // Update progress segments
  const segments = statusSegments;
  segments.innerHTML = statuses.map((_, i) => `
    <div class="segment"><div class="segment-fill" style="width: ${i === index ? '100%' : (i < index ? '100%' : '0%')};"></div></div>
  `).join('');
  
  // Update progress for current
  const fills = segments.querySelectorAll('.segment-fill');
  if (fills[index]) {
    statusProgress.style.width = '0%';
    // The progress will be animated by the timer
  }
}

function startStatusTimer(statuses) {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  
  let progress = 0;
  statusTimer = setInterval(() => {
    if (statusPaused) return;
    
    progress += 2;
    if (progress >= 100) {
      progress = 0;
      // Move to next status
      if (currentStatusIndex < statuses.length - 1) {
        currentStatusIndex++;
        renderStatusViewer(statuses, currentStatusIndex);
      } else {
        closeStatusViewer();
      }
    }
    
    const fills = statusSegments.querySelectorAll('.segment-fill');
    if (fills[currentStatusIndex]) {
      fills[currentStatusIndex].style.width = progress + '%';
    }
  }, 80);
}

function closeStatusViewer() {
  statusViewerOpen = false;
  statusModal.classList.add('hidden');
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  statusPaused = false;
}

// Status viewer controls
closeStatusModal.addEventListener('click', closeStatusViewer);
statusModal.addEventListener('click', (e) => {
  if (e.target === statusModal) closeStatusViewer();
});

statusPauseBtn.addEventListener('click', () => {
  statusPaused = !statusPaused;
  statusPauseBtn.innerHTML = statusPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
});

// Keyboard support for status viewer
document.addEventListener('keydown', (e) => {
  if (!statusViewerOpen) return;
  if (e.key === 'Escape') closeStatusViewer();
});

// ============================================================
// SETTINGS FUNCTIONS
// ============================================================
async function createChannel() {
  const name = prompt('Enter session name:');
  if (!name || !name.trim()) return;
  
  const description = prompt('Enter session description (optional):') || '';
  
  try {
    const { data, error } = await supabase
      .from('channels')
      .insert({
        name: name.trim(),
        description: description,
        created_by: currentUser.id,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    
    if (data && data[0]) {
      allChannels.unshift(data[0]);
      renderChatList();
      showToast('Session created');
    }
    
  } catch (err) {
    console.error('Error creating channel:', err);
    showToast('Failed to create session');
  }
}

async function createUser() {
  const username = newUserUsername.value.trim();
  const displayName = newUserDisplayName.value.trim() || username;
  const password = newUserPassword.value.trim();
  const role = newUserRole.value;
  
  if (!username) {
    showToast('Username is required');
    return;
  }
  
  if (!password || password.length < 6) {
    showToast('Password must be at least 6 characters');
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('users')
      .insert({
        username: username,
        display_name: displayName,
        password: password,
        role: role,
        created_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    
    if (data && data[0]) {
      allUsers.push(data[0]);
      updateRegisteredUsersList();
      showToast(`User ${username} created`);
      newUserUsername.value = '';
      newUserDisplayName.value = '';
      newUserPassword.value = '';
    }
    
  } catch (err) {
    console.error('Error creating user:', err);
    showToast('Failed to create user');
  }
}

async function updateUser() {
  const username = editUsername.value.trim();
  const displayName = editDisplayName.value.trim();
  const newUsername = editNewUsername.value.trim();
  const password = editPassword.value.trim();
  const role = editRole.value;
  
  if (!username) {
    showToast('Username is required');
    return;
  }
  
  try {
    const updates = {};
    if (displayName) updates.display_name = displayName;
    if (newUsername) updates.username = newUsername;
    if (password && password.length >= 6) updates.password = password;
    if (role) updates.role = role;
    
    if (Object.keys(updates).length === 0) {
      showToast('No changes to apply');
      return;
    }
    
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('username', username);
    
    if (error) throw error;
    
    // Update local cache
    const userIndex = allUsers.findIndex(u => u.username === username);
    if (userIndex > -1) {
      allUsers[userIndex] = { ...allUsers[userIndex], ...updates };
    }
    
    updateRegisteredUsersList();
    showToast('User updated');
    editUsername.value = '';
    editDisplayName.value = '';
    editNewUsername.value = '';
    editPassword.value = '';
    userEditForm.style.display = 'none';
    
  } catch (err) {
    console.error('Error updating user:', err);
    showToast('Failed to update user');
  }
}

async function deleteUser() {
  const username = editUsername.value.trim();
  if (!username) return;
  
  if (!confirm(`Delete user "${username}"? This action cannot be undone.`)) return;
  
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('username', username);
    
    if (error) throw error;
    
    allUsers = allUsers.filter(u => u.username !== username);
    updateRegisteredUsersList();
    showToast('User deleted');
    editUsername.value = '';
    editDisplayName.value = '';
    editNewUsername.value = '';
    editPassword.value = '';
    userEditForm.style.display = 'none';
    
  } catch (err) {
    console.error('Error deleting user:', err);
    showToast('Failed to delete user');
  }
}

async function loadUserForEdit(username) {
  const user = allUsers.find(u => u.username === username);
  if (!user) {
    showToast('User not found');
    return;
  }
  
  editUsername.value = user.username;
  editDisplayName.value = user.display_name || '';
  editNewUsername.value = '';
  editPassword.value = '';
  editRole.value = user.role;
  userEditForm.style.display = 'flex';
}

// ============================================================
// LIVE SESSION
// ============================================================
function joinLiveSession() {
  if (!currentChannel) return;
  
  if (currentChannel.live_url) {
    // Open video container
    videoContainer.classList.remove('hidden');
    videoIframe.src = currentChannel.live_url;
  } else {
    // Create a live session
    const liveUrl = prompt('Enter live session URL (Zoom, Google Meet, etc.):');
    if (liveUrl && liveUrl.trim()) {
      setLiveSession(currentChannel.id, liveUrl.trim());
    }
  }
}

async function setLiveSession(channelId, url) {
  try {
    const { error } = await supabase
      .from('channels')
      .update({ live_url: url })
      .eq('id', channelId);
    
    if (error) throw error;
    
    const channel = allChannels.find(c => c.id === channelId);
    if (channel) {
      channel.live_url = url;
      if (currentChannel && currentChannel.id === channelId) {
        currentChannel.live_url = url;
        liveBtnText.textContent = 'Join Live Session';
        joinLiveBtn.classList.remove('hidden');
      }
    }
    
    showToast('Live session set');
    
  } catch (err) {
    console.error('Error setting live session:', err);
    showToast('Failed to set live session');
  }
}

function closeVideo() {
  videoContainer.classList.add('hidden');
  videoIframe.src = '';
}

// ============================================================
// SEND MESSAGE
// ============================================================
async function sendMessage() {
  if (!currentChannel) {
    showToast('Select a session first');
    return;
  }
  
  const text = messageInput.value.trim();
  const file = fileToSend;
  
  if (!text && !file) return;
  
  // Build message object
  const msg = {
    channel_id: currentChannel.id,
    user_id: currentUser.id,
    content: text || '',
    created_at: new Date().toISOString(),
    delivery_status: 'sent'
  };
  
  if (replyToMessage) {
    msg.reply_to = replyToMessage.id;
  }
  
  try {
    // If there's a file, upload it
    let attachmentUrl = null;
    let attachmentFilename = null;
    
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `attachments/${currentChannel.id}/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('files')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from('files')
        .getPublicUrl(filePath);
      
      attachmentUrl = urlData.publicUrl;
      attachmentFilename = file.name;
    }
    
    if (attachmentUrl) {
      msg.attachment_url = attachmentUrl;
      msg.attachment_filename = attachmentFilename;
    }
    
    const { error } = await supabase
      .from('messages')
      .insert(msg);
    
    if (error) throw error;
    
    // Clear input
    messageInput.value = '';
    fileToSend = null;
    filePreview.classList.add('hidden');
    filePreviewName.textContent = '';
    fileInput.value = '';
    
    if (replyToMessage) {
      replyToMessage = null;
      replyPreview.classList.add('hidden');
    }
    
  } catch (err) {
    console.error('Error sending message:', err);
    showToast('Failed to send message');
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

// Auth
loginBtn.addEventListener('click', login);
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passwordInput.focus(); });
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

// Navigation tabs
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'chats') {
      showScreen('chats');
      if (currentChannel) {
        showScreen('chat');
      }
    } else if (tab === 'updates') {
      showScreen('updates');
      loadStatuses();
    } else if (tab === 'settings') {
      showScreen('settings');
    }
  });
});

// Chat search
chatSearchInput.addEventListener('input', renderChatList);

// Member search
memberSearchInput.addEventListener('input', renderMembers);

// Back buttons
backFromChat.addEventListener('click', () => {
  showScreen('chats');
  if (window.innerWidth < 1024) {
    screenChatDetail.classList.add('hidden');
  } else {
    screenChatDetail.classList.add('no-chat');
    screenChatDetail.classList.remove('hidden');
    chatMessages.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon"><i class="fas fa-comments"></i></div>
        <div class="chat-welcome-title">Nous Complex Orbit</div>
        <div class="chat-welcome-sub">Select a session from the list to start messaging.</div>
      </div>
    `;
  }
});

backFromUpdates.addEventListener('click', showScreen('chats'));
backFromMembers.addEventListener('click', () => showScreen('profile'));
backFromProfile.addEventListener('click', () => {
  if (currentChannel) {
    showScreen('chat');
  } else {
    showScreen('chats');
  }
});

// Chat detail title click - show profile
document.getElementById('chatDetailTitleBtn').addEventListener('click', showProfile);

// Profile members button
profileMembersBtn.addEventListener('click', () => {
  if (currentChannel) {
    loadChannelMembers(currentChannel.id);
    showScreen('members');
  }
});

// Send message
sendMsgBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// File input
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    fileToSend = file;
    filePreviewName.textContent = file.name;
    filePreview.classList.remove('hidden');
    fileUploadStatus.classList.add('hidden');
  }
});

filePreviewRemove.addEventListener('click', () => {
  fileToSend = null;
  filePreview.classList.add('hidden');
  fileInput.value = '';
});

replyPreviewCancel.addEventListener('click', () => {
  replyToMessage = null;
  replyPreview.classList.add('hidden');
});

// Join live session
joinLiveBtn.addEventListener('click', joinLiveSession);

// Close video
closeVideoBtn.addEventListener('click', closeVideo);

// Create channel
createChannelBtn.addEventListener('click', createChannel);

// Generate password
generatePasswordBtn.addEventListener('click', () => {
  newUserPassword.value = generateRandomPassword();
});

// Create user
createUserBtn.addEventListener('click', createUser);

// Load user for edit
loadUserBtn.addEventListener('click', () => {
  const username = manageUserSearch.value.trim();
  if (username) loadUserForEdit(username);
});

manageUserSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadUserBtn.click();
  }
});

// Update user
updateUserBtn.addEventListener('click', updateUser);

// Delete user
deleteUserBtn.addEventListener('click', deleteUser);

// Assign member
assignStudentBtn.addEventListener('click', () => {
  const username = assignStudentInput.value.trim();
  const role = assignRoleSelect.value;
  if (username) addMemberToChannel(username, role);
});

assignStudentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    assignStudentBtn.click();
  }
});

// Update description
updateDescBtn.addEventListener('click', async () => {
  if (!currentChannel) return;
  const desc = channelDescInput.value.trim();
  
  try {
    const { error } = await supabase
      .from('channels')
      .update({ description: desc })
      .eq('id', currentChannel.id);
    
    if (error) throw error;
    
    currentChannel.description = desc;
    const channel = allChannels.find(c => c.id === currentChannel.id);
    if (channel) channel.description = desc;
    
    profileChannelDesc.textContent = desc;
    profileChannelMeta.textContent = desc || 'Session';
    showToast('Description updated');
    
  } catch (err) {
    console.error('Error updating description:', err);
    showToast('Failed to update description');
  }
});

// Set schedule
setScheduleBtn.addEventListener('click', async () => {
  if (!currentChannel) return;
  
  const time = scheduleTimeInput.value;
  const teacherUsername = scheduleTeacherInput.value.trim();
  const duration = parseInt(scheduleDurationInput.value) || 45;
  
  if (!time) {
    showToast('Please select a time');
    return;
  }
  
  try {
    let teacherId = null;
    if (teacherUsername) {
      const teacher = allUsers.find(u => u.username === teacherUsername);
      if (teacher) teacherId = teacher.id;
    }
    
    const updates = {
      scheduled_time: new Date(time).toISOString(),
      scheduled_duration: duration,
      scheduled_teacher: teacherId
    };
    
    const { error } = await supabase
      .from('channels')
      .update(updates)
      .eq('id', currentChannel.id);
    
    if (error) throw error;
    
    Object.assign(currentChannel, updates);
    const channel = allChannels.find(c => c.id === currentChannel.id);
    if (channel) Object.assign(channel, updates);
    
    // Update banner
    scheduleBanner.classList.remove('hidden');
    const date = new Date(time);
    scheduleBannerText.textContent = `Scheduled: ${formatFullDate(date)} at ${formatTime(date)}`;
    
    showToast('Schedule updated');
    
  } catch (err) {
    console.error('Error setting schedule:', err);
    showToast('Failed to set schedule');
  }
});

// Post status
postStatusBtn.addEventListener('click', () => {
  const content = prompt('What\'s on your mind?');
  if (content && content.trim()) {
    postStatus(content.trim());
  }
});

postStatusFab.addEventListener('click', () => {
  postStatusBtn.click();
});

// Sign out
signOutBtn.addEventListener('click', logout);

// Dark mode toggle
darkToggle.addEventListener('change', (e) => {
  document.body.classList.toggle('theme-dark', e.target.checked);
  localStorage.setItem('orbit_dark_mode', e.target.checked);
});

// Notifications toggle
notifToggle.addEventListener('change', (e) => {
  localStorage.setItem('orbit_notifications', e.target.checked);
});

// ============================================================
// THEME INITIALIZATION
// ============================================================
function initTheme() {
  const dark = localStorage.getItem('orbit_dark_mode') === 'true';
  document.body.classList.toggle('theme-dark', dark);
  darkToggle.checked = dark;
  
  const notif = localStorage.getItem('orbit_notifications') !== 'false';
  notifToggle.checked = notif;
}

// ============================================================
// VIEWPORT HEIGHT FIX
// ============================================================
function setAppHeight() {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', vh + 'px');
}

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  // Set viewport height
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.visualViewport?.addEventListener('resize', setAppHeight);
  
  // Init theme
  initTheme();
  
  // Check auto login
  const loggedIn = checkAutoLogin();
  
  if (!loggedIn) {
    authCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }
  
  // Load users for autocomplete
  await loadUsers();
  
  // Setup channel subscription for real-time updates
  setupChannelSubscription();
  
  // Setup status subscription
  setupStatusSubscription();
}

async function loadUsers() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) throw error;
    allUsers = data || [];
    updateRegisteredUsersList();
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function setupChannelSubscription() {
  if (channelSubscription) {
    channelSubscription.unsubscribe();
    channelSubscription = null;
  }
  
  channelSubscription = supabase
    .channel('channels')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'channels'
    }, () => {
      loadChannels();
    })
    .subscribe();
}

function setupStatusSubscription() {
  if (statusSubscription) {
    statusSubscription.unsubscribe();
    statusSubscription = null;
  }
  
  statusSubscription = supabase
    .channel('statuses')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'statuses'
    }, () => {
      loadStatuses();
    })
    .subscribe();
}

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================
// These are needed for inline onclick handlers in HTML
window.openLightbox = openLightbox;
window.openDocViewer = openDocViewer;
window.removeMember = removeMember;
window.openCarouselLightbox = openCarouselLightbox;
window.closeCarouselLightbox = closeCarouselLightbox;

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', init);

// Also run init if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('🚀 Nous Complex Orbit loaded successfully');
console.log('📱 App ready for use');
