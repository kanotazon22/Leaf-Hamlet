/**
 * chat.js - Chat Management Module (FIXED - No Full JSON Encryption)
 * Handles chat logic, message processing, and commands
 */

import { CONFIG, MESSAGES, COMMANDS, NOTIFICATION_TYPES } from './config.js';
import { StrUtils } from './utils.js';
import { MessageDisplay, ToastManager, StatusIndicator } from './ui.js';
import { WebSocketManager, ConnectionState } from './websocket.js';

// ==================== CHAT MANAGER ====================
export class ChatManager {
    constructor() {
        // Core components
        this.wsManager = new WebSocketManager();
        this.messageDisplay = new MessageDisplay();
        this.toastManager = new ToastManager();
        this.statusIndicator = new StatusIndicator();

        // State
        this.currentUser = null;
        this.userStats = null;
        this.processedMessageIds = new Set();
        this.hideOthersServerMsg = false;

        // Auth manager reference (set later)
        this.authManager = null;

        // Setup WebSocket event handlers
        this._setupWebSocketHandlers();
    }

    /**
     * Set auth manager reference
     */
    setAuthManager(authManager) {
        this.authManager = authManager;
    }

    /**
     * Setup WebSocket event handlers
     */
    _setupWebSocketHandlers() {
        this.wsManager.onMessage = (msg) => this._handleMessage(msg);
        
        this.wsManager.onStateChange = (newState, oldState) => {
            this._handleStateChange(newState, oldState);
        };

        this.wsManager.onError = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    /**
     * Connect to server
     */
    async connect(serverUrl) {
        return await this.wsManager.connect(serverUrl);
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.wsManager.disconnect();
        this._reset();
    }

    /**
     * Send message
     */
    sendMessage(message) {
        const trimmed = message.trim();

        // Ignore empty messages or single slash
        if (!trimmed || trimmed === '/') {
            return false;
        }

        // Handle client-side commands
        if (this._handleClientCommand(trimmed)) {
            return true;
        }

        // Check connection
        if (!this.wsManager.isConnected()) {
            this.toastManager.show(MESSAGES.errors.noConnection, 'error');
            return false;
        }

        // Handle special server commands
        if (trimmed === COMMANDS.SERVER.HIDEOTHERS) {
            this._toggleHideOthers();
            return true;
        }

        // Display message locally
        this.messageDisplay.addPlayerMessage(this.currentUser, trimmed, trimmed.startsWith('/'));

        // Send JSON with ONLY message content encrypted
        try {
            this.wsManager.send({
                action: 'send',
                msg: StrUtils.xorCipher(trimmed)
            });
            return true;
        } catch (error) {
            console.error('Send failed:', error);
            this.toastManager.show(MESSAGES.errors.sendFailed, 'error');
            return false;
        }
    }

    /**
     * Handle client-side commands
     */
    _handleClientCommand(command) {
        const parsed = StrUtils.parseCommand(command);
        if (!parsed) return false;

        switch (parsed.command) {
            case COMMANDS.CLIENT.PING:
                this._executePing();
                return true;

            case COMMANDS.CLIENT.QUIT:
            case COMMANDS.CLIENT.LOGOUT:
            case COMMANDS.CLIENT.EXIT:
                this._executeLogout();
                return true;

            case COMMANDS.CLIENT.CLEAR:
                this._executeClear();
                return true;

            default:
                return false;
        }
    }

    /**
     * Execute /ping command
     */
    async _executePing() {
        try {
            const latency = await this.wsManager.measurePing();
            
            let quality = '🟢';
            if (latency > 200) quality = '🟡';
            if (latency > 500) quality = '🔴';

            const message = 
                `📊 Ping: ${latency}ms ${quality}\n` +
                `📡 WebSocket: ${this.wsManager.isConnected() ? 'OPEN' : 'CLOSED'}\n` +
                `🔗 Server: ${this.wsManager.url}`;

            this.messageDisplay.addServerMessage(message, true);
        } catch (error) {
            this.messageDisplay.addServerMessage('⏱️ Ping timeout (>5000ms)', true);
        }
    }

    /**
     * Execute /quit command
     */
    _executeLogout() {
        this.messageDisplay.addServerMessage(
            '👋 Đang đăng xuất... / Logging out...', 
            true
        );
        setTimeout(() => this.authManager?.logout(), 500);
    }

    /**
     * Execute /clear command
     */
    _executeClear() {
        this.messageDisplay.clear();
        this.messageDisplay.addServerMessage(
            '🗑️ Đã xóa lịch sử chat / Chat history cleared',
            true
        );
    }

    /**
     * Toggle hide others server messages
     */
    _toggleHideOthers() {
        this.hideOthersServerMsg = !this.hideOthersServerMsg;
        const status = this.hideOthersServerMsg ? 'ẨN' : 'HIỆN';
        this.messageDisplay.addServerMessage(
            `🔕 ${status} server response của người khác`,
            true
        );
    }

    /**
     * Handle incoming message from server
     */
    _handleMessage(msg) {
        // Handle errors
        if (msg.error) {
            console.error('Server error:', msg.error);
            this.messageDisplay.addServerMessage(`❌ ${msg.error}`, true);
            return;
        }

        // Handle system notifications from server
        if (msg.action === 'system_notification') {
            this._handleSystemNotification(msg);
            return;
        }

        // Handle kicked
        if (msg.action === 'kicked') {
            this.messageDisplay.addServerMessage(
                `🚫 Bạn đã bị kick: ${msg.reason}`,
                true
            );
            setTimeout(() => {
                this.disconnect();
                this.authManager?.logout();
            }, 2000);
            return;
        }

        // Route to appropriate handler
        if (msg.action === 'register_response') {
            if (this.authManager) {
                this.authManager.handleRegisterResponse(msg);
            } else {
                console.error('AuthManager not set!');
            }
        } else if (msg.action === 'login_response') {
            if (this.authManager) {
                this.authManager.handleLoginResponse(msg);
            } else {
                console.error('AuthManager not set!');
            }
        } else if (msg.action === 'poll_response') {
            this._handlePoll(msg);
        } else if (msg.action === 'initial_state') {
            this._handleInitialState(msg);
        } else if (msg.id) {
            this._handleBroadcast(msg);
        }
    }

    /**
     * Handle initial state from server
     */
    _handleInitialState(data) {
        console.log('📦 Received initial state');
        (data.messages || []).forEach(msg => {
            if (msg.action === 'system_notification') {
                this._handleSystemNotification(msg);
            } else {
                this._handleBroadcast(msg);
            }
        });
    }

    /**
     * Handle system notification from server
     */
    _handleSystemNotification(msg) {
        // Skip if already processed
        if (this.processedMessageIds.has(msg.id)) {
            return;
        }

        // Display the notification
        this.messageDisplay.addSystemNotification(msg.text, msg.type);

        // Mark as processed
        this.processedMessageIds.add(msg.id);
        this._cleanupMessageIds();
    }

    /**
     * Handle broadcast message
     */
    _handleBroadcast(msg) {
        // Skip if already processed
        if (this.processedMessageIds.has(msg.id)) {
            return;
        }

        // Handle server messages
        if (msg.isServer) {
            const isForMe = msg.targetUser === this.currentUser;
            
            if (this.hideOthersServerMsg && !isForMe) {
                this.processedMessageIds.add(msg.id);
                return;
            }

            this.messageDisplay.addServerMessage(msg.msg, isForMe);
        }
        // Handle player messages
        else if (msg.name !== this.currentUser) {
            this.messageDisplay.addPlayerMessage(msg.name, msg.msg, msg.isCommand);
        }

        // Mark as processed
        this.processedMessageIds.add(msg.id);
        this._cleanupMessageIds();
    }

    /**
     * Handle poll response
     */
    _handlePoll(data) {
        (data.messages || []).forEach(msg => {
            if (msg.action === 'system_notification') {
                this._handleSystemNotification(msg);
            } else {
                this._handleBroadcast(msg);
            }
        });
    }

    /**
     * Cleanup old message IDs
     */
    _cleanupMessageIds() {
        if (this.processedMessageIds.size > CONFIG.message.maxProcessedIds) {
            const ids = Array.from(this.processedMessageIds)
                .slice(-CONFIG.message.cleanupThreshold);
            this.processedMessageIds = new Set(ids);
        }
    }

    /**
     * Handle connection state changes
     */
    _handleStateChange(newState, oldState) {
        switch (newState) {
            case ConnectionState.CONNECTING:
                this.statusIndicator.setConnecting();
                break;

            case ConnectionState.CONNECTED:
                this.statusIndicator.setOnline();
                break;

            case ConnectionState.RECONNECTING:
                this.statusIndicator.setReconnecting(this.wsManager.reconnectAttempts);
                break;

            case ConnectionState.DISCONNECTED:
                this.statusIndicator.setOffline();
                break;

            case ConnectionState.FAILED:
                this.statusIndicator.setOffline();
                this.toastManager.show(MESSAGES.errors.maxReconnect, 'error');
                break;
        }
    }

    /**
     * Set current user and stats
     */
    setUser(username, stats) {
        this.currentUser = username;
        this.userStats = stats;
    }

    /**
     * Get current user
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * Get user stats
     */
    getStats() {
        return this.userStats;
    }

    /**
     * Reset chat state
     */
    _reset() {
        this.currentUser = null;
        this.userStats = null;
        this.processedMessageIds.clear();
        this.hideOthersServerMsg = false;
        this.messageDisplay.clear();
    }

    /**
     * Show welcome message
     */
    showWelcome() {
        if (!this.currentUser || !this.userStats) return;
        
        const welcomeMsg = MESSAGES.welcome(this.currentUser, this.userStats);
        this.messageDisplay.addServerMessage(welcomeMsg, true);
    }

    /**
     * Request initial messages from server
     */
    requestInitialMessages() {
        if (this.wsManager.isConnected()) {
            this.wsManager.send({ action: 'poll' });
        }
    }
}

export default ChatManager;