// ═══════════════════════════════════════════════════════════════════════════
// WebSocket Connection Manager - NO TIMEOUT VERSION
// ═══════════════════════════════════════════════════════════════════════════

const WS_URL = 'wss://leafhamlet.serveousercontent.com';
// const WS_URL = 'ws://localhost:8000';  // Uncomment for local dev

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000;
        this.messageHandlers = new Map();
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.heartbeatInterval = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('🔌 Connecting to:', WS_URL);
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('✅ Connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Parse error:', e);
                }
            };

            this.ws.onerror = (error) => {
                console.error('❌ WS Error:', error);
                reject(error);
            };

            this.ws.onclose = () => {
                console.log('🔌 Disconnected');
                this.connected = false;
                this.stopHeartbeat();
                this.attemptReconnect();
            };
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnect attempts reached');
            alert('Mất kết nối với server. Vui lòng tải lại trang.');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`🔄 Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        setTimeout(() => {
            this.connect().catch(console.error);
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.connected) {
                this.send({ type: 'ping' }).catch(() => {
                    console.log('Heartbeat failed, connection may be dead');
                });
            }
        }, 30000); // 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    send(data) {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('Not connected'));
        }

        return new Promise((resolve, reject) => {
            const requestId = ++this.requestId;
            const message = { ...data, requestId };
            
            this.pendingRequests.set(requestId, { resolve, reject });
            
            try {
                this.ws.send(JSON.stringify(message));
            } catch (error) {
                this.pendingRequests.delete(requestId);
                reject(error);
            }

            // NO TIMEOUT - requests wait indefinitely for server response
            // The connection itself will fail if server is down
        });
    }

    handleMessage(data) {
        // Pong response
        if (data.type === 'pong') return;

        // Chat broadcasts (not tied to a specific request)
        if (data.type === 'chat_broadcast') {
            const handler = this.messageHandlers.get('chat_broadcast');
            if (handler) handler(data);
            return;
        }

        // Response to a specific request
        if (data.requestId !== undefined && this.pendingRequests.has(data.requestId)) {
            const { resolve } = this.pendingRequests.get(data.requestId);
            this.pendingRequests.delete(data.requestId);
            resolve(data);
            return;
        }

        // General event handlers
        const handler = this.messageHandlers.get(data.type);
        if (handler) handler(data);
    }

    on(eventType, handler) {
        this.messageHandlers.set(eventType, handler);
    }

    off(eventType) {
        this.messageHandlers.delete(eventType);
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
}

// Global WebSocket instance
const wsManager = new WebSocketManager();

// ═══════════════════════════════════════════════════════════════════════════
// Auth Module
// ═══════════════════════════════════════════════════════════════════════════

const Auth = {
    token: null,
    
    init() {
        const savedToken = localStorage.getItem('token');
        if (savedToken) {
            this.token = savedToken;
            this.verifyToken();
        }
        
        // Setup auth tab switching
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
        });
        
        // Setup enter key handlers
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        document.getElementById('register-confirm').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.register();
        });
    },
    
    switchAuthTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`${tab}-form`).classList.add('active');
        
        this.clearMessage();
    },
    
    async login() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            this.showMessage('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }
        
        this.showMessage('Đang đăng nhập...', 'info');
        
        try {
            const response = await wsManager.send({
                type: 'auth',
                action: 'login',
                username,
                password
            });
            
            if (response.success) {
                this.token = response.token;
                localStorage.setItem('token', response.token);
                this.showMessage('Đăng nhập thành công!', 'success');
                setTimeout(() => this.showGameScreen(), 500);
            } else {
                this.showMessage(response.error || 'Đăng nhập thất bại', 'error');
            }
        } catch (error) {
            this.showMessage('Không thể kết nối đến server', 'error');
            console.error('Login error:', error);
        }
    },
    
    async register() {
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        
        if (!username || !password || !confirm) {
            this.showMessage('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }
        
        if (password !== confirm) {
            this.showMessage('Mật khẩu không khớp', 'error');
            return;
        }
        
        if (password.length < 3) {
            this.showMessage('Mật khẩu phải có ít nhất 3 ký tự', 'error');
            return;
        }
        
        this.showMessage('Đang đăng ký...', 'info');
        
        try {
            const response = await wsManager.send({
                type: 'auth',
                action: 'register',
                username,
                password
            });
            
            if (response.success) {
                this.showMessage('Đăng ký thành công! Đang đăng nhập...', 'success');
                setTimeout(() => {
                    document.getElementById('login-username').value = username;
                    document.getElementById('login-password').value = password;
                    this.switchAuthTab('login');
                    this.login();
                }, 1000);
            } else {
                this.showMessage(response.error || 'Đăng ký thất bại', 'error');
            }
        } catch (error) {
            this.showMessage('Không thể kết nối đến server', 'error');
            console.error('Register error:', error);
        }
    },
    
    async verifyToken() {
        try {
            const response = await wsManager.send({
                type: 'auth',
                action: 'verify',
                token: this.token
            });
            
            if (response.success && response.valid) {
                this.showGameScreen();
            } else {
                this.logout();
            }
        } catch (error) {
            console.error('Verify token error:', error);
            this.logout();
        }
    },
    
    logout() {
        this.token = null;
        localStorage.removeItem('token');
        
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('auth-screen').classList.add('active');
        
        // Clear all input fields
        document.querySelectorAll('input').forEach(input => input.value = '');
        this.clearMessage();
        
        // Disconnect websocket handlers for game/chat
        if (typeof Game !== 'undefined') {
            Game.player = null;
            Game.currentEnemy = null;
            Game.inBattle = false;
        }
        
        if (typeof Chat !== 'undefined') {
            Chat.messages = [];
            Chat.lastId = 0;
        }
    },
    
    showGameScreen() {
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        
        if (typeof Game !== 'undefined') {
            Game.init();
        }
    },
    
    showMessage(text, type) {
        const messageEl = document.getElementById('auth-message');
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
    },
    
    clearMessage() {
        const messageEl = document.getElementById('auth-message');
        messageEl.textContent = '';
        messageEl.className = 'message';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Initialize on page load
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await wsManager.connect();
        Auth.init();
    } catch (error) {
        console.error('Failed to connect:', error);
        alert('Không thể kết nối đến server. Vui lòng thử lại sau.');
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    wsManager.disconnect();
});
