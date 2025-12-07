from database import Database, UserManager

# ==================== PARTY CONFIG ====================
PARTY_CONFIG = {
    'max_members': 10,
    'exp_bonus_per_member': 0.05  # 2% per member
}

# ==================== PARTY MANAGER ====================
class PartyManager:
    """Quản lý hệ thống party"""
    
    @staticmethod
    def get_party(db, username):
        """Lấy party hiện tại của user (trả về party object hoặc None)"""
        user = db['users'].get(username)
        if not user:
            return None
        
        party_id = user.get('party_id')
        if not party_id:
            return None
        
        # Lấy party từ database
        parties = db.get('parties', {})
        return parties.get(party_id)
    
    @staticmethod
    def get_pending_invite(db, username):
        """Lấy lời mời party đang chờ"""
        user = db['users'].get(username)
        if not user:
            return None
        return user.get('pending_party_invite')
    
    @staticmethod
    def set_pending_invite(db, username, invite_data):
        """Set lời mời party"""
        if invite_data is None:
            db['users'][username].pop('pending_party_invite', None)
        else:
            db['users'][username]['pending_party_invite'] = invite_data
        Database.save(db)
    
    @staticmethod
    def create_party(username):
        """Tạo party mới"""
        db = Database.load()
        
        # Kiểm tra đã có party chưa
        if PartyManager.get_party(db, username):
            return "❌ Bạn đã có party rồi! Dùng /party leave để rời trước."
        
        # Kiểm tra có invite pending không
        if PartyManager.get_pending_invite(db, username):
            return "❌ Bạn đang có lời mời party! Hãy /party accept hoặc /party decline trước."
        
        # Tạo party mới
        if 'parties' not in db:
            db['parties'] = {}
        
        party_id = f"party_{username}_{len(db['parties']) + 1}"
        
        party = {
            'id': party_id,
            'leader': username,
            'members': [username],
            'created_at': None  # có thể thêm timestamp nếu cần
        }
        
        db['parties'][party_id] = party
        db['users'][username]['party_id'] = party_id
        Database.save(db)
        
        return f"✅ Đã tạo party!\n👑 Nhóm trưởng: {username}\n💡 Dùng /party invite <tên> để mời thành viên"
    
    @staticmethod
    def show_party(username):
        """Hiển thị thông tin party"""
        db = Database.load()
        party = PartyManager.get_party(db, username)
        
        if not party:
            return ("❌ Bạn chưa có party!\n"
                   "💡 /party create - Tạo party mới\n"
                   "💡 Hoặc đợi ai đó mời bạn")
        
        # Tính EXP bonus
        member_count = len(party['members'])
        exp_bonus = member_count * PARTY_CONFIG['exp_bonus_per_member'] * 100
        
        result = [f"🎉 Party: {party['id']}"]
        result.append(f"👑 Nhóm trưởng: {party['leader']}")
        result.append(f"👥 Thành viên: {member_count}/{PARTY_CONFIG['max_members']}")
        result.append("")
        
        # List members
        for i, member in enumerate(party['members'], 1):
            if member == party['leader']:
                result.append(f"  {i}. {member} 👑")
            else:
                result.append(f"  {i}. {member}")
        
        result.append("")
        result.append(f"✨ EXP Bonus: +{exp_bonus:.0f}%")
        result.append("")
        
        # Commands
        if username == party['leader']:
            result.append("💡 /party invite <tên> - Mời thành viên")
            result.append("💡 /party kick <tên> - Kick thành viên")
        result.append("💡 /party leave - Rời party")
        
        return "\n".join(result)
    
    @staticmethod
    def invite_member(username, target_username):
        """Mời người chơi vào party"""
        db = Database.load()
        party = PartyManager.get_party(db, username)
        
        # Validate: phải có party
        if not party:
            return "❌ Bạn chưa có party! Dùng /party create để tạo."
        
        # Validate: phải là leader
        if party['leader'] != username:
            return "❌ Chỉ nhóm trưởng mới có thể mời thành viên!"
        
        # Validate: target exists
        if target_username not in db['users']:
            return f"❌ Người chơi '{target_username}' không tồn tại!"
        
        # Validate: không tự mời mình
        if target_username == username:
            return "❌ Không thể mời chính mình!"
        
        # Validate: target chưa có party
        target_party = PartyManager.get_party(db, target_username)
        if target_party:
            return f"❌ {target_username} đã có party rồi!"
        
        # Validate: target chưa có invite pending
        pending = PartyManager.get_pending_invite(db, target_username)
        if pending:
            return f"❌ {target_username} đang có lời mời party khác!"
        
        # Validate: party không đầy
        if len(party['members']) >= PARTY_CONFIG['max_members']:
            return f"❌ Party đã đầy! (Max: {PARTY_CONFIG['max_members']} người)"
        
        # Validate: chưa trong party
        if target_username in party['members']:
            return f"❌ {target_username} đã ở trong party rồi!"
        
        # Send invite
        invite_data = {
            'party_id': party['id'],
            'inviter': username
        }
        PartyManager.set_pending_invite(db, target_username, invite_data)
        
        return (f"✅ Đã gửi lời mời party đến {target_username}!\n"
               f"⏳ Chờ {target_username} chấp nhận...")
    
    @staticmethod
    def accept_invite(username):
        """Chấp nhận lời mời vào party"""
        db = Database.load()
        
        # Validate: có invite không
        invite = PartyManager.get_pending_invite(db, username)
        if not invite:
            return "❌ Bạn không có lời mời party nào!"
        
        # Validate: party còn tồn tại không
        parties = db.get('parties', {})
        party = parties.get(invite['party_id'])
        if not party:
            PartyManager.set_pending_invite(db, username, None)
            return "❌ Party không còn tồn tại!"
        
        # Validate: party không đầy
        if len(party['members']) >= PARTY_CONFIG['max_members']:
            PartyManager.set_pending_invite(db, username, None)
            return f"❌ Party đã đầy rồi!"
        
        # Join party
        party['members'].append(username)
        db['users'][username]['party_id'] = party['id']
        PartyManager.set_pending_invite(db, username, None)
        Database.save(db)
        
        member_count = len(party['members'])
        exp_bonus = member_count * PARTY_CONFIG['exp_bonus_per_member'] * 100
        
        return (f"✅ Đã tham gia party của {party['leader']}!\n"
               f"👥 Thành viên: {member_count}/{PARTY_CONFIG['max_members']}\n"
               f"✨ EXP Bonus: +{exp_bonus:.0f}%")
    
    @staticmethod
    def decline_invite(username):
        """Từ chối lời mời party"""
        db = Database.load()
        
        invite = PartyManager.get_pending_invite(db, username)
        if not invite:
            return "❌ Bạn không có lời mời party nào!"
        
        inviter = invite['inviter']
        PartyManager.set_pending_invite(db, username, None)
        
        return f"❌ Đã từ chối lời mời party từ {inviter}"
    
    @staticmethod
    def kick_member(username, target_username):
        """Kick thành viên khỏi party"""
        db = Database.load()
        party = PartyManager.get_party(db, username)
        
        # Validate: phải có party
        if not party:
            return "❌ Bạn chưa có party!"
        
        # Validate: phải là leader
        if party['leader'] != username:
            return "❌ Chỉ nhóm trưởng mới có thể kick thành viên!"
        
        # Validate: không tự kick mình
        if target_username == username:
            return "❌ Không thể kick chính mình! Dùng /party leave để rời party."
        
        # Validate: target trong party
        if target_username not in party['members']:
            return f"❌ {target_username} không ở trong party!"
        
        # Kick
        party['members'].remove(target_username)
        db['users'][target_username].pop('party_id', None)
        Database.save(db)
        
        return f"✅ Đã kick {target_username} khỏi party!"
    
    @staticmethod
    def leave_party(username):
        """Rời khỏi party"""
        db = Database.load()
        party = PartyManager.get_party(db, username)
        
        if not party:
            return "❌ Bạn không có party!"
        
        # Nếu là leader → giải tán party
        if party['leader'] == username:
            # Xóa party_id của tất cả members
            for member in party['members']:
                if member in db['users']:
                    db['users'][member].pop('party_id', None)
            
            # Xóa party
            db['parties'].pop(party['id'], None)
            Database.save(db)
            
            return "✅ Bạn đã rời party!\n💥 Party đã bị giải tán (leader rời)"
        
        # Nếu là member thường → chỉ rời
        party['members'].remove(username)
        db['users'][username].pop('party_id', None)
        Database.save(db)
        
        return f"✅ Đã rời party của {party['leader']}"
    
    @staticmethod
    def get_exp_bonus(username):
        """Lấy % EXP bonus từ party (dùng khi tính exp)"""
        db = Database.load()
        party = PartyManager.get_party(db, username)
        
        if not party:
            return 0.0
        
        member_count = len(party['members'])
        return member_count * PARTY_CONFIG['exp_bonus_per_member']
    
    @staticmethod
    def get_exp_multiplier(username):
        """Lấy multiplier EXP (1.0 + bonus)"""
        return 1.0 + PartyManager.get_exp_bonus(username)

