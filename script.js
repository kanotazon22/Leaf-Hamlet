// ==================== DEBUG SYSTEM ====================
const DEBUG = {
    enabled: true,
    logLevel: 'ALL', // ALL, ERROR, WARN, INFO
    
    log(level, category, message, data = null) {
        if (!this.enabled) return;
        
        const levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
        const currentLevel = levels[this.logLevel] || 3;
        const msgLevel = levels[level] || 3;
        
        if (msgLevel > currentLevel) return;
        
        const timestamp = new Date().toLocaleTimeString('vi-VN');
        const emoji = {
            ERROR: '❌',
            WARN: '⚠️',
            INFO: 'ℹ️',
            DEBUG: '🔍'
        }[level] || '📝';
        
        const style = {
            ERROR: 'color: #ff4444; font-weight: bold',
            WARN: 'color: #ffaa00; font-weight: bold',
            INFO: 'color: #4444ff',
            DEBUG: 'color: #888888'
        }[level] || '';
        
        console.log(
            `%c[${timestamp}] ${emoji} ${category}`,
            style,
            message,
            data ? data : ''
        );
        
        // Display critical errors on UI
        if (level === 'ERROR') {
            this.showErrorOnUI(`${category}: ${message}`);
        }
    },
    
    error(category, message, error = null) {
        this.log('ERROR', category, message, error);
        if (error) {
            console.error('Stack trace:', error.stack);
        }
    },
    
    warn(category, message, data = null) {
        this.log('WARN', category, message, data);
    },
    
    info(category, message, data = null) {
        this.log('INFO', category, message, data);
    },
    
    debug(category, message, data = null) {
        this.log('DEBUG', category, message, data);
    },
    
    showErrorOnUI(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            font-size: 14px;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => errorDiv.remove(), 5000);
    }
};

// ==================== GLOBAL STATE ====================
let ws = null;
let currentUser = null;
let userStats = null;
let hideOthersServerMsg = false;
let commandMode = false;
let processedMessageIds = new Set();
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectTimeout = null;
let currentServerUrl = null;

// Cache DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const chatDiv = document.getElementById('chat');
const loginDiv = document.getElementById('login');
const authMsg = document.getElementById('authMsg');
const rememberCheckbox = document.getElementById('rememberMe');
const savedAccountsDiv = document.getElementById('savedAccounts');

DEBUG.info('INIT', 'Script loaded, DOM elements cached', {
    messagesContainer: !!messagesContainer,
    messageInput: !!messageInput,
    chatDiv: !!chatDiv,
    loginDiv: !!loginDiv
});

// ==================== LOCAL STORAGE ====================
const STORAGE_KEY = 'rpg_saved_accounts';

function saveAccount(url, username, password) {
    try {
        DEBUG.info('STORAGE', 'Saving account', { url, username });
        const accounts = getSavedAccounts();
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
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
        DEBUG.info('STORAGE', 'Account saved successfully');
    } catch (e) {
        DEBUG.error('STORAGE', 'Failed to save account', e);
    }
}

function getSavedAccounts() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        const accounts = data ? JSON.parse(data) : [];
        DEBUG.debug('STORAGE', `Loaded ${accounts.length} saved accounts`);
        return accounts;
    } catch (e) {
        DEBUG.error('STORAGE', 'Failed to load accounts', e);
        return [];
    }
}

function removeAccount(url, username) {
    try {
        DEBUG.info('STORAGE', 'Removing account', { url, username });
        const accounts = getSavedAccounts();
        const filtered = accounts.filter(acc => !(acc.url === url && acc.username === username));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        displaySavedAccounts();
        DEBUG.info('STORAGE', 'Account removed successfully');
    } catch (e) {
        DEBUG.error('STORAGE', 'Failed to remove account', e);
    }
}

