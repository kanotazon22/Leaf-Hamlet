from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import threading
import os
import hashlib
import signal
import sys
import time
from datetime import datetime
from combat import CommandHandler
from database import Database, UserManager, DEFAULT_STATS
from inventory import DEFAULT_INVENTORY
from performance import monitor  # ← IMPORT

# ============= CONSTANTS =============
DB_FILE = 'server.json'
SALT = 'salt42'
XOR_KEY = 42
MAX_MESSAGES = 100
MESSAGE_CLEANUP_THRESHOLD = 150

# ============= GLOBAL STATE =============
msgs = []
msg_id_counter = 0
lock = threading.RLock()

# ============= DATABASE =============
class Database:
    @staticmethod
    def init():
        if not os.path.exists(DB_FILE):
            Database.save({'users': {}})
    
    @staticmethod
    def load():
        with open(DB_FILE, 'r') as f:
            return json.load(f)
    
    @staticmethod
    def save(data):
        with open(DB_FILE, 'w') as f:
            json.dump(data, f, indent=2)

# ============= UTILITIES =============
def hash_password(pw):
    return hashlib.sha256((pw + SALT).encode()).hexdigest()[:16]

def encrypt(s):
    return ''.join(chr(ord(c) ^ XOR_KEY) for c in s)

def decrypt(s):
    return ''.join(chr(ord(c) ^ XOR_KEY) for c in s)

def log_event(event_type, username):
    messages = {
        'register': f'✅ Account {username} has been created',
        'login': f'🎮 Account {username} has logged in',
        'logout': f'👋 Account {username} has logged out'
    }
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{timestamp}] {messages.get(event_type, event_type)}')

def add_message(name, text, is_server=False, target_user=None, is_command=False):
    """Thread-safe message adding với auto-cleanup"""
    global msg_id_counter
    
    with lock:
        msg_id_counter += 1
        
        msg_obj = {
            'id': msg_id_counter,
            'name': name,
            'msg': text,
            'isServer': is_server,
            'isCommand': is_command,
            'targetUser': target_user,
            'timestamp': datetime.now().isoformat()
        }
        
        msgs.append(msg_obj)
        monitor.track_message()  # ← TRACK MESSAGE
        
        # Auto-cleanup khi vượt ngưỡng
        if len(msgs) > MESSAGE_CLEANUP_THRESHOLD:
            msgs[:] = msgs[-MAX_MESSAGES:]

# ============= HTTP HANDLER =============
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
    
    def send_json(self, obj):
        start_time = time.time()  # ← TRACK RESPONSE TIME
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())
        
        duration = (time.time() - start_time) * 1000  # ms
        monitor.track_response_time(duration)  # ← TRACK
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        monitor.track_request()  # ← TRACK REQUEST
        
        if self.path == '/poll':
            with lock:
                result = {
                    'messages': msgs.copy(),
                    'lastId': msg_id_counter,
                    'totalMessages': len(msgs)
                }
                self.send_json(result)
        elif self.path == '/stats':  # ← NEW ENDPOINT
            stats = monitor.get_json_stats()
            self.send_json(stats)
        else:
            self.send_error(404)
    
    def do_POST(self):
        monitor.track_request()  # ← TRACK REQUEST
        
        length = int(self.headers['Content-Length'])
        data = json.loads(self.rfile.read(length))
        
        routes = {
            '/register': self.handle_register,
            '/login': self.handle_login,
            '/logout': self.handle_logout,
            '/send': self.handle_send
        }
        
        handler = routes.get(self.path)
        if handler:
            try:
                handler(data)
            except Exception as e:
                monitor.track_error()  # ← TRACK ERROR
                raise
        else:
            self.send_error(404)
    
    def handle_register(self, data):
        db = Database.load()
        user = data.get('user', '').strip()
        pw = data.get('pw', '')
        
        if not user or not pw:
            self.send_json({'ok': False, 'msg': 'Tên và mật khẩu không được trống'})
            return
        
        if user in db['users']:
            self.send_json({'ok': False, 'msg': 'Tên đã tồn tại'})
            return
        
        db['users'][user] = {
            'password': hash_password(pw),
            'stats': DEFAULT_STATS.copy(),
            'inventory': DEFAULT_INVENTORY.copy()
        }
        Database.save(db)
        log_event('register', user)
        self.send_json({'ok': True})
    
    def handle_login(self, data):
        db = Database.load()
        user = data.get('user', '').strip()
        pw = data.get('pw', '')
        
        if user not in db['users']:
            self.send_json({'ok': False, 'msg': 'Tài khoản không tồn tại'})
            return
        
        user_data = db['users'][user]
        stored_pw = user_data.get('password', user_data)
        
        if stored_pw != hash_password(pw):
            self.send_json({'ok': False, 'msg': 'Sai mật khẩu'})
            return
        
        if 'stats' not in user_data:
            user_data['stats'] = DEFAULT_STATS.copy()
            Database.save(db)
        
        stats = user_data['stats']
        log_event('login', user)
        monitor.track_user(user)  # ← TRACK USER
        self.send_json({'ok': True, 'stats': stats})
    
    def handle_logout(self, data):
        user = data.get('user', '').strip()
        if user:
            log_event('logout', user)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'OK')
    
    def handle_send(self, data):
        msg_text = decrypt(data['msg'])
        username = data['name']
        
        monitor.track_user(username)  # ← UPDATE USER ACTIVITY
        
        if msg_text.startswith('/'):
            add_message(username, msg_text, is_server=False, is_command=True)
            monitor.track_command()  # ← TRACK COMMAND
            
            try:
                result = CommandHandler.handle(msg_text, username, add_message)
            except Exception as e:
                result = f"❌ Lỗi xử lý lệnh: {str(e)}"
                monitor.track_error()  # ← TRACK ERROR
            
            add_message('SERVER', result, is_server=True, target_user=username)
        else:
            add_message(username, msg_text)
        
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'OK')

# ============= MAIN =============
def signal_handler(sig, frame):
    print('\n🛑 Server is shutting down')
    monitor.print_stats()  # ← PRINT FINAL STATS
    sys.exit(0)

if __name__ == '__main__':
    Database.init()
    signal.signal(signal.SIGINT, signal_handler)
    print("🚀 RPG CHAT SERVER v0.5.1 - Performance Monitoring Enabled")
    print("✅ RLock enabled (reentrant lock)")
    print("✅ Message ID tracking enabled")
    print("✅ Auto-cleanup enabled")
    print("✅ Performance monitoring enabled")
    print("📦 Combat system loaded")
    print(f"⚙️ Max messages: {MAX_MESSAGES}")
    print("📡 Endpoints:")
    print("  - /poll    : Get messages")
    print("  - /stats   : Get performance stats")
    print("  - /send    : Send message")
    print("📊 Performance stats will be printed every 10 seconds")
    print()
    
    try:
        HTTPServer(('0.0.0.0', 8765), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\n🛑 Server is shutting down')
        monitor.print_stats()