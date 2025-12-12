// ==================== DEBUG SYSTEM ====================
const DEBUG = {
    enabled: true,
    logLevel: 'ALL', // ALL, ERROR, WARN, INFO
    logs: [],
    maxLogs: 100,
    panelVisible: false,
    
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
        
        // Console log
        console.log(
            `%c[${timestamp}] ${emoji} ${category}`,
            style,
            message,
            data ? data : ''
        );
        
        // Store log
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            data: data ? JSON.stringify(data) : null,
            emoji
        };
        
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Update panel if visible
        if (this.panelVisible) {
            this.updatePanel();
        }
        
        // Display critical errors on UI
        if (level === 'ERROR') {
            this.showErrorToast(`${category}: ${message}`);
        }
    },
    
    error(category, message, error = null) {
        this.log('ERROR', category, message, error);
        if (error) {
            console.error('Stack trace:', error.stack);
            this.log('ERROR', 'STACK', error.stack);
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
    
    showErrorToast(message) {
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
            animation: slideIn 0.3s ease-out;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => errorDiv.remove(), 300);
        }, 5000);
    },
    
    togglePanel() {
        this.panelVisible = !this.panelVisible;
        
        if (this.panelVisible) {
            this.createPanel();
        } else {
            this.removePanel();
        }
    },
    
    createPanel() {
        if (document.getElementById('debugPanel')) return;
        
        const panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 40vh;
            background: rgba(0, 0, 0, 0.95);
            color: #fff;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            font-family: monospace;
            font-size: 11px;
            border-top: 2px solid #444;
        `;
        
        panel.innerHTML = `
            <div style="padding: 10px; background: #222; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444;">
                <div style="font-weight: bold; color: #4CAF50;">🔍 DEBUG CONSOLE</div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="DEBUG.clearLogs()" style="padding: 5px 10px; background: #555; color: white; border: none; border-radius: 4px; font-size: 10px;">
                        🗑️ Clear
                    </button>
                    <button onclick="DEBUG.exportLogs()" style="padding: 5px 10px; background: #555; color: white; border: none; border-radius: 4px; font-size: 10px;">
                        💾 Export
                    </button>
                    <button onclick="DEBUG.togglePanel()" style="padding: 5px 10px; background: #f44; color: white; border: none; border-radius: 4px; font-size: 10px;">
                        ✕
                    </button>
                </div>
            </div>
            <div id="debugLogs" style="flex: 1; overflow-y: auto; padding: 10px; line-height: 1.6;"></div>
        `;
        
        document.body.appendChild(panel);
        this.updatePanel();
    },
    
    updatePanel() {
        const logsContainer = document.getElementById('debugLogs');
        if (!logsContainer) return;
        
        const colorMap = {
            ERROR: '#ff4444',
            WARN: '#ffaa00',
            INFO: '#4444ff',
            DEBUG: '#888888'
        };
        
        logsContainer.innerHTML = this.logs.map(log => {
            const dataStr = log.data ? `<br><span style="color: #666; margin-left: 20px;">${log.data}</span>` : '';
            return `
                <div style="margin-bottom: 5px; padding: 5px; border-left: 3px solid ${colorMap[log.level]}; background: rgba(255,255,255,0.05);">
                    <span style="color: #666;">[${log.timestamp}]</span>
                    <span>${log.emoji}</span>
                    <span style="color: ${colorMap[log.level]}; font-weight: bold;">${log.category}</span>
                    <span style="color: #ccc;"> ${log.message}</span>
                    ${dataStr}
                </div>
            `;
        }).join('');
        
        // Auto scroll to bottom
        logsContainer.scrollTop = logsContainer.scrollHeight;
    },
    
    removePanel() {
        const panel = document.getElementById('debugPanel');
        if (panel) {
            panel.remove();
        }
    },
    
    clearLogs() {
        this.logs = [];
        this.updatePanel();
        this.info('DEBUG', 'Logs cleared');
    },
    
    exportLogs() {
        const logText = this.logs.map(log => 
            `[${log.timestamp}] ${log.emoji} ${log.category}: ${log.message}${log.data ? '\n  ' + log.data : ''}`
        ).join('\n');
        
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-log-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.info('DEBUG', 'Logs exported');
    }
};

// ==================== CHAT MODULE ====================
const ChatModule = {
    // State
    ws: null,
    currentUser: null,
    userStats: null,
    currentServerUrl: null,
    hideOthersServerMsg: false,
    commandMode: false,
    processedMessageIds: new Set(),
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectTimeout: null,
    
    // ==================== WEBSOCKET CONNECTION ====================
    
    connectWebSocket(serverInput) {
        return new Promise((resolve, reject) => {
            try {
                DEBUG.info('WEBSOCKET', 'Starting connection', { server: serverInput });
                
                const wsUrl = LoginModule.normalizeServerUrl(serverInput);
                this.currentServerUrl = serverInput;
                
                const authMsg = document.getElementById('authMsg');
                if (authMsg) {
                    authMsg.style.color = 'blue';
                    authMsg.textContent = `🔌 Đang kết nối tới ${serverInput}...`;
                }
                
                this.ws = new WebSocket(wsUrl);
                
                DEBUG.debug('WEBSOCKET', 'WebSocket object created', {
                    url: wsUrl,
                    readyState: this.ws.readyState
                });
                
                const connectionTimeout = setTimeout(() => {
                    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                        DEBUG.error('WEBSOCKET', 'Connection timeout after 5s');
                        this.ws.close();
                        reject(new Error('Connection timeout - Server không phản hồi'));
                    }
                }, 5000);
                
                this.ws.onopen = () => {
                    clearTimeout(connectionTimeout);
                    DEBUG.info('WEBSOCKET', '✅ Connected successfully', {
                        url: wsUrl,
                        readyState: this.ws.readyState
                    });
                    this.updateConnectionStatus(true);
                    this.reconnectAttempts = 0;
                    resolve(this.ws);
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        DEBUG.debug('WEBSOCKET', 'Message received', {
                            length: event.data.length,
                            preview: event.data.substring(0, 100)
                        });
                        this.handleWebSocketMessage(event.data);
                    } catch (e) {
                        DEBUG.error('WEBSOCKET', 'Failed to handle message', e);
                    }
                };
                
                this.ws.onerror = (error) => {
                    clearTimeout(connectionTimeout);
                    DEBUG.error('WEBSOCKET', 'Connection error', {
                        error: error,
                        readyState: this.ws.readyState,
                        url: wsUrl
                    });
                    
                    const authMsg = document.getElementById('authMsg');
                    if (authMsg) {
                        authMsg.style.color = 'red';
                        authMsg.textContent = '❌ Không thể kết nối! Kiểm tra URL server.';
                    }
                    this.updateConnectionStatus(false);
                    
                    reject(new Error('WebSocket connection failed'));
                };
                
                this.ws.onclose = (event) => {
                    clearTimeout(connectionTimeout);
                    DEBUG.warn('WEBSOCKET', 'Connection closed', {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean
                    });
                    this.updateConnectionStatus(false);
                    
                    if (this.currentUser && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        DEBUG.info('WEBSOCKET', `Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                        
                        this.reconnectTimeout = setTimeout(() => {
                            this.connectWebSocket(this.currentServerUrl).catch(err => {
                                DEBUG.error('WEBSOCKET', 'Reconnection failed', err);
                            });
                        }, 2000 * this.reconnectAttempts);
                    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        DEBUG.error('WEBSOCKET', 'Max reconnection attempts reached');
                    }
                };
                
            } catch (error) {
                DEBUG.error('WEBSOCKET', 'Connection setup failed', error);
                reject(error);
            }
        });
    },
    
    updateConnectionStatus(connected) {
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
    },
    
    // ==================== MESSAGE HANDLING ====================
    
    handleWebSocketMessage(data) {
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
                this.displayServerMessage(`❌ Lỗi: ${message.error}`, true);
                return;
            }
            
            // Handle different message types
            if (message.action === 'register_response') {
                DEBUG.info('MESSAGE', 'Register response received');
                LoginModule.handleRegisterResponse(message);
            } else if (message.action === 'login_response') {
                DEBUG.info('MESSAGE', 'Login response received');
                LoginModule.handleLoginResponse(message);
            } else if (message.action === 'poll_response') {
                DEBUG.info('MESSAGE', 'Poll response received', {
                    messageCount: message.messages?.length || 0
                });
                this.handlePollResponse(message);
            } else if (message.id) {
                DEBUG.debug('MESSAGE', 'Broadcast message received');
                this.handleBroadcastMessage(message);
            } else {
                DEBUG.warn('MESSAGE', 'Unknown message type', message);
            }
        } catch (error) {
            DEBUG.error('MESSAGE', 'Failed to parse/handle message', error);
        }
    },
    
    handleBroadcastMessage(msg) {
        if (this.processedMessageIds.has(msg.id)) {
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
                const isForMe = msg.targetUser === this.currentUser;
                if (this.hideOthersServerMsg && !isForMe) {
                    this.processedMessageIds.add(msg.id);
                    DEBUG.debug('MESSAGE', 'Server message hidden (not for me)');
                    return;
                }
                this.displayServerMessage(msg.msg, isForMe);
            } else if (msg.name !== this.currentUser) {
                this.displayPlayerMessage(msg.name, msg.msg, msg.isCommand);
            }
            
            this.processedMessageIds.add(msg.id);
            
            // Cleanup old message IDs
            if (this.processedMessageIds.size > 200) {
                const idsArray = Array.from(this.processedMessageIds).sort((a, b) => b - a);
                this.processedMessageIds = new Set(idsArray.slice(0, 150));
                DEBUG.debug('MESSAGE', 'Cleaned up old message IDs');
            }
        } catch (e) {
            DEBUG.error('MESSAGE', 'Failed to handle broadcast', e);
        }
    },
    
    handlePollResponse(data) {
        try {
            const messages = data.messages || [];
            DEBUG.info('MESSAGE', `Processing ${messages.length} poll messages`);
            messages.forEach(msg => {
                this.handleBroadcastMessage(msg);
            });
        } catch (e) {
            DEBUG.error('MESSAGE', 'Failed to handle poll response', e);
        }
    },
    
    // ==================== MESSAGE DISPLAY ====================
    
    displayPlayerMessage(sender, text, isCommand = false) {
        try {
            const messagesContainer = document.getElementById('messages');
            if (!messagesContainer) return;
            
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
            this.scrollToBottom();
            
            DEBUG.debug('UI', 'Player message displayed', { sender, isCommand });
        } catch (e) {
            DEBUG.error('UI', 'Failed to display player message', e);
        }
    },
    
    displayServerMessage(text, isForMe) {
        try {
            const messagesContainer = document.getElementById('messages');
            if (!messagesContainer) return;
            
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
            this.scrollToBottom();
            
            DEBUG.debug('UI', 'Server message displayed', { isForMe, lines: lines.length });
        } catch (e) {
            DEBUG.error('UI', 'Failed to display server message', e);
        }
    },
    
    displayMyMessage(text) {
        try {
            const messagesContainer = document.getElementById('messages');
            if (!messagesContainer) return;
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message me';
            
            if (text.startsWith('/')) {
                messageDiv.classList.add('command');
            }
            
            messageDiv.textContent = text;

            messagesContainer.appendChild(messageDiv);
            this.scrollToBottom();
            
            DEBUG.debug('UI', 'My message displayed');
        } catch (e) {
            DEBUG.error('UI', 'Failed to display my message', e);
        }
    },
    
    scrollToBottom() {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        requestAnimationFrame(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    },
    
    // ==================== MESSAGE SENDING ====================
    
    encryptMessage(text) {
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
    },
    
    handleClientCommand(message) {
        try {
            if (message === '/hideothers') {
                this.hideOthersServerMsg = !this.hideOthersServerMsg;
                const status = this.hideOthersServerMsg ? 'ẨN' : 'HIỆN';
                this.displayServerMessage(
                    `🔔 Đã ${status} server response của người khác`,
                    true
                );
                DEBUG.info('COMMAND', `Hide others: ${status}`);
                return true;
            }
            
            if (message === '/debug') {
                DEBUG.togglePanel();
                const status = DEBUG.panelVisible ? 'MỞ' : 'ĐÓNG';
                this.displayServerMessage(`🔧 Debug panel: ${status}`, true);
                DEBUG.info('COMMAND', `Debug panel: ${status}`);
                return true;
            }
            
            if (message === '/debugoff') {
                DEBUG.enabled = !DEBUG.enabled;
                const status = DEBUG.enabled ? 'BẬT' : 'TẮT';
                this.displayServerMessage(`🔧 Debug logging: ${status}`, true);
                DEBUG.info('COMMAND', `Debug logging: ${status}`);
                return true;
            }
            
            return false;
        } catch (e) {
            DEBUG.error('COMMAND', 'Failed to handle client command', e);
            return false;
        }
    },
    
    sendMessage() {
        try {
            const messageInput = document.getElementById('messageInput');
            if (!messageInput) return;
            
            const message = messageInput.value.trim();
            
            if (!message) {
                DEBUG.debug('MESSAGE', 'Empty message, ignoring');
                return;
            }
            
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                DEBUG.error('MESSAGE', 'Cannot send - WebSocket not connected', {
                    hasWs: !!this.ws,
                    readyState: this.ws?.readyState
                });
                this.displayServerMessage('❌ Không thể gửi - chưa kết nối!', true);
                return;
            }

            if (this.handleClientCommand(message)) {
                messageInput.value = '';
                if (this.commandMode) {
                    messageInput.value = '/';
                }
                messageInput.focus();
                return;
            }

            DEBUG.debug('MESSAGE', 'Sending message', { 
                message, 
                isCommand: message.startsWith('/') 
            });

            this.displayMyMessage(message);
            
            const isCommand = message.startsWith('/');
            
            messageInput.value = '';
            
            if (isCommand) {
                messageInput.value = '/';
                this.commandMode = true;
            }
            
            messageInput.focus();

            try {
                const payload = {
                    action: 'send',
                    msg: this.encryptMessage(message)
                };
                
                DEBUG.debug('MESSAGE', 'Sending payload', payload);
                this.ws.send(JSON.stringify(payload));
                DEBUG.info('MESSAGE', 'Message sent successfully');
                
            } catch (e) {
                DEBUG.error('MESSAGE', 'Failed to send message', e);
                this.displayServerMessage('❌ Lỗi gửi tin nhắn!', true);
            }
        } catch (e) {
            DEBUG.error('MESSAGE', 'sendMessage function failed', e);
        }
    },
    
    handleEnter(event) {
        if (event.key === 'Enter') {
            this.sendMessage();
        }
    }
};