function displaySavedAccounts() {
    try {
        const accounts = getSavedAccounts();
        
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
                    <div class="account-name">👤 ${escapeHtml(acc.username)}</div>
                    <div class="account-server">🌐 ${escapeHtml(acc.url)}</div>
                </div>
                <button class="quick-login-btn" onclick='quickLogin(\`${escapeHtml(acc.url)}\`, "${escapeHtml(acc.username)}", "${acc.password}")'>
                    Đăng nhập
                </button>
                <button class="remove-btn" onclick='removeAccount(\`${escapeHtml(acc.url)}\`, "${escapeHtml(acc.username)}")'>
                    ✕
                </button>
            `;
            savedAccountsDiv.appendChild(accountBtn);
        });
        
        DEBUG.info('UI', `Displayed ${accounts.length} saved accounts`);
    } catch (e) {
        DEBUG.error('UI', 'Failed to display saved accounts', e);
    }
}

function quickLogin(url, username, encodedPassword) {
    try {
        DEBUG.info('AUTH', 'Quick login initiated', { url, username });
        document.getElementById('serverURL').value = url;
        document.getElementById('userName').value = username;
        document.getElementById('password').value = atob(encodedPassword);
        loginUser();
    } catch (e) {
        DEBUG.error('AUTH', 'Quick login failed', e);
        authMsg.style.color = 'red';
        authMsg.textContent = '❌ Lỗi đăng nhập nhanh!';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== WEBSOCKET CONNECTION ====================
function normalizeServerUrl(serverInput) {
    try {
        DEBUG.debug('WEBSOCKET', 'Normalizing URL', { input: serverInput });
        
        let wsUrl;
        
        // Already has protocol
        if (serverInput.startsWith('ws://') || serverInput.startsWith('wss://')) {
            wsUrl = serverInput;
        }
        // Tmole tunnel (*.tmole.io)
        else if (serverInput.includes('.tmole.io')) {
            wsUrl = `wss://${serverInput}`;
            DEBUG.info('WEBSOCKET', 'Detected tmole tunnel');
        }
        // Cloudflare tunnel (*.trycloudflare.com)
        else if (serverInput.includes('.trycloudflare.com')) {
            wsUrl = `wss://${serverInput}`;
            DEBUG.info('WEBSOCKET', 'Detected Cloudflare tunnel');
        }
        // LocalTunnel (*.loca.lt)
        else if (serverInput.includes('.loca.lt')) {
            wsUrl = `wss://${serverInput}`;
            DEBUG.info('WEBSOCKET', 'Detected LocalTunnel');
        }
        // Localhost or local IP
        else if (serverInput === 'localhost' || 
                 serverInput.startsWith('192.168.') || 
                 serverInput.startsWith('10.') ||
                 serverInput.startsWith('172.')) {
            wsUrl = `ws://${serverInput}:8766`;
            DEBUG.info('WEBSOCKET', 'Detected local server');
        }
        // Default to secure WebSocket
        else {
            wsUrl = `wss://${serverInput}`;
            DEBUG.warn('WEBSOCKET', 'Unknown server type, using wss://');
        }
        
        DEBUG.info('WEBSOCKET', 'URL normalized', { output: wsUrl });
        return wsUrl;
        
    } catch (e) {
        DEBUG.error('WEBSOCKET', 'Failed to normalize URL', e);
        throw e;
    }
}

function connectWebSocket(serverInput) {
    return new Promise((resolve, reject) => {
        try {
            DEBUG.info('WEBSOCKET', 'Starting connection', { server: serverInput });
            
            const wsUrl = normalizeServerUrl(serverInput);
            currentServerUrl = serverInput;
            
            authMsg.style.color = 'blue';
            authMsg.textContent = `🔌 Đang kết nối tới ${serverInput}...`;
            
            ws = new WebSocket(wsUrl);
            
            DEBUG.debug('WEBSOCKET', 'WebSocket object created', {
                url: wsUrl,
                readyState: ws.readyState
            });
            
            const connectionTimeout = setTimeout(() => {
                if (ws && ws.readyState !== WebSocket.OPEN) {
                    DEBUG.error('WEBSOCKET', 'Connection timeout after 5s');
                    ws.close();
                    reject(new Error('Connection timeout - Server không phản hồi'));
                }
            }, 5000);
            
            ws.onopen = () => {
                clearTimeout(connectionTimeout);
                DEBUG.info('WEBSOCKET', '✅ Connected successfully', {
                    url: wsUrl,
                    readyState: ws.readyState
                });
                updateConnectionStatus(true);
                reconnectAttempts = 0;
                resolve(ws);
            };
            
            ws.onmessage = (event) => {
                try {
                    DEBUG.debug('WEBSOCKET', 'Message received', {
                        length: event.data.length,
                        preview: event.data.substring(0, 100)
                    });
                    handleWebSocketMessage(event.data);
                } catch (e) {
                    DEBUG.error('WEBSOCKET', 'Failed to handle message', e);
                }
            };
            
            ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                DEBUG.error('WEBSOCKET', 'Connection error', {
                    error: error,
                    readyState: ws.readyState,
                    url: wsUrl
                });
                
                authMsg.style.color = 'red';
                authMsg.textContent = '❌ Không thể kết nối! Kiểm tra URL server.';
                updateConnectionStatus(false);
                
                reject(new Error('WebSocket connection failed'));
            };
            
            ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                DEBUG.warn('WEBSOCKET', 'Connection closed', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean
                });
                updateConnectionStatus(false);
                
                if (currentUser && reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    DEBUG.info('WEBSOCKET', `Attempting reconnect ${reconnectAttempts}/${maxReconnectAttempts}`);
                    
                    reconnectTimeout = setTimeout(() => {
                        connectWebSocket(currentServerUrl).catch(err => {
                            DEBUG.error('WEBSOCKET', 'Reconnection failed', err);
                        });
                    }, 2000 * reconnectAttempts);
                } else if (reconnectAttempts >= maxReconnectAttempts) {
                    DEBUG.error('WEBSOCKET', 'Max reconnection attempts reached');
                }
            };
            
        } catch (error) {
            DEBUG.error('WEBSOCKET', 'Connection setup failed', error);
            reject(error);
        }
    });
}

