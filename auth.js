/**
 * auth.js - Authentication Module
 * Handles user registration, login, and account management
 */

import { CONFIG, MESSAGES } from './config.js';
import { Storage, Validate, DOM } from './utils.js';
import { ViewSwitcher, FormManager, SavedAccountsUI } from './ui.js';

// ==================== ACCOUNT MANAGER ====================
class AccountManager {
    constructor() {
        this.storageKey = CONFIG.storage.accountsKey;
    }

    /**
     * Get all saved accounts
     */
    getAccounts() {
        return Storage.get(this.storageKey, []);
    }

    /**
     * Save account
     */
    saveAccount(url, username, password) {
        const accounts = this.getAccounts();
        const index = accounts.findIndex(
            a => a.url === url && a.username === username
        );

        const account = {
            url,
            username,
            password: btoa(password), // Base64 encode
            lastLogin: Date.now()
        };

        if (index >= 0) {
            accounts[index] = account;
        } else {
            accounts.push(account);
        }

        // Limit max accounts
        if (accounts.length > CONFIG.storage.maxSavedAccounts) {
            accounts.shift();
        }

        return Storage.set(this.storageKey, accounts);
    }

    /**
     * Remove account
     */
    removeAccount(url, username) {
        const accounts = this.getAccounts().filter(
            a => !(a.url === url && a.username === username)
        );
        return Storage.set(this.storageKey, accounts);
    }

    /**
     * Clear all accounts
     */
    clearAccounts() {
        return Storage.remove(this.storageKey);
    }
}

// ==================== AUTHENTICATION MANAGER ====================
export class AuthenticationManager {
    constructor(chatManager) {
        this.chatManager = chatManager;
        this.accountManager = new AccountManager();
        this.viewSwitcher = new ViewSwitcher();
        this.savedAccountsUI = new SavedAccountsUI();

        // Form management
        this.loginForm = new FormManager('login');
        this.loginForm.registerField('url', 'serverURL');
        this.loginForm.registerField('username', 'userName');
        this.loginForm.registerField('password', 'password');

        // Auth state
        this.authInProgress = false;
        this.pendingAuth = null;
        this.authTimeout = null;

        // Initialize
        this._init();
    }

    /**
     * Initialize authentication manager
     */
    _init() {
        this.displaySavedAccounts();
    }

    /**
     * Register new user
     */
    async register() {
        await this._authenticate('register');
    }

    /**
     * Login user
     */
    async login() {
        await this._authenticate('login');
    }

    /**
     * Quick login with saved credentials
     */
    async quickLogin(url, username, encodedPassword) {
        try {
            this.loginForm.setValue('url', url);
            this.loginForm.setValue('username', username);
            this.loginForm.setValue('password', atob(encodedPassword));
            await this.login();
        } catch (error) {
            console.error('Quick login failed:', error);
            this._setMessage('❌ Lỗi đăng nhập nhanh!', 'error');
        }
    }

