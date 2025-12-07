import time
import threading
from collections import defaultdict, deque
from datetime import datetime
import hashlib

class Shield:
    def __init__(self):
        self.lock = threading.Lock()
        
        # Rate limiting per IP
        self.ip_requests = defaultdict(lambda: deque(maxlen=100))
        self.ip_blocked = {}
        self.ip_warnings = defaultdict(int)
        
        # Rate limiting per user
        self.user_requests = defaultdict(lambda: deque(maxlen=100))
        self.user_blocked = {}
        
        # Request pattern detection
        self.ip_patterns = defaultdict(lambda: {
            'poll': deque(maxlen=50),
            'send': deque(maxlen=50),
            'register': deque(maxlen=20)
        })
        
        # Blacklist & Whitelist
        self.blacklist = set()
        self.whitelist = set()  # ← FIX: BỎ WHITELIST MẶC ĐỊNH!
        
        # Statistics
        self.stats = {
            'blocked_requests': 0,
            'warnings_issued': 0,
            'ips_banned': 0,
            'attacks_detected': 0
        }
        
        # Configuration
        self.config = {
            # Rate limits (requests per time window)
            'max_requests_per_second': 10,
            'max_requests_per_minute': 300,
            'max_poll_per_minute': 200,
            'max_send_per_minute': 100,
            'max_register_per_hour': 5,
            
            # Block durations (seconds)
            'soft_block_duration': 60,
            'hard_block_duration': 600,
            'permaban_duration': 86400,
            
            # Thresholds
            'warning_threshold': 3,
            'burst_threshold': 20,
            'suspicion_score_max': 100,
            
            # Advanced
            'enable_adaptive_limits': True,
            'enable_pattern_detection': True,
            'enable_fingerprinting': True
        }
        
        # Cleanup thread
        threading.Thread(target=self._cleanup_loop, daemon=True).start()
    
    def _cleanup_loop(self):
        """Cleanup expired blocks every 30 seconds"""
        while True:
            time.sleep(30)
            now = time.time()
            
            with self.lock:
                # Cleanup IP blocks
                expired_ips = [ip for ip, unblock_time in self.ip_blocked.items() if now >= unblock_time]
                for ip in expired_ips:
                    del self.ip_blocked[ip]
                    self.ip_warnings[ip] = max(0, self.ip_warnings[ip] - 1)
                
                # Cleanup user blocks
                expired_users = [user for user, unblock_time in self.user_blocked.items() if now >= unblock_time]
                for user in expired_users:
                    del self.user_blocked[user]
    
    def _calculate_suspicion_score(self, ip, endpoint):
        """Calculate suspicion score based on request patterns"""
        score = 0
        now = time.time()
        
        # Check burst requests
        recent_requests = [t for t in self.ip_requests[ip] if now - t < 1]
        if len(recent_requests) > self.config['burst_threshold']:
            score += 50
        
        # Check endpoint-specific patterns
        patterns = self.ip_patterns[ip]
        
        # Spam poll requests
        recent_polls = [t for t in patterns['poll'] if now - t < 10]
        if len(recent_polls) > 50:
            score += 30
        
        # Spam send requests
        recent_sends = [t for t in patterns['send'] if now - t < 10]
        if len(recent_sends) > 30:
            score += 25
        
        # Multiple register attempts
        recent_registers = [t for t in patterns['register'] if now - t < 3600]
        if len(recent_registers) > 3:
            score += 40
        
        # Check warnings
        score += self.ip_warnings[ip] * 10
        
        return min(score, self.config['suspicion_score_max'])
    
    def _block_ip(self, ip, duration, reason):
        """Block an IP address"""
        with self.lock:
            self.ip_blocked[ip] = time.time() + duration
            self.ip_warnings[ip] += 1
            self.stats['ips_banned'] += 1
            
            timestamp = datetime.now().strftime('%H:%M:%S')
            print(f"[{timestamp}] 🛡️ BLOCKED: {ip} for {duration}s - Reason: {reason}")
    
    def check_request(self, ip, endpoint, username=None):
        """
        Check if request should be allowed
        Returns: (allowed: bool, reason: str, status_code: int)
        """
        now = time.time()
        
        # Whitelist bypass
        if ip in self.whitelist:
            return (True, "Whitelisted", 200)
        
        # Blacklist check
        if ip in self.blacklist:
            self.stats['blocked_requests'] += 1
            return (False, "IP permanently banned", 403)
        
        with self.lock:
            # Check if IP is blocked
            if ip in self.ip_blocked:
                if now < self.ip_blocked[ip]:
                    remaining = int(self.ip_blocked[ip] - now)
                    self.stats['blocked_requests'] += 1
                    return (False, f"IP blocked for {remaining}s", 429)
                else:
                    del self.ip_blocked[ip]
            
            # Check if user is blocked
            if username and username in self.user_blocked:
                if now < self.user_blocked[username]:
                    remaining = int(self.user_blocked[username] - now)
                    self.stats['blocked_requests'] += 1
                    return (False, f"User blocked for {remaining}s", 429)
                else:
                    del self.user_blocked[username]
            
            # Track request
            self.ip_requests[ip].append(now)
            self.ip_patterns[ip][endpoint].append(now)
            if username:
                self.user_requests[username].append(now)
            
            # Rate limiting - Requests per second
            recent_1s = [t for t in self.ip_requests[ip] if now - t < 1]
            if len(recent_1s) > self.config['max_requests_per_second']:
                self._block_ip(ip, self.config['soft_block_duration'], f"Rate limit: {len(recent_1s)} req/s")
                self.stats['blocked_requests'] += 1
                return (False, "Rate limit exceeded (per second)", 429)
            
            # Rate limiting - Requests per minute
            recent_1m = [t for t in self.ip_requests[ip] if now - t < 60]
            if len(recent_1m) > self.config['max_requests_per_minute']:
                self._block_ip(ip, self.config['hard_block_duration'], f"Rate limit: {len(recent_1m)} req/min")
                self.stats['blocked_requests'] += 1
                return (False, "Rate limit exceeded (per minute)", 429)
            
            # Endpoint-specific limits
            if endpoint == 'poll':
                recent_polls = [t for t in self.ip_patterns[ip]['poll'] if now - t < 60]
                if len(recent_polls) > self.config['max_poll_per_minute']:
                    self._block_ip(ip, self.config['soft_block_duration'], f"Poll spam: {len(recent_polls)}/min")
                    self.stats['attacks_detected'] += 1
                    return (False, "Poll rate limit exceeded", 429)
            
            elif endpoint == 'send':
                recent_sends = [t for t in self.ip_patterns[ip]['send'] if now - t < 60]
                if len(recent_sends) > self.config['max_send_per_minute']:
                    self._block_ip(ip, self.config['hard_block_duration'], f"Message spam: {len(recent_sends)}/min")
                    self.stats['attacks_detected'] += 1
                    return (False, "Message rate limit exceeded", 429)
            
            elif endpoint == 'register':
                recent_registers = [t for t in self.ip_patterns[ip]['register'] if now - t < 3600]
                if len(recent_registers) > self.config['max_register_per_hour']:
                    self._block_ip(ip, self.config['permaban_duration'], f"Register spam: {len(recent_registers)}/hour")
                    self.stats['attacks_detected'] += 1
                    return (False, "Register rate limit exceeded", 429)
            
            # Advanced pattern detection
            if self.config['enable_pattern_detection']:
                suspicion_score = self._calculate_suspicion_score(ip, endpoint)
                
                if suspicion_score >= 80:
                    self._block_ip(ip, self.config['hard_block_duration'], f"High suspicion score: {suspicion_score}")
                    self.stats['attacks_detected'] += 1
                    return (False, "Suspicious activity detected", 429)
                elif suspicion_score >= 50:
                    self.stats['warnings_issued'] += 1
                    # Warning but allow
            
            return (True, "OK", 200)
    
    def add_to_blacklist(self, ip):
        """Permanently ban an IP"""
        with self.lock:
            self.blacklist.add(ip)
            print(f"🚫 BLACKLISTED: {ip}")
    
    def add_to_whitelist(self, ip):
        """Add IP to whitelist"""
        with self.lock:
            self.whitelist.add(ip)
            print(f"✅ WHITELISTED: {ip}")
    
    def get_stats(self):
        """Get shield statistics"""
        with self.lock:
            return {
                'blocked_requests': self.stats['blocked_requests'],
                'warnings_issued': self.stats['warnings_issued'],
                'ips_banned': self.stats['ips_banned'],
                'attacks_detected': self.stats['attacks_detected'],
                'currently_blocked': len(self.ip_blocked),
                'blacklisted': len(self.blacklist),
                'whitelisted': len(self.whitelist)
            }
    
    def print_stats(self):
        """Print shield statistics"""
        stats = self.get_stats()
        print(f"\n{'='*70}")
        print(f"🛡️  SHIELD PROTECTION STATS")
        print(f"{'='*70}")
        print(f"🚫 Blocked Requests: {stats['blocked_requests']}")
        print(f"⚠️  Warnings Issued: {stats['warnings_issued']}")
        print(f"🔨 IPs Banned: {stats['ips_banned']}")
        print(f"🎯 Attacks Detected: {stats['attacks_detected']}")
        print(f"🔒 Currently Blocked: {stats['currently_blocked']}")
        print(f"⛔ Blacklisted: {stats['blacklisted']}")
        print(f"✅ Whitelisted: {stats['whitelisted']}")
        print(f"{'='*70}\n")

# Global shield instance
shield = Shield()