function updateConnectionStatus(connected) {
    try {
        const statusDot = document.querySelector('#serverStatus .status-dot');
        const statusText = document.querySelector('#serverStatus .status-text');
        
        if (connected) {
            if (statusDot) statusDot.className = 'status-dot online';
            if (statusText) statusText.textContent = 'Đã kết nối';
            DEBUG.debug('UI', 'Status updated: ONLINE');
        } else {
            if (statusDot) statusDot.className = 'status-dot offline';
            if (statusText) statusText.textContent = 'Mất kết nối';
            DEBUG.debug('UI', 'Status updated: OFFLINE');
        }
    } catch (e) {
        DEBUG.error('UI', 'Failed to update connection status', e);
    }
}

function handleWebSocketMessage(data) {
    try {
        DEBUG.debug('MESSAGE', 'Parsing message');
        const message = JSON.parse(data);
        
        DEBUG.debug('MESSAGE', 'Message parsed', {
            action: message.action,
            id: message.id,
            hasError: !!message.error
        });
        
        if (message.error) {
            DEBUG.error('MESSAGE', 'Server returned error', message.error);
            displayServerMessage(`❌ Lỗi: ${message.error}`, true);
            return;
        }
        
        // Handle different message types
        if (message.action === 'register_response') {
            DEBUG.info('MESSAGE', 'Register response received');
            handleRegisterResponse(message);
        } else if (message.action === 'login_response') {
            DEBUG.info('MESSAGE', 'Login response received');
            handleLoginResponse(message);
        } else if (message.action === 'poll_response') {
            DEBUG.info('MESSAGE', 'Poll response received', {
                messageCount: message.messages?.length || 0
            });
            handlePollResponse(message);
        } else if (message.id) {
            DEBUG.debug('MESSAGE', 'Broadcast message received');
            handleBroadcastMessage(message);
        } else {
            DEBUG.warn('MESSAGE', 'Unknown message type', message);
        }
    } catch (error) {
        DEBUG.error('MESSAGE', 'Failed to parse/handle message', error);
    }
}

function handleBroadcastMessage(msg) {
    if (processedMessageIds.has(msg.id)) {
        DEBUG.debug('MESSAGE', 'Message already processed', { id: msg.id });
        return;
    }
    
    try {
        DEBUG.debug('MESSAGE', 'Processing broadcast', {
            id: msg.id,
            from: msg.name,
            isServer: msg.isServer,
            isCommand: msg.isCommand
        });
        
        if (msg.isServer) {
            const isForMe = msg.targetUser === currentUser;
            if (hideOthersServerMsg && !isForMe) {
                processedMessageIds.add(msg.id);
                DEBUG.debug('MESSAGE', 'Server message hidden (not for me)');
                return;
            }
            displayServerMessage(msg.msg, isForMe);
        } else if (msg.name !== currentUser) {
            displayPlayerMessage(msg.name, msg.msg, msg.isCommand);
        }
        
        processedMessageIds.add(msg.id);
        
        // Cleanup old message IDs
        if (processedMessageIds.size > 200) {
            const idsArray = Array.from(processedMessageIds).sort((a, b) => b - a);
            processedMessageIds = new Set(idsArray.slice(0, 150));
            DEBUG.debug('MESSAGE', 'Cleaned up old message IDs');
        }
    } catch (e) {
        DEBUG.error('MESSAGE', 'Failed to handle broadcast', e);
    }
}

