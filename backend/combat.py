import random
import json
from admincommand import AdminCommands
from trade import TradeManager
from database import Database, UserManager, DEFAULT_STATS
from inventory import InventoryManager, EquipmentManager, ITEMS, EQUIPMENT_DROP_CHANCE, GOLD_DROP_CHANCE, POTION_DROP_CHANCE
from npc import NPCCommandHandler, QuestManager, StateValidator
from map import MapManager
from party import PartyManager, PartyCommandHandler

def calculate_exp_for_level(level):
    return 100 + (10 * level)

def calculate_total_exp_for_level(target_level):
    total = 0
    for lv in range(1, target_level):
        total += calculate_exp_for_level(lv)
    return total
    
HP_GAIN_PER_LEVEL = 10
DAMAGE_GAIN_PER_LEVEL = 2
PLAYER_DAMAGE_VARIANCE = (-2, 5)
MONSTER_DAMAGE_VARIANCE = (-2, 3)
DEFEAT_HP_LOSS_PERCENT = 0.5

# ==================== COMBAT SYSTEM ====================
class CombatSystem:
    @staticmethod
    def create_monster(map_id):
        """Tạo quái vật ngẫu nhiên từ map hiện tại"""
        monsters = MapManager.get_monsters_in_map(map_id)
        if not monsters:
            return None
        
        monster = random.choice(monsters).copy()
        return {
            'monster_name': monster['name'],
            'monster_hp': monster['health'],
            'monster_max_hp': monster['health'],
            'monster_damage': monster['damage'],
            'monster_exp': monster['exp'],
            'gold_range': tuple(monster['gold_range'])
        }
    
    @staticmethod
    def format_monster_info(combat):
        """Format thông tin quái vật"""
        return (f"👹 {combat['monster_name']}\n"
                f"❤️ HP: {combat['monster_hp']}/{combat['monster_max_hp']}\n"
                f"⚔️ Damage: {combat['monster_damage']}\n"
                f"✨ EXP: {combat['monster_exp']}")
    
    @staticmethod
    def calculate_damage(base_damage, variance):
        """Tính sát thương với random"""
        return base_damage + random.randint(*variance)
    
    @staticmethod
    def check_level_up(stats):
    	required_exp = calculate_exp_for_level(stats['level'])
    	if stats['exp'] >= required_exp:
    	   stats['exp'] -= required_exp
    	   stats['level'] += 1
    	   stats['max_health'] += HP_GAIN_PER_LEVEL
    	   stats['health'] = stats['max_health']
    	   stats['damage'] += DAMAGE_GAIN_PER_LEVEL
    	   return True
    	return False
    
    @staticmethod
    def format_combat_actions():
        """Format các hành động có thể thực hiện"""
        return "\n⚔️ /attack - Tấn công | 🏃 /run - Chạy trốn"
    
    @staticmethod
    def roll_drop(drop_chance):
        """Roll xem có drop item không"""
        return random.random() < drop_chance

