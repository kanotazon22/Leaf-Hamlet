import random
from database import Database, UserManager
from inventory import InventoryManager, ITEMS
from map import MapManager

# ==================== NPC DATA ====================
NPC_DATA = {
    'quest': {
        'name': 'Ông già Quest',
        'icon': '📜',
        'description': 'Nhận nhiệm vụ tiêu diệt quái vật',
        'available_maps': ['slumcity'],
        'type': 'quest',
        'greeting': '👴 "Chào mừng chiến binh! Ta có việc cần nhờ ngươi..."'
    },
    'shop': {
        'name': 'Cửa hàng vật phẩm',
        'icon': '🏪',
        'description': 'Mua bán trang bị và vật phẩm',
        'available_maps': ['slumcity'],
        'type': 'shop',
        'greeting': '🧙 "Chào mừng đến cửa hàng! Hãy xem những gì ta có..."',
        'inventory': {
            'hp_potion': {'price': 20, 'stock': -1},
            'copper_helmet': {'price': 50, 'stock': -1},
            'copper_armor': {'price': 50, 'stock': -1},
            'copper_boots': {'price': 50, 'stock': -1}
        }
    }
}

QUEST_CONFIG = {
    'min_kills': 2,
    'max_kills': 15,
    'gold_per_kill': 10,
    'exp_bonus': 5
}

# ==================== STATE VALIDATOR ====================
class StateValidator:
    """Tập trung validate state - không hardcode ở khắp nơi"""
    
    @staticmethod
    def require_idle(username):
        """Yêu cầu player phải idle"""
        db = Database.load()
        if not UserManager.is_idle(db, username):
            state = UserManager.get_state(db, username)
            if state['type'] == 'combat':
                return False, "❌ Không thể thực hiện khi đang chiến đấu! Dùng /run để chạy trốn."
            elif state['type'] == 'npc':
                npc = NPC_DATA.get(state['data'], {})
                return False, f"❌ Bạn đang ở {npc.get('name', 'NPC')}! Dùng /leave để rời đi."
        return True, None
    
    @staticmethod
    def require_npc(username, npc_id=None):
        """Yêu cầu player phải ở NPC (hoặc NPC cụ thể)"""
        db = Database.load()
        if npc_id:
            if not UserManager.is_at_npc(db, username, npc_id):
                npc = NPC_DATA.get(npc_id, {})
                return False, f"❌ Bạn phải ở {npc.get('name', 'NPC')}! Dùng /move {npc_id}"
        else:
            if not UserManager.is_at_npc(db, username):
                return False, "❌ Bạn không đang ở NPC nào!"
        return True, None
    
    @staticmethod
    def require_combat(username):
        """Yêu cầu player phải đang combat"""
        db = Database.load()
        if not UserManager.is_in_combat(db, username):
            return False, "❌ Bạn không đang chiến đấu! Dùng /find để tìm quái."
        return True, None

