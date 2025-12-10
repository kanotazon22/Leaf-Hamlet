// ==================== CONFIGURATION ====================
const SERVER_URL = 'xomnhala1.loca.lt'; // Thay đổi URL server tại đây

// ==================== GLOBAL STATE ====================
let ws = null;
let currentUser = null;
let userStats = null;
let hideOthersServerMsg = false;
let commandMode = false;
let processedMessageIds = new Set();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimeout = null;
let isManualDisconnect = false;

// Ping tracking
let pingStats = {
    current: null,
    min: Infinity,
    max: -Infinity,
    history: [],
    maxHistory: 20
};
let lastPingTime = null;
let pingTimeout = null;

// ==================== DOM ELEMENTS ====================
const elements = {
    messages: document.getElementById('messages'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    chat: document.getElementById('chat'),
    login: document.getElementById('login'),
    authMsg: document.getElementById('authMsg'),
    userName: document.getElementById('userName'),
    password: document.getElementById('password'),
    rememberMe: document.getElementById('rememberMe'),
    savedAccounts: document.getElementById('savedAccounts'),
    userInfo: document.getElementById('userInfo'),
    statusDot: document.querySelector('#serverStatus .status-dot'),
    statusText: document.querySelector('#serverStatus .status-text')
};

// ==================== LOCAL STORAGE ====================
const STORAGE_KEY = 'rpg_saved_accounts';

function saveAccount(username, password) {
    if (!elements.rememberMe?.checked) return;
    
    try {
        const accounts = getSavedAccounts();
        const existing = accounts.findIndex(acc => 
            acc.url === SERVER_URL && acc.username === username
        );
        
        const accountData = {
            url: SERVER_URL,
            username: username,
            password: btoa(password),
            lastLogin: Date.now()
        };
        
        if (existing >= 0) {
            accounts[existing] = accountData;
        } else {
            accounts.push(accountData);
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) {
        console.error('Error saving account:', e);
    }
}

function getSavedAccounts() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error loading accounts:', e);
        return [];
    }
}

