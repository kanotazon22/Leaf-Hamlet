// ==================== CONFIGURATION ====================
const CONFIG = {
    debug: {
        enabled: true,
        logLevel: 'INFO',
        maxLogs: 100
    },
    websocket: {
        maxReconnectAttempts: 5,
        reconnectDelay: 2000,
        connectionTimeout: 5000
    },
    message: {
        maxProcessedIds: 200,
        cleanupThreshold: 150,
        encryptionKey: 42
    },
    tunnel: {
        patterns: [
            { regex: /\.(tmole|ngrok|trycloudflare|loca\.lt|serveo|pagekite|bore\.pub)\.io$/i, protocol: 'wss' },
            { regex: /^(localhost|127\.0\.0\.1)$/i, protocol: 'ws', port: 8766 },
            { regex: /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i, protocol: 'ws', port: 8766 }
        ],
        defaultProtocol: 'wss'
    }
};

// ==================== UTILITY FUNCTIONS ====================
const Utils = {
    escapeHtml: text => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    encrypt: (text, key = CONFIG.message.encryptionKey) => 
        [...text].map(char => String.fromCharCode(char.charCodeAt(0) ^ key)).join(''),
    
    getElement: id => document.getElementById(id),
    
    showToast: (message, type = 'error', duration = 5000) => {
        const colors = { error: '#ff4444', success: '#4CAF50', info: '#2196F3' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; background: ${colors[type]};
            color: white; padding: 15px; border-radius: 8px; z-index: 10000;
            max-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

// ==================== DEBUG SYSTEM ====================
const DEBUG = {
    logs: [],
    panelVisible: false,
    
    log(level, category, message, data = null) {
        if (!CONFIG.debug.enabled) return;
        
        const levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
        if (levels[level] > levels[CONFIG.debug.logLevel]) return;
        
        const timestamp = new Date().toLocaleTimeString('vi-VN');
        const emoji = { ERROR: '❌', WARN: '⚠️', INFO: 'ℹ️', DEBUG: '🔍' }[level];
        
        console.log(`[${timestamp}] ${emoji} ${category}:`, message, data || '');
        
        this.logs.push({ timestamp, level, category, message, data: data ? JSON.stringify(data) : null, emoji });
        if (this.logs.length > CONFIG.debug.maxLogs) this.logs.shift();
        
        if (this.panelVisible) this.updatePanel();
        if (level === 'ERROR') Utils.showToast(`${category}: ${message}`, 'error');
    },
    
    error: (cat, msg, err) => DEBUG.log('ERROR', cat, msg, err),
    warn: (cat, msg, data) => DEBUG.log('WARN', cat, msg, data),
    info: (cat, msg, data) => DEBUG.log('INFO', cat, msg, data),
    debug: (cat, msg, data) => DEBUG.log('DEBUG', cat, msg, data),
    
    togglePanel() {
        this.panelVisible = !this.panelVisible;
        this.panelVisible ? this.createPanel() : this.removePanel();
    },
    
    createPanel() {
        if (Utils.getElement('debugPanel')) return;
        
        const panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.style.cssText = `
            position: fixed; bottom: 0; left: 0; right: 0; height: 40vh;
            background: rgba(0,0,0,0.95); color: #fff; z-index: 9999;
            display: flex; flex-direction: column; font-family: monospace; font-size: 11px;
        `;
        
        panel.innerHTML = `
            <div style="padding: 10px; background: #222; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: bold; color: #4CAF50;">🔍 DEBUG CONSOLE</div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="DEBUG.clearLogs()" style="padding: 5px 10px; background: #555; color: white; border: none; border-radius: 4px;">Clear</button>
                    <button onclick="DEBUG.exportLogs()" style="padding: 5px 10px; background: #555; color: white; border: none; border-radius: 4px;">Export</button>
                    <button onclick="DEBUG.togglePanel()" style="padding: 5px 10px; background: #f44; color: white; border: none; border-radius: 4px;">✕</button>
                </div>
            </div>
            <div id="debugLogs" style="flex: 1; overflow-y: auto; padding: 10px;"></div>
        `;
        
        document.body.appendChild(panel);
        this.updatePanel();
    },
    
    updatePanel() {
        const container = Utils.getElement('debugLogs');
        if (!container) return;
        
        const colors = { ERROR: '#f44', WARN: '#fa0', INFO: '#44f', DEBUG: '#888' };
        container.innerHTML = this.logs.map(log => `
            <div style="margin-bottom: 5px; padding: 5px; border-left: 3px solid ${colors[log.level]}; background: rgba(255,255,255,0.05);">
                <span style="color: #666;">[${log.timestamp}]</span>
                <span>${log.emoji}</span>
                <span style="color: ${colors[log.level]}; font-weight: bold;">${log.category}</span>
                <span style="color: #ccc;"> ${log.message}</span>
                ${log.data ? `<br><span style="color: #666; margin-left: 20px;">${log.data}</span>` : ''}
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
    },
    
    removePanel() {
        Utils.getElement('debugPanel')?.remove();
    },
    
    clearLogs() {
        this.logs = [];
        this.updatePanel();
    },
    
    exportLogs() {
        const text = this.logs.map(l => `[${l.timestamp}] ${l.emoji} ${l.category}: ${l.message}${l.data ? '\n  ' + l.data : ''}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `debug-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
};

// ==================== CHAT MODULE ====================
const ChatModule = {
    ws: null,
    currentUser: null,
    userStats: null,
    currentServerUrl: null,
    hideOthersServerMsg: false,
    processedMessageIds: new Set(),
    reconnectAttempts: 0,
    reconnectTimeout: null,
    connectionState: 'DISCONNECTED', // DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, FAILED
    
    // ==================== CONNECTION ====================
    async connect(serverUrl) {
        if (this.connectionState === 'CONNECTING') {
            DEBUG.warn('WS', 'Already connecting');
            return;
        }
        
        this.connectionState = 'CONNECTING';
        this.currentServerUrl = serverUrl;
        
        try {
            const wsUrl = this.normalizeUrl(serverUrl);
            DEBUG.info('WS', 'Connecting', { url: wsUrl });
            
            this.updateStatus('Đang kết nối...', 'connecting');
            
            return await this.createConnection(wsUrl);
        } catch (error) {
            this.connectionState = 'FAILED';
            DEBUG.error('WS', 'Connection failed', error);
            throw error;
        }
    },
    
    createConnection(wsUrl) {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(wsUrl);
            
            const timeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    this.ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, CONFIG.websocket.connectionTimeout);
            
            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.connectionState = 'CONNECTED';
                this.reconnectAttempts = 0;
                this.updateStatus('Đã kết nối', 'online');
                DEBUG.info('WS', 'Connected');
                resolve(this.ws);
            };
            
            this.ws.onmessage = (e) => this.handleMessage(e.data);
            
            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                DEBUG.error('WS', 'Error', error);
                this.updateStatus('Lỗi kết nối', 'offline');
                reject(error);
            };
            
            this.ws.onclose = (e) => {
                clearTimeout(timeout);
                this.connectionState = 'DISCONNECTED';
                DEBUG.warn('WS', 'Closed', { code: e.code, reason: e.reason });
                this.updateStatus('Mất kết nối', 'offline');
                this.handleReconnect();
            };
        });
    },
    
    handleReconnect() {
        if (!this.currentUser || this.reconnectAttempts >= CONFIG.websocket.maxReconnectAttempts) {
            if (this.reconnectAttempts >= CONFIG.websocket.maxReconnectAttempts) {
                DEBUG.error('WS', 'Max reconnect attempts reached');
                this.connectionState = 'FAILED';
                Utils.showToast('Không thể kết nối lại. Vui lòng đăng nhập lại.', 'error');
            }
            return;
        }
        
        this.connectionState = 'RECONNECTING';
        this.reconnectAttempts++;
        const delay = CONFIG.websocket.reconnectDelay * this.reconnectAttempts;
        
        DEBUG.info('WS', `Reconnecting in ${delay}ms (${this.reconnectAttempts}/${CONFIG.websocket.maxReconnectAttempts})`);
        this.updateStatus(`Kết nối lại (${this.reconnectAttempts})...`, 'connecting');
        
        this.reconnectTimeout = setTimeout(() => {
            this.connect(this.currentServerUrl).catch(err => {
                DEBUG.error('WS', 'Reconnect failed', err);
            });
        }, delay);
    },
    
    normalizeUrl(url) {
        if (url.startsWith('ws://') || url.startsWith('wss://')) return url;
        
        const cleanUrl = url.replace(/^https?:\/\//i, '');
        
        for (const pattern of CONFIG.tunnel.patterns) {
            if (pattern.regex.test(cleanUrl)) {
                return pattern.port ? `${pattern.protocol}://${cleanUrl}:${pattern.port}` : `${pattern.protocol}://${cleanUrl}`;
            }
        }
        
        return `${CONFIG.tunnel.defaultProtocol}://${cleanUrl}`;
    },
    
    updateStatus(text, state) {
        const dot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        if (dot) dot.className = `status-dot ${state}`;
        if (statusText) statusText.textContent = text;
    },
    
    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionState = 'DISCONNECTED';
        this.reconnectAttempts = 0;
    },
    
    // ==================== MESSAGING ====================
    handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            DEBUG.debug('MSG', 'Received', { action: msg.action, id: msg.id });
            
            if (msg.error) {
                DEBUG.error('MSG', 'Server error', msg.error);
                this.displayServerMsg(`❌ ${msg.error}`, true);
                return;
            }
            
            const handlers = {
                register_response: () => window.LoginModule?.handleRegisterResponse(msg),
                login_response: () => window.LoginModule?.handleLoginResponse(msg),
                poll_response: () => this.handlePoll(msg),
                default: () => msg.id && this.handleBroadcast(msg)
            };
            
            (handlers[msg.action] || handlers.default)();
        } catch (error) {
            DEBUG.error('MSG', 'Parse failed', error);
        }
    },
    
    handleBroadcast(msg) {
        if (this.processedMessageIds.has(msg.id)) return;
        
        if (msg.isServer) {
            const isForMe = msg.targetUser === this.currentUser;
            if (this.hideOthersServerMsg && !isForMe) {
                this.processedMessageIds.add(msg.id);
                return;
            }
            this.displayServerMsg(msg.msg, isForMe);
        } else if (msg.name !== this.currentUser) {
            this.displayPlayerMsg(msg.name, msg.msg, msg.isCommand);
        }
        
        this.processedMessageIds.add(msg.id);
        this.cleanupMessageIds();
    },
    
    handlePoll(data) {
        (data.messages || []).forEach(msg => this.handleBroadcast(msg));
    },
    
    cleanupMessageIds() {
        if (this.processedMessageIds.size > CONFIG.message.maxProcessedIds) {
            const ids = Array.from(this.processedMessageIds).slice(-CONFIG.message.cleanupThreshold);
            this.processedMessageIds = new Set(ids);
        }
    },
    
    send(message) {
        if (!message.trim()) return false;
        
        if (this.ws?.readyState !== WebSocket.OPEN) {
            Utils.showToast('Chưa kết nối server!', 'error');
            return false;
        }
        
        // Client commands
        if (message === '/hideothers') {
            this.hideOthersServerMsg = !this.hideOthersServerMsg;
            this.displayServerMsg(`🔔 ${this.hideOthersServerMsg ? 'ẨN' : 'HIỆN'} server response của người khác`, true);
            return true;
        }
        
        this.displayMyMsg(message);
        
        try {
            this.ws.send(JSON.stringify({
                action: 'send',
                msg: Utils.encrypt(message)
            }));
            DEBUG.info('MSG', 'Sent');
        } catch (error) {
            DEBUG.error('MSG', 'Send failed', error);
            Utils.showToast('Lỗi gửi tin nhắn!', 'error');
            return false;
        }
        
        return true;
    },
    
    // ==================== UI ====================
    displayPlayerMsg(sender, text, isCommand) {
        this.addMessage('other' + (isCommand ? ' command' : ''), text, sender);
    },
    
    displayServerMsg(text, isForMe) {
        this.addMessage(isForMe ? 'server-me' : 'server-other', text, 'SERVER');
    },
    
    displayMyMsg(text) {
        this.addMessage('me' + (text.startsWith('/') ? ' command' : ''), text);
    },
    
    addMessage(className, text, sender = null) {
        const container = Utils.getElement('messages');
        if (!container) return;
        
        const div = document.createElement('div');
        div.className = `message ${className}`;
        
        if (sender) {
            const nameDiv = document.createElement('div');
            nameDiv.className = 'sender-name';
            nameDiv.textContent = sender;
            div.appendChild(nameDiv);
        }
        
        text.split('\n').forEach((line, i, arr) => {
            div.appendChild(document.createTextNode(line));
            if (i < arr.length - 1) div.appendChild(document.createElement('br'));
        });
        
        container.appendChild(div);
        requestAnimationFrame(() => container.scrollTop = container.scrollHeight);
    }
};