# ==================== NPC MANAGER ====================
class NPCManager:
    
    @staticmethod
    def get_npcs_in_map(map_id):
        return {
            npc_id: data 
            for npc_id, data in NPC_DATA.items() 
            if map_id in data['available_maps']
        }
    
    @staticmethod
    def can_access_npc(username, npc_id):
        """Kiểm tra NPC có tồn tại và player có ở đúng map không"""
        npc = NPC_DATA.get(npc_id)
        if not npc:
            return False, f"❌ NPC '{npc_id}' không tồn tại!"
        
        db = Database.load()
        stats = UserManager.get_stats(db, username)
        current_map = stats.get('current_map', 'slum')
        
        if current_map not in npc['available_maps']:
            map_info = MapManager.get_map_info(current_map)
            map_name = map_info['name'] if map_info else current_map
            return False, f"❌ Không có NPC '{npc['name']}' tại {map_name}!"
        
        return True, None
    
    @staticmethod
    def list_npcs(username):
        db = Database.load()
        stats = UserManager.get_stats(db, username)
        current_map = stats.get('current_map', 'slum')
        map_info = MapManager.get_map_info(current_map)
        
        npcs = NPCManager.get_npcs_in_map(current_map)
        
        if not npcs:
            return f"❌ Không có NPC nào tại {map_info['name']}!"
        
        result = [f"🏘️ NPC tại {map_info['name']}:\n"]
        for npc_id, npc_data in npcs.items():
            result.append(f"{npc_data['icon']} /move {npc_id} - {npc_data['name']}")
            result.append(f"   📝 {npc_data['description']}")
        
        result.append("\n💡 Dùng /move <npc_id> để tiếp cận NPC")
        return "\n".join(result)
    
    @staticmethod
    def enter_npc(username, npc_id):
        """Vào NPC (chuyển state sang 'npc')"""
        # Validate state
        ok, error = StateValidator.require_idle(username)
        if not ok:
            return error
        
        # Validate NPC
        can_access, error = NPCManager.can_access_npc(username, npc_id)
        if not can_access:
            return error
        
        # Set state
        db = Database.load()
        UserManager.set_current_npc(db, username, npc_id)
        
        # Route to handler
        npc = NPC_DATA[npc_id]
        if npc['type'] == 'quest':
            return QuestManager.offer_quest(username)
        elif npc['type'] == 'shop':
            return ShopManager.show_shop()
        
        return f"✅ Đã tiếp cận {npc['name']}"
    
    @staticmethod
    def leave_npc(username):
        """Rời NPC (chuyển state về 'idle')"""
        ok, error = StateValidator.require_npc(username)
        if not ok:
            return error
        
        db = Database.load()
        npc_id = UserManager.get_current_npc(db, username)
        npc = NPC_DATA.get(npc_id, {})
        
        # Clear state
        UserManager.set_current_npc(db, username, None)
        
        # Clear pending quest nếu rời quest NPC
        if npc_id == 'quest':
            UserManager.set_pending_quest(db, username, None)
        
        return f"👋 Đã rời khỏi {npc.get('name', 'NPC')}"