function handlePollResponse(data) {
    try {
        const messages = data.messages || [];
        DEBUG.info('MESSAGE', `Processing ${messages.length} poll messages`);
        messages.forEach(msg => {
            handleBroadcastMessage(msg);
        });
    } catch (e) {
        DEBUG.error('MESSAGE', 'Failed to handle poll response', e);
    }
}

// ==================== AUTH FUNCTIONS ====================
function encryptMessage(text) {
    try {
        const encrypted = [...text].map(char => 
            String.fromCharCode(char.charCodeAt(0) ^ 42)
        ).join('');
        DEBUG.debug('CRYPTO', 'Message encrypted', { length: text.length });
        return encrypted;
    } catch (e) {
        DEBUG.error('CRYPTO', 'Failed to encrypt message', e);
        throw e;
    }
}

async function registerUser() {
    try {
        DEBUG.info('AUTH', '=== REGISTER STARTED ===');
        
        const url = document.getElementById('serverURL').value.trim();
        const user = document.getElementById('userName').value.trim();
        const pw = document.getElementById('password').value;

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
        await connectWebSocket(url);
        
        const payload = {
            action: 'register',
            user: user,
            pw: pw
        };
        
        DEBUG.debug('AUTH', 'Sending register payload', payload);
        ws.send(JSON.stringify(payload));
        
        authMsg.style.color = 'blue';
        authMsg.textContent = '⏳ Đang đăng ký...';
        DEBUG.info('AUTH', 'Register request sent');
        
    } catch (error) {
        DEBUG.error('AUTH', 'Register failed', error);
        authMsg.style.color = 'red';
        authMsg.textContent = `❌ Lỗi: ${error.message}`;
    }
}

function handleRegisterResponse(response) {
    try {
        DEBUG.info('AUTH', 'Processing register response', response);
        
        if (response.ok) {
            DEBUG.info('AUTH', '✅ Registration successful');
            authMsg.style.color = 'green';
            authMsg.textContent = '✅ Đăng ký thành công! Hãy đăng nhập.';
            
            if (rememberCheckbox && rememberCheckbox.checked) {
                const url = document.getElementById('serverURL').value.trim();
                const user = document.getElementById('userName').value.trim();
                const pw = document.getElementById('password').value;
                saveAccount(url, user, pw);
                displaySavedAccounts();
            }
        } else {
            DEBUG.warn('AUTH', 'Registration failed', response.msg);
            authMsg.style.color = 'red';
            authMsg.textContent = response.msg || '❌ Đăng ký thất bại!';
        }
    } catch (e) {
        DEBUG.error('AUTH', 'Failed to handle register response', e);
    }
}

async function loginUser() {
    try {
        DEBUG.info('AUTH', '=== LOGIN STARTED ===');
        
        const url = document.getElementById('serverURL').value.trim();
        const user = document.getElementById('userName').value.trim();
        const pw = document.getElementById('password').value;

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
        await connectWebSocket(url);
        
        const payload = {
            action: 'login',
            user: user,
            pw: pw
        };
        
        DEBUG.debug('AUTH', 'Sending login payload', payload);
        ws.send(JSON.stringify(payload));
        
        authMsg.style.color = 'blue';
        authMsg.textContent = '⏳ Đang đăng nhập...';
        DEBUG.info('AUTH', 'Login request sent');
        
    } catch (error) {
        DEBUG.error('AUTH', 'Login failed', error);
        authMsg.style.color = 'red';
        authMsg.textContent = `❌ Lỗi: ${error.message}`;
    }
}