# ==================== GAME ENGINE ====================
class GameEngine:
    
    @staticmethod
    def change_map(username, new_map_id):
        """Di chuyển đến map mới"""
        # Validate: phải idle
        ok, error = StateValidator.require_idle(username)
        if not ok:
            return error
        
        db = Database.load()
        
        # Validate map
        map_info = MapManager.get_map_info(new_map_id)
        if not map_info:
            return f"❌ Map '{new_map_id}' không tồn tại!\n" + MapManager.list_all_maps()
        
        stats = UserManager.get_stats(db, username)
        
        # Check already at map
        if stats.get('current_map') == new_map_id:
            return f"❌ Bạn đang ở {map_info['name']} rồi!"
        
        # Move
        old_map_id = stats.get('current_map', 'slum')
        old_map_info = MapManager.get_map_info(old_map_id)
        stats['current_map'] = new_map_id
        UserManager.update_stats(db, username, stats)
        
        return (f"🚶 Bạn đã rời {old_map_info['name'] if old_map_info else 'nơi cũ'}\n"
                f"📍 Đến {map_info['name']}\n\n"
                f"{MapManager.format_map_info(new_map_id, map_info)}\n\n"
                f"💡 Dùng /find để tìm quái vật!")
    
    @staticmethod
    def show_current_map(username):
        """Hiển thị thông tin map hiện tại"""
        db = Database.load()
        stats = UserManager.get_stats(db, username)
        current_map_id = stats.get('current_map', 'slum')
        map_info = MapManager.get_map_info(current_map_id)
        
        if not map_info:
            return "❌ Lỗi: Không tìm thấy thông tin map!"
        
        return (f"📍 Vị trí hiện tại:\n\n"
                f"{MapManager.format_map_info(current_map_id, map_info)}")
    
    @staticmethod
    def find_monster(username):
        """Tìm quái vật - chuyển state sang combat"""
        db = Database.load()
        
        # Nếu đang combat, show lại info
        combat = UserManager.get_combat(db, username)
        if combat:
            stats = UserManager.get_stats(db, username)
            return (f"⚔️ Bạn đang chiến đấu với {combat['monster_name']}!\n\n"
                    f"❤️ {username}: {stats['health']}/{stats['max_health']} HP\n"
                    f"👹 {combat['monster_name']}: {combat['monster_hp']}/{combat['monster_max_hp']} HP"
                    f"{CombatSystem.format_combat_actions()}")
        
        # Validate: phải idle
        ok, error = StateValidator.require_idle(username)
        if not ok:
            return error
        
        # Create combat
        stats = UserManager.get_stats(db, username)
        current_map = stats.get('current_map', 'slum')
        map_info = MapManager.get_map_info(current_map)
        
        combat = CombatSystem.create_monster(current_map)
        if not combat:
            return "❌ Không có quái vật nào trong map này!"
        
        UserManager.set_combat(db, username, combat)
        
        return (f"🎯 Bạn gặp {combat['monster_name']} tại {map_info['name']}!\n\n"
                f"{CombatSystem.format_monster_info(combat)}"
                f"{CombatSystem.format_combat_actions()}")
    
    @staticmethod
    def run_away(username):
        """Chạy trốn - chuyển state về idle"""
        ok, error = StateValidator.require_combat(username)
        if not ok:
            return error
        
        db = Database.load()
        combat = UserManager.get_combat(db, username)
        monster_name = combat['monster_name']
        
        UserManager.set_combat(db, username, None)
        return f"🏃 Bạn đã chạy trốn khỏi {monster_name}!"
    
    @staticmethod
    def attack(username):
        """Thực hiện tấn công"""
        ok, error = StateValidator.require_combat(username)
        if not ok:
            return error
        
        db = Database.load()
        combat = UserManager.get_combat(db, username)
        stats = UserManager.get_stats(db, username)
        log = []
        
        # Player attack
        log.extend(GameEngine._handle_player_attack(username, stats, combat))
        
        # Check monster death
        if combat['monster_hp'] <= 0:
            victory_log, _ = GameEngine._handle_victory(username, stats, combat, db)
            log.extend(victory_log)
            return "\n".join(log)
        
        # Monster counter
        log.extend(GameEngine._handle_monster_attack(username, stats, combat))
        
        # Check player death
        if stats['health'] <= 0:
            defeat_log, _ = GameEngine._handle_defeat(username, stats, combat, db)
            log.extend(defeat_log)
            return "\n".join(log)
        
        # Continue combat
        log.extend(GameEngine._format_ongoing_combat(username, stats, combat))
        UserManager.set_combat(db, username, combat)
        UserManager.update_stats(db, username, stats)
        return "\n".join(log)
    
    @staticmethod
    def show_stats(username):
        """Hiển thị stats với equipment đang mặc"""
        db = Database.load()
        stats = UserManager.get_stats(db, username)
        current_map = stats.get('current_map', 'slum')
        map_info = MapManager.get_map_info(current_map)
        map_name = map_info['name'] if map_info else 'Unknown'

        # Get equipment
        equipment = EquipmentManager.get_equipment(db, username)
        bonus_hp = EquipmentManager.calculate_bonus_hp(equipment)

        # Basic stats
        result = [f"📊 Stats của {username}:"]
        result.append(f"❤️ HP: {stats['health']}/{stats['max_health']}" + 
                      (f" (+{bonus_hp} từ trang bị)" if bonus_hp > 0 else ""))
        result.append(f"⚔️ Damage: {stats['damage']}")
        result.append(f"🌟 Level: {stats['level']}")
        result.append(f"✨ EXP: {stats['exp']}/{calculate_exp_for_level(stats['level'])}")
        result.append(f"📍 Vị trí: {map_name}")
        
        # Equipment
        result.append("\n⚔️ Trang bị:")
        for slot in ['helmet', 'armor', 'boots']:
            item_id = equipment[slot]
            if item_id and item_id in ITEMS:
                item = ITEMS[item_id]
                result.append(f"  🔹 {item['name']} (+{item['hp']} HP)")
            else:
                result.append(f"  🔸 {slot.capitalize()}: (Trống)")
        
        return "\n".join(result)
    
    # ==================== PRIVATE HELPERS ====================
    
    @staticmethod
    def _handle_player_attack(username, stats, combat):
        """Xử lý lượt tấn công của player"""
        player_dmg = CombatSystem.calculate_damage(stats['damage'], PLAYER_DAMAGE_VARIANCE)
        combat['monster_hp'] -= player_dmg
        return [f"⚔️ {username} gây {player_dmg} sát thương!"]

    @staticmethod
    def _handle_victory(username, stats, combat, db):
        """Xử lý khi thắng combat"""
        log = []
        
        # Tính EXP với party bonus
        base_exp = combat['monster_exp']
        party_multiplier = PartyManager.get_exp_multiplier(username)
        total_exp = int(base_exp * party_multiplier)
        
        stats['exp'] += total_exp
        
        # Log victory
        if party_multiplier > 1.0:
            party_bonus_percent = (party_multiplier - 1.0) * 100
            log.append(f"🏆 Chiến thắng {combat['monster_name']}!")
            log.append(f"✨ +{base_exp} EXP (base)")
            log.append(f"🎉 +{party_bonus_percent:.0f}% Party Bonus → {total_exp} EXP")
        else:
            log.append(f"🏆 Chiến thắng {combat['monster_name']}! (+{total_exp} EXP)")
        
        # Drop items
        drops = []
        
        if CombatSystem.roll_drop(GOLD_DROP_CHANCE):
            gold_amount = random.randint(*combat['gold_range'])
            InventoryManager.add_item(db, username, 'gold', gold_amount)
            drops.append(f"💰 +{gold_amount} gold")
        
        if CombatSystem.roll_drop(POTION_DROP_CHANCE):
            InventoryManager.add_item(db, username, 'hp_potion', 1)
            drops.append(f"🧪 +1 HP Potion")
        
        if CombatSystem.roll_drop(EQUIPMENT_DROP_CHANCE):
            equipment_items = [k for k, v in ITEMS.items() if v.get('type') == 'equipment']
            item_id = random.choice(equipment_items)
            InventoryManager.add_item(db, username, item_id, 1)
            drops.append(f"⚔️ +1 {ITEMS[item_id]['name']}")
        
        if drops:
            log.append("📦 Nhặt được: " + " | ".join(drops))
        
        # Quest progress
        quest_msg = QuestManager.update_quest_progress(username, combat['monster_name'])
        if quest_msg:
            log.append(quest_msg)
        
        # Level up
        if CombatSystem.check_level_up(stats):
            log.append(f"🎉 LEVEL UP! Cấp {stats['level']}!")
            log.append(f"📈 HP: {stats['max_health']}, DMG: {stats['damage']}")
        else:
            log.append(f"✨ EXP: {stats['exp']}/{calculate_exp_for_level(stats['level'])}")
        
        log.append(f"❤️ HP: {stats['health']}/{stats['max_health']}")
        
        UserManager.set_combat(db, username, None)
        UserManager.update_stats(db, username, stats)
        return log, True
    
    @staticmethod
    def _handle_monster_attack(username, stats, combat):
        """Xử lý lượt tấn công của quái"""
        monster_dmg = CombatSystem.calculate_damage(combat['monster_damage'], MONSTER_DAMAGE_VARIANCE)
        stats['health'] -= monster_dmg
        return [f"💥 {combat['monster_name']} gây {monster_dmg} sát thương!"]
    
    @staticmethod
    def _handle_defeat(username, stats, combat, db):
        """Xử lý khi thua combat"""
        log = []
        stats['health'] = int(stats['max_health'] * DEFEAT_HP_LOSS_PERCENT)
        log.append(f"💀 Bạn thua {combat['monster_name']}! (-{int(DEFEAT_HP_LOSS_PERCENT * 100)}% HP)")
        log.append(f"❤️ HP: {stats['health']}/{stats['max_health']}")
        
        UserManager.set_combat(db, username, None)
        UserManager.update_stats(db, username, stats)
        return log, True
    
    @staticmethod
    def _format_ongoing_combat(username, stats, combat):
        """Format trạng thái combat đang tiếp diễn"""
        return [
            "",
            f"❤️ {username}: {stats['health']}/{stats['max_health']} HP",
            f"👹 {combat['monster_name']}: {combat['monster_hp']}/{combat['monster_max_hp']} HP",
            "",
            "⚔️ /attack tiếp | 🏃 /run để chạy"
        ]