# ==================== QUEST MANAGER ====================
class QuestManager:
    
    @staticmethod
    def generate_quest(username):
        db = Database.load()
        stats = UserManager.get_stats(db, username)
        current_map = stats.get('current_map', 'slum')
        
        monsters = MapManager.get_monsters_in_map(current_map)
        if not monsters:
            return None
        
        target_monster = random.choice(monsters)
        kill_count = random.randint(QUEST_CONFIG['min_kills'], QUEST_CONFIG['max_kills'])
        
        return {
            'target': target_monster['name'],
            'required': kill_count,
            'progress': 0,
            'reward_gold': kill_count * QUEST_CONFIG['gold_per_kill'],
            'reward_exp': kill_count * QUEST_CONFIG['exp_bonus'],
            'map': current_map
        }
    
    @staticmethod
    def offer_quest(username):
        """Hiển thị quest offer (phải ở NPC quest)"""
        db = Database.load()
        
        # Check active quest
        current_quest = UserManager.get_quest(db, username)
        if current_quest:
            return (f"❌ Bạn đang có quest:\n"
                   f"🎯 Tiêu diệt {current_quest['target']}: "
                   f"{current_quest['progress']}/{current_quest['required']}\n"
                   f"💡 Hoàn thành hoặc dùng /quest cancel để hủy")
        
        # Check pending offer
        pending = UserManager.get_pending_quest(db, username)
        if pending:
            return (f"📜 Quest đang chờ xác nhận:\n"
                   f"🎯 Tiêu diệt: {pending['target']} x{pending['required']}\n"
                   f"💰 Thưởng: {pending['reward_gold']} gold + {pending['reward_exp']} EXP\n\n"
                   f"✅ /quest accept - Nhận nhiệm vụ\n"
                   f"❌ /quest decline - Từ chối\n"
                   f"💡 /leave - Rời NPC")
        
        # Generate new quest
        quest = QuestManager.generate_quest(username)
        if not quest:
            return "❌ Không thể tạo quest! Map này không có quái vật."
        
        UserManager.set_pending_quest(db, username, quest)
        
        npc = NPC_DATA['quest']
        map_info = MapManager.get_map_info(quest['map'])
        
        return (f"{npc['greeting']}\n\n"
               f"📜 Nhiệm vụ:\n"
               f"🎯 Tiêu diệt: {quest['target']} x{quest['required']}\n"
               f"📍 Địa điểm: {map_info['name']}\n"
               f"💰 Phần thưởng: {quest['reward_gold']} gold + {quest['reward_exp']} EXP\n\n"
               f"✅ /quest accept - Nhận nhiệm vụ\n"
               f"❌ /quest decline - Từ chối\n"
               f"💡 /leave - Rời NPC")
    
    @staticmethod
    def accept_quest(username):
        ok, error = StateValidator.require_npc(username, 'quest')
        if not ok:
            return error
        
        db = Database.load()
        pending = UserManager.get_pending_quest(db, username)
        if not pending:
            return "❌ Không có quest nào để nhận!"
        
        UserManager.set_quest(db, username, pending)
        UserManager.set_pending_quest(db, username, None)
        UserManager.set_current_npc(db, username, None)  # Auto leave
        
        return (f"✅ Đã nhận nhiệm vụ!\n"
               f"🎯 Tiêu diệt: {pending['target']} x{pending['required']}\n"
               f"💰 Thưởng: {pending['reward_gold']} gold + {pending['reward_exp']} EXP\n\n"
               f"💡 Dùng /quest để xem tiến độ")
    
    @staticmethod
    def decline_quest(username):
        ok, error = StateValidator.require_npc(username, 'quest')
        if not ok:
            return error
        
        db = Database.load()
        pending = UserManager.get_pending_quest(db, username)
        if not pending:
            return "❌ Không có quest nào để từ chối!"
        
        UserManager.set_pending_quest(db, username, None)
        UserManager.set_current_npc(db, username, None)  # Auto leave
        
        return '👴 "Không sao, hãy quay lại khi ngươi sẵn sàng..."'
    
    @staticmethod
    def cancel_quest(username):
        db = Database.load()
        quest = UserManager.get_quest(db, username)
        if not quest:
            return "❌ Bạn không có quest nào!"
        
        UserManager.set_quest(db, username, None)
        return f"❌ Đã hủy quest: Tiêu diệt {quest['target']}"
    
    @staticmethod
    def show_quest(username):
        db = Database.load()
        
        # Check pending first
        pending = UserManager.get_pending_quest(db, username)
        if pending:
            return (f"📜 Quest đang chờ xác nhận:\n"
                   f"🎯 Tiêu diệt: {pending['target']} x{pending['required']}\n"
                   f"💰 Thưởng: {pending['reward_gold']} gold + {pending['reward_exp']} EXP\n\n"
                   f"💡 Đến /move quest để accept/decline")
        
        # Check active
        quest = UserManager.get_quest(db, username)
        if not quest:
            return "❌ Bạn không có quest! Dùng /move quest để nhận nhiệm vụ mới."
        
        map_info = MapManager.get_map_info(quest['map'])
        return (f"📜 Quest hiện tại:\n"
               f"🎯 Tiêu diệt: {quest['target']}\n"
               f"📊 Tiến độ: {quest['progress']}/{quest['required']}\n"
               f"💰 Thưởng: {quest['reward_gold']} gold + {quest['reward_exp']} EXP\n"
               f"📍 Địa điểm: {map_info['name']}\n\n"
               f"💡 /quest cancel để hủy")
    
    @staticmethod
    def update_quest_progress(username, killed_monster_name):
        """Gọi khi giết quái - update progress"""
        db = Database.load()
        quest = UserManager.get_quest(db, username)
        if not quest or quest['target'] != killed_monster_name:
            return None
        
        quest['progress'] += 1
        
        # Complete
        if quest['progress'] >= quest['required']:
            return QuestManager.complete_quest(username, quest, db)
        
        UserManager.set_quest(db, username, quest)
        return f"📊 Quest: {quest['progress']}/{quest['required']} {quest['target']}"
    
    @staticmethod
    def complete_quest(username, quest, db):
        stats = UserManager.get_stats(db, username)
        
        InventoryManager.add_item(db, username, 'gold', quest['reward_gold'])
        stats['exp'] += quest['reward_exp']
        UserManager.update_stats(db, username, stats)
        UserManager.set_quest(db, username, None)
        
        return (f"🎉 HOÀN THÀNH QUEST!\n"
               f"✅ Đã tiêu diệt {quest['required']} {quest['target']}\n"
               f"💰 Nhận được: {quest['reward_gold']} gold\n"
               f"✨ Nhận được: {quest['reward_exp']} EXP\n"
               f'👴 "Tốt lắm! Hãy quay lại khi ngươi cần nhiệm vụ mới!"')

