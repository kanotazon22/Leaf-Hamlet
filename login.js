// ==================== LOGIN MODULE ====================
const LoginModule = {
    STORAGE_KEY: 'rpg_saved_accounts',
    authInProgress: false,
    pendingAuth: null, // Store auth data during connection
    
    // ==================== STORAGE ====================
    getSavedAccounts() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            DEBUG.error('STORAGE', 'Load failed', error);
            return [];
        }
    },
    
    saveAccount(url, username, password) {
        try {
            const accounts = this.getSavedAccounts();
            const index = accounts.findIndex(a => a.url === url && a.username === username);
            
            const account = {
                url,
                username,
                password: btoa(password),
                lastLogin: Date.now()
            };
            
            if (index >= 0) {
                accounts[index] = account;
            } else {
                accounts.push(account);
            }
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(accounts));
            DEBUG.info('STORAGE', 'Saved', { url, username });
        } catch (error) {
            DEBUG.error('STORAGE', 'Save failed', error);
        }
    },
    
    removeAccount(url, username) {
        try {
            const accounts = this.getSavedAccounts().filter(a => !(a.url === url && a.username === username));
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(accounts));
            this.displaySavedAccounts();
            DEBUG.info('STORAGE', 'Removed', { url, username });
        } catch (error) {
            DEBUG.error('STORAGE', 'Remove failed', error);
        }
    },
    
    displaySavedAccounts() {
        const container = document.getElementById('savedAccounts');
        if (!container) return;
        
        const accounts = this.getSavedAccounts();
        
        if (accounts.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        container.innerHTML = '<div class="saved-title">💾 Tài khoản đã lưu:</div>';
        
        accounts.sort((a, b) => b.lastLogin - a.lastLogin).forEach(acc => {
            const div = document.createElement('div');
            div.className = 'saved-account';
            div.innerHTML = `
                <div class="account-info">
                    <div class="account-name">👤 ${this.escapeHtml(acc.username)}</div>
                    <div class="account-server">🌐 ${this.escapeHtml(acc.url)}</div>
                </div>
                <button class="quick-login-btn" onclick='LoginModule.quickLogin("${this.escapeHtml(acc.url)}", "${this.escapeHtml(acc.username)}", "${acc.password}")'>
                    Đăng nhập
                </button>
                <button class="remove-btn" onclick='LoginModule.removeAccount("${this.escapeHtml(acc.url)}", "${this.escapeHtml(acc.username)}")'>
                    ✕
                </button>
            `;
            container.appendChild(div);
        });
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // ==================== UI HELPERS ====================
    getFormData() {
        return {
            url: document.getElementById('serverURL')?.value.trim() || '',
            username: document.getElementById('userName')?.value.trim() || '',
            password: document.getElementById('password')?.value || ''
        };
    },
    
    setAuthMessage(text, type = 'info') {
        const msg = document.getElementById('authMsg');
        if (!msg) return;
        
        const colors = { error: 'red', success: 'green', info: 'blue' };
        msg.style.color = colors[type];
        msg.textContent = text;
    },
    
    validateForm(data) {
        if (!data.url) {
            this.setAuthMessage('❌ Vui lòng nhập địa chỉ server!', 'error');
            return false;
        }
        if (!data.username || !data.password) {
            this.setAuthMessage('❌ Vui lòng điền đầy đủ thông tin!', 'error');
            return false;
        }
        return true;
    },
    
    setFormEnabled(enabled) {
        ['serverURL', 'userName', 'password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !enabled;
        });
        
        document.querySelectorAll('.auth-buttons button').forEach(btn => {
            btn.disabled = !enabled;
        });
    },
    
    // ==================== AUTHENTICATION FLOW ====================
    async authenticate(action) {
        if (this.authInProgress) {
            DEBUG.warn('AUTH', 'Already in progress');
            return;
        }
        
        const data = this.getFormData();
        if (!this.validateForm(data)) return;
        
        this.authInProgress = true;
        this.setFormEnabled(false);
        
        try {
            DEBUG.info('AUTH', `${action} started`, { url: data.url, username: data.username });
            
            // Store auth data for after connection
            this.pendingAuth = { action, data };
            
            // Connect to server
            this.setAuthMessage('🔌 Đang kết nối...', 'info');
            await ChatModule.connect(data.url);
            
            // Send auth request
            this.setAuthMessage(`⏳ Đang ${action === 'register' ? 'đăng ký' : 'đăng nhập'}...`, 'info');
            
            const payload = {
                action,
                user: data.username,
                pw: data.password
            };
            
            DEBUG.debug('AUTH', 'Sending payload', payload);
            ChatModule.ws.send(JSON.stringify(payload));
            
        } catch (error) {
            DEBUG.error('AUTH', 'Failed', error);
            this.setAuthMessage(`❌ ${error.message}`, 'error');
            this.authInProgress = false;
            this.pendingAuth = null;
            this.setFormEnabled(true);
            
            // Show user-friendly error
            if (error.message.includes('timeout')) {
                this.setAuthMessage('❌ Server không phản hồi. Kiểm tra lại URL.', 'error');
            } else {
                this.setAuthMessage('❌ Không thể kết nối. Kiểm tra lại địa chỉ server.', 'error');
            }
        }
    },
    
    async registerUser() {
        await this.authenticate('register');
    },
    
    async loginUser() {
        await this.authenticate('login');
    },
    
    async quickLogin(url, username, encodedPassword) {
        try {
            document.getElementById('serverURL').value = url;
            document.getElementById('userName').value = username;
            document.getElementById('password').value = atob(encodedPassword);
            await this.loginUser();
        } catch (error) {
            DEBUG.error('AUTH', 'Quick login failed', error);
            this.setAuthMessage('❌ Lỗi đăng nhập nhanh!', 'error');
        }
    },
    
    // ==================== RESPONSE HANDLERS ====================
    handleRegisterResponse(response) {
        this.authInProgress = false;
        this.setFormEnabled(true);
        
        DEBUG.info('AUTH', 'Register response', { ok: response.ok });
        
        if (response.ok) {
            this.setAuthMessage('✅ Đăng ký thành công! Hãy đăng nhập.', 'success');
            
            // Save account if remember me is checked
            if (this.pendingAuth && document.getElementById('rememberMe')?.checked) {
                const { data } = this.pendingAuth;
                this.saveAccount(data.url, data.username, data.password);
                this.displaySavedAccounts();
            }
        } else {
            this.setAuthMessage(response.msg || '❌ Đăng ký thất bại!', 'error');
            ChatModule.disconnect(); // Disconnect on failed registration
        }
        
        this.pendingAuth = null;
    },
    
    handleLoginResponse(response) {
        this.authInProgress = false;
        
        DEBUG.info('AUTH', 'Login response', { ok: response.ok, hasStats: !!response.stats });
        
        if (!response.ok) {
            this.setAuthMessage(response.msg || '❌ Đăng nhập thất bại!', 'error');
            this.setFormEnabled(true);
            ChatModule.disconnect(); // Disconnect on failed login
            this.pendingAuth = null;
            return;
        }
        
        // Login successful
        const { data } = this.pendingAuth || {};
        if (!data) {
            DEBUG.error('AUTH', 'No pending auth data');
            return;
        }
        
        ChatModule.currentUser = data.username;
        ChatModule.userStats = response.stats;
        
        // Save account if remember me is checked
        if (document.getElementById('rememberMe')?.checked) {
            this.saveAccount(data.url, data.username, data.password);
        }
        
        // Switch to chat view
        this.switchToChatView(data.username, response.stats);
        
        this.pendingAuth = null;
    },
    
    switchToChatView(username, stats) {
        const login = document.getElementById('login');
        const chat = document.getElementById('chat');
        const userInfo = document.getElementById('userInfo');
        
        if (login) login.style.display = 'none';
        if (chat) {
            chat.style.display = 'flex';
            chat.classList.add('active');
        }
        if (userInfo) userInfo.textContent = `👤 ${username}`;
        
        DEBUG.info('AUTH', 'Switched to chat view');
        
        // Welcome message
        ChatModule.displayServerMsg(
            `🎮 Chào mừng ${username}!\n` +
            `❤️ HP: ${stats.health}/${stats.max_health} | ⚔️ DMG: ${stats.damage} | 🌟 LV: ${stats.level}\n` +
            `Gõ /help để xem lệnh | /hideothers để ẩn/hiện tin nhắn server của người khác`,
            true
        );
        
        // Focus input
        setTimeout(() => {
            document.getElementById('messageInput')?.focus();
        }, 100);
        
        // Request initial messages
        if (ChatModule.ws?.readyState === WebSocket.OPEN) {
            ChatModule.ws.send(JSON.stringify({ action: 'poll' }));
            DEBUG.info('MSG', 'Requested initial messages');
        }
        
        // Re-enable form for potential logout
        this.setFormEnabled(true);
    },
    
    // ==================== LOGOUT ====================
    logout() {
        try {
            DEBUG.info('AUTH', 'Logging out');
            
            // Disconnect websocket
            ChatModule.disconnect();
            
            // Clear chat state
            ChatModule.currentUser = null;
            ChatModule.userStats = null;
            ChatModule.currentServerUrl = null;
            ChatModule.processedMessageIds.clear();
            ChatModule.hideOthersServerMsg = false;
            
            // Clear auth state
            this.authInProgress = false;
            this.pendingAuth = null;
            
            // Reset UI
            const login = document.getElementById('login');
            const chat = document.getElementById('chat');
            const messages = document.getElementById('messages');
            const messageInput = document.getElementById('messageInput');
            
            if (login) login.style.display = 'block';
            if (chat) {
                chat.style.display = 'none';
                chat.classList.remove('active');
            }
            if (messages) messages.innerHTML = '';
            if (messageInput) messageInput.value = '';
            
            this.setFormEnabled(true);
            this.setAuthMessage('', 'info');
            
            DEBUG.info('AUTH', 'Logout complete');
        } catch (error) {
            DEBUG.error('AUTH', 'Logout failed', error);
        }
    }
};

// ==================== GLOBAL EXPORTS ====================
window.LoginModule = LoginModule;
window.loginUser = () => LoginModule.loginUser();
window.registerUser = () => LoginModule.registerUser();
window.quickLogin = (url, username, pwd) => LoginModule.quickLogin(url, username, pwd);
window.removeAccount = (url, username) => LoginModule.removeAccount(url, username);
window.logout = () => LoginModule.logout();