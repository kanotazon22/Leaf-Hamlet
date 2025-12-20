/**
 * websocket.js - WebSocket Connection Management
 * Handles WebSocket connection, reconnection, and message handling
 */

import { CONFIG, MESSAGES } from './config.js';
import { Async } from './utils.js';

// ==================== CONNECTION STATES ====================
export const ConnectionState = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    RECONNECTING: 'RECONNECTING',
    FAILED: 'FAILED'
};

// ==================== WEBSOCKET MANAGER ====================
export class WebSocketManager {
    constructor() {
        this.ws = null;
        this.state = ConnectionState.DISCONNECTED;
        this.url = null;
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        this.heartbeatInterval = null;
        
        // Event handlers (to be set externally)
        this.onMessage = null;
        this.onStateChange = null;
        this.onError = null;
    }

    /**
     * Connect to WebSocket server
     */
    async connect(serverUrl) {
        if (this.state === ConnectionState.CONNECTING) {
            throw new Error('Connection already in progress');
        }

        this.setState(ConnectionState.CONNECTING);
        this.url = this._normalizeUrl(serverUrl);

        try {
            await this._createConnection();
            await this._waitForOpen();
            
            this.setState(ConnectionState.CONNECTED);
            this.reconnectAttempts = 0;
            this._startHeartbeat();
            
            return this.ws;
        } catch (error) {
            this.setState(ConnectionState.FAILED);
            throw error;
        }
    }

    /**
     * Create WebSocket connection
     */
    _createConnection() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
            } catch (error) {
                reject(error);
                return;
            }

            const timeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    this.ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, CONFIG.websocket.connectionTimeout);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                resolve();
            };

            this.ws.onmessage = (e) => this._handleMessage(e.data);
            
            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                this._handleError(error);
            };

            this.ws.onclose = (e) => {
                clearTimeout(timeout);
                this._handleClose(e);
            };
        });
    }

    /**
     * Wait for WebSocket to be in OPEN state
     */
    async _waitForOpen() {
        await Async.waitFor(
            () => this.ws?.readyState === WebSocket.OPEN,
            CONFIG.websocket.readyTimeout
        );
    }

    /**
     * Send message through WebSocket
     */
    send(data) {
        if (!this.isConnected()) {
            throw new Error('WebSocket not connected');
        }

        try {
            const payload = typeof data === 'string' ? data : JSON.stringify(data);
            this.ws.send(payload);
            return true;
        } catch (error) {
            this._handleError(error);
            return false;
        }
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this._stopHeartbeat();
        this._clearReconnectTimeout();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.setState(ConnectionState.DISCONNECTED);
        this.reconnectAttempts = 0;
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN 
            && this.state === ConnectionState.CONNECTED;
    }

    /**
     * Get current connection state
     */
    getState() {
        return this.state;
    }

    /**
     * Handle incoming message
     */
    _handleMessage(data) {
        try {
            const message = JSON.parse(data);
            if (this.onMessage) {
                this.onMessage(message);
            }
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    }

    /**
     * Handle WebSocket error
     */
    _handleError(error) {
        console.error('WebSocket error:', error);
        if (this.onError) {
            this.onError(error);
        }
    }

    /**
     * Handle WebSocket close
     */
    _handleClose(event) {
        const wasConnected = this.state === ConnectionState.CONNECTED;
        
        this._stopHeartbeat();
        this.setState(ConnectionState.DISCONNECTED);

        if (wasConnected) {
            this._attemptReconnect();
        }
    }

    /**
     * Attempt to reconnect
     */
    _attemptReconnect() {
        if (this.reconnectAttempts >= CONFIG.websocket.maxReconnectAttempts) {
            this.setState(ConnectionState.FAILED);
            return;
        }

        this.setState(ConnectionState.RECONNECTING);
        this.reconnectAttempts++;

        const delay = CONFIG.websocket.reconnectDelay * this.reconnectAttempts;

        this.reconnectTimeout = setTimeout(async () => {
            try {
                await this.connect(this.url);
            } catch (error) {
                console.error('Reconnect failed:', error);
            }
        }, delay);
    }

    /**
     * Clear reconnect timeout
     */
    _clearReconnectTimeout() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    /**
     * Start heartbeat to keep connection alive
     */
    _startHeartbeat() {
        this._stopHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send({ action: 'ping' });
            }
        }, CONFIG.websocket.heartbeatInterval);
    }

    /**
     * Stop heartbeat
     */
    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Set connection state and notify listeners
     */
    setState(newState) {
        const oldState = this.state;
        this.state = newState;

        if (oldState !== newState && this.onStateChange) {
            this.onStateChange(newState, oldState);
        }
    }

    /**
     * Normalize server URL to WebSocket URL
     */
    _normalizeUrl(url) {
        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            return url;
        }

        const cleanUrl = url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

        // Check tunnel patterns
        for (const { regex, protocol, port } of CONFIG.tunnel.patterns) {
            if (regex.test(cleanUrl)) {
                return port ? `${protocol}://${cleanUrl}:${port}` : `${protocol}://${cleanUrl}`;
            }
        }

        // Default
        return `${CONFIG.tunnel.defaultProtocol}://${cleanUrl}`;
    }

    /**
     * Measure ping latency
     */
    async measurePing() {
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        return new Promise((resolve, reject) => {
            const startTime = performance.now();
            const pingId = Date.now();
            
            const timeout = setTimeout(() => {
                reject(new Error('Ping timeout'));
            }, 5000);

            const originalHandler = this.ws.onmessage;
            
            this.ws.onmessage = (e) => {
                clearTimeout(timeout);
                const latency = Math.round(performance.now() - startTime);
                this.ws.onmessage = originalHandler;
                resolve(latency);
            };

            this.send({ action: 'poll', _ping: pingId });
        });
    }
}

export default WebSocketManager;