function handleLoginResponse(response) {
    try {
        DEBUG.info('AUTH', 'Processing login response', {
            ok: response.ok,
            hasStats: !!response.stats
        });
        
        if (response.ok) {
            const url = document.getElementById('serverURL').value.trim();
            const user = document.getElementById('userName').value.trim();
            const pw = document.getElementById('password').value;
            
            currentUser = user;
            userStats = response.stats;
            
            DEBUG.info('AUTH', '✅ Login successful', {
                user: currentUser,
                stats: userStats
            });
            
            if (rememberCheckbox && rememberCheckbox.checked) {
                saveAccount(url, user, pw);
            }
            
            // Switch to chat view
            loginDiv.style.display = 'none';
            chatDiv.style.display = 'flex';
            chatDiv.classList.add('active');
            
            const userInfo = document.getElementById('userInfo');
            if (userInfo) {
                userInfo.textContent = `👤 ${user}`;
            }
            
            DEBUG.info('UI', 'Switched to chat view');
            
            // Focus input
            setTimeout(() => {
                if (messageInput) {
                    messageInput.focus();
                    DEBUG.debug('UI', 'Input focused');
                }
            }, 100);
            
            displayServerMessage(
                `🎮 Chào mừng ${user}!\n` +
                `❤️ HP: ${userStats.health}/${userStats.max_health}\n` +
                `⚔️ DMG: ${userStats.damage} | 🌟 LV: ${userStats.level}\n` +
                `Gõ /help để xem danh sách lệnh\n` +
                `Gõ /hideothers để ẩn/hiện server response của người khác`,
                true
            );
            
            // Request initial messages
            if (ws && ws.readyState === WebSocket.OPEN) {
                DEBUG.info('MESSAGE', 'Requesting initial messages');
                ws.send(JSON.stringify({ action: 'poll' }));
            }
            
        } else {
            DEBUG.warn('AUTH', 'Login failed', response.msg);
            authMsg.style.color = 'red';
            authMsg.textContent = response.msg || '❌ Đăng nhập thất bại!';
        }
    } catch (e) {
        DEBUG.error('AUTH', 'Failed to handle login response', e);
    }
}

function logout() {
    try {
        DEBUG.info('AUTH', 'Logging out');
        
        if (ws) {
            ws.close();
            ws = null;
        }
        
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        currentUser = null;
        userStats = null;
        currentServerUrl = null;
        processedMessageIds.clear();
        reconnectAttempts = 0;
        
        loginDiv.style.display = 'block';
        chatDiv.style.display = 'none';
        chatDiv.classList.remove('active');
        messagesContainer.innerHTML = '';
        messageInput.value = '';
        
        DEBUG.info('AUTH', 'Logout complete');
    } catch (e) {
        DEBUG.error('AUTH', 'Failed to logout', e);
    }
}

// ==================== MESSAGE DISPLAY ====================
function displayPlayerMessage(sender, text, isCommand = false) {
    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message other';
        
        if (isCommand) {
            messageDiv.classList.add('command');
        }

        const nameDiv = document.createElement('div');
        nameDiv.className = 'sender-name';
        nameDiv.textContent = sender;
        messageDiv.appendChild(nameDiv);

        const textNode = document.createTextNode(text);
        messageDiv.appendChild(textNode);

        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
        
        DEBUG.debug('UI', 'Player message displayed', { sender, isCommand });
    } catch (e) {
        DEBUG.error('UI', 'Failed to display player message', e);
    }
}

function displayServerMessage(text, isForMe) {
    try {
        const messageDiv = document.createElement('div');
        
        if (isForMe) {
            messageDiv.className = 'message server-me';
        } else {
            messageDiv.className = 'message server-other';
        }
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'sender-name';
        nameDiv.textContent = 'SERVER';
        messageDiv.appendChild(nameDiv);

        const lines = text.split('\n');
        lines.forEach((line, index) => {
            messageDiv.appendChild(document.createTextNode(line));
            if (index < lines.length - 1) {
                messageDiv.appendChild(document.createElement('br'));
            }
        });

        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
        
        DEBUG.debug('UI', 'Server message displayed', { isForMe, lines: lines.length });
    } catch (e) {
        DEBUG.error('UI', 'Failed to display server message', e);
    }
}