function removeAccount(username) {
    try {
        const accounts = getSavedAccounts();
        const filtered = accounts.filter(acc => 
            !(acc.url === SERVER_URL && acc.username === username)
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        displaySavedAccounts();
    } catch (e) {
        console.error('Error removing account:', e);
    }
}

function displaySavedAccounts() {
    const accounts = getSavedAccounts().filter(acc => acc.url === SERVER_URL);
    
    if (accounts.length === 0) {
        elements.savedAccounts.style.display = 'none';
        return;
    }
    
    elements.savedAccounts.style.display = 'block';
    elements.savedAccounts.innerHTML = '<div class="saved-title">💾 Tài khoản đã lưu:</div>';
    
    accounts.sort((a, b) => b.lastLogin - a.lastLogin).forEach(acc => {
        const div = document.createElement('div');
        div.className = 'saved-account';
        div.innerHTML = `
            <div class="account-info">
                <div class="account-name">👤 ${escapeHtml(acc.username)}</div>
                <div class="account-server">🌐 ${escapeHtml(SERVER_URL)}</div>
            </div>
            <button class="quick-login-btn" onclick='quickLogin("${escapeHtml(acc.username)}", "${acc.password}")'>
                Đăng nhập
            </button>
            <button class="remove-btn" onclick='removeAccount("${escapeHtml(acc.username)}")'>
                ✕
            </button>
        `;
        elements.savedAccounts.appendChild(div);
    });
}

function quickLogin(username, encodedPassword) {
    try {
        elements.userName.value = username;
        elements.password.value = atob(encodedPassword);
        loginUser();
    } catch (e) {
        console.error('Error in quick login:', e);
        showAuthMessage('❌ Lỗi đăng nhập nhanh!', 'red');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== PING FUNCTIONS ====================
function sendPing() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        displayServerMessage('❌ Không có kết nối để ping!', true);
        return;
    }
    
    lastPingTime = performance.now();
    
    // Send a simple ping message
    ws.send(JSON.stringify({
        action: 'ping',
        timestamp: lastPingTime
    }));
    
    // Set timeout for ping response
    if (pingTimeout) clearTimeout(pingTimeout);
    pingTimeout = setTimeout(() => {
        displayServerMessage('⏱️ Ping timeout (>5000ms)', true);
        lastPingTime = null;
    }, 5000);
}

function handlePingResponse() {
    if (!lastPingTime) return;
    
    if (pingTimeout) clearTimeout(pingTimeout);
    
    const pingTime = performance.now() - lastPingTime;
    lastPingTime = null;
    
    // Update ping stats
    pingStats.current = pingTime;
    pingStats.history.push(pingTime);
    
    if (pingTime < pingStats.min) pingStats.min = pingTime;
    if (pingTime > pingStats.max) pingStats.max = pingTime;
    
    // Keep only recent history
    if (pingStats.history.length > pingStats.maxHistory) {
        pingStats.history.shift();
    }
    
    // Calculate average
    const avg = pingStats.history.reduce((a, b) => a + b, 0) / pingStats.history.length;
    
    // Display ping results
    const pingMessage = 
        `📡 PING STATISTICS\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Current: ${pingTime.toFixed(2)}ms\n` +
        `Min: ${pingStats.min.toFixed(2)}ms\n` +
        `Max: ${pingStats.max.toFixed(2)}ms\n` +
        `Avg: ${avg.toFixed(2)}ms\n` +
        `Samples: ${pingStats.history.length}`;
    
    displayServerMessage(pingMessage, true);
}

function resetPingStats() {
    pingStats = {
        current: null,
        min: Infinity,
        max: -Infinity,
        history: [],
        maxHistory: 20
    };
}

// ==================== CONNECTION STATUS ====================
function updateConnectionStatus(connected, message = '') {
    if (!elements.statusDot || !elements.statusText) return;
    
    if (connected) {
        elements.statusDot.className = 'status-dot online';
        elements.statusText.textContent = message || 'Đã kết nối';
    } else {
        elements.statusDot.className = 'status-dot offline';
        elements.statusText.textContent = message || 'Mất kết nối';
    }
}

function showAuthMessage(text, color = 'blue') {
    if (elements.authMsg) {
        elements.authMsg.style.color = color;
        elements.authMsg.textContent = text;
    }
}

function showSystemMessage(text, type = 'info') {
    const colors = {
        info: '#1a73e8',
        warning: '#f59e0b',
        error: '#ef4444',
        success: '#10b981'
    };
    
    const icons = {
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌',
        success: '✅'
    };
    
    displayServerMessage(`${icons[type]} ${text}`, true);
}

// ==================== WEBSOCKET CONNECTION ====================
function connectWebSocket() {
    return new Promise((resolve, reject) => {
        try {
            const wsUrl = `wss://${SERVER_URL}`;
            
            console.log('🔌 Connecting to:', wsUrl);
            showAuthMessage(`🔌 Đang kết nối tới ${SERVER_URL}...`);
            
            ws = new WebSocket(wsUrl);
            
            const connectionTimeout = setTimeout(() => {
                if (ws && ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
            
            ws.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('✅ WebSocket connected');
                updateConnectionStatus(true);
                reconnectAttempts = 0;
                resetPingStats();
                
                if (currentUser) {
                    showSystemMessage('Đã kết nối lại server!', 'success');
                }
                
                resolve(ws);
            };
            
            ws.onmessage = (event) => {
                try {
                    handleWebSocketMessage(event.data);
                } catch (e) {
                    console.error('Error handling message:', e);
                }
            };
            
            ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.error('❌ WebSocket error:', error);
                updateConnectionStatus(false, 'Lỗi kết nối');
            };
            
            ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                console.log('🔌 WebSocket disconnected');
                updateConnectionStatus(false, 'Mất kết nối');
                
                // Only reconnect if logged in and not manual disconnect
                if (currentUser && !isManualDisconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
                    
                    showSystemMessage(
                        `Mất kết nối! Đang thử kết nối lại (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
                        'warning'
                    );
                    
                    reconnectTimeout = setTimeout(() => {
                        console.log(`🔄 Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                        connectWebSocket()
                            .then(() => {
                                // Re-login after reconnect
                                if (currentUser) {
                                    const pw = elements.password.value;
                                    if (pw) {
                                        ws.send(JSON.stringify({
                                            action: 'login',
                                            user: currentUser,
                                            pw: pw
                                        }));
                                    }
                                }
                            })
                            .catch(err => {
                                console.error('Reconnect failed:', err);
                                if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                                    showSystemMessage(
                                        'Không thể kết nối lại! Vui lòng tải lại trang.',
                                        'error'
                                    );
                                }
                            });
                    }, delay);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    showSystemMessage(
                        'Đã mất kết nối! Vui lòng tải lại trang để kết nối lại.',
                        'error'
                    );
                }
            };
            
        } catch (error) {
            reject(error);
        }
    });
}

