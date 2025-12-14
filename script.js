// ==================== CONFIGURATION ====================
const CONFIG = {
    debug: {
        enabled: true,
        logLevel: 'INFO',
        maxLogs: 200,
        categories: ['WS', 'MSG', 'AUTH', 'STORAGE', 'INIT', 'GLOBAL', 'PERF'],
        colors: {
            ERROR: '#f44',
            WARN: '#fa0',
            INFO: '#44f',
            DEBUG: '#888',
            SUCCESS: '#4c4'
        }
    },
    websocket: {
        maxReconnectAttempts: 5,
        reconnectDelay: 2000,
        connectionTimeout: 8000,
        readyTimeout: 3000  // Wait for OPEN state
    },
    message: {
        maxProcessedIds: 200,
        cleanupThreshold: 150,
        encryptionKey: 42
    },
    tunnel: {
        patterns: [
            { regex: /\.(ngrok|trycloudflare|loca\.lt|serveo|pagekite|bore\.pub|tunnelmole\.net)\.?/i, protocol: 'wss' },
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
        [...text].map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join(''),
    
    getEl: id => document.getElementById(id),
    
    showToast: (msg, type = 'error', duration = 5000) => {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; 
            background: ${CONFIG.debug.colors[type.toUpperCase()] || '#f44'};
            color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000;
            max-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out; font-size: 14px;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    waitFor: (condition, timeout = 5000, interval = 100) => {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (condition()) resolve();
                else if (Date.now() - start > timeout) reject(new Error('Timeout'));
                else setTimeout(check, interval);
            };
            check();
        });
    }
};