function displayMyMessage(text) {
    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message me';
        
        if (text.startsWith('/')) {
            messageDiv.classList.add('command');
        }
        
        messageDiv.textContent = text;

        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
        
        DEBUG.debug('UI', 'My message displayed');
    } catch (e) {
        DEBUG.error('UI', 'Failed to display my message', e);
    }
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// ==================== MESSAGE SENDING ====================
function handleClientCommand(message) {
    try {
        if (message === '/hideothers') {
            hideOthersServerMsg = !hideOthersServerMsg;
            const status = hideOthersServerMsg ? 'ẨN' : 'HIỆN';
            displayServerMessage(
                `🔔 Đã ${status} server response của người khác`,
                true
            );
            DEBUG.info('COMMAND', `Hide others: ${status}`);
            return true;
        }
        
        if (message === '/debug') {
            DEBUG.enabled = !DEBUG.enabled;
            const status = DEBUG.enabled ? 'BẬT' : 'TẮT';
            displayServerMessage(`🔧 Debug mode: ${status}`, true);
            DEBUG.info('COMMAND', `Debug mode: ${status}`);
            return true;
        }
        
        return false;
    } catch (e) {
        DEBUG.error('COMMAND', 'Failed to handle client command', e);
        return false;
    }
}

function sendMessage() {
    try {
        const message = messageInput.value.trim();
        
        if (!message) {
            DEBUG.debug('MESSAGE', 'Empty message, ignoring');
            return;
        }
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            DEBUG.error('MESSAGE', 'Cannot send - WebSocket not connected', {
                hasWs: !!ws,
                readyState: ws?.readyState
            });
            displayServerMessage('❌ Không thể gửi - chưa kết nối!', true);
            return;
        }

        if (handleClientCommand(message)) {
            messageInput.value = '';
            if (commandMode) {
                messageInput.value = '/';
            }
            messageInput.focus();
            return;
        }

        DEBUG.debug('MESSAGE', 'Sending message', { 
            message, 
            isCommand: message.startsWith('/') 
        });

        displayMyMessage(message);
        
        const isCommand = message.startsWith('/');
        
        messageInput.value = '';
        
        if (isCommand) {
            messageInput.value = '/';
            commandMode = true;
        }
        
        messageInput.focus();

        try {
            const payload = {
                action: 'send',
                msg: encryptMessage(message)
            };
            
            DEBUG.debug('MESSAGE', 'Sending payload', payload);
            ws.send(JSON.stringify(payload));
            DEBUG.info('MESSAGE', 'Message sent successfully');
            
        } catch (e) {
            DEBUG.error('MESSAGE', 'Failed to send message', e);
            displayServerMessage('❌ Lỗi gửi tin nhắn!', true);
        }
    } catch (e) {
        DEBUG.error('MESSAGE', 'sendMessage function failed', e);
    }
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Command mode detection
if (messageInput) {
    messageInput.addEventListener('input', function() {
        const value = this.value;
        if (commandMode && !value.startsWith('/')) {
            commandMode = false;
        }
        if (!commandMode && value === '/') {
            commandMode = true;
        }
    });
}

// ==================== INITIALIZATION ====================
window.addEventListener('load', () => {
    DEBUG.info('INIT', '=== APPLICATION LOADED ===');
    DEBUG.info('INIT', 'User Agent', navigator.userAgent);
    DEBUG.info('INIT', 'WebSocket support', 'WebSocket' in window);
    
    displaySavedAccounts();
    
    DEBUG.info('INIT', 'Initialization complete');
});

window.addEventListener('beforeunload', () => {
    DEBUG.info('INIT', 'Page unloading, closing connections');
    if (ws) {
        ws.close();
    }
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }
});

// Prevent page zoom on double tap (mobile optimization)
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Global error handler
window.addEventListener('error', (event) => {
    DEBUG.error('GLOBAL', 'Uncaught error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });
});

window.addEventListener('unhandledrejection', (event) => {
    DEBUG.error('GLOBAL', 'Unhandled promise rejection', {
        reason: event.reason,
        promise: event.promise
    });
});

// Make functions globally accessible
window.quickLogin = quickLogin;
window.removeAccount = removeAccount;
window.loginUser = loginUser;
window.registerUser = registerUser;
window.sendMessage = sendMessage;
window.handleEnter = handleEnter;
window.logout = logout;
window.DEBUG = DEBUG;

DEBUG.info('INIT', '=== SCRIPT INITIALIZATION COMPLETE ===');
DEBUG.info('INIT', 'Available commands: /hideothers, /debug');
DEBUG.info('INIT', 'Supported tunnels: tmole.io, trycloudflare.com, loca.lt, localhost');