// ==================== INITIALIZATION ====================
window.addEventListener('load', () => {
    DEBUG.info('INIT', '=== APPLICATION LOADED ===');
    DEBUG.info('INIT', 'User Agent', navigator.userAgent);
    DEBUG.info('INIT', 'WebSocket support', 'WebSocket' in window);
    
    // Display saved accounts
    LoginModule.displaySavedAccounts();
    
    // Command mode detection
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            const value = this.value;
            if (ChatModule.commandMode && !value.startsWith('/')) {
                ChatModule.commandMode = false;
            }
            if (!ChatModule.commandMode && value === '/') {
                ChatModule.commandMode = true;
            }
        });
    }
    
    DEBUG.info('INIT', 'Initialization complete');
});

window.addEventListener('beforeunload', () => {
    DEBUG.info('INIT', 'Page unloading, closing connections');
    if (ChatModule.ws) {
        ChatModule.ws.close();
    }
    if (ChatModule.reconnectTimeout) {
        clearTimeout(ChatModule.reconnectTimeout);
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

// Make globally accessible
window.ChatModule = ChatModule;
window.DEBUG = DEBUG;
window.sendMessage = () => ChatModule.sendMessage();
window.handleEnter = (event) => ChatModule.handleEnter(event);

DEBUG.info('INIT', '=== SCRIPT INITIALIZATION COMPLETE ===');
DEBUG.info('INIT', 'Commands: /hideothers, /debug (mở panel), /debugoff (tắt logging)');
DEBUG.info('INIT', 'Tunnels: Tự động detect mọi loại tunnel');
DEBUG.info('INIT', '📱 Gõ /debug để mở debug panel trên điện thoại!');