# ==================== SHOP MANAGER ====================
class ShopManager:
    
    @staticmethod
    def show_shop():
        shop = NPC_DATA['shop']
        result = [f"{shop['greeting']}\n", f"{shop['icon']} {shop['name']}\n"]
        
        for item_id, details in shop['inventory'].items():
            item = ITEMS.get(item_id)
            if not item:
                continue
            
            stock_text = "∞" if details['stock'] == -1 else details['stock']
            
            if item_id == 'hp_potion':
                result.append(f"🧪 [{item_id}] {item['name']}")
            else:
                result.append(f"⚔️ [{item_id}] {item['name']} (+{item['hp']} HP)")
            
            result.append(f"   💰 Giá: {details['price']} gold | Kho: {stock_text}")
        
        result.append("\n💡 /buy <số> <item_id> - Mua đồ")
        result.append("📝 VD: /buy 5 hp_potion")
        result.append("💡 /leave - Rời shop")
        return "\n".join(result)
    
    @staticmethod
    def buy_item(username, quantity, item_id):
        # Validate state
        ok, error = StateValidator.require_npc(username, 'shop')
        if not ok:
            return error
        
        shop = NPC_DATA['shop']
        
        if item_id not in shop['inventory']:
            return f"❌ Shop không bán '{item_id}'!"
        
        if quantity <= 0:
            return "❌ Số lượng phải lớn hơn 0!"
        
        item_details = shop['inventory'][item_id]
        item = ITEMS.get(item_id)
        
        if item_details['stock'] != -1 and quantity > item_details['stock']:
            return f"❌ Shop chỉ còn {item_details['stock']} {item['name']}!"
        
        total_cost = item_details['price'] * quantity
        
        db = Database.load()
        inv = InventoryManager.get_inventory(db, username)
        
        if inv['gold'] < total_cost:
            return (f"❌ Không đủ tiền!\n"
                   f"💰 Cần: {total_cost} gold | Có: {inv['gold']} gold")
        
        InventoryManager.remove_item(db, username, 'gold', total_cost)
        InventoryManager.add_item(db, username, item_id, quantity)
        
        if item_details['stock'] != -1:
            item_details['stock'] -= quantity
        
        return (f"✅ Mua thành công!\n"
               f"📦 {item['name']} x{quantity}\n"
               f"💰 Tổng: {total_cost} gold | Còn: {inv['gold'] - total_cost} gold\n"
               f'🧙 "Cảm ơn! Hãy quay lại nhé!"')

# ==================== COMMAND HANDLERS ====================
class NPCCommandHandler:
    
    @staticmethod
    def handle_move(username, args):
        if not args:
            return NPCManager.list_npcs(username)
        return NPCManager.enter_npc(username, args[0].lower())
    
    @staticmethod
    def handle_leave(username):
        return NPCManager.leave_npc(username)
    
    @staticmethod
    def handle_quest(username, args):
        if not args:
            return QuestManager.show_quest(username)
        
        action = args[0].lower()
        if action == 'accept':
            return QuestManager.accept_quest(username)
        elif action == 'decline':
            return QuestManager.decline_quest(username)
        elif action == 'cancel':
            return QuestManager.cancel_quest(username)
        
        return "❌ Lệnh không hợp lệ! Dùng /quest accept/decline/cancel"
    
    @staticmethod
    def handle_buy(username, args):
        if len(args) < 2:
            return "❌ Cú pháp: /buy <số> <item_id>\n💡 VD: /buy 5 hp_potion"
        
        try:
            quantity = int(args[0])
        except ValueError:
            return "❌ Số lượng không hợp lệ!"
        
        return ShopManager.buy_item(username, quantity, args[1].lower())
    
    @staticmethod
    def handle_npc(username, args):
        return NPCManager.list_npcs(username)