function handleWebSocketMessage(data) {
    try {
        const message = JSON.parse(data);
        
        // Handle ping response
        if (message.action === 'pong' || message.action === 'ping') {
            handlePingResponse();
            return;
        }
        
        switch (message.action) {
            case 'register_response':
                handleRegisterResponse(message);
                break;
            case 'login_response':
                handleLoginResponse(message);
                break;
            case 'poll_response':
                // Skip old messages - don't process poll_response
                console.log('Skipping old messages from server');
                break;
            default:
                if (message.id) {
                    handleBroadcastMessage(message);
                }
        }
    } catch (error) {
        console.error('Error parsing message:', error);
    }
}

function handleBroadcastMessage(msg) {
    if (processedMessageIds.has(msg.id)) return;
    
    try {
        if (msg.isServer) {
            const isForMe = msg.targetUser === currentUser;
            if (hideOthersServerMsg && !isForMe) {
                processedMessageIds.add(msg.id);
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
        }
    } catch (e) {
        console.error('Error handling broadcast:', e);
    }
}

// ==================== AUTH FUNCTIONS ====================
function encryptMessage(text) {
    return [...text].map(char => 
        String.fromCharCode(char.charCodeAt(0) ^ 42)
    ).join('');
}

async function registerUser() {
    const user = elements.userName.value.trim();
    const pw = elements.password.value;

    if (!user || !pw) {
        showAuthMessage('Vui lòng điền đầy đủ thông tin!', 'red');
        return;
    }

    try {
        await connectWebSocket();
        
        ws.send(JSON.stringify({
            action: 'register',
            user: user,
            pw: pw
        }));
        
        showAuthMessage('⏳ Đang đăng ký...');
        
    } catch (error) {
        showAuthMessage('❌ Không thể kết nối server!', 'red');
        console.error(error);
    }
}

function handleRegisterResponse(response) {
    if (response.ok) {
        showAuthMessage('✅ Đăng ký thành công! Hãy đăng nhập.', 'green');
        
        const user = elements.userName.value.trim();
        const pw = elements.password.value;
        saveAccount(user, pw);
        displaySavedAccounts();
    } else {
        showAuthMessage(response.msg || '❌ Đăng ký thất bại!', 'red');
    }
}

async function loginUser() {
    const user = elements.userName.value.trim();
    const pw = elements.password.value;

    if (!user || !pw) {
        showAuthMessage('Vui lòng điền đầy đủ thông tin!', 'red');
        return;
    }

    try {
        await connectWebSocket();
        
        ws.send(JSON.stringify({
            action: 'login',
            user: user,
            pw: pw
        }));
        
        showAuthMessage('⏳ Đang đăng nhập...');
        
    } catch (error) {
        showAuthMessage('❌ Không thể kết nối server!', 'red');
        console.error(error);
    }
}

function handleLoginResponse(response) {
    if (response.ok) {
        const user = elements.userName.value.trim();
        const pw = elements.password.value;
        
        currentUser = user;
        userStats = response.stats;
        isManualDisconnect = false;
        
        saveAccount(user, pw);
        
        // Switch to chat view
        elements.login.style.display = 'none';
        elements.chat.style.display = 'flex';
        elements.chat.classList.add('active');
        
        if (elements.userInfo) {
            elements.userInfo.textContent = `👤 ${user}`;
        }
        
        // Focus input
        setTimeout(() => {
            if (elements.messageInput) {
                elements.messageInput.focus();
            }
        }, 100);
        
        displayServerMessage(
            `🎮 Chào mừng ${user}!\n` +
            `❤️ HP: ${userStats.health}/${userStats.max_health}\n` +
            `⚔️ DMG: ${userStats.damage} | 🌟 LV: ${userStats.level}\n` +
            `Gõ /help để xem danh sách lệnh\n` +
            `Gõ /hideothers để ẩn/hiện server response của người khác\n` +
            `Gõ /ping để kiểm tra độ trễ kết nối`,
            true
        );
        
        // DON'T request old messages - fresh start
        console.log('Login successful - starting fresh (no old messages)');
        
    } else {
        showAuthMessage(response.msg || '❌ Đăng nhập thất bại!', 'red');
    }
}

function logout() {
    isManualDisconnect = true;
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    if (pingTimeout) {
        clearTimeout(pingTimeout);
        pingTimeout = null;
    }
    
    currentUser = null;
    userStats = null;
    processedMessageIds.clear();
    reconnectAttempts = 0;
    resetPingStats();
    
    elements.login.style.display = 'block';
    elements.chat.style.display = 'none';
    elements.chat.classList.remove('active');
    elements.messages.innerHTML = '';
    elements.messageInput.value = '';
    
    updateConnectionStatus(false, 'Đã đăng xuất');
}

// ==================== MESSAGE DISPLAY ====================
function displayPlayerMessage(sender, text, isCommand = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message other';
    
    if (isCommand) {
        messageDiv.classList.add('command');
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'sender-name';
    nameDiv.textContent = sender;
    messageDiv.appendChild(nameDiv);

    messageDiv.appendChild(document.createTextNode(text));

    elements.messages.appendChild(messageDiv);
    scrollToBottom();
}

function displayServerMessage(text, isForMe) {
    const messageDiv = document.createElement('div');
    messageDiv.className = isForMe ? 'message server-me' : 'message server-other';
    
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

    elements.messages.appendChild(messageDiv);
    scrollToBottom();
}

function displayMyMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message me';
    
    if (text.startsWith('/')) {
        messageDiv.classList.add('command');
    }
    
    messageDiv.textContent = text;

    elements.messages.appendChild(messageDiv);
    scrollToBottom();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        elements.messages.scrollTop = elements.messages.scrollHeight;
    });
}

