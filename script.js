let ws = null;
let currentUser = null;
let userStats = null;
let hideOthersServerMsg = false;
let commandMode = false;
let processedMessageIds = new Set();
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectTimeout = null;

// Cache DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const chatDiv = document.getElementById('chat');
const loginDiv = document.getElementById('login');
const authMsg = document.getElementById('authMsg');
const rememberCheckbox = document.getElementById('rememberMe');
const savedAccountsDiv = document.getElementById('savedAccounts');

// ==================== LOCAL STORAGE ====================
const STORAGE_KEY = 'rpg_saved_accounts';

function saveAccount(url, username, password) {
    try {
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

function removeAccount(url, username) {
    try {
        const accounts = getSavedAccounts();
        const filtered = accounts.filter(acc => !(acc.url === url && acc.username === username));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        displaySavedAccounts();
    } catch (e) {
        console.error('Error removing account:', e);
    }
}

function displaySavedAccounts() {
    const accounts = getSavedAccounts();
    
    if (accounts.length === 0) {
        savedAccountsDiv.style.display = 'none';
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
}

function quickLogin(url, username, encodedPassword) {
    try {
        document.getElementById('serverURL').value = url;
        document.getElementById('userName').value = username;
        document.getElementById('password').value = atob(encodedPassword);
        loginUser();
    } catch (e) {
        console.error('Error in quick login:', e);
        authMsg.style.color = 'red';
        authMsg.textContent = '❌ Lỗi đăng nhập nhanh!';
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== WEBSOCKET CONNECTION ====================
function connectWebSocket(serverInput) {
    return new Promise((resolve, reject) => {
        try {
            // Tự động xác định WebSocket URL
            let wsUrl;
            
            if (serverInput.startsWith('ws://') || serverInput.startsWith('wss://')) {
                wsUrl = serverInput;
            } else if (serverInput.includes('trycloudflare.com') || serverInput.includes('loca.lt')) {
                wsUrl = `wss://${serverInput}`;
            } else if (serverInput === 'localhost' || serverInput.startsWith('192.168.') || serverInput.startsWith('10.')) {
                wsUrl = `ws://${serverInput}:8766`;
            } else {
                wsUrl = `wss://${serverInput}`;
            }
            
            console.log('🔌 Connecting to:', wsUrl);
            authMsg.style.color = 'blue';
            authMsg.textContent = `🔌 Đang kết nối tới ${serverInput}...`;
            
            ws = new WebSocket(wsUrl);
            
            const connectionTimeout = setTimeout(() => {
                if (ws && ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, 5000);
            
            ws.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('✅ WebSocket connected');
                updateConnectionStatus(true);
                reconnectAttempts = 0;
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
                authMsg.style.color = 'red';
                authMsg.textContent = '❌ Không thể kết nối! Kiểm tra URL server.';
                updateConnectionStatus(false);
            };
            
            ws.onclose = () => {
                clearTimeout(connectionTimeout);
                console.log('🔌 WebSocket disconnected');
                updateConnectionStatus(false);
                
                if (currentUser && reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    console.log(`🔄 Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
                    reconnectTimeout = setTimeout(() => {
                        connectWebSocket(serverInput).catch(err => {
                            console.error('Reconnect failed:', err);
                        });
                    }, 2000 * reconnectAttempts);
                }
            };
            
        } catch (error) {
            reject(error);
        }
    });
}

function updateConnectionStatus(connected) {
    const statusDot = document.querySelector('#serverStatus .status-dot');
    const statusText = document.querySelector('#serverStatus .status-text');
    
    if (connected) {
        if (statusDot) statusDot.className = 'status-dot online';
        if (statusText) statusText.textContent = 'Đã kết nối';
    } else {
        if (statusDot) statusDot.className = 'status-dot offline';
        if (statusText) statusText.textContent = 'Mất kết nối';
    }
}

function handleWebSocketMessage(data) {
    try {
        const message = JSON.parse(data);
        
        // Handle different message types
        if (message.action === 'register_response') {
            handleRegisterResponse(message);
        } else if (message.action === 'login_response') {
            handleLoginResponse(message);
        } else if (message.action === 'poll_response') {
            handlePollResponse(message);
        } else if (message.id) {
            // Regular message broadcast
            handleBroadcastMessage(message);
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

function handlePollResponse(data) {
    const messages = data.messages || [];
    messages.forEach(msg => {
        handleBroadcastMessage(msg);
    });
}

// ==================== AUTH FUNCTIONS ====================
function encryptMessage(text) {
    return [...text].map(char => 
        String.fromCharCode(char.charCodeAt(0) ^ 42)
    ).join('');
}

async function registerUser() {
    const url = document.getElementById('serverURL').value.trim();
    const user = document.getElementById('userName').value.trim();
    const pw = document.getElementById('password').value;

    if (!url) {
        authMsg.style.color = 'red';
        authMsg.textContent = 'Vui lòng nhập địa chỉ server!';
        return;
    }

    if (!user || !pw) {
        authMsg.style.color = 'red';
        authMsg.textContent = 'Vui lòng điền đầy đủ thông tin!';
        return;
    }

    try {
        await connectWebSocket(url);
        
        ws.send(JSON.stringify({
            action: 'register',
            user: user,
            pw: pw
        }));
        
        authMsg.style.color = 'blue';
        authMsg.textContent = '⏳ Đang đăng ký...';
        
    } catch (error) {
        authMsg.style.color = 'red';
        authMsg.textContent = '❌ Không thể kết nối server!';
        console.error(error);
    }
}

function handleRegisterResponse(response) {
    if (response.ok) {
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
        authMsg.style.color = 'red';
        authMsg.textContent = response.msg || '❌ Đăng ký thất bại!';
    }
}

async function loginUser() {
    const url = document.getElementById('serverURL').value.trim();
    const user = document.getElementById('userName').value.trim();
    const pw = document.getElementById('password').value;

    if (!url) {
        authMsg.style.color = 'red';
        authMsg.textContent = 'Vui lòng nhập địa chỉ server!';
        return;
    }

    if (!user || !pw) {
        authMsg.style.color = 'red';
        authMsg.textContent = 'Vui lòng điền đầy đủ thông tin!';
        return;
    }

    try {
        await connectWebSocket(url);
        
        ws.send(JSON.stringify({
            action: 'login',
            user: user,
            pw: pw
        }));
        
        authMsg.style.color = 'blue';
        authMsg.textContent = '⏳ Đang đăng nhập...';
        
    } catch (error) {
        authMsg.style.color = 'red';
        authMsg.textContent = '❌ Không thể kết nối server!';
        console.error(error);
    }
}

function handleLoginResponse(response) {
    if (response.ok) {
        const url = document.getElementById('serverURL').value.trim();
        const user = document.getElementById('userName').value.trim();
        const pw = document.getElementById('password').value;
        
        currentUser = user;
        userStats = response.stats;
        
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
        
        // Focus input after a short delay to ensure UI is ready
        setTimeout(() => {
            if (messageInput) {
                messageInput.focus();
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
            ws.send(JSON.stringify({ action: 'poll' }));
        }
        
    } else {
        authMsg.style.color = 'red';
        authMsg.textContent = response.msg || '❌ Đăng nhập thất bại!';
    }
}

function logout() {
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
    processedMessageIds.clear();
    reconnectAttempts = 0;
    
    loginDiv.style.display = 'block';
    chatDiv.style.display = 'none';
    chatDiv.classList.remove('active');
    messagesContainer.innerHTML = '';
    messageInput.value = '';
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

    const textNode = document.createTextNode(text);
    messageDiv.appendChild(textNode);

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function displayServerMessage(text, isForMe) {
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
}

function displayMyMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message me';
    
    if (text.startsWith('/')) {
        messageDiv.classList.add('command');
    }
    
    messageDiv.textContent = text;

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Optimized scroll function
function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    
    return false;
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;

    if (handleClientCommand(message)) {
        messageInput.value = '';
        if (commandMode) {
            messageInput.value = '/';
        }
        messageInput.focus();
        return;
    }

    displayMyMessage(message);
    
    const isCommand = message.startsWith('/');
    
    messageInput.value = '';
    
    if (isCommand) {
        messageInput.value = '/';
        commandMode = true;
    }
    
    messageInput.focus();

    try {
        ws.send(JSON.stringify({
            action: 'send',
            msg: encryptMessage(message)
        }));
    } catch (e) {
        console.error('Error sending message:', e);
        displayServerMessage('❌ Lỗi gửi tin nhắn!', true);
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
    displaySavedAccounts();
});

window.addEventListener('beforeunload', () => {
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

// Make functions globally accessible
window.quickLogin = quickLogin;
window.removeAccount = removeAccount;
window.loginUser = loginUser;
window.registerUser = registerUser;
window.sendMessage = sendMessage;
window.handleEnter = handleEnter;