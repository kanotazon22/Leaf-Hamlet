/**
 * config.js - Centralized Configuration
 * All app constants, settings, and configurations
 */

export const CONFIG = {
    // Debug settings
    debug: {
        enabled: true,
        logLevel: 'INFO', // ERROR | WARN | INFO | DEBUG
        maxLogs: 200,
        categories: ['WS', 'MSG', 'AUTH', 'STORAGE', 'INIT', 'UI', 'PERF'],
        colors: {
            ERROR: '#f44',
            WARN: '#fa0',
            INFO: '#44f',
            DEBUG: '#888',
            SUCCESS: '#4c4'
        }
    },

    // WebSocket settings
    websocket: {
        maxReconnectAttempts: 5,
        reconnectDelay: 2000,
        connectionTimeout: 8000,
        readyTimeout: 3000,
        heartbeatInterval: 30000
    },

    // Message settings
    message: {
        maxProcessedIds: 200,
        cleanupThreshold: 150,
        encryptionKey: 42,
        maxMessageLength: 2000
    },

    // Tunnel detection patterns
    tunnel: {
        patterns: [
            { 
                regex: /\.(ngrok|trycloudflare|loca\.lt|serveo|pagekite|bore\.pub|tunnelmole\.net)\.?/i, 
                protocol: 'wss' 
            },
            { 
                regex: /^(localhost|127\.0\.0\.1)$/i, 
                protocol: 'ws', 
                port: 8766 
            },
            { 
                regex: /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i, 
                protocol: 'ws', 
                port: 8766 
            }
        ],
        defaultProtocol: 'wss'
    },

    // UI settings
    ui: {
        scrollBehavior: 'smooth',
        messageAnimationDuration: 200,
        toastDuration: 5000,
        systemMessageDuration: 0, // 0 = permanent
        inputPlaceholder: 'Nhập tin nhắn...',
        sendButtonText: 'Gửi'
    },

    // Storage settings
    storage: {
        accountsKey: 'rpg_saved_accounts',
        maxSavedAccounts: 10,
        sessionTimeout: 3600000 // 1 hour
    },

    // Performance settings
    performance: {
        enableAnimations: true,
        enableDebugPanel: true,
        enableMetrics: true
    }
};

// Message templates
export const MESSAGES = {
    welcome: (username, stats) => `
🎮 Chào mừng ${username}!

📊 Thông tin nhân vật:
   ❤️ HP: ${stats.health}/${stats.max_health} | ⚔️ DMG: ${stats.damage} | 🌟 LV: ${stats.level}

🇻🇳 Tiếng Việt:
   • Gõ /help để xem danh sách lệnh
   • Gõ /hideothers để ẩn/hiện tin nhắn server của người khác
   • Khám phá thế giới RPG với quái vật, nhiệm vụ và boss khổng lồ!

🇬🇧 English:
   • Type /help to see command list
   • Type /hideothers to show/hide other players' server messages
   • Explore the RPG world with monsters, quests and world bosses!

💡 Client Commands: /ping | /quit | /clear
`.trim(),

    errors: {
        noConnection: '❌ Chưa kết nối server!',
        sendFailed: '❌ Lỗi gửi tin nhắn!',
        connectionTimeout: '❌ Server không phản hồi. Kiểm tra lại URL.',
        authInProgress: '⚠️ Đang xử lý yêu cầu trước đó...',
        invalidCredentials: '❌ Vui lòng điền đầy đủ thông tin!',
        maxReconnect: '❌ Không thể kết nối lại. Vui lòng đăng nhập lại.'
    },

    success: {
        connected: '✅ Đã kết nối thành công!',
        registered: '✅ Đăng ký thành công! Hãy đăng nhập.',
        loggedIn: '✅ Đăng nhập thành công!'
    },

    system: {
        connecting: '🔌 Đang kết nối...',
        reconnecting: (attempt) => `🔄 Đang kết nối lại (${attempt})...`,
        disconnected: '🔴 Mất kết nối'
    }
};

// System notification types
export const NOTIFICATION_TYPES = {
    JOIN: 'join',
    LEAVE: 'leave',
    INFO: 'info',
    WARNING: 'warning',
    SUCCESS: 'success',
    ERROR: 'error'
};

// Command definitions
export const COMMANDS = {
    CLIENT: {
        PING: '/ping',
        QUIT: '/quit',
        LOGOUT: '/logout',
        EXIT: '/exit',
        CLEAR: '/clear',
        HELP: '/help',
        DEBUG: '/debug'
    },
    SERVER: {
        HIDEOTHERS: '/hideothers'
    }
};

export default CONFIG;