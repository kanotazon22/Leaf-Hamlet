import random
import json

# Import các constants từ combat.py
EXP_PER_LEVEL = 100
HP_GAIN_PER_LEVEL = 10
DAMAGE_GAIN_PER_LEVEL = 2

class AdminCommands:
    ADMIN_USERNAME = 'admin'
    
    @staticmethod
    def is_admin(username):
        """Kiểm tra xem user có phải admin không"""
        return username.lower() == AdminCommands.ADMIN_USERNAME.lower()
    
    @staticmethod
    def heal_player(username, args, add_message_func=None):
        """Admin hồi phục HP cho người chơi"""
        from combat import Database, UserManager
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        if not args:
            return "❌ Cú pháp: /admin heal <tên_người_chơi>"
        
        target_user = args[0].strip()
        
        db = Database.load()
        
        if target_user not in db['users']:
            return f"❌ Người chơi '{target_user}' không tồn tại!"
        
        stats = UserManager.get_stats(db, target_user)
        
        if stats['health'] >= stats['max_health']:
            return f"❌ {target_user} đã có HP đầy rồi!"
        
        old_hp = stats['health']
        stats['health'] = stats['max_health']
        UserManager.update_stats(db, target_user, stats)
        
        if add_message_func:
            add_message_func('SERVER', 
                           f"💚 Admin đã hồi phục HP cho bạn!\n❤️ HP: {old_hp} → {stats['health']}/{stats['max_health']}", 
                           is_server=True, 
                           target_user=target_user)
        
        return f"✅ Đã hồi phục HP cho {target_user}: {old_hp} → {stats['health']}/{stats['max_health']}"
    
    @staticmethod
    def give_gold(username, args, add_message_func=None):
        """Admin tặng gold cho người chơi"""
        from combat import Database
        from inventory import InventoryManager  # ← Import mới
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        if len(args) < 2:
            return "❌ Cú pháp: /admin gold <tên> <số_lượng>"
        
        target_user = args[0].strip()
        
        try:
            amount = int(args[1])
            if amount <= 0:
                return "❌ Số lượng phải lớn hơn 0!"
        except ValueError:
            return "❌ Số lượng không hợp lệ!"
        
        db = Database.load()
        
        if target_user not in db['users']:
            return f"❌ Người chơi '{target_user}' không tồn tại!"
        
        InventoryManager.add_item(db, target_user, 'gold', amount)
        new_gold = InventoryManager.get_item_count(db, target_user, 'gold')
        
        if add_message_func:
            add_message_func('SERVER', 
                           f"💰 Admin đã tặng bạn {amount} gold!\n💰 Gold hiện tại: {new_gold}", 
                           is_server=True, 
                           target_user=target_user)
        
        return f"✅ Đã tặng {amount} gold cho {target_user} | Tổng: {new_gold}"
    
    @staticmethod
    def give_potion(username, args, add_message_func=None):
        """Admin tặng potion cho người chơi"""
        from combat import Database
        from inventory import InventoryManager  # ← Import mới
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        if len(args) < 2:
            return "❌ Cú pháp: /admin potion <tên> <số_lượng>"
        
        target_user = args[0].strip()
        
        try:
            amount = int(args[1])
            if amount <= 0:
                return "❌ Số lượng phải lớn hơn 0!"
        except ValueError:
            return "❌ Số lượng không hợp lệ!"
        
        db = Database.load()
        
        if target_user not in db['users']:
            return f"❌ Người chơi '{target_user}' không tồn tại!"
        
        InventoryManager.add_item(db, target_user, 'hp_potion', amount)
        new_potion = InventoryManager.get_item_count(db, target_user, 'hp_potion')
        
        if add_message_func:
            add_message_func('SERVER', 
                           f"🧪 Admin đã tặng bạn {amount} HP Potion!\n🧪 Potion hiện tại: {new_potion}", 
                           is_server=True, 
                           target_user=target_user)
        
        return f"✅ Đã tặng {amount} potion cho {target_user} | Tổng: {new_potion}"
    
    @staticmethod
    def set_level(username, args, add_message_func=None):
        """Admin đặt level cho người chơi"""
        from combat import Database, UserManager
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        if len(args) < 2:
            return "❌ Cú pháp: /admin level <tên> <level>"
        
        target_user = args[0].strip()
        
        try:
            new_level = int(args[1])
            if new_level <= 0 or new_level > 100:
                return "❌ Level phải từ 1 đến 100!"
        except ValueError:
            return "❌ Level không hợp lệ!"
        
        db = Database.load()
        
        if target_user not in db['users']:
            return f"❌ Người chơi '{target_user}' không tồn tại!"
        
        stats = UserManager.get_stats(db, target_user)
        old_level = stats['level']
        
        stats['level'] = new_level
        stats['max_health'] = 100 + (new_level - 1) * HP_GAIN_PER_LEVEL
        stats['health'] = stats['max_health']
        stats['damage'] = 10 + (new_level - 1) * DAMAGE_GAIN_PER_LEVEL
        stats['exp'] = 0
        
        UserManager.update_stats(db, target_user, stats)
        
        if add_message_func:
            add_message_func('SERVER', 
                           f"⭐ Admin đã thay đổi level của bạn!\n🌟 Level: {old_level} → {new_level}\n❤️ HP: {stats['max_health']}\n⚔️ DMG: {stats['damage']}", 
                           is_server=True, 
                           target_user=target_user)
        
        return f"✅ Đã đặt level {new_level} cho {target_user} | HP: {stats['max_health']}, DMG: {stats['damage']}"
    
    @staticmethod
    def kill_monster(username, args, add_message_func=None):
        """Admin giết quái cho người chơi"""
        from combat import Database, UserManager, GameEngine
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        if not args:
            return "❌ Cú pháp: /admin kill <tên_người_chơi>"
        
        target_user = args[0].strip()
        
        db = Database.load()
        
        if target_user not in db['users']:
            return f"❌ Người chơi '{target_user}' không tồn tại!"
        
        combat = UserManager.get_combat(db, target_user)
        
        if not combat:
            return f"❌ {target_user} không đang chiến đấu!"
        
        monster_name = combat['monster_name']
        
        stats = UserManager.get_stats(db, target_user)
        combat['monster_hp'] = 0
        
        victory_log, _ = GameEngine._handle_victory(target_user, stats, combat, db)
        
        if add_message_func:
            add_message_func('SERVER', 
                           f"⚡ Admin đã giúp bạn hạ gục {monster_name}!\n" + "\n".join(victory_log), 
                           is_server=True, 
                           target_user=target_user)
        
        return f"✅ Đã giết {monster_name} cho {target_user}"
    
    @staticmethod
    def list_players(username, args, add_message_func=None):
        """Admin xem danh sách người chơi"""
        from combat import Database, UserManager
        from inventory import InventoryManager  # ← Import mới
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        db = Database.load()
        
        if not db['users']:
            return "❌ Không có người chơi nào!"
        
        result = ["👥 Danh sách người chơi:"]
        
        for user in db['users']:
            stats = UserManager.get_stats(db, user)
            combat = UserManager.get_combat(db, user)
            
            gold = InventoryManager.get_item_count(db, user, 'gold')
            potion = InventoryManager.get_item_count(db, user, 'hp_potion')
            
            status = "⚔️ Đang chiến đấu" if combat else "🟢 Online"
            
            result.append(f"\n📌 {user} - {status}")
            result.append(f"   🌟 Lv.{stats['level']} | ❤️ {stats['health']}/{stats['max_health']} | ⚔️ {stats['damage']}")
            result.append(f"   💰 {gold} gold | 🧪 {potion} potion")
        
        return "\n".join(result)
    
    @staticmethod
    def broadcast(username, args, add_message_func=None):
        """Admin gửi thông báo cho tất cả người chơi"""
        from combat import Database
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        if not args:
            return "❌ Cú pháp: /admin bc <tin_nhắn>"
        
        message = ' '.join(args)
        
        if add_message_func:
            db = Database.load()
            for user in db['users']:
                add_message_func('SERVER', 
                               f"📢 THÔNG BÁO:\n{message}", 
                               is_server=True, 
                               target_user=user)
        
        return f"✅ Đã gửi thông báo đến tất cả người chơi: {message}"
    
    @staticmethod
    def reset_combat(username, args, add_message_func=None):
        """Admin reset trạng thái combat của người chơi"""
        from combat import Database, UserManager
        
        if not AdminCommands.is_admin(username):
            return "❌ Bạn không có quyền sử dụng lệnh này!"
        
        if not args:
            return "❌ Cú pháp: /admin reset <tên_người_chơi>"
        
        target_user = args[0].strip()
        
        db = Database.load()
        
        if target_user not in db['users']:
            return f"❌ Người chơi '{target_user}' không tồn tại!"
        
        combat = UserManager.get_combat(db, target_user)
        
        if not combat:
            return f"❌ {target_user} không đang chiến đấu!"
        
        UserManager.set_combat(db, target_user, None)
        
        if add_message_func:
            add_message_func('SERVER', 
                           f"🔄 Admin đã reset trạng thái combat của bạn!", 
                           is_server=True, 
                           target_user=target_user)
        
        return f"✅ Đã reset combat cho {target_user}"
    
    @staticmethod
    def handle_admin_command(username, cmd_parts, add_message_func=None):
        """Xử lý các lệnh admin"""
        if len(cmd_parts) < 2:
            return ("📖 Danh sách lệnh Admin:\n"
                   "/admin heal <tên> - Hồi phục HP đầy\n"
                   "/admin gold <tên> <số> - Tặng gold\n"
                   "/admin potion <tên> <số> - Tặng potion\n"
                   "/admin level <tên> <level> - Đặt level\n"
                   "/admin kill <tên> - Giết quái cho player\n"
                   "/admin reset <tên> - Reset combat\n"
                   "/admin list - Xem danh sách player\n"
                   "/admin bc <tin_nhắn> - Broadcast")
        
        sub_command = cmd_parts[1].lower()
        args = cmd_parts[2:] if len(cmd_parts) > 2 else []
        
        commands = {
            'heal': AdminCommands.heal_player,
            'gold': AdminCommands.give_gold,
            'potion': AdminCommands.give_potion,
            'level': AdminCommands.set_level,
            'kill': AdminCommands.kill_monster,
            'list': AdminCommands.list_players,
            'bc': AdminCommands.broadcast,
            'reset': AdminCommands.reset_combat
        }
        
        if sub_command in commands:
            return commands[sub_command](username, args, add_message_func)
        
        return "❌ Lệnh admin không tồn tại. Dùng /admin để xem danh sách."