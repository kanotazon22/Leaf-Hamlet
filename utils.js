/**
 * utils.js - Utility Functions (FIXED)
 * Common helper functions used across the application
 */

import { CONFIG } from './config.js';

// ==================== DOM UTILITIES ====================
export const DOM = {
    /**
     * Get element by ID
     */
    get(id) {
        return document.getElementById(id);
    },

    /**
     * Create element with properties
     */
    create(tag, props = {}, children = []) {
        const el = document.createElement(tag);
        
        Object.entries(props).forEach(([key, value]) => {
            if (key === 'class') {
                el.className = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key.startsWith('on')) {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                el[key] = value;
            }
        });

        children.forEach(child => {
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                el.appendChild(child);
            }
        });

        return el;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Scroll element to bottom smoothly
     */
    scrollToBottom(element, smooth = true) {
        if (!element) return;
        
        if (smooth && CONFIG.ui.scrollBehavior === 'smooth') {
            element.scrollTo({
                top: element.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            element.scrollTop = element.scrollHeight;
        }
    },

    /**
     * Check if element is scrolled to bottom
     */
    isAtBottom(element, threshold = 100) {
        if (!element) return false;
        return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
    }
};

// ⭐ FIX: Đổi tên từ "String" thành "StrUtils" để tránh conflict
// ==================== STRING UTILITIES ====================
export const StrUtils = {
    /**
     * Encrypt/decrypt text using XOR
     */
    xorCipher(text, key = CONFIG.message.encryptionKey) {
        return [...text]
            .map(c => String.fromCharCode(c.charCodeAt(0) ^ key))
            .join('');
    },

    /**
     * Truncate text with ellipsis
     */
    truncate(text, maxLength = 50) {
        return text.length > maxLength 
            ? text.substring(0, maxLength - 3) + '...' 
            : text;
    },

    /**
     * Format timestamp
     */
    formatTime(timestamp = Date.now()) {
        return new Date(timestamp).toLocaleTimeString('vi-VN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    /**
     * Parse command and arguments
     */
    parseCommand(text) {
        const trimmed = text.trim();
        if (!trimmed.startsWith('/')) return null;
        
        const [command, ...args] = trimmed.split(' ');
        return {
            command: command.toLowerCase(),
            args,
            raw: trimmed
        };
    }
};

// ==================== ASYNC UTILITIES ====================
export const Async = {
    /**
     * Wait for condition to be true
     */
    waitFor(condition, timeout = 5000, interval = 100) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            
            const check = () => {
                if (condition()) {
                    resolve();
                } else if (Date.now() - start > timeout) {
                    reject(new Error('Timeout waiting for condition'));
                } else {
                    setTimeout(check, interval);
                }
            };
            
            check();
        });
    },

    /**
     * Sleep for specified duration
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Retry function with exponential backoff
     */
    async retry(fn, maxAttempts = 3, delay = 1000) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxAttempts - 1) throw error;
                await this.sleep(delay * Math.pow(2, i));
            }
        }
    }
};

// ==================== VALIDATION UTILITIES ====================
export const Validate = {
    /**
     * Check if string is empty or whitespace
     */
    isEmpty(str) {
        return !str || str.trim().length === 0;
    },

    /**
     * Validate URL format
     */
    isValidUrl(str) {
        try {
            new URL(str.startsWith('http') ? str : `https://${str}`);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Validate username (alphanumeric + underscore)
     */
    isValidUsername(str) {
        return /^[a-zA-Z0-9_]{3,20}$/.test(str);
    },

    /**
     * Validate password strength
     */
    isStrongPassword(str) {
        return str.length >= 6;
    }
};

// ==================== STORAGE UTILITIES ====================
export const Storage = {
    /**
     * Get item from localStorage with error handling
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage.get error:', error);
            return defaultValue;
        }
    },

    /**
     * Set item in localStorage with error handling
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage.set error:', error);
            return false;
        }
    },

    /**
     * Remove item from localStorage
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage.remove error:', error);
            return false;
        }
    },

    /**
     * Clear all items from localStorage
     */
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Storage.clear error:', error);
            return false;
        }
    }
};

// ==================== PERFORMANCE UTILITIES ====================
export const Performance = {
    /**
     * Debounce function calls
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function calls
     */
    throttle(func, limit = 300) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Measure function execution time
     */
    async measure(name, fn) {
        const start = performance.now();
        try {
            const result = await fn();
            const duration = performance.now() - start;
            console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            console.error(`⏱️ ${name} failed after ${duration.toFixed(2)}ms:`, error);
            throw error;
        }
    }
};

// ==================== EVENT UTILITIES ====================
export const Events = {
    /**
     * Create custom event emitter
     */
    createEmitter() {
        const listeners = new Map();

        return {
            on(event, callback) {
                if (!listeners.has(event)) {
                    listeners.set(event, []);
                }
                listeners.get(event).push(callback);
            },

            off(event, callback) {
                if (!listeners.has(event)) return;
                const callbacks = listeners.get(event);
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            },

            emit(event, ...args) {
                if (!listeners.has(event)) return;
                listeners.get(event).forEach(callback => {
                    try {
                        callback(...args);
                    } catch (error) {
                        console.error(`Event ${event} handler error:`, error);
                    }
                });
            },

            clear() {
                listeners.clear();
            }
        };
    }
};

// ==================== MOBILE UTILITIES ====================
export const Mobile = {
    /**
     * Check if device is mobile
     */
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(navigator.userAgent);
    },

    /**
     * Prevent double-tap zoom
     */
    preventDoubleTapZoom() {
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap <= 300) {
                e.preventDefault();
            }
            lastTap = now;
        }, false);
    },

    /**
     * Handle safe area insets
     */
    applySafeArea() {
        const root = document.documentElement;
        if (CSS.supports('padding: env(safe-area-inset-bottom)')) {
            root.style.setProperty('--safe-area-bottom', 'env(safe-area-inset-bottom)');
        }
    }
};

// ⭐ FIX: Export default với tên đúng
export default {
    DOM,
    StrUtils,  // Changed from "String"
    Async,
    Validate,
    Storage,
    Performance,
    Events,
    Mobile
};