// ==================== INITIALIZATION ====================
window.addEventListener('load', () => {
    DEBUG.info('INIT', 'Application loaded');
    
    // Create debug button
    const debugBtn = document.createElement('button');
    debugBtn.innerHTML = '🐛';
    debugBtn.style.cssText = `
        position: fixed; bottom: 10px; right: 10px; width: 30px; height: 30px;
        border-radius: 50%; background: #333; color: white; border: 2px solid #555;
        cursor: pointer; z-index: 9998; font-size: 14px; opacity: 0.6;
        transition: opacity 0.3s;
    `;
    debugBtn.onmouseover = () => debugBtn.style.opacity = '1';
    debugBtn.onmouseout = () => debugBtn.style.opacity = '0.6';
    debugBtn.onclick = () => DEBUG.togglePanel();
    document.body.appendChild(debugBtn);
    
    // Setup message input
    const input = Utils.getElement('messageInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const msg = input.value.trim();
                if (msg && ChatModule.send(msg)) {
                    input.value = ''; // Always clear completely
                    input.focus();
                }
            }
        });
    }
    
    window.LoginModule?.displaySavedAccounts();
    DEBUG.info('INIT', 'Ready');
});

window.addEventListener('beforeunload', () => {
    ChatModule.disconnect();
});

// Global error handlers
window.addEventListener('error', (e) => DEBUG.error('GLOBAL', 'Uncaught error', { msg: e.message, file: e.filename, line: e.lineno }));
window.addEventListener('unhandledrejection', (e) => DEBUG.error('GLOBAL', 'Unhandled rejection', e.reason));

// Prevent double-tap zoom on mobile
let lastTap = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap <= 300) e.preventDefault();
    lastTap = now;
}, false);

// Exports
window.ChatModule = ChatModule;
window.DEBUG = DEBUG;
window.sendMessage = () => {
    const input = Utils.getElement('messageInput');
    const msg = input?.value.trim();
    if (msg && ChatModule.send(msg)) {
        input.value = ''; // Always clear completely
        input.focus();
    }
};
window.handleEnter = (e) => e.key === 'Enter' && window.sendMessage();