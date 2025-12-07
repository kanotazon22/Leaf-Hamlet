from database import Database, UserManager
from inventory import InventoryManager, ITEMS  # ← Import mới

class TradeManager:
    _pending_trades = {}

    @staticmethod
    def get_pending_trade(username):
        return TradeManager._pending_trades.get(username)

    @staticmethod
    def set_pending_trade(username, trade_data):
        if trade_data is None:
            TradeManager._pending_trades.pop(username, None)
        else:
            TradeManager._pending_trades[username] = trade_data

    @staticmethod
    def _get_item_display(offer):
        """Helper để format display name"""
        if offer['item_type'] == 'potion':
            return "🧪 HP Potion"
        elif offer['item_type'] == 'gold':
            return "💰 Gold"
        else:
            return f"⚔️ {ITEMS[offer['item_type']]['name']}"

    @staticmethod
    def initiate_trade(sender, args):
        """Bắt đầu trade với offer của sender"""
        if len(args) < 3:
            return "❌ Cú pháp: /trade <tên> <số_lượng> <gold/potion/item_id>"

        receiver = args[0].strip()
        item_type = args[2].lower()

        # Validate item type
        valid_types = ['gold', 'potion'] + [k for k, v in ITEMS.items() if v.get('type') == 'equipment']
        if item_type not in valid_types:
            return "❌ Item không hợp lệ! Dùng: gold, potion, hoặc tên equipment (vd: copper_helmet)"
        
        try:
            amount = int(args[1])
            if amount <= 0:
                return "❌ Số lượng phải lớn hơn 0!"
        except ValueError:
            return "❌ Số lượng không hợp lệ!"
        
        if sender.lower() == receiver.lower():
            return "❌ Không thể trade với chính mình!"
        
        db = Database.load()
        
        if receiver not in db['users']:
            return f"❌ Người chơi '{receiver}' không tồn tại!"
        
        # Sử dụng InventoryManager thay vì UserManager
        sender_count = InventoryManager.get_item_count(db, sender, item_type if item_type != 'potion' else 'hp_potion')
        
        if sender_count < amount:
            item_display = ITEMS.get(item_type, {'name': item_type})['name'] if item_type not in ['gold', 'potion'] else item_type
            return f"❌ Bạn không đủ {item_display}! (Có: {sender_count})"
        
        # Kiểm tra receiver có trade đang chờ không
        if TradeManager.get_pending_trade(receiver):
            return f"❌ {receiver} đang có lời mời trade khác!"
        
        # Xác định item_key
        if item_type == 'gold':
            item_key = 'gold'
        elif item_type == 'potion':
            item_key = 'hp_potion'
            item_type = 'hp_potion'
        else:
            item_key = 'items'
        
        # Tạo trade session
        trade_data = {
            'sender': sender,
            'receiver': receiver,
            'sender_offer': {'amount': amount, 'item_type': item_type, 'item_key': item_key},
            'receiver_offer': None,
            'sender_accepted': False,
            'receiver_accepted': False,
            'status': 'pending_receiver_offer'
        }
        
        TradeManager.set_pending_trade(sender, trade_data)
        TradeManager.set_pending_trade(receiver, trade_data)
        
        item_display = TradeManager._get_item_display(trade_data['sender_offer'])
        
        return (f"📤 Đã gửi lời mời trade đến {receiver}\n"
                f"📦 Bạn offer: {amount} {item_display}\n"
                f"⏳ Chờ {receiver} đưa offer ngược lại...")
    
    @staticmethod
    def make_counter_offer(username, args):
        """Receiver đưa counter offer"""
        trade = TradeManager.get_pending_trade(username)
        
        if not trade:
            return "❌ Bạn không có lời mời trade nào!"
        
        if trade['receiver'] != username:
            return "❌ Bạn không phải người nhận trade này!"
        
        if trade['status'] != 'pending_receiver_offer':
            return "❌ Bạn đã đưa offer rồi!"
        
        if len(args) < 2:
            return "❌ Cú pháp: /trade offer <số_lượng> <gold/potion/item_id>"
        
        item_type = args[1].lower()
        
        valid_types = ['gold', 'potion'] + [k for k, v in ITEMS.items() if v.get('type') == 'equipment']
        if item_type not in valid_types:
            return "❌ Item không hợp lệ! Dùng: gold, potion, hoặc tên equipment (vd: copper_helmet)"
        
        try:
            amount = int(args[0])
            if amount <= 0:
                return "❌ Số lượng phải lớn hơn 0!"
        except ValueError:
            return "❌ Số lượng không hợp lệ!"
        
        db = Database.load()
        
        # Sử dụng InventoryManager
        receiver_count = InventoryManager.get_item_count(db, username, item_type if item_type != 'potion' else 'hp_potion')
        
        if receiver_count < amount:
            item_display = ITEMS.get(item_type, {'name': item_type})['name'] if item_type not in ['gold', 'potion'] else item_type
            return f"❌ Bạn không đủ {item_display}! (Có: {receiver_count})"
        
        # Xác định item_key
        if item_type == 'gold':
            item_key = 'gold'
        elif item_type == 'potion':
            item_key = 'hp_potion'
            item_type = 'hp_potion'
        else:
            item_key = 'items'
        
        # Cập nhật offer
        trade['receiver_offer'] = {'amount': amount, 'item_type': item_type, 'item_key': item_key}
        trade['status'] = 'both_offered'
        
        TradeManager.set_pending_trade(trade['sender'], trade)
        TradeManager.set_pending_trade(trade['receiver'], trade)
        
        sender_display = TradeManager._get_item_display(trade['sender_offer'])
        receiver_display = TradeManager._get_item_display(trade['receiver_offer'])
        
        return (f"✅ Đã đưa counter offer!\n"
                f"📦 {trade['sender']} offer: {trade['sender_offer']['amount']} {sender_display}\n"
                f"📦 Bạn offer: {amount} {receiver_display}\n"
                f"💡 Cả 2 dùng /trade accept để xác nhận, hoặc /trade cancel để hủy")
    
    @staticmethod
    def accept_trade(username):
        """Người chơi accept trade"""
        trade = TradeManager.get_pending_trade(username)
        
        if not trade:
            return "❌ Bạn không có trade nào đang chờ!"
        
        if trade['status'] != 'both_offered':
            return "❌ Chưa thể accept! Chờ đối phương đưa offer."
        
        # Đánh dấu accept
        if username == trade['sender']:
            trade['sender_accepted'] = True
        elif username == trade['receiver']:
            trade['receiver_accepted'] = True
        else:
            return "❌ Bạn không phải thành viên của trade này!"
        
        # Kiểm tra cả 2 đã accept chưa
        if trade['sender_accepted'] and trade['receiver_accepted']:
            return TradeManager.execute_trade(trade)
        else:
            TradeManager.set_pending_trade(trade['sender'], trade)
            TradeManager.set_pending_trade(trade['receiver'], trade)
            
            other_user = trade['receiver'] if username == trade['sender'] else trade['sender']
            return f"✅ Bạn đã accept trade!\n⏳ Chờ {other_user} accept..."
    
    @staticmethod
    def execute_trade(trade):
        """Thực hiện chuyển items - sử dụng InventoryManager"""
        db = Database.load()
        sender = trade['sender']
        receiver = trade['receiver']
        
        if sender not in db['users'] or receiver not in db['users']:
            TradeManager.set_pending_trade(sender, None)
            TradeManager.set_pending_trade(receiver, None)
            return "❌ Có người chơi không còn tồn tại!"
        
        sender_offer = trade['sender_offer']
        receiver_offer = trade['receiver_offer']
        
        # Validate cuối cùng
        sender_count = InventoryManager.get_item_count(db, sender, sender_offer['item_type'])
        receiver_count = InventoryManager.get_item_count(db, receiver, receiver_offer['item_type'])
        
        if sender_count < sender_offer['amount']:
            TradeManager.set_pending_trade(sender, None)
            TradeManager.set_pending_trade(receiver, None)
            return f"❌ {sender} không còn đủ items!"
        
        if receiver_count < receiver_offer['amount']:
            TradeManager.set_pending_trade(sender, None)
            TradeManager.set_pending_trade(receiver, None)
            return f"❌ {receiver} không còn đủ items!"
        
        # Thực hiện transfer bằng InventoryManager
        # Sender gửi -> Receiver nhận
        InventoryManager.remove_item(db, sender, sender_offer['item_type'], sender_offer['amount'])
        InventoryManager.add_item(db, receiver, sender_offer['item_type'], sender_offer['amount'])
        
        # Receiver gửi -> Sender nhận
        InventoryManager.remove_item(db, receiver, receiver_offer['item_type'], receiver_offer['amount'])
        InventoryManager.add_item(db, sender, receiver_offer['item_type'], receiver_offer['amount'])
        
        TradeManager.set_pending_trade(sender, None)
        TradeManager.set_pending_trade(receiver, None)
        
        sender_display = TradeManager._get_item_display(sender_offer)
        receiver_display = TradeManager._get_item_display(receiver_offer)
        
        return (f"✅ TRADE THÀNH CÔNG!\n"
                f"📤 Bạn gửi: {sender_offer['amount']} {sender_display}\n"
                f"📥 Bạn nhận: {receiver_offer['amount']} {receiver_display}")
    
    @staticmethod
    def cancel_trade(username):
        """Hủy trade"""
        trade = TradeManager.get_pending_trade(username)
        
        if not trade:
            return "❌ Bạn không có trade nào đang chờ!"
        
        other_user = trade['receiver'] if username == trade['sender'] else trade['sender']
        
        TradeManager.set_pending_trade(trade['sender'], None)
        TradeManager.set_pending_trade(trade['receiver'], None)
        
        return f"❌ Đã hủy trade với {other_user}"
    
    @staticmethod
    def check_pending_trade(username):
        """Kiểm tra trade đang chờ"""
        trade = TradeManager.get_pending_trade(username)
        
        if not trade:
            return "❌ Bạn không có trade nào đang chờ!"
        
        sender_display = TradeManager._get_item_display(trade['sender_offer'])
        
        result = [f"📬 Trade với {trade['sender'] if username == trade['receiver'] else trade['receiver']}:"]
        result.append(f"📦 {trade['sender']} offer: {trade['sender_offer']['amount']} {sender_display}")
        
        if trade['receiver_offer']:
            receiver_display = TradeManager._get_item_display(trade['receiver_offer'])
            result.append(f"📦 {trade['receiver']} offer: {trade['receiver_offer']['amount']} {receiver_display}")
        
        if trade['status'] == 'pending_receiver_offer':
            if username == trade['receiver']:
                result.append("💡 Dùng /trade offer <số> <gold/potion/item_id> để đưa offer")
            else:
                result.append("⏳ Chờ đối phương đưa offer...")
        elif trade['status'] == 'both_offered':
            if username == trade['sender'] and trade['sender_accepted']:
                result.append("✅ Bạn đã accept | ⏳ Chờ đối phương accept...")
            elif username == trade['receiver'] and trade['receiver_accepted']:
                result.append("✅ Bạn đã accept | ⏳ Chờ đối phương accept...")
            else:
                result.append("💡 /trade accept để đồng ý | /trade cancel để hủy")
        
        return "\n".join(result)
    
    @staticmethod
    def handle_trade_command(username, args, add_message_func=None):
        """Xử lý lệnh /trade"""
        if not args:
            return TradeManager.check_pending_trade(username)
        
        first_arg = args[0].lower()
        
        # Accept trade
        if first_arg == 'accept':
            result = TradeManager.accept_trade(username)
            
            if result.startswith('✅ TRADE THÀNH CÔNG') and add_message_func:
                # Tìm người kia để gửi thông báo
                for user, user_trade in list(TradeManager._pending_trades.items()):
                    if user != username and (user_trade.get('sender') == username or user_trade.get('receiver') == username):
                        add_message_func('SERVER', result, is_server=True, target_user=user)
                        break
            
            return result
        
        # Cancel trade
        if first_arg == 'cancel':
            trade = TradeManager.get_pending_trade(username)
            result = TradeManager.cancel_trade(username)
            
            if result.startswith('❌ Đã hủy') and add_message_func and trade:
                other_user = trade['receiver'] if username == trade['sender'] else trade['sender']
                add_message_func('SERVER',
                               f"❌ {username} đã hủy trade!",
                               is_server=True,
                               target_user=other_user)
            
            return result
        
        # Counter offer
        if first_arg == 'offer':
            result = TradeManager.make_counter_offer(username, args[1:])
            
            if result.startswith('✅ Đã đưa') and add_message_func:
                trade = TradeManager.get_pending_trade(username)
                if trade:
                    sender_display = TradeManager._get_item_display(trade['sender_offer'])
                    receiver_display = TradeManager._get_item_display(trade['receiver_offer'])
                    add_message_func('SERVER',
                                   f"📬 {username} đã đưa counter offer!\n"
                                   f"📦 Bạn offer: {trade['sender_offer']['amount']} {sender_display}\n"
                                   f"📦 {username} offer: {trade['receiver_offer']['amount']} {receiver_display}\n"
                                   f"💡 /trade accept để đồng ý | /trade cancel để hủy",
                                   is_server=True,
                                   target_user=trade['sender'])
            
            return result
        
        # Initiate new trade
        result = TradeManager.initiate_trade(username, args)
        
        if result.startswith('📤') and add_message_func:
            trade = TradeManager.get_pending_trade(username)
            if trade:
                item_display = TradeManager._get_item_display(trade['sender_offer'])
                add_message_func('SERVER',
                               f"📬 Lời mời trade từ {username}!\n"
                               f"📦 {username} offer: {trade['sender_offer']['amount']} {item_display}\n"
                               f"💡 Dùng /trade offer <số> <gold/potion/item_id> để đưa offer ngược lại",
                               is_server=True,
                               target_user=trade['receiver'])
        
        return result