// ==================== ENHANCED DEBUG SYSTEM ====================
const DEBUG = {
    logs: [],
    panelVisible: false,
    filters: { category: 'ALL', level: 'ALL' },
    metrics: { messages: 0, errors: 0, warnings: 0, startTime: Date.now() },
    
    log(level, category, msg, data = null) {
        if (!CONFIG.debug.enabled) return;
        
        const levels = { ERROR: 0, WARN: 1, INFO: 2, SUCCESS: 2, DEBUG: 3 };
        if (levels[level] > levels[CONFIG.debug.logLevel]) return;
        
        const ts = new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const emoji = { ERROR: '❌', WARN: '⚠️', INFO: 'ℹ️', DEBUG: '🔍', SUCCESS: '✅' }[level];
        
        console.log(`[${ts}] ${emoji} ${category}:`, msg, data || '');
        
        this.logs.push({ 
            ts, 
            level, 
            category, 
            msg, 
            data: data ? JSON.stringify(data, null, 2) : null, 
            emoji,
            id: Date.now() + Math.random()
        });
        
        if (this.logs.length > CONFIG.debug.maxLogs) this.logs.shift();
        if (this.panelVisible) this.updatePanel();
        
        // Update metrics
        if (level === 'ERROR') this.metrics.errors++;
        if (level === 'WARN') this.metrics.warnings++;
        this.metrics.messages++;
    },
    
    error: (cat, msg, err) => DEBUG.log('ERROR', cat, msg, err),
    warn: (cat, msg, data) => DEBUG.log('WARN', cat, msg, data),
    info: (cat, msg, data) => DEBUG.log('INFO', cat, msg, data),
    success: (cat, msg, data) => DEBUG.log('SUCCESS', cat, msg, data),
    debug: (cat, msg, data) => DEBUG.log('DEBUG', cat, msg, data),
    
    togglePanel() {
        this.panelVisible = !this.panelVisible;
        this.panelVisible ? this.createPanel() : this.removePanel();
    },
    
    createPanel() {
        if (Utils.getEl('debugPanel')) return;
        
        const panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.style.cssText = `
            position: fixed; bottom: 0; left: 0; right: 0; height: 50vh;
            background: rgba(0,0,0,0.95); color: #fff; z-index: 9999;
            display: flex; flex-direction: column; font-family: 'Courier New', monospace; font-size: 11px;
            border-top: 3px solid #4CAF50; backdrop-filter: blur(10px);
        `;
        
        const categories = CONFIG.debug.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        const levels = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'].map(l => `<option value="${l}">${l}</option>`).join('');
        
        panel.innerHTML = `
            <div style="padding: 10px; background: #222; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                <div style="font-weight: bold; color: #4CAF50; display: flex; align-items: center; gap: 10px;">
                    <span>🔍 DEBUG CONSOLE</span>
                    <span id="debugMetrics" style="font-size: 10px; color: #888;"></span>
                </div>
                <div style="display: flex; gap: 5px; flex-wrap: wrap; align-items: center;">
                    <select id="debugCategoryFilter" onchange="DEBUG.setFilter('category', this.value)" 
                            style="padding: 5px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; font-size: 11px;">
                        <option value="ALL">All Categories</option>
                        ${categories}
                    </select>
                    <select id="debugLevelFilter" onchange="DEBUG.setFilter('level', this.value)"
                            style="padding: 5px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; font-size: 11px;">
                        ${levels}
                    </select>
                    <button onclick="DEBUG.clearLogs()" style="padding: 5px 10px; background: #555; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">Clear</button>
                    <button onclick="DEBUG.exportLogs()" style="padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">Export</button>
                    <button onclick="DEBUG.togglePanel()" style="padding: 5px 10px; background: #f44; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">✕</button>
                </div>
            </div>
            <div id="debugLogs" style="flex: 1; overflow-y: auto; padding: 10px; line-height: 1.5;"></div>
        `;
        
        document.body.appendChild(panel);
        this.updatePanel();
        this.updateMetrics();
    },
    
    setFilter(type, value) {
        this.filters[type] = value;
        this.updatePanel();
    },
    
    getFilteredLogs() {
        return this.logs.filter(log => {
            const catMatch = this.filters.category === 'ALL' || log.category === this.filters.category;
            const lvlMatch = this.filters.level === 'ALL' || log.level === this.filters.level;
            return catMatch && lvlMatch;
        });
    },
    
    updatePanel() {
        const container = Utils.getEl('debugLogs');
        if (!container) return;
        
        const filtered = this.getFilteredLogs();
        container.innerHTML = filtered.map(log => `
            <div style="margin-bottom: 5px; padding: 5px 8px; border-left: 3px solid ${CONFIG.debug.colors[log.level]}; 
                        background: rgba(255,255,255,0.05); border-radius: 2px;">
                <span style="color: #666;">[${log.ts}]</span>
                <span>${log.emoji}</span>
                <span style="color: ${CONFIG.debug.colors[log.level]}; font-weight: bold;">${log.category}</span>
                <span style="color: #ccc;"> ${Utils.escapeHtml(log.msg)}</span>
                ${log.data ? `<pre style="color: #888; margin: 5px 0 0 20px; font-size: 10px; overflow-x: auto;">${Utils.escapeHtml(log.data)}</pre>` : ''}
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
        this.updateMetrics();
    },
    
    updateMetrics() {
        const el = Utils.getEl('debugMetrics');
        if (!el) return;
        
        const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
        el.textContent = `📊 ${this.metrics.messages} logs | ❌ ${this.metrics.errors} errors | ⚠️ ${this.metrics.warnings} warns | ⏱️ ${uptime}s`;
    },
    
    removePanel() {
        Utils.getEl('debugPanel')?.remove();
    },
    
    clearLogs() {
        this.logs = [];
        this.metrics = { messages: 0, errors: 0, warnings: 0, startTime: Date.now() };
        this.updatePanel();
    },
    
    exportLogs() {
        const filtered = this.getFilteredLogs();
        const text = filtered.map(l => 
            `[${l.ts}] ${l.emoji} ${l.category}: ${l.msg}${l.data ? '\n  ' + l.data : ''}`
        ).join('\n');
        
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `debug-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        DEBUG.info('DEBUG', 'Logs exported');
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
    connectionState: 'DISCONNECTED',
    
    // ==================== CONNECTION ====================
    async connect(serverUrl) {
        if (this.connectionState === 'CONNECTING') {
            DEBUG.warn('WS', 'Already connecting');
            throw new Error('Connection in progress');
        }
        
        this.connectionState = 'CONNECTING';
        this.currentServerUrl = serverUrl;
        
        try {
            const wsUrl = this.normalizeUrl(serverUrl);
            DEBUG.info('WS', 'Connecting', { url: wsUrl });
            this.updateStatus('Đang kết nối...', 'connecting');
            
            await this.createConnection(wsUrl);
            
            // CRITICAL FIX: Wait for WebSocket to be OPEN
            DEBUG.info('WS', 'Waiting for OPEN state...');
            await Utils.waitFor(
                () => this.ws?.readyState === WebSocket.OPEN,
                CONFIG.websocket.readyTimeout
            );
            
            DEBUG.success('WS', 'Connection ready', { state: this.ws.readyState });
            return this.ws;
            
        } catch (error) {
            this.connectionState = 'FAILED';
            DEBUG.error('WS', 'Connection failed', { error: error.message });
            this.updateStatus('Kết nối thất bại', 'offline');
            throw error;
        }
    },
    
    createConnection(wsUrl) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(wsUrl);
            } catch (error) {
                DEBUG.error('WS', 'Failed to create WebSocket', error);
                reject(error);
                return;
            }
            
            const timeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    DEBUG.error('WS', 'Connection timeout');
                    this.ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, CONFIG.websocket.connectionTimeout);
            
            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.connectionState = 'CONNECTED';
                this.reconnectAttempts = 0;
                this.updateStatus('Đã kết nối', 'online');
                DEBUG.success('WS', 'Connected', { readyState: this.ws.readyState });
                resolve();
            };
            
            this.ws.onmessage = (e) => this.handleMessage(e.data);
            
            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                DEBUG.error('WS', 'Error', error);
                this.updateStatus('Lỗi kết nối', 'offline');
            };
            
            this.ws.onclose = (e) => {
                clearTimeout(timeout);
                const wasConnected = this.connectionState === 'CONNECTED';
                this.connectionState = 'DISCONNECTED';
                
                DEBUG.warn('WS', 'Closed', { code: e.code, reason: e.reason, wasClean: e.wasClean });
                this.updateStatus('Mất kết nối', 'offline');
                
                if (wasConnected) this.handleReconnect();
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
        
        DEBUG.info('WS', `Reconnecting in ${delay}ms`, { attempt: `${this.reconnectAttempts}/${CONFIG.websocket.maxReconnectAttempts}` });
        this.updateStatus(`Kết nối lại (${this.reconnectAttempts})...`, 'connecting');
        
        this.reconnectTimeout = setTimeout(async () => {
            try {
                await this.connect(this.currentServerUrl);
            } catch (err) {
                DEBUG.error('WS', 'Reconnect failed', err);
            }
        }, delay);
    },
    
    normalizeUrl(url) {
        if (url.startsWith('ws://') || url.startsWith('wss://')) return url;
        
        const cleanUrl = url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        
        for (const { regex, protocol, port } of CONFIG.tunnel.patterns) {
            if (regex.test(cleanUrl)) {
                const result = port ? `${protocol}://${cleanUrl}:${port}` : `${protocol}://${cleanUrl}`;
                DEBUG.debug('WS', 'URL normalized', { input: url, output: result, pattern: regex.toString() });
                return result;
            }
        }
        
        const result = `${CONFIG.tunnel.defaultProtocol}://${cleanUrl}`;
        DEBUG.debug('WS', 'URL normalized (default)', { input: url, output: result });
        return result;
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
        DEBUG.info('WS', 'Disconnected manually');
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
        DEBUG.info('MSG', 'Poll response', { count: data.messages?.length || 0 });
        (data.messages || []).forEach(msg => this.handleBroadcast(msg));
    },
    
    cleanupMessageIds() {
        if (this.processedMessageIds.size > CONFIG.message.maxProcessedIds) {
            const ids = Array.from(this.processedMessageIds).slice(-CONFIG.message.cleanupThreshold);
            this.processedMessageIds = new Set(ids);
            DEBUG.debug('MSG', 'Cleaned up message IDs', { remaining: ids.length });
        }
    },
    
    send(message) {
        const trimmed = message.trim();
        
        // ✅ Không gửi "/" đơn độc hoặc tin nhắn rỗng
        if (!trimmed || trimmed === '/') return false;
        
        if (this.ws?.readyState !== WebSocket.OPEN) {
            Utils.showToast('Chưa kết nối server!', 'error');
            DEBUG.warn('MSG', 'Send failed - not connected');
            return false;
        }
        
        if (trimmed === '/hideothers') {
            this.hideOthersServerMsg = !this.hideOthersServerMsg;
            this.displayServerMsg(`🔔 ${this.hideOthersServerMsg ? 'ẨN' : 'HIỆN'} server response của người khác`, true);
            return true;
        }
        
        this.displayMyMsg(trimmed);
        
        try {
            this.ws.send(JSON.stringify({
                action: 'send',
                msg: Utils.encrypt(trimmed)
            }));
            DEBUG.info('MSG', 'Sent', { isCommand: trimmed.startsWith('/') });
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
        const container = Utils.getEl('messages');
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
    DEBUG.info('INIT', 'Application loaded', { version: '1.2.0' });
    
    // Create debug button - MOVED TO TOP RIGHT
    const debugBtn = document.createElement('button');
    debugBtn.innerHTML = '🐛';
    debugBtn.title = 'Toggle Debug Console';
    debugBtn.style.cssText = `
        position: fixed; top: 10px; right: 10px; width: 40px; height: 40px;
        border-radius: 50%; background: #333; color: white; border: 2px solid #555;
        cursor: pointer; z-index: 9998; font-size: 18px; opacity: 0.7;
        transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    debugBtn.onmouseover = () => { debugBtn.style.opacity = '1'; debugBtn.style.transform = 'scale(1.1)'; };
    debugBtn.onmouseout = () => { debugBtn.style.opacity = '0.7'; debugBtn.style.transform = 'scale(1)'; };
    debugBtn.onclick = () => DEBUG.togglePanel();
    document.body.appendChild(debugBtn);
    
    // Setup message input
    const input = Utils.getEl('messageInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const msg = input.value;
                if (ChatModule.send(msg)) {
                    input.value = msg.startsWith('/') ? '/' : '';
                }
            }
        });
    }
    
    window.LoginModule?.displaySavedAccounts();
    DEBUG.success('INIT', 'Ready');
});

window.addEventListener('beforeunload', () => {
    ChatModule.disconnect();
});

// Global error handlers
window.addEventListener('error', (e) => 
    DEBUG.error('GLOBAL', 'Uncaught error', { msg: e.message, file: e.filename, line: e.lineno })
);
window.addEventListener('unhandledrejection', (e) => 
    DEBUG.error('GLOBAL', 'Unhandled rejection', { reason: e.reason?.message || e.reason })
);

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
window.sendMessage = (event) => {
    // ✅ CRITICAL: Prevent ANY default behavior
    if (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }
    
    const input = Utils.getEl('messageInput');
    if (!input) {
        DEBUG.warn('MSG', 'Input element not found');
        return false;
    }
    
    const msg = input.value.trim();
    
    // ✅ Không gửi rỗng
    if (!msg || msg === '/') {
        DEBUG.debug('MSG', 'Empty message, skipping');
        return false;
    }
    
    // ✅ Send message
    const sent = ChatModule.send(msg);
    
    if (sent) {
        // ✅ Clear or keep "/"
        input.value = msg.startsWith('/') ? '/' : '';
        input.focus();
        DEBUG.info('MSG', 'Message sent successfully');
    }
    
    return false; // ✅ IMPORTANT: Always return false
};

window.handleEnter = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        window.sendMessage(e);
        return false;
    }
};
