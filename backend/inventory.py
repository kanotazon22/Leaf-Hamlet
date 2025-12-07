from database import Database, UserManager

# ==================== ITEM DEFINITIONS ====================
# Tất cả items trong game (equipment, consumables, materials...)
ITEMS = {
    # Equipment - Helmet
    'copper_helmet': {'name': 'Mũ Đồng', 'type': 'equipment', 'hp': 5, 'slot': 'helmet'},
    'iron_helmet': {'name': 'Mũ Sắt', 'type': 'equipment', 'hp': 10, 'slot': 'helmet'},
    
    # Equipment - Armor
    'copper_armor': {'name': 'Giáp Đồng', 'type': 'equipment', 'hp': 5, 'slot': 'armor'},
    'iron_armor': {'name': 'Giáp Sắt', 'type': 'equipment', 'hp': 10, 'slot': 'armor'},
    
    # Equipment - Boots
    'copper_boots': {'name': 'Giày Đồng', 'type': 'equipment', 'hp': 5, 'slot': 'boots'},
    'iron_boots': {'name': 'Giày Sắt', 'type': 'equipment', 'hp': 10, 'slot': 'boots'},
    
    # Consumables
    'hp_potion': {'name': 'HP Potion', 'type': 'consumable', 'icon': '🧪'},
    
    # Currency
    'gold': {'name': 'Gold', 'type': 'currency', 'icon': '💰'},
}

# Default inventory structure
DEFAULT_INVENTORY = {
    'gold': 0,
    'hp_potion': 0,
    'items': {}  # {item_id: quantity}
}

# Drop chances
EQUIPMENT_DROP_CHANCE = 0.2
GOLD_DROP_CHANCE = 0.5
POTION_DROP_CHANCE = 0.5
POTION_HEAL_PERCENT = 0.5

# ==================== INVENTORY MANAGER ====================
class InventoryManager:
    
    @staticmethod
    def get_inventory(db, username):
        """Lấy inventory, tự động migrate từ format cũ"""
        user_data = db['users'][username]
        
        # Migrate từ format cũ nếu cần
        if 'inventory' not in user_data:
            user_data['inventory'] = DEFAULT_INVENTORY.copy()
            Database.save(db)
        
        inv = user_data['inventory']
        
        # Đảm bảo có đầy đủ fields
        if 'items' not in inv:
            inv['items'] = {}
        if 'gold' not in inv:
            inv['gold'] = 0
        if 'hp_potion' not in inv:
            inv['hp_potion'] = 0
            
        return inv
    
    @staticmethod
    def update_inventory(db, username, inventory):
        """Cập nhật inventory"""
        db['users'][username]['inventory'] = inventory
        Database.save(db)
    
    @staticmethod
    def add_item(db, username, item_id, amount=1):
        """Thêm item vào inventory"""
        inv = InventoryManager.get_inventory(db, username)
        
        if item_id == 'gold':
            inv['gold'] += amount
        elif item_id == 'hp_potion':
            inv['hp_potion'] += amount
        else:
            inv['items'][item_id] = inv['items'].get(item_id, 0) + amount
        
        InventoryManager.update_inventory(db, username, inv)
        return True
    
    @staticmethod
    def remove_item(db, username, item_id, amount=1):
        """Xóa item khỏi inventory"""
        inv = InventoryManager.get_inventory(db, username)
        
        if item_id == 'gold':
            if inv['gold'] < amount:
                return False
            inv['gold'] -= amount
        elif item_id == 'hp_potion':
            if inv['hp_potion'] < amount:
                return False
            inv['hp_potion'] -= amount
        else:
            if inv['items'].get(item_id, 0) < amount:
                return False
            inv['items'][item_id] -= amount
            if inv['items'][item_id] <= 0:
                del inv['items'][item_id]
        
        InventoryManager.update_inventory(db, username, inv)
        return True
    
    @staticmethod
    def get_item_count(db, username, item_id):
        """Lấy số lượng item"""
        inv = InventoryManager.get_inventory(db, username)
        
        if item_id == 'gold':
            return inv['gold']
        elif item_id == 'hp_potion':
            return inv['hp_potion']
        else:
            return inv['items'].get(item_id, 0)
    
    @staticmethod
    def show_inventory(username):
        """Hiển thị toàn bộ inventory (gộp /inv và /items)"""
        db = Database.load()
        inv = InventoryManager.get_inventory(db, username)
        
        result = [f"🎒 Kho đồ của {username}:\n"]
        
        # Currency
        result.append("💰 Tiền tệ:")
        result.append(f"  💰 Gold: {inv['gold']}")
        
        # Consumables
        result.append("\n🧪 Vật phẩm tiêu hao:")
        result.append(f"  🧪 HP Potion: {inv['hp_potion']}")
        
        # Equipment
        equipment_items = {k: v for k, v in inv['items'].items() 
                          if k in ITEMS and ITEMS[k].get('type') == 'equipment'}
        
        if equipment_items:
            result.append("\n⚔️ Trang bị:")
            for item_id, count in equipment_items.items():
                item = ITEMS[item_id]
                result.append(f"  📦 [{item_id}] {item['name']} x{count} (+{item['hp']} HP)")
            result.append("\n💡 Dùng /equip <item_id> để mặc (vd: /equip copper_helmet)")
        else:
            result.append("\n⚔️ Trang bị: (Trống)")
        
        return "\n".join(result)
    
    @staticmethod
    def use_potion(username):
        """Sử dụng HP potion"""
        db = Database.load()
        inv = InventoryManager.get_inventory(db, username)
        stats = UserManager.get_stats(db, username)
        
        if inv['hp_potion'] <= 0:
            return "❌ Bạn không có HP Potion!"
        
        if stats['health'] >= stats['max_health']:
            return "❌ HP của bạn đã đầy rồi!"
        
        # Sử dụng
        inv['hp_potion'] -= 1
        heal_amount = int(stats['max_health'] * POTION_HEAL_PERCENT)
        stats['health'] = min(stats['health'] + heal_amount, stats['max_health'])
        
        InventoryManager.update_inventory(db, username, inv)
        UserManager.update_stats(db, username, stats)
        
        return (f"🧪 Đã sử dụng HP Potion!\n"
                f"💚 Hồi {heal_amount} HP\n"
                f"❤️ HP hiện tại: {stats['health']}/{stats['max_health']}")