# ============= COMMAND HANDLER =============
class CommandHandler:
    """Xử lý tất cả commands trong game"""
    
    # Simple commands (no arguments)
    COMMANDS = {
        '/find': GameEngine.find_monster,
        '/attack': GameEngine.attack,
        '/run': GameEngine.run_away,
        '/stats': GameEngine.show_stats,
        '/inv': InventoryManager.show_inventory,
        '/potion': InventoryManager.use_potion,
        '/where': GameEngine.show_current_map,
        '/maps': MapManager.list_all_maps,
        '/npc': NPCCommandHandler.handle_npc,
    }

    @staticmethod
    def handle(cmd, username, add_message_func=None):
        cmd_lower = cmd.lower().strip()
        cmd_parts = cmd.split()
        
        # === HELP COMMAND ===
        if cmd_lower == '/help':
            return CommandHandler._show_help(username)
        
        # === SIMPLE COMMANDS (no args) ===
        if cmd_lower in CommandHandler.COMMANDS:
            return CommandHandler.COMMANDS[cmd_lower](username)
        
        # === COMPLEX COMMANDS (with args) ===
        if not cmd_parts:
            return "❌ Lệnh không hợp lệ. Dùng /help để xem danh sách lệnh."
        
        first_cmd = cmd_parts[0].lower()
        
        # Map navigation
        if first_cmd == '/map':
            if len(cmd_parts) < 2:
                return "❌ Cú pháp: /map <tên_map>\n💡 Dùng /maps để xem danh sách"
            return GameEngine.change_map(username, cmd_parts[1].lower())
        
        # NPC interaction
        if first_cmd == '/move':
            return NPCCommandHandler.handle_move(username, cmd_parts[1:])
        
        if first_cmd == '/leave':
            return NPCCommandHandler.handle_leave(username)
        
        if first_cmd == '/quest':
            return NPCCommandHandler.handle_quest(username, cmd_parts[1:])
        
        if first_cmd == '/buy':
            return NPCCommandHandler.handle_buy(username, cmd_parts[1:])
        
        # Equipment
        if first_cmd == '/equip':
            return EquipmentManager.handle_equipment_command(username, cmd_parts[1:])
        
        if first_cmd == '/unequip':
            return EquipmentManager.handle_unequip_command(username, cmd_parts[1:])
        
        # Trade
        if first_cmd == '/trade':
            return TradeManager.handle_trade_command(username, cmd_parts[1:], add_message_func)
        
        # Party
        if first_cmd == '/party':
            return PartyCommandHandler.handle_party(username, cmd_parts[1:])
        
        # Admin
        if first_cmd == '/admin':
            return AdminCommands.handle_admin_command(username, cmd_parts, add_message_func)
        
        return "❌ Lệnh không tồn tại. Dùng /help để xem danh sách lệnh."
    
    @staticmethod
    def _show_help(username):
        """Hiển thị help menu đẹp và rõ ràng"""
        sections = []
        
        # ===== COMBAT =====
        sections.append("⚔️ CHIẾN ĐẤU")
        sections.append("  /find     - Tìm quái vật")
        sections.append("  /attack   - Tấn công")
        sections.append("  /run      - Chạy trốn")
        sections.append("")
        
        # ===== CHARACTER =====
        sections.append("👤 NHÂN VẬT")
        sections.append("  /stats    - Xem thông tin & trang bị")
        sections.append("  /inv      - Xem kho đồ")
        sections.append("  /potion   - Dùng HP Potion")
        sections.append("")
        
        # ===== EQUIPMENT =====
        sections.append("🛡️ TRANG BỊ")
        sections.append("  /equip <item_id>    - Mặc trang bị")
        sections.append("  /unequip <slot>     - Tháo trang bị")
        sections.append("  💡 VD: /equip copper_helmet")
        sections.append("  💡 Slot: helmet, armor, boots")
        sections.append("")
        
        # ===== MAP & EXPLORATION =====
        sections.append("🗺️ KHÁM PHÁ")
        sections.append("  /where    - Xem vị trí hiện tại")
        sections.append("  /maps     - Xem danh sách map")
        sections.append("  /map <id> - Di chuyển đến map khác")
        sections.append("  💡 VD: /map forest")
        sections.append("")
        
        # ===== NPC =====
        sections.append("🏘️ NPC & NHIỆM VỤ")
        sections.append("  /npc              - Xem NPC trong map")
        sections.append("  /move <npc_id>    - Tiếp cận NPC")
        sections.append("  /leave            - Rời khỏi NPC")
        sections.append("  /quest            - Xem nhiệm vụ hiện tại")
        sections.append("  /quest accept     - Nhận nhiệm vụ")
        sections.append("  /quest decline    - Từ chối nhiệm vụ")
        sections.append("  /quest cancel     - Hủy nhiệm vụ đang làm")
        sections.append("  /buy <số> <item>  - Mua đồ từ shop")
        sections.append("  💡 VD: /move quest, /buy 5 hp_potion")
        sections.append("")
        
        # ===== TRADE =====
        sections.append("💱 GIAO DỊCH")
        sections.append("  /trade <tên> <số> <item>    - Gửi lời mời trade")
        sections.append("  /trade offer <số> <item>    - Đưa counter offer")
        sections.append("  /trade accept               - Chấp nhận trade")
        sections.append("  /trade cancel               - Hủy trade")
        sections.append("  /trade                      - Xem trade hiện tại")
        sections.append("  💡 Item: gold, potion, copper_helmet...")
        sections.append("  💡 VD: /trade Alice 100 gold")
        sections.append("")
        
        # ===== PARTY =====
        sections.append("🎉 PARTY")
        sections.append("  /party                   - Xem party hiện tại")
        sections.append("  /party create            - Tạo party mới")
        sections.append("  /party invite <tên>      - Mời thành viên")
        sections.append("  /party accept            - Chấp nhận lời mời")
        sections.append("  /party decline           - Từ chối lời mời")
        sections.append("  /party kick <tên>        - Kick thành viên (leader)")
        sections.append("  /party leave             - Rời party")
        sections.append("  💡 Bonus: +5% EXP/thành viên")
        sections.append("  💡 VD: 5 người = +25% EXP")
        sections.append("")
        
        # ===== ADMIN (if admin) =====
        if AdminCommands.is_admin(username):
            sections.append("🔧 ADMIN")
            sections.append("  /admin - Xem lệnh quản trị")
            sections.append("")
        
        # ===== FOOTER =====
        sections.append("━━━━━━━━━━━━━━━━━━━━━━━━━━")
        sections.append("💡 Gõ lệnh không có dấu ngoặc <>")
        sections.append("📖 /help - Hiển thị menu này")
        
        return "\n".join(sections)