# ==================== COMMAND HANDLER ====================
class PartyCommandHandler:
    """Xử lý commands liên quan đến party"""
    
    @staticmethod
    def handle_party(username, args):
        """Xử lý lệnh /party"""
        if not args:
            return PartyManager.show_party(username)
        
        action = args[0].lower()
        
        # Create party
        if action == 'create':
            return PartyManager.create_party(username)
        
        # Accept invite
        if action == 'accept':
            return PartyManager.accept_invite(username)
        
        # Decline invite
        if action in ['decline', 'cancel']:
            return PartyManager.decline_invite(username)
        
        # Leave party
        if action == 'leave':
            return PartyManager.leave_party(username)
        
        # Invite member
        if action == 'invite':
            if len(args) < 2:
                return "❌ Cú pháp: /party invite <tên>\n💡 VD: /party invite Alice"
            return PartyManager.invite_member(username, args[1])
        
        # Kick member
        if action == 'kick':
            if len(args) < 2:
                return "❌ Cú pháp: /party kick <tên>\n💡 VD: /party kick Bob"
            return PartyManager.kick_member(username, args[1])
        
        return ("❌ Lệnh không hợp lệ!\n"
               "💡 /party - Xem party\n"
               "💡 /party create - Tạo party\n"
               "💡 /party invite <tên> - Mời thành viên\n"
               "💡 /party accept - Chấp nhận lời mời\n"
               "💡 /party decline - Từ chối lời mời\n"
               "💡 /party kick <tên> - Kick thành viên\n"
               "💡 /party leave - Rời party")