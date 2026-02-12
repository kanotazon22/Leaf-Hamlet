// ═══════════════════════════════════════════════════════════════════════════
// Chat Module - POLLING VERSION - Update liên tục không cần broadcast
// ═══════════════════════════════════════════════════════════════════════════

const Chat = {
    // ─── STATE ───────────────────────────────────────────────────
    channel: 'global',
    lastId: 0,
    isTabOpen: false,
    unreadCount: 0,
    initialized: false,
    isSending: false,
    pollingInterval: null,
    renderedMessageIds: new Set(),

    // ─── INITIALIZATION ──────────────────────────────────────────
    init() {
        if (this.initialized) {
            console.log('⚠️ Chat already initialized');
            return;
        }
        
        console.log('🎮 Initializing Chat module with POLLING...');
        
        if (!wsManager?.connected) {
            console.log('⏳ Waiting for WebSocket connection...');
            setTimeout(() => this.init(), 1000);
            return;
        }
        
        this.setupUI();
        this.loadInitialMessages();
        this.startPolling(); // 🔥 BẮT ĐẦU POLLING
        
        this.initialized = true;
        console.log('✅ Chat initialized with polling');
    },

    // ─── POLLING - UPDATE LIÊN TỤC ──────────────────────────────
    startPolling() {
        console.log('🔄 Starting chat polling (every 2 seconds)...');
        
        // Clear interval cũ nếu có
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        // Poll mỗi 2 giây
        this.pollingInterval = setInterval(async () => {
            if (this.initialized && Auth?.token) {
                await this.pollNewMessages();
            }
        }, 200);
        
        console.log('✅ Polling started');
    },

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('⏸️ Polling stopped');
        }
    },

    async pollNewMessages() {
        if (!Auth?.token) return;
        
        try {
            // Lấy tin nhắn mới sau lastId
            const response = await wsManager.send({
                type: 'chat',
                action: 'get_messages',
                token: Auth.token,
                channel: this.channel,
                after: this.lastId, // 🔥 CHỈ LẤY TIN NHẮN MỚI
                limit: 50
            });

            if (response.success && response.messages && response.messages.length > 0) {
                console.log(`📥 Polled ${response.messages.length} new messages`);
                
                response.messages.forEach(msg => {
                    if (msg.id > this.lastId) {
                        this.lastId = msg.id;
                    }
                    
                    // Chỉ render nếu chưa có
                    if (!this.renderedMessageIds.has(msg.id)) {
                        this.renderMessage(msg);
                        
                        // Update unread nếu tab không mở
                        if (!this.isTabOpen) {
                            this.unreadCount++;
                            this.updateUnreadBadge();
                        }
                    }
                });
            }

            // Update online count
            if (response.online !== undefined) {
                this.updateOnlineCount(response.online);
            }
        } catch (error) {
            console.error('❌ Polling error:', error);
        }
    },

    // ─── UI SETUP ────────────────────────────────────────────────
    setupUI() {
        this.setupEnterKey();
        this.setupTabTracking();
        this.setupSendButton();
    },

    setupEnterKey() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        console.log('✅ Enter key handler registered');
    },

    setupSendButton() {
        const sendBtn = document.querySelector('.chat-send-btn');
        if (!sendBtn) return;
        
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.sendMessage();
        });
    },

    setupTabTracking() {
        console.log('📑 Setting up tab tracking...');
        
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const isChatTab = tab.dataset.tab === 'chat';
                
                if (isChatTab) {
                    this.onTabOpen();
                } else if (this.isTabOpen) {
                    this.onTabClose();
                }
            });
        });
        
        console.log('✅ Tab tracking ready');
    },

    // ─── CHANNEL ─────────────────────────────────────────────────
    switchChannel(channel, btnEl) {
        console.log(`🔄 Switching to channel: ${channel}`);
        
        this.channel = channel;
        this.lastId = 0;
        this.renderedMessageIds.clear();

        // Update UI
        document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        // Show loading
        const box = document.getElementById('chat-messages');
        if (box) box.innerHTML = '<div class="chat-empty">— đang tải... —</div>';

        this.loadInitialMessages();
    },

    // ─── MESSAGES ────────────────────────────────────────────────
    async loadInitialMessages() {
        console.log(`📥 Loading messages for channel: ${this.channel}`);
        
        if (!Auth?.token) {
            console.log('⚠️ No auth token');
            return;
        }
        
        try {
            const response = await wsManager.send({
                type: 'chat',
                action: 'get_messages',
                token: Auth.token,
                channel: this.channel,
                after: 0,
                limit: 50
            });

            console.log('📨 Get messages response:', response);

            if (response.success && response.messages) {
                const box = document.getElementById('chat-messages');
                if (box) {
                    box.innerHTML = '';
                    this.renderedMessageIds.clear();
                }

                console.log(`✅ Loaded ${response.messages.length} messages`);
                
                response.messages.forEach(msg => {
                    if (msg.id > this.lastId) {
                        this.lastId = msg.id;
                    }
                    this.renderMessage(msg);
                });

                if (response.online !== undefined) {
                    this.updateOnlineCount(response.online);
                }
            }
        } catch (error) {
            console.error('❌ Error loading messages:', error);
            this.showSystemMsg('Không thể tải tin nhắn: ' + error.message);
        }
    },

    async sendMessage() {
        if (this.isSending) {
            console.log('⚠️ Already sending');
            return;
        }

        const input = document.getElementById('chat-input');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        if (!Auth?.token) {
            this.showSystemMsg('Chưa đăng nhập!');
            return;
        }

        console.log(`📤 Sending message to ${this.channel}:`, text);

        this.isSending = true;
        
        const originalValue = input.value;
        input.value = '';
        
        const sendBtn = document.querySelector('.chat-send-btn');
        if (sendBtn) {
            sendBtn.classList.add('sending');
            sendBtn.disabled = true;
        }

        try {
            const response = await wsManager.send({
                type: 'chat',
                action: 'send_message',
                token: Auth.token,
                channel: this.channel,
                message: text
            });

            console.log('📨 Send message response:', response);

            if (!response.success) {
                console.error('❌ Send failed:', response.error);
                this.showSystemMsg(`Lỗi: ${response.error || 'Không gửi được tin nhắn'}`);
                input.value = originalValue;
            } else {
                console.log('✅ Message sent successfully');
                
                // 🔥 POLL NGAY LẬP TỨC để lấy tin nhắn vừa gửi
                setTimeout(() => this.pollNewMessages(), 100);
            }
        } catch (error) {
            console.error('❌ Error sending message:', error);
            this.showSystemMsg('Lỗi: ' + error.message);
            input.value = originalValue;
        } finally {
            setTimeout(() => {
                this.isSending = false;
                if (sendBtn) {
                    sendBtn.classList.remove('sending');
                    sendBtn.disabled = false;
                }
                input.focus();
            }, 100);
        }
    },

    // ─── RENDER ──────────────────────────────────────────────────
    renderMessage(msg) {
        const box = document.getElementById('chat-messages');
        if (!box) {
            console.error('❌ Chat messages box not found!');
            return;
        }

        const empty = box.querySelector('.chat-empty');
        if (empty) empty.remove();

        if (this.renderedMessageIds.has(msg.id)) {
            console.log('⚠️ Message already rendered:', msg.id);
            return;
        }

        const isMe = Game.player && (msg.username === Game.player.username);
        const div = document.createElement('div');
        div.className = 'chat-msg' + (isMe ? ' mine' : '');
        div.dataset.id = msg.id;

        const time = this.formatTime(msg.timestamp);

        div.innerHTML = `
            <div class="chat-msg-header">
                <span class="chat-msg-user ${isMe ? 'me' : ''}">${this.escapeHtml(msg.username)}</span>
                <span class="chat-msg-lv">Lv ${msg.level || 1}</span>
                <span class="chat-msg-time">${time}</span>
            </div>
            <div class="chat-msg-body">${this.escapeHtml(msg.message)}</div>
        `;

        box.appendChild(div);
        this.renderedMessageIds.add(msg.id);
        box.scrollTop = box.scrollHeight;

        console.log('✅ Message rendered:', msg.id);

        this.cleanupOldMessages(box);
    },

    showSystemMsg(text) {
        const box = document.getElementById('chat-messages');
        if (!box) return;

        const div = document.createElement('div');
        div.className = 'chat-system-msg';
        div.textContent = text;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 300);
        }, 5000);
    },

    cleanupOldMessages(box) {
        const messages = Array.from(box.querySelectorAll('[data-id]'));
        
        while (messages.length > 100) {
            const oldest = messages.shift();
            const oldId = parseInt(oldest.dataset.id);
            this.renderedMessageIds.delete(oldId);
            oldest.remove();
        }
    },

    // ─── UI UPDATES ──────────────────────────────────────────────
    updateOnlineCount(count) {
        const el = document.getElementById('online-count');
        if (el) {
            el.textContent = `${count} người online`;
        }
    },

    updateUnreadBadge() {
        const badge = document.getElementById('chat-unread-badge');
        if (badge) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.style.display = 'inline-block';
        }
    },

    onTabOpen() {
        console.log('👁️ Chat tab opened');
        this.isTabOpen = true;
        this.unreadCount = 0;

        const badge = document.getElementById('chat-unread-badge');
        if (badge) badge.style.display = 'none';

        const box = document.getElementById('chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
        
        const input = document.getElementById('chat-input');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
        
        // 🔥 POLL NGAY KHI MỞ TAB
        this.pollNewMessages();
    },

    onTabClose() {
        console.log('👁️ Chat tab closed');
        this.isTabOpen = false;
    },

    // ─── HELPERS ─────────────────────────────────────────────────
    formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    },

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-START polling when initialized
// ═══════════════════════════════════════════════════════════════════════════
