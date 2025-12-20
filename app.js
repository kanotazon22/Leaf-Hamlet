/**
 * app.js - Main Application Entry Point (FIXED)
 * Initializes and coordinates all modules
 */

import { CONFIG } from './config.js';
import { DOM, Mobile } from './utils.js';
import ChatManager from './chat.js';
import AuthenticationManager from './auth.js';

// ==================== APPLICATION CLASS ====================
class Application {
    constructor() {
        this.chatManager = null;
        this.authManager = null;
        this.initialized = false;
    }

    /**
     * Initialize application
     */
    async init() {
        if (this.initialized) {
            console.warn('Application already initialized');
            return;
        }

        try {
            console.log('🚀 Initializing application...');

            // Initialize core managers
            this.chatManager = new ChatManager();
            this.authManager = new AuthenticationManager(this.chatManager);

            // ⭐ FIX: Set bidirectional reference IMMEDIATELY
            this.chatManager.setAuthManager(this.authManager);

            // Setup UI event handlers
            this._setupEventHandlers();

            // Mobile optimizations
            if (Mobile.isMobile()) {
                Mobile.preventDoubleTapZoom();
                Mobile.applySafeArea();
            }

            // Setup debug panel
            if (CONFIG.performance.enableDebugPanel) {
                this._setupDebugPanel();
            }

            // Setup global error handlers
            this._setupErrorHandlers();

            // ⭐ FIX: Export to window BEFORE marking as initialized
            window.ChatModule = this.chatManager;
            window.LoginModule = this.authManager;

            this.initialized = true;
            console.log('✅ Application initialized successfully');

        } catch (error) {
            console.error('❌ Application initialization failed:', error);
            throw error;
        }
    }

    /**
     * Setup UI event handlers
     */
    _setupEventHandlers() {
        // Message input
        const messageInput = DOM.get('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this._handleSendMessage();
                }
            });
        }

        // Send button
        const sendButton = DOM.get('sendButton');
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                this._handleSendMessage();
            });
        }

        // Prevent form submission on Enter in login
        const loginInputs = ['serverURL', 'userName', 'password'];
        loginInputs.forEach(id => {
            const input = DOM.get(id);
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        // Trigger login on Enter in any field
                        this.authManager.login();
                    }
                });
            }
        });
    }

    /**
     * Handle send message
     */
    _handleSendMessage() {
        const input = DOM.get('messageInput');
        if (!input) return;

        const message = input.value;
        if (this.chatManager.sendMessage(message)) {
            // Clear input, keep slash if command
            input.value = message.startsWith('/') ? '/' : '';
        }
    }

    /**
     * Setup debug panel
     */
    _setupDebugPanel() {
        const debugBtn = DOM.create('button', {
            innerHTML: '🛠',
            title: 'Toggle Debug Console',
            style: {
                position: 'fixed',
                top: '10px',
                right: '10px',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#333',
                color: 'white',
                border: '2px solid #555',
                cursor: 'pointer',
                zIndex: '9998',
                fontSize: '18px',
                opacity: '0.7',
                transition: 'all 0.3s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            },
            onMouseOver: function() {
                this.style.opacity = '1';
                this.style.transform = 'scale(1.1)';
            },
            onMouseOut: function() {
                this.style.opacity = '0.7';
                this.style.transform = 'scale(1)';
            },
            onClick: () => {
                if (window.DEBUG) {
                    window.DEBUG.togglePanel();
                }
            }
        });

        document.body.appendChild(debugBtn);
    }

    /**
     * Setup global error handlers
     */
    _setupErrorHandlers() {
        window.addEventListener('error', (e) => {
            console.error('❌ Uncaught error:', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno
            });
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('❌ Unhandled promise rejection:', {
                reason: e.reason?.message || e.reason
            });
        });
    }

    /**
     * Cleanup on page unload
     */
    cleanup() {
        if (this.chatManager) {
            this.chatManager.disconnect();
        }
        console.log('🧹 Application cleanup complete');
    }
}

// ==================== GLOBAL EXPORTS ====================
const app = new Application();

// Export functions for HTML onclick handlers
window.loginUser = () => app.authManager?.login();
window.registerUser = () => app.authManager?.register();
window.sendMessage = () => {
    const input = DOM.get('messageInput');
    if (input && app.chatManager?.sendMessage(input.value)) {
        input.value = input.value.startsWith('/') ? '/' : '';
    }
};
window.handleEnter = (e) => e.key === 'Enter' && window.sendMessage();

// Quick login handler (called from saved accounts UI)
window.quickLogin = (url, username, password) => {
    app.authManager?.quickLogin(url, username, password);
};

// Remove account handler
window.removeAccount = (url, username) => {
    app.authManager?.removeAccount(url, username);
};

// Logout handler
window.logout = () => app.authManager?.logout();

// ==================== INITIALIZATION ====================
window.addEventListener('load', async () => {
    try {
        await app.init();
    } catch (error) {
        console.error('Failed to initialize application:', error);
        alert('Lỗi khởi động ứng dụng. Vui lòng tải lại trang.');
    }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    app.cleanup();
});

// Export app instance
export default app;