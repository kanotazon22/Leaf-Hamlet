import json

DB_FILE = 'server.json'

# === DEFAULT VALUES ===
DEFAULT_STATS = {
    'health': 100,
    'max_health': 100,
    'damage': 10,
    'level': 1,
    'exp': 0,
    'current_map': 'slum'
}

# ==================== DATABASE HELPER ====================
class Database:
    @staticmethod
    def load():
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    @staticmethod
    def save(data):
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

# ==================== USER MANAGER ====================
class UserManager:
    @staticmethod
    def get_stats(db, username):
        user_data = db['users'][username]
        if 'stats' not in user_data:
            user_data['stats'] = DEFAULT_STATS.copy()
            Database.save(db)
        if 'current_map' not in user_data['stats']:
            user_data['stats']['current_map'] = 'slum'
            Database.save(db)
        return user_data['stats']
    
    @staticmethod
    def update_stats(db, username, stats):
        db['users'][username]['stats'] = stats
        Database.save(db)
    
    # ==================== STATE MANAGEMENT ====================
    @staticmethod
    def get_state(db, username):
        """
        Lấy trạng thái hiện tại của player
        Returns: {
            'type': 'idle' | 'combat' | 'npc',
            'data': combat_data | npc_id | None
        }
        """
        user = db['users'][username]
        return user.get('state', {'type': 'idle', 'data': None})
    
    @staticmethod
    def set_state(db, username, state_type, state_data=None):
        """
        Set trạng thái player
        state_type: 'idle' | 'combat' | 'npc'
        state_data: combat info | npc_id | None
        """
        db['users'][username]['state'] = {
            'type': state_type,
            'data': state_data
        }
        Database.save(db)
    
    @staticmethod
    def is_idle(db, username):
        """Kiểm tra player có đang idle không"""
        state = UserManager.get_state(db, username)
        return state['type'] == 'idle'
    
    @staticmethod
    def is_in_combat(db, username):
        """Kiểm tra player có đang combat không"""
        state = UserManager.get_state(db, username)
        return state['type'] == 'combat'
    
    @staticmethod
    def is_at_npc(db, username, npc_id=None):
        """Kiểm tra player có đang ở NPC không (hoặc ở NPC cụ thể)"""
        state = UserManager.get_state(db, username)
        if state['type'] != 'npc':
            return False
        if npc_id:
            return state['data'] == npc_id
        return True
    
    # ==================== COMBAT ====================
    @staticmethod
    def get_combat(db, username):
        """Lấy combat data nếu đang combat"""
        state = UserManager.get_state(db, username)
        if state['type'] == 'combat':
            return state['data']
        return None
    
    @staticmethod
    def set_combat(db, username, combat_data):
        """Set combat state"""
        if combat_data is None:
            UserManager.set_state(db, username, 'idle')
        else:
            UserManager.set_state(db, username, 'combat', combat_data)
    
    # ==================== NPC ====================
    @staticmethod
    def get_current_npc(db, username):
        """Lấy NPC đang tương tác"""
        state = UserManager.get_state(db, username)
        if state['type'] == 'npc':
            return state['data']
        return None
    
    @staticmethod
    def set_current_npc(db, username, npc_id):
        """Set NPC state"""
        if npc_id is None:
            UserManager.set_state(db, username, 'idle')
        else:
            UserManager.set_state(db, username, 'npc', npc_id)
    
    # ==================== QUEST ====================
    @staticmethod
    def get_quest(db, username):
        """Lấy quest đang làm"""
        return db['users'][username].get('quest')
    
    @staticmethod
    def set_quest(db, username, quest_data):
        """Lưu quest vào database"""
        if quest_data is None:
            db['users'][username].pop('quest', None)
        else:
            db['users'][username]['quest'] = quest_data
        Database.save(db)
    
    @staticmethod
    def get_pending_quest(db, username):
        """Lấy quest offer đang chờ"""
        return db['users'][username].get('pending_quest')
    
    @staticmethod
    def set_pending_quest(db, username, quest_offer):
        """Lưu quest offer vào database"""
        if quest_offer is None:
            db['users'][username].pop('pending_quest', None)
        else:
            db['users'][username]['pending_quest'] = quest_offer
        Database.save(db)