# ==================== EQUIPMENT MANAGER ====================
class EquipmentManager:
    
    @staticmethod
    def get_equipment(db, username):
        """Lấy equipment đang mặc"""
        user = db['users'][username]
        if 'equipment' not in user:
            user['equipment'] = {'helmet': None, 'armor': None, 'boots': None}
            Database.save(db)
        return user['equipment']
    
    @staticmethod
    def calculate_bonus_hp(equipment):
        """Tính tổng HP bonus từ equipment"""
        total_hp = 0
        for slot, item_id in equipment.items():
            if item_id and item_id in ITEMS:
                total_hp += ITEMS[item_id].get('hp', 0)
        return total_hp
    
    @staticmethod
    def equip_item(username, item_id):
        """Trang bị item"""
        if item_id not in ITEMS:
            return f"❌ Item '{item_id}' không tồn tại!"
        
        item = ITEMS[item_id]
        if item.get('type') != 'equipment':
            return f"❌ {item['name']} không phải trang bị!"
        
        db = Database.load()
        equipment = EquipmentManager.get_equipment(db, username)
        inv = InventoryManager.get_inventory(db, username)
        
        # Kiểm tra có item không
        if inv['items'].get(item_id, 0) <= 0:
            return f"❌ Bạn không có {item['name']}!"
        
        slot = item['slot']
        old_item = equipment[slot]
        
        # Tháo item cũ (nếu có) -> trả về inventory
        if old_item:
            inv['items'][old_item] = inv['items'].get(old_item, 0) + 1
        
        # Mặc item mới (lấy từ inventory)
        equipment[slot] = item_id
        inv['items'][item_id] -= 1
        if inv['items'][item_id] <= 0:
            del inv['items'][item_id]
        
        # Cập nhật HP
        stats = UserManager.get_stats(db, username)
        old_bonus = ITEMS[old_item]['hp'] if old_item and old_item in ITEMS else 0
        new_bonus = item['hp']
        
        stats['max_health'] += (new_bonus - old_bonus)
        stats['health'] = min(stats['health'] + (new_bonus - old_bonus), stats['max_health'])
        
        UserManager.update_stats(db, username, stats)
        db['users'][username]['equipment'] = equipment
        InventoryManager.update_inventory(db, username, inv)
        
        result = f"✅ Đã trang bị {item['name']}! (+{new_bonus} HP)"
        if old_item:
            result += f"\n📦 {ITEMS[old_item]['name']} đã vào kho"
        return result
    
    @staticmethod
    def unequip_item(username, slot):
        """Tháo item"""
        if slot not in ['helmet', 'armor', 'boots']:
            return "❌ Slot không hợp lệ! (helmet/armor/boots)"
        
        db = Database.load()
        equipment = EquipmentManager.get_equipment(db, username)
        
        item_id = equipment[slot]
        if not item_id:
            return f"❌ Bạn chưa mặc gì ở slot {slot}!"
        
        inv = InventoryManager.get_inventory(db, username)
        inv['items'][item_id] = inv['items'].get(item_id, 0) + 1
        
        # Giảm HP
        stats = UserManager.get_stats(db, username)
        hp_loss = ITEMS[item_id]['hp']
        stats['max_health'] -= hp_loss
        stats['health'] = min(stats['health'], stats['max_health'])
        
        equipment[slot] = None
        
        UserManager.update_stats(db, username, stats)
        db['users'][username]['equipment'] = equipment
        InventoryManager.update_inventory(db, username, inv)
        
        return f"✅ Đã tháo {ITEMS[item_id]['name']}! (-{hp_loss} HP)"
    
    @staticmethod
    def handle_equipment_command(username, args):
        """Xử lý lệnh /equip"""
        if not args:
            return ("❌ Cú pháp: /equip <item_id>\n"
                   "💡 Dùng /inv để xem trang bị trong kho")
        
        return EquipmentManager.equip_item(username, args[0].lower())
    
    @staticmethod
    def handle_unequip_command(username, args):
        """Xử lý lệnh /unequip"""
        if not args:
            return "❌ Cú pháp: /unequip <helmet/armor/boots>"
        
        return EquipmentManager.unequip_item(username, args[0].lower())