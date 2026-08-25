// ============================================================
// CONFIGURATION - Nous Complex Orbit Application
// UPDATE THESE VALUES WITH YOUR OWN CREDENTIALS
// ============================================================

const CONFIG = {
  // ============================================================
  // APP BRANDING
  // ============================================================
  BRANDING: {
    LOGO: {
      PATH: 'nouscomplex.png',
      ALT: 'NousComplex Logo',
      WIDTH: '40px',
      HEIGHT: '40px',
      USE_AS_FAVICON: true,
    },
    NAME: 'Nous Complex Orbit',
    SHORT_NAME: 'Orbit',
    DESCRIPTION: 'Unified communication platform for Educational Complexs',
    VERSION: '1.0.0',
  },

  // ============================================================
  // SUPABASE CONFIGURATION - UPDATE THESE!
  // ============================================================
  SUPABASE: {
    URL: 'https://vybzpzlklgrgwzlmtqmj.supabase.co',      // <-- CHANGE THIS
    ANON_KEY: 'sb_publishable_6Vebs1lIOrcsY_Q52m92ZQ_EOsOAyyV',                    // <-- CHANGE THIS
    STORAGE_BUCKET: 'files',
    TABLES: {
      CHANNELS: 'channels',
      MESSAGES: 'messages',
      STATUSES: 'statuses',
      ATTENDANCE: 'attendance',
      MEMBERS: 'members',
    }
  },

  // ============================================================
  // LIVEKIT / PLUG-N-MEET
  // ============================================================
  // PLUGNMEET.SERVER_URL is only used to detect misconfiguration
  // (see validateConfig() below) and to build the visible iframe host —
  // the actual room creation + per-user join token now happens
  // server-side in the "plugnmeet-token" Supabase Edge Function, which
  // holds the real PlugNmeet API key/secret. The browser never sees
  // those credentials and never sees a plain, reusable room link —
  // every join fetches a fresh, single-use token (see getLiveJoinUrl()
  // in app.js). EDGE_FUNCTION must match the folder name under
  // supabase/functions/.
  PLUGNMEET: {
    SERVER_URL: 'https://meet.nouscomplex.com',
    EDGE_FUNCTION: 'plugnmeet-token',
    ROOM_SETTINGS: {
      lock_webcam: true,
      lock_microphone: true,
      lock_screen_sharing: true,
      lock_chat: false,
      lock_chat_send_message: false,
      lock_chat_file_share: true,
      // Extra layer beyond the app's own start/join gating: if enabled,
      // anyone whose token somehow reached PlugNmeet without going
      // through the app's normal flow would still sit in a waiting room
      // until the teacher/admin (who is a room moderator) admits them.
      // Off by default so students really do "just jump in" with zero
      // extra taps, per the no-friction requirement.
      waiting_room: false,
    },
  },

  // ============================================================
  // AUTHENTICATION CONFIGURATION
  // ============================================================
  AUTH: {
    EMAIL_SUFFIX: '@orbit.com',
    DEFAULT_PASSWORD: 'password123',
    ROLES: {
      ADMIN: 'admin',
      TEACHER: 'teacher',
      STUDENT: 'student',
    }
  },

  // ============================================================
  // FILE UPLOAD CONFIGURATION
  // ============================================================
  UPLOAD: {
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    ALLOWED_TYPES: [
      'image/*',
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.png',
      '.jpg',
      '.jpeg'
    ],
    STORAGE_PATH: 'homework-assignments/class-{channelId}/{timestamp}_{filename}',
  },

  // ============================================================
  // UI / THEME CONFIGURATION
  // ============================================================
  THEME: {
    COLORS: {
      PRIMARY_NAVY: '#0e1c76',
      SECONDARY_SKY: '#67b3f9',
      PURE_WHITE: '#ffffff',
    },
    GLASS: {
      BACKGROUND: 'rgba(255, 255, 255, 0.65)',
      BLUR: '14px',
      BORDER: 'rgba(255, 255, 255, 0.25)',
      SHADOW: '0 20px 35px -8px rgba(0, 0, 0, 0.15)',
    }
  },

  // ============================================================
  // FEATURE FLAGS
  // ============================================================
  FEATURES: {
    ENABLE_ATTENDANCE_LOGGING: true,
    ENABLE_FILE_UPLOADS: true,
    ENABLE_STATUS_UPDATES: true,
    ENABLE_ADMIN_CONSOLE: true,
    ENABLE_VIDEO_CONFERENCE: true,
  },

  // ============================================================
  // PUSH NOTIFICATIONS (lock-screen / background alerts)
  // Public key only — the matching private key lives on the
  // server (Supabase Edge Function secret), never in this file.
  // ============================================================
  PUSH: {
    VAPID_PUBLIC_KEY: 'BAHQkLJFJkm-zUEMXKZt7Twb8lzC6fYtCNkb_an0VR9bFLRLOkCixcNZpoH9UX04AmoB3xZFEuo-cK8I_fCd7O0',
  },

  // ============================================================
  // ENVIRONMENT
  // ============================================================
  ENV: 'development', // 'development' | 'production' | 'staging'
};

// Environment-specific overrides
if (CONFIG.ENV === 'production') {
  // Production settings
}

// ============================================================
// VALIDATION
// ============================================================
function validateConfig() {
  const errors = [];
  
  if (!CONFIG.SUPABASE.URL || CONFIG.SUPABASE.URL.includes('your-project')) {
    errors.push('⚠️ Supabase URL not configured');
  }
  
  if (!CONFIG.SUPABASE.ANON_KEY || CONFIG.SUPABASE.ANON_KEY.includes('your-anon')) {
    errors.push('⚠️ Supabase anon key not configured');
  }
  
  if (!CONFIG.PLUGNMEET.SERVER_URL || CONFIG.PLUGNMEET.SERVER_URL.includes('your-livekit') || CONFIG.PLUGNMEET.SERVER_URL.includes('your-plugnmeet')) {
    errors.push('⚠️ PlugNmeet server URL not configured');
  }
  
  if (errors.length > 0) {
    console.warn('⚠️ Configuration warnings:');
    errors.forEach(err => console.warn(`  ${err}`));
    console.warn('Please update config.js with your actual credentials.');
  }
}

validateConfig();

// Export
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
