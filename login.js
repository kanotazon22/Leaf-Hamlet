// ==================== LOGIN MODULE ====================
// Handles all authentication logic

const LoginModule = {
    // ==================== STORAGE ====================
    STORAGE_KEY: 'rpg_saved_accounts',
    
    saveAccount(url, username, password) {
        try {
            DEBUG.info('STORAGE', 'Saving account', { url, username });
            const accounts = this.getSavedAccounts();
            const existing = accounts.findIndex(acc => acc.url === url && acc.username === username);
            
            const accountData = {
                url: url,
                username: username,
                password: btoa(password),
                lastLogin: Date.now()
            };
            
            if (existing >= 0) {
                accounts[existing] = accountData;
                DEBUG.debug('STORAGE', 'Updated existing account');
            } else {
                accounts.push(accountData);
                DEBUG.debug('STORAGE', 'Added new account');
            }
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(accounts));
            DEBUG.info('STORAGE', 'Account saved successfully');
        } catch (e) {
            DEBUG.error('STORAGE', 'Failed to save account', e);
        }
    },
    
    getSavedAccounts() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            const accounts = data ? JSON.parse(data) : [];
            DEBUG.debug('STORAGE', `Loaded ${accounts.length} saved accounts`);
            return accounts;
        } catch (e) {
            DEBUG.error('STORAGE', 'Failed to load accounts', e);
            return [];
        }
    },
    
    removeAccount(url, username) {
        try {
            DEBUG.info('STORAGE', 'Removing account', { url, username });
            const accounts = this.getSavedAccounts();
            const filtered = accounts.filter(acc => !(acc.url === url && acc.username === username));
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
            this.displaySavedAccounts();
            DEBUG.info('STORAGE', 'Account removed successfully');
        } catch (e) {
            DEBUG.error('STORAGE', 'Failed to remove account', e);
        }
    },
    
    displaySavedAccounts() {
        try {
            const accounts = this.getSavedAccounts();
            const savedAccountsDiv = document.getElementById('savedAccounts');
            
            if (!savedAccountsDiv) {
                DEBUG.error('UI', 'savedAccounts element not found');
                return;
            }
            
            if (accounts.length === 0) {
                savedAccountsDiv.style.display = 'none';
                DEBUG.debug('UI', 'No saved accounts to display');
                return;
            }
            
            savedAccountsDiv.style.display = 'block';
            savedAccountsDiv.innerHTML = '<div class="saved-title">💾 Tài khoản đã lưu:</div>';
            
            accounts.sort((a, b) => b.lastLogin - a.lastLogin).forEach(acc => {
                const accountBtn = document.createElement('div');
                accountBtn.className = 'saved-account';
                accountBtn.innerHTML = `
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
                savedAccountsDiv.appendChild(accountBtn);
            });
            
            DEBUG.info('UI', `Displayed ${accounts.length} saved accounts`);
        } catch (e) {
            DEBUG.error('UI', 'Failed to display saved accounts', e);
        }
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // ==================== URL NORMALIZATION ====================
    // Flexible tunnel detection - no hardcoding
    
    TUNNEL_PATTERNS: [
        // Pattern: { regex, protocol, port }
        { regex: /\.tmole\.io$/i, protocol: 'wss', port: null },
        { regex: /\.trycloudflare\.com$/i, protocol: 'wss', port: null },
        { regex: /\.loca\.lt$/i, protocol: 'wss', port: null },
        { regex: /\.ngrok\.io$/i, protocol: 'wss', port: null },
        { regex: /\.serveo\.net$/i, protocol: 'wss', port: null },
        { regex: /\.pagekite\.me$/i, protocol: 'wss', port: null },
        { regex: /\.bore\.pub$/i, protocol: 'wss', port: null },
        { regex: /^localhost$/i, protocol: 'ws', port: 8766 },
        { regex: /^127\.0\.0\.1$/i, protocol: 'ws', port: 8766 },
        { regex: /^192\.168\./i, protocol: 'ws', port: 8766 },
        { regex: /^10\./i, protocol: 'ws', port: 8766 },
        { regex: /^172\.(1[6-9]|2[0-9]|3[0-1])\./i, protocol: 'ws', port: 8766 }
    ],
    
    normalizeServerUrl(serverInput) {
        try {
            DEBUG.debug('WEBSOCKET', 'Normalizing URL', { input: serverInput });
            
            // Already has protocol
            if (serverInput.startsWith('ws://') || serverInput.startsWith('wss://')) {
                DEBUG.info('WEBSOCKET', 'URL already has protocol');
                return serverInput;
            }
            
            // Remove any http/https prefix if present
            let cleanUrl = serverInput.replace(/^https?:\/\//i, '');
            
            // Check against all patterns
            for (const pattern of this.TUNNEL_PATTERNS) {
                if (pattern.regex.test(cleanUrl)) {
                    const wsUrl = pattern.port 
                        ? `${pattern.protocol}://${cleanUrl}:${pattern.port}`
                        : `${pattern.protocol}://${cleanUrl}`;
                    
                    DEBUG.info('WEBSOCKET', `Detected pattern: ${pattern.regex}`, {
                        protocol: pattern.protocol,
                        port: pattern.port,
                        result: wsUrl
                    });
                    
                    return wsUrl;
                }
            }
            
            // Default: assume it's a secure tunnel
            const wsUrl = `wss://${cleanUrl}`;
            DEBUG.warn('WEBSOCKET', 'No pattern matched, defaulting to wss://', { result: wsUrl });
            return wsUrl;
            
        } catch (e) {
            DEBUG.error('WEBSOCKET', 'Failed to normalize URL', e);
            throw e;
        }
    },
    
    // ==================== AUTHENTICATION ====================
    
    async quickLogin(url, username, encodedPassword) {
        try {
            DEBUG.info('AUTH', 'Quick login initiated', { url, username });
            document.getElementById('serverURL').value = url;
            document.getElementById('userName').value = username;
            document.getElementById('password').value = atob(encodedPassword);
            await this.loginUser();
        } catch (e) {
            DEBUG.error('AUTH', 'Quick login failed', e);
            const authMsg = document.getElementById('authMsg');
            if (authMsg) {
                authMsg.style.color = 'red';
                authMsg.textContent = '❌ Lỗi đăng nhập nhanh!';
            }
        }
    },
    
    async registerUser() {
        try {
            DEBUG.info('AUTH', '=== REGISTER STARTED ===');
            
            const url = document.getElementById('serverURL').value.trim();
            const user = document.getElementById('userName').value.trim();
            const pw = document.getElementById('password').value;
            const authMsg = document.getElementById('authMsg');

            DEBUG.debug('AUTH', 'Register data', { url, username: user, passwordLength: pw.length });

            if (!url) {
                DEBUG.warn('AUTH', 'Missing server URL');
                authMsg.style.color = 'red';
                authMsg.textContent = 'Vui lòng nhập địa chỉ server!';
                return;
            }

            if (!user || !pw) {
                DEBUG.warn('AUTH', 'Missing credentials');
                authMsg.style.color = 'red';
                authMsg.textContent = 'Vui lòng điền đầy đủ thông tin!';
                return;
            }

            DEBUG.info('AUTH', 'Connecting to server...');
            await ChatModule.connectWebSocket(url);
            
            const payload = {
                action: 'register',
                user: user,
                pw: pw
            };
            
            DEBUG.debug('AUTH', 'Sending register payload', payload);
            ChatModule.ws.send(JSON.stringify(payload));
            
            authMsg.style.color = 'blue';
            authMsg.textContent = '⏳ Đang đăng ký...';
            DEBUG.info('AUTH', 'Register request sent');
            
        } catch (error) {
            DEBUG.error('AUTH', 'Register failed', error);
            const authMsg = document.getElementById('authMsg');
            if (authMsg) {
                authMsg.style.color = 'red';
                authMsg.textContent = `❌ Lỗi: ${error.message}`;
            }
        }
    },
    
    handleRegisterResponse(response) {
        try {
            DEBUG.info('AUTH', 'Processing register response', response);
            const authMsg = document.getElementById('authMsg');
            
            if (response.ok) {
                DEBUG.info('AUTH', '✅ Registration successful');
                authMsg.style.color = 'green';
                authMsg.textContent = '✅ Đăng ký thành công! Hãy đăng nhập.';
                
                const rememberCheckbox = document.getElementById('rememberMe');
                if (rememberCheckbox && rememberCheckbox.checked) {
                    const url = document.getElementById('serverURL').value.trim();
                    const user = document.getElementById('userName').value.trim();
                    const pw = document.getElementById('password').value;
                    this.saveAccount(url, user, pw);
                    this.displaySavedAccounts();
                }
            } else {
                DEBUG.warn('AUTH', 'Registration failed', response.msg);
                authMsg.style.color = 'red';
                authMsg.textContent = response.msg || '❌ Đăng ký thất bại!';
            }
        } catch (e) {
            DEBUG.error('AUTH', 'Failed to handle register response', e);
        }
    },
    
    async loginUser() {
        try {
            DEBUG.info('AUTH', '=== LOGIN STARTED ===');
            
            const url = document.getElementById('serverURL').value.trim();
            const user = document.getElementById('userName').value.trim();
            const pw = document.getElementById('password').value;
            const authMsg = document.getElementById('authMsg');

            DEBUG.debug('AUTH', 'Login data', { url, username: user, passwordLength: pw.length });

            if (!url) {
                DEBUG.warn('AUTH', 'Missing server URL');
                authMsg.style.color = 'red';
                authMsg.textContent = 'Vui lòng nhập địa chỉ server!';
                return;
            }

            if (!user || !pw) {
                DEBUG.warn('AUTH', 'Missing credentials');
                authMsg.style.color = 'red';
                authMsg.textContent = 'Vui lòng điền đầy đủ thông tin!';
                return;
            }

            DEBUG.info('AUTH', 'Connecting to server...');
            await ChatModule.connectWebSocket(url);
            
            const payload = {
                action: 'login',
                user: user,
                pw: pw
            };
            
            DEBUG.debug('AUTH', 'Sending login payload', payload);
            ChatModule.ws.send(JSON.stringify(payload));
            
            authMsg.style.color = 'blue';
            authMsg.textContent = '⏳ Đang đăng nhập...';
            DEBUG.info('AUTH', 'Login request sent');
            
        } catch (error) {
            DEBUG.error('AUTH', 'Login failed', error);
            const authMsg = document.getElementById('authMsg');
            if (authMsg) {
                authMsg.style.color = 'red';
                authMsg.textContent = `❌ Lỗi: ${error.message}`;
            }
        }
    },
    
    handleLoginResponse(response) {
        try {
            DEBUG.info('AUTH', 'Processing login response', {
                ok: response.ok,
                hasStats: !!response.stats
            });
            
            const authMsg = document.getElementById('authMsg');
            
            if (response.ok) {
                const url = document.getElementById('serverURL').value.trim();
                const user = document.getElementById('userName').value.trim();
                const pw = document.getElementById('password').value;
                
                ChatModule.currentUser = user;
                ChatModule.userStats = response.stats;
                
                DEBUG.info('AUTH', '✅ Login successful', {
                    user: ChatModule.currentUser,
                    stats: ChatModule.userStats
                });
                
                const rememberCheckbox = document.getElementById('rememberMe');
                if (rememberCheckbox && rememberCheckbox.checked) {
                    this.saveAccount(url, user, pw);
                }
                
                // Switch to chat view
                const loginDiv = document.getElementById('login');
                const chatDiv = document.getElementById('chat');
                
                if (loginDiv) loginDiv.style.display = 'none';
                if (chatDiv) {
                    chatDiv.style.display = 'flex';
                    chatDiv.classList.add('active');
                }
                
                const userInfo = document.getElementById('userInfo');
                if (userInfo) {
                    userInfo.textContent = `👤 ${user}`;
                }
                
                DEBUG.info('UI', 'Switched to chat view');
                
                // Focus input
                setTimeout(() => {
                    const messageInput = document.getElementById('messageInput');
                    if (messageInput) {
                        messageInput.focus();
                        DEBUG.debug('UI', 'Input focused');
                    }
                }, 100);
                
                ChatModule.displayServerMessage(
                    `🎮 Chào mừng ${user}!\n` +
                    `❤️ HP: ${ChatModule.userStats.health}/${ChatModule.userStats.max_health}\n` +
                    `⚔️ DMG: ${ChatModule.userStats.damage} | 🌟 LV: ${ChatModule.userStats.level}\n` +
                    `Gõ /help để xem danh sách lệnh\n` +
                    `Gõ /hideothers để ẩn/hiện server response của người khác`,
                    true
                );
                
                // Request initial messages
                if (ChatModule.ws && ChatModule.ws.readyState === WebSocket.OPEN) {
                    DEBUG.info('MESSAGE', 'Requesting initial messages');
                    ChatModule.ws.send(JSON.stringify({ action: 'poll' }));
                }
                
            } else {
                DEBUG.warn('AUTH', 'Login failed', response.msg);
                authMsg.style.color = 'red';
                authMsg.textContent = response.msg || '❌ Đăng nhập thất bại!';
            }
        } catch (e) {
            DEBUG.error('AUTH', 'Failed to handle login response', e);
        }
    },
    
    logout() {
        try {
            DEBUG.info('AUTH', 'Logging out');
            
            if (ChatModule.ws) {
                ChatModule.ws.close();
                ChatModule.ws = null;
            }
            
            if (ChatModule.reconnectTimeout) {
                clearTimeout(ChatModule.reconnectTimeout);
                ChatModule.reconnectTimeout = null;
            }
            
            ChatModule.currentUser = null;
            ChatModule.userStats = null;
            ChatModule.currentServerUrl = null;
            ChatModule.processedMessageIds.clear();
            ChatModule.reconnectAttempts = 0;
            
            const loginDiv = document.getElementById('login');
            const chatDiv = document.getElementById('chat');
            const messagesContainer = document.getElementById('messages');
            const messageInput = document.getElementById('messageInput');
            
            if (loginDiv) loginDiv.style.display = 'block';
            if (chatDiv) {
                chatDiv.style.display = 'none';
                chatDiv.classList.remove('active');
            }
            if (messagesContainer) messagesContainer.innerHTML = '';
            if (messageInput) messageInput.value = '';
            
            DEBUG.info('AUTH', 'Logout complete');
        } catch (e) {
            DEBUG.error('AUTH', 'Failed to logout', e);
        }
    }
};

// Make globally accessible
window.LoginModule = LoginModule;
window.loginUser = () => LoginModule.loginUser();
window.registerUser = () => LoginModule.registerUser();
window.quickLogin = (url, username, encodedPassword) => LoginModule.quickLogin(url, username, encodedPassword);
window.removeAccount = (url, username) => LoginModule.removeAccount(url, username);
window.logout = () => LoginModule.logout();