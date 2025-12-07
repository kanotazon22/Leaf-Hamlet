
import psutil
import time
import threading
import json
from datetime import datetime, timedelta
from collections import deque
import platform

class PerformanceMonitor:
    def __init__(self):
        self.start_time = time.time()
        self.request_count = 0
        self.message_count = 0
        self.command_count = 0
        self.error_count = 0
        self.active_users = set()
        self.last_activity = {}
        self.lock = threading.Lock()
        
        # Extended tracking history (360 samples = 1 hour if sampling every 10s)
        self.cpu_history = deque(maxlen=360)
        self.ram_history = deque(maxlen=360)
        self.request_history = deque(maxlen=360)
        self.error_history = deque(maxlen=360)
        self.user_history = deque(maxlen=360)
        self.last_request_count = 0
        self.last_error_count = 0
        
        # Peak tracking with timestamps
        self.peak_cpu = {'value': 0.0, 'time': None}
        self.peak_ram = {'value': 0.0, 'time': None}
        self.peak_users = {'value': 0, 'time': None}
        self.peak_requests_per_min = {'value': 0, 'time': None}
        
        # Response time tracking
        self.response_times = deque(maxlen=1000)
        
        # Request rate tracking (per minute)
        self.requests_last_minute = deque(maxlen=6)  # 6 samples of 10s each
        
        # User session tracking
        self.user_sessions = {}  # username -> {first_seen, message_count, command_count}
        
        # System info (cached)
        self.system_info = self._get_system_info()
        
        # Check system capabilities
        self.can_read_system_cpu = self._test_system_cpu()
        self.can_read_system_memory = self._test_system_memory()
        
    def _test_system_cpu(self):
        """Test if we can read system-wide CPU stats"""
        try:
            psutil.cpu_percent(interval=0)
            return True
        except (PermissionError, OSError):
            return False
    
    def _test_system_memory(self):
        """Test if we can read system-wide memory stats"""
        try:
            psutil.virtual_memory()
            return True
        except (PermissionError, OSError):
            return False
    
    def _get_system_info(self):
        """Get system information with fallbacks"""
        info = {
            'platform': platform.system(),
            'platform_version': platform.version(),
            'architecture': platform.machine(),
            'processor': platform.processor() or 'Unknown',
            'python_version': platform.python_version(),
        }
        
        try:
            info['cpu_count'] = psutil.cpu_count(logical=False) or psutil.cpu_count()
            info['cpu_threads'] = psutil.cpu_count(logical=True)
        except:
            info['cpu_count'] = 'N/A'
            info['cpu_threads'] = 'N/A'
        
        try:
            info['total_ram'] = psutil.virtual_memory().total / (1024**3)  # GB
        except:
            info['total_ram'] = 'N/A'
        
        return info
    
    def track_request(self):
        with self.lock:
            self.request_count += 1
    
    def track_message(self, username=None):
        with self.lock:
            self.message_count += 1
            if username and username in self.user_sessions:
                self.user_sessions[username]['message_count'] += 1
    
    def track_command(self, username=None):
        with self.lock:
            self.command_count += 1
            if username and username in self.user_sessions:
                self.user_sessions[username]['command_count'] += 1
    
    def track_error(self, error_type=None):
        with self.lock:
            self.error_count += 1
    
    def track_response_time(self, duration_ms):
        with self.lock:
            self.response_times.append(duration_ms)
    
    def track_user(self, username):
        with self.lock:
            now = time.time()
            self.active_users.add(username)
            self.last_activity[username] = now
            
            # Initialize user session if new
            if username not in self.user_sessions:
                self.user_sessions[username] = {
                    'first_seen': now,
                    'message_count': 0,
                    'command_count': 0
                }
            
            # Update peak users
            if len(self.active_users) > self.peak_users['value']:
                self.peak_users = {'value': len(self.active_users), 'time': datetime.now()}
    
    def remove_inactive(self, timeout=300):  # 5 minutes
        with self.lock:
            now = time.time()
            inactive = [u for u, t in self.last_activity.items() if now - t > timeout]
            for u in inactive:
                self.active_users.discard(u)
    
    def _calculate_percentile(self, data, percentile):
        """Calculate percentile from data"""
        if not data:
            return 0
        sorted_data = sorted(data)
        index = int(len(sorted_data) * percentile / 100)
        return sorted_data[min(index, len(sorted_data) - 1)]
    
    def _safe_get_cpu(self, process=None):
        """Safely get CPU usage"""
        try:
            if process:
                return process.cpu_percent(interval=0.1)
            elif self.can_read_system_cpu:
                return psutil.cpu_percent(interval=0.1)
            else:
                return None
        except (PermissionError, OSError):
            self.can_read_system_cpu = False
            return None
    
    def _safe_get_memory(self):
        """Safely get system memory"""
        try:
            if self.can_read_system_memory:
                return psutil.virtual_memory()
            else:
                return None
        except (PermissionError, OSError):
            self.can_read_system_memory = False
            return None
    
    def get_stats(self):
        self.remove_inactive()
        process = psutil.Process()
        
        try:
            mem = process.memory_info()
        except:
            mem = type('obj', (object,), {'rss': 0})()
        
        cpu = self._safe_get_cpu(process) or 0
        uptime = int(time.time() - self.start_time)
        
        # System-wide metrics (with fallback)
        system_cpu = self._safe_get_cpu()
        system_mem = self._safe_get_memory()
        
        # Update history
        self.cpu_history.append(cpu)
        self.ram_history.append(mem.rss / 1024 / 1024)
        self.user_history.append(len(self.active_users))
        
        # Calculate requests delta
        current_requests = self.request_count
        requests_delta = current_requests - self.last_request_count
        self.last_request_count = current_requests
        self.request_history.append(requests_delta)
        self.requests_last_minute.append(requests_delta)
        
        # Calculate errors delta
        current_errors = self.error_count
        errors_delta = current_errors - self.last_error_count
        self.last_error_count = current_errors
        self.error_history.append(errors_delta)
        
        # Update peaks with timestamps
        if cpu > self.peak_cpu['value']:
            self.peak_cpu = {'value': cpu, 'time': datetime.now()}
        if mem.rss / 1024 / 1024 > self.peak_ram['value']:
            self.peak_ram = {'value': mem.rss / 1024 / 1024, 'time': datetime.now()}
        
        # Calculate requests per minute
        requests_per_min = sum(self.requests_last_minute) * 6  # Extrapolate to full minute
        if requests_per_min > self.peak_requests_per_min['value']:
            self.peak_requests_per_min = {'value': requests_per_min, 'time': datetime.now()}
        
        # Calculate comprehensive averages
        avg_cpu = sum(self.cpu_history) / len(self.cpu_history) if self.cpu_history else 0
        avg_ram = sum(self.ram_history) / len(self.ram_history) if self.ram_history else 0
        avg_users = sum(self.user_history) / len(self.user_history) if self.user_history else 0
        
        # Response time statistics
        if self.response_times:
            avg_response = sum(self.response_times) / len(self.response_times)
            min_response = min(self.response_times)
            max_response = max(self.response_times)
            p50_response = self._calculate_percentile(self.response_times, 50)
            p95_response = self._calculate_percentile(self.response_times, 95)
            p99_response = self._calculate_percentile(self.response_times, 99)
        else:
            avg_response = min_response = max_response = 0
            p50_response = p95_response = p99_response = 0
        
        # Calculate trends (last 10 samples vs previous 10)
        def calculate_trend(history, window=10):
            if len(history) < window * 2:
                return 0
            recent = list(history)[-window:]
            previous = list(history)[-window*2:-window]
            recent_avg = sum(recent) / len(recent)
            previous_avg = sum(previous) / len(previous)
            if previous_avg == 0:
                return 0
            return ((recent_avg - previous_avg) / previous_avg) * 100
        
        cpu_trend = calculate_trend(self.cpu_history)
        ram_trend = calculate_trend(self.ram_history)
        request_trend = calculate_trend(self.request_history)
        
        # Health assessment with more granular scoring
        health_score = 100
        status_icon = "🟢"
        status_text = "Excellent"
        warnings = []
        
        # CPU scoring
        if cpu > 80:
            health_score -= 30
            warnings.append("High CPU usage")
        elif cpu > 60:
            health_score -= 20
        elif cpu > 40:
            health_score -= 10
        
        # RAM scoring
        ram_mb = mem.rss / 1024 / 1024
        if ram_mb > 200:
            health_score -= 30
            warnings.append("High memory usage")
        elif ram_mb > 150:
            health_score -= 20
        elif ram_mb > 100:
            health_score -= 10
        
        # Error rate scoring
        if self.error_count > 0:
            error_rate = self.error_count / max(self.request_count, 1)
            if error_rate > 0.1:
                health_score -= 25
                warnings.append(f"High error rate ({error_rate*100:.1f}%)")
            elif error_rate > 0.05:
                health_score -= 15
            elif error_rate > 0.01:
                health_score -= 5
        
        # Response time scoring
        if avg_response > 1000:
            health_score -= 15
            warnings.append("Slow response times")
        elif avg_response > 500:
            health_score -= 10
        
        # Determine status
        if health_score >= 90:
            status_icon = "🟢"
            status_text = "Excellent"
        elif health_score >= 75:
            status_icon = "🟢"
            status_text = "Good"
        elif health_score >= 60:
            status_icon = "🟡"
            status_text = "Fair"
        elif health_score >= 40:
            status_icon = "🟠"
            status_text = "Degraded"
        else:
            status_icon = "🔴"
            status_text = "Critical"
        
        # Format uptime
        uptime_delta = timedelta(seconds=uptime)
        days = uptime_delta.days
        hours = uptime_delta.seconds // 3600
        minutes = (uptime_delta.seconds % 3600) // 60
        seconds = uptime_delta.seconds % 60
        
        if days > 0:
            uptime_str = f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            uptime_str = f"{hours}h {minutes}m {seconds}s"
        else:
            uptime_str = f"{minutes}m {seconds}s"
        
        # Top users by activity
        top_users = sorted(
            self.user_sessions.items(),
            key=lambda x: x[1]['message_count'] + x[1]['command_count'],
            reverse=True
        )[:5]
        
        # Build CPU stats
        cpu_stats = {
            'process': cpu,
            'trend': cpu_trend
        }
        if system_cpu is not None:
            cpu_stats['system'] = system_cpu
        
        # Build RAM stats
        ram_stats = {
            'process_mb': ram_mb,
            'trend': ram_trend
        }
        
        if system_mem:
            ram_stats['process_percent'] = (mem.rss / system_mem.total) * 100
            ram_stats['system_used_gb'] = system_mem.used / (1024**3)
            ram_stats['system_total_gb'] = system_mem.total / (1024**3)
            ram_stats['system_percent'] = system_mem.percent
        
        return {
            'timestamp': datetime.now().isoformat(),
            'uptime': uptime_str,
            'uptime_seconds': uptime,
            'uptime_detailed': {
                'days': days,
                'hours': hours,
                'minutes': minutes,
                'seconds': seconds
            },
            
            # Current metrics
            'cpu': cpu_stats,
            'ram': ram_stats,
            
            # Averages
            'averages': {
                'cpu': avg_cpu,
                'ram_mb': avg_ram,
                'users': avg_users,
                'response_ms': avg_response
            },
            
            # Peaks
            'peaks': {
                'cpu': {
                    'value': self.peak_cpu['value'],
                    'time': self.peak_cpu['time'].strftime('%H:%M:%S') if self.peak_cpu['time'] else 'N/A'
                },
                'ram': {
                    'value': self.peak_ram['value'],
                    'time': self.peak_ram['time'].strftime('%H:%M:%S') if self.peak_ram['time'] else 'N/A'
                },
                'users': {
                    'value': self.peak_users['value'],
                    'time': self.peak_users['time'].strftime('%H:%M:%S') if self.peak_users['time'] else 'N/A'
                },
                'requests_per_min': {
                    'value': self.peak_requests_per_min['value'],
                    'time': self.peak_requests_per_min['time'].strftime('%H:%M:%S') if self.peak_requests_per_min['time'] else 'N/A'
                }
            },
            
            # User metrics
            'users': {
                'online': len(self.active_users),
                'total_sessions': len(self.user_sessions),
                'active_list': list(self.active_users),
                'top_users': [
                    {
                        'username': user,
                        'messages': data['message_count'],
                        'commands': data['command_count'],
                        'total': data['message_count'] + data['command_count']
                    }
                    for user, data in top_users
                ]
            },
            
            # Request metrics
            'requests': {
                'total': self.request_count,
                'messages': self.message_count,
                'commands': self.command_count,
                'errors': self.error_count,
                'per_10s': requests_delta,
                'per_minute': requests_per_min,
                'error_rate': (self.error_count / max(self.request_count, 1)) * 100,
                'trend': request_trend
            },
            
            # Response time statistics
            'response_time': {
                'avg': avg_response,
                'min': min_response,
                'max': max_response,
                'p50': p50_response,
                'p95': p95_response,
                'p99': p99_response,
                'samples': len(self.response_times)
            },
            
            # Health
            'health': {
                'score': max(0, health_score),
                'status_icon': status_icon,
                'status_text': status_text,
                'status': f"{status_icon} {status_text}",
                'warnings': warnings
            },
            
            # System info
            'system': self.system_info,
            
            # Capabilities
            'capabilities': {
                'system_cpu': self.can_read_system_cpu,
                'system_memory': self.can_read_system_memory
            }
        }
    
    def print_stats(self):
        stats = self.get_stats()
        
        # Header
        print("\n" + "="*80)
        print(f"⚡ SYSTEM PERFORMANCE MONITOR".center(80))
        print("="*80)
        
        # Status and Uptime
        print(f"\n⏱️  UPTIME: {stats['uptime']}")
        print(f"🏥 HEALTH: {stats['health']['status']} (Score: {stats['health']['score']}/100)")
        if stats['health']['warnings']:
            print(f"⚠️  WARNINGS: {', '.join(stats['health']['warnings'])}")
        
        # Performance Section
        print(f"\n{'='*80}")
        print("📊 PERFORMANCE METRICS")
        print(f"{'='*80}")
        
        # CPU
        cpu_bar = self._create_bar(stats['cpu']['process'], 100, 30)
        cpu_trend_icon = "📈" if stats['cpu']['trend'] > 5 else "📉" if stats['cpu']['trend'] < -5 else "➡️"
        print(f"🖥️  CPU (Process):")
        print(f"    {cpu_bar} {stats['cpu']['process']:.1f}% {cpu_trend_icon}")
        print(f"    Avg: {stats['averages']['cpu']:.1f}% | Peak: {stats['peaks']['cpu']['value']:.1f}% at {stats['peaks']['cpu']['time']}")
        if 'system' in stats['cpu']:
            print(f"    System: {stats['cpu']['system']:.1f}%")
        
        # RAM
        max_ram = stats['ram'].get('system_total_gb', 1) * 1024 if 'system_total_gb' in stats['ram'] else 500
        ram_bar = self._create_bar(stats['ram']['process_mb'], max_ram, 30)
        ram_trend_icon = "📈" if stats['ram']['trend'] > 5 else "📉" if stats['ram']['trend'] < -5 else "➡️"
        print(f"\n💾 RAM:")
        print(f"    {ram_bar} {stats['ram']['process_mb']:.1f}MB {ram_trend_icon}")
        print(f"    Avg: {stats['averages']['ram_mb']:.1f}MB | Peak: {stats['peaks']['ram']['value']:.1f}MB at {stats['peaks']['ram']['time']}")
        if 'system_used_gb' in stats['ram']:
            print(f"    System: {stats['ram']['system_used_gb']:.1f}GB / {stats['ram']['system_total_gb']:.1f}GB ({stats['ram']['system_percent']:.1f}%)")
        
        # Response Time
        if stats['response_time']['samples'] > 0:
            print(f"\n⚡ RESPONSE TIME:")
            print(f"    Avg: {stats['response_time']['avg']:.2f}ms | Min: {stats['response_time']['min']:.2f}ms | Max: {stats['response_time']['max']:.2f}ms")
            print(f"    P50: {stats['response_time']['p50']:.2f}ms | P95: {stats['response_time']['p95']:.2f}ms | P99: {stats['response_time']['p99']:.2f}ms")
        
        # Users Section
        print(f"\n{'='*40}")
        print("👥 USER ACTIVITY")
        print(f"{'='*40}")
        print(f"Online: {stats['users']['online']} | Total Sessions: {stats['users']['total_sessions']} | Peak: {stats['peaks']['users']['value']} at {stats['peaks']['users']['time']}")
        
        if stats['users']['top_users']:
            print(f"\n🏆 Top Active Users:")
            for user_data in stats['users']['top_users']:
                print(f"    • {user_data['username']}: {user_data['total']} actions ({user_data['messages']}msg, {user_data['commands']}cmd)")
        
        # Requests Section
        print(f"\n{'='*40}")
        print("📡 REQUEST METRICS")
        print(f"{'='*40}")
        req_trend_icon = "📈" if stats['requests']['trend'] > 10 else "📉" if stats['requests']['trend'] < -10 else "➡️"
        print(f"Total Requests: {stats['requests']['total']:,} {req_trend_icon}")
        print(f"Messages: {stats['requests']['messages']:,} | Commands: {stats['requests']['commands']:,}")
        print(f"Errors: {stats['requests']['errors']} ({stats['requests']['error_rate']:.2f}%)")
        print(f"Rate: {stats['requests']['per_10s']} req/10s | {stats['requests']['per_minute']} req/min")
        print(f"Peak Rate: {stats['peaks']['requests_per_min']['value']} req/min at {stats['peaks']['requests_per_min']['time']}")
        
        # System Info (compact)
        sys_info = stats['system']
        cpu_info = f"{sys_info['cpu_count']}C/{sys_info['cpu_threads']}T" if sys_info['cpu_count'] != 'N/A' else 'N/A'
        ram_info = f"{sys_info['total_ram']:.1f}GB" if isinstance(sys_info['total_ram'], float) else 'N/A'
        print(f"\n{'='*40}")
        print(f"💻 System: {sys_info['platform']} | CPU: {cpu_info} | RAM: {ram_info}")
        print("="*40 + "\n")
    
    def _create_bar(self, value, max_value, width=20):
        """Create a visual progress bar"""
        if max_value == 0:
            return "[" + "░" * width + "]"
        filled = int((value / max_value) * width)
        filled = min(filled, width)
        filled = max(filled, 0)
        bar = "█" * filled + "░" * (width - filled)
        return f"[{bar}]"
    
    def get_json_stats(self):
        """Return stats as JSON for API endpoint"""
        return self.get_stats()

# Initialize monitor
monitor = PerformanceMonitor()

def auto_print_stats(interval=10):
    """Background thread to print stats"""
    while True:
        time.sleep(interval)
        try:
            monitor.print_stats()
        except Exception as e:
            print(f"Error printing stats: {e}")

# Auto-start monitoring thread
threading.Thread(target=auto_print_stats, daemon=True).start()