    /**
     * Logout user
     */
    logout() {
        try {
            // Show leave notification
            const username = this.chatManager.getUser();
            if (username) {
                const text = `🔴 ${username} đã thoát game / ${username} left the game`;
                this.chatManager.messageDisplay.addSystemNotification(
                    text, 
                    'leave'
                );
            }

            // Disconnect from server
            this.chatManager.disconnect();

            // Reset auth state
            this._resetAuth();

            // Switch to login view
            this.viewSwitcher.showLogin();
            
            // Reset form
            this.loginForm.clearAll();
            this.loginForm.setEnabled(true);
            this._setMessage('', 'info');

            console.log('✅ Logout complete');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    /**
     * Core authentication flow
     */
    async _authenticate(action) {
        // Check if already authenticating
        if (this.authInProgress) {
            console.warn('Authentication already in progress');
            return;
        }

        // Validate form
        const credentials = this._getCredentials();
        if (!this._validateCredentials(credentials)) {
            return;
        }

        // Start authentication
        this.authInProgress = true;
        this.loginForm.setEnabled(false);
        this.pendingAuth = { action, credentials };

        try {
            // Step 1: Connect to WebSocket
            this._setMessage('🔌 Đang kết nối server...', 'info');
            await this.chatManager.connect(credentials.url);

            // Step 2: Verify connection
            if (!this.chatManager.wsManager.isConnected()) {
                throw new Error('WebSocket not in OPEN state');
            }

            // Step 3: Send auth request
            const actionText = action === 'register' ? 'đăng ký' : 'đăng nhập';
            this._setMessage(`⏳ Đang ${actionText}...`, 'info');

            this.chatManager.wsManager.send({
                action,
                user: credentials.username,
                pw: credentials.password
            });

            // Step 4: Set timeout for response
            this.authTimeout = setTimeout(() => {
                if (this.authInProgress) {
                    console.error('Authentication timeout');
                    this._setMessage(MESSAGES.errors.connectionTimeout, 'error');
                    this._resetAuth();
                    this.chatManager.disconnect();
                }
            }, 10000);

        } catch (error) {
            console.error('Authentication failed:', error);
            
            let errorMsg = MESSAGES.errors.noConnection;
            if (error.message.includes('timeout')) {
                errorMsg = MESSAGES.errors.connectionTimeout;
            }

            this._setMessage(errorMsg, 'error');
            this._resetAuth();
            this.chatManager.disconnect();
        }
    }

    /**
     * Handle register response from server
     */
    handleRegisterResponse(response) {
        this._clearAuthTimeout();
        this.authInProgress = false;
        this.loginForm.setEnabled(true);

        if (response.ok) {
            this._setMessage(MESSAGES.success.registered, 'success');

            // Save account if remember me is checked
            if (this._shouldRememberAccount()) {
                const { credentials } = this.pendingAuth;
                this.accountManager.saveAccount(
                    credentials.url,
                    credentials.username,
                    credentials.password
                );
                this.displaySavedAccounts();
            }

            // Clear password field
            this.loginForm.clearField('password');
        } else {
            this._setMessage(response.msg || '❌ Đăng ký thất bại!', 'error');
            this.chatManager.disconnect();
        }

        this.pendingAuth = null;
    }

    /**
     * Handle login response from server
     */
    handleLoginResponse(response) {
        this._clearAuthTimeout();
        this.authInProgress = false;

        if (!response.ok) {
            this._setMessage(response.msg || '❌ Đăng nhập thất bại!', 'error');
            this.loginForm.setEnabled(true);
            this.chatManager.disconnect();
            this.pendingAuth = null;
            return;
        }

        // Login successful
        const { credentials } = this.pendingAuth || {};
        if (!credentials) {
            console.error('No pending auth credentials');
            this._resetAuth();
            return;
        }

        // Set user in chat manager
        this.chatManager.setUser(credentials.username, response.stats);

        // Save account if remember me is checked
        if (this._shouldRememberAccount()) {
            this.accountManager.saveAccount(
                credentials.url,
                credentials.username,
                credentials.password
            );
        }

        // Switch to chat view
        this._switchToChatView();
        
        this.pendingAuth = null;
    }

    /**
     * Switch to chat view after successful login
     */
    _switchToChatView() {
        // Switch view
        this.viewSwitcher.showChat();

        // Show welcome message
        this.chatManager.showWelcome();

        // Request initial messages
        this.chatManager.requestInitialMessages();

        // Re-enable form
        this.loginForm.setEnabled(true);
    }

    /**
     * Display saved accounts
     */
    displaySavedAccounts() {
        const accounts = this.accountManager.getAccounts();
        this.savedAccountsUI.display(accounts);
    }

    /**
     * Remove saved account
     */
    removeAccount(url, username) {
        this.accountManager.removeAccount(url, username);
        this.displaySavedAccounts();
    }

    /**
     * Get form credentials
     */
    _getCredentials() {
        return {
            url: this.loginForm.getValue('url'),
            username: this.loginForm.getValue('username'),
            password: this.loginForm.getValue('password')
        };
    }

    /**
     * Validate credentials
     */
    _validateCredentials(credentials) {
        if (Validate.isEmpty(credentials.url)) {
            this._setMessage('❌ Vui lòng nhập địa chỉ server!', 'error');
            return false;
        }

        if (Validate.isEmpty(credentials.username) || 
            Validate.isEmpty(credentials.password)) {
            this._setMessage(MESSAGES.errors.invalidCredentials, 'error');
            return false;
        }

        return true;
    }

    /**
     * Check if should remember account
     */
    _shouldRememberAccount() {
        const checkbox = DOM.get('rememberMe');
        return checkbox?.checked || false;
    }

    /**
     * Set authentication message
     */
    _setMessage(text, type = 'info') {
        const msgEl = DOM.get('authMsg');
        if (!msgEl) return;

        const colors = {
            error: 'red',
            success: 'green',
            info: 'blue',
            warning: 'orange'
        };

        msgEl.style.color = colors[type] || colors.info;
        msgEl.textContent = text;
    }

    /**
     * Reset authentication state
     */
    _resetAuth() {
        this.authInProgress = false;
        this.pendingAuth = null;
        this.loginForm.setEnabled(true);
        this._clearAuthTimeout();
    }

    /**
     * Clear authentication timeout
     */
    _clearAuthTimeout() {
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
    }
}

export default AuthenticationManager;