// ==================== MESSAGE SENDING ====================
function handleClientCommand(message) {
    if (message === '/hideothers') {
        hideOthersServerMsg = !hideOthersServerMsg;
        const status = hideOthersServerMsg ? 'ẨN' : 'HIỆN';
        displayServerMessage(
            `🔔 Đã ${status} server response của người khác`,
            true
        );
        return true;
    }
    
    if (message === '/ping') {
        sendPing();
        return true;
    }
    
    return false;
}

function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showSystemMessage('Không có kết nối! Đang thử kết nối lại...', 'warning');
        }
        return;
    }

    if (handleClientCommand(message)) {
        elements.messageInput.value = '';
        if (commandMode) {
            elements.messageInput.value = '/';
        }
        elements.messageInput.focus();
        return;
    }

    displayMyMessage(message);
    
    const isCommand = message.startsWith('/');
    
    elements.messageInput.value = '';
    
    if (isCommand) {
        elements.messageInput.value = '/';
        commandMode = true;
    }
    
    elements.messageInput.focus();

    try {
        ws.send(JSON.stringify({
            action: 'send',
            msg: encryptMessage(message)
        }));
    } catch (e) {
        console.error('Error sending message:', e);
        showSystemMessage('Lỗi gửi tin nhắn!', 'error');
    }
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Command mode detection
if (elements.messageInput) {
    elements.messageInput.addEventListener('input', function() {
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
    displaySavedAccounts();
    console.log(`🌐 Configured server: ${SERVER_URL}`);
});

window.addEventListener('beforeunload', () => {
    isManualDisconnect = true;
    if (ws) {
        ws.close();
    }
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }
    if (pingTimeout) {
        clearTimeout(pingTimeout);
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

// Make functions globally accessible
window.quickLogin = quickLogin;
window.removeAccount = removeAccount;
window.loginUser = loginUser;
window.registerUser = registerUser;
window.sendMessage = sendMessage;
window.handleEnter = handleEnter;
window.logout = logout;