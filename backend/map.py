import json

# ==================== MAP MANAGER ====================
class MapManager:
    _maps_data = None
    
    @staticmethod
    def load_maps():
        """Load dữ liệu map từ file"""
        if MapManager._maps_data is None:
            with open('mapandmonster.json', 'r', encoding='utf-8') as f:
                MapManager._maps_data = json.load(f)
        return MapManager._maps_data
    
    @staticmethod
    def get_map_info(map_id):
        """Lấy thông tin của map"""
        maps_data = MapManager.load_maps()
        return maps_data['maps'].get(map_id)
    
    @staticmethod
    def get_all_maps():
        """Lấy danh sách tất cả các map"""
        maps_data = MapManager.load_maps()
        return maps_data['maps']
    
    @staticmethod
    def get_monsters_in_map(map_id):
        """Lấy danh sách quái vật trong map"""
        map_info = MapManager.get_map_info(map_id)
        if map_info:
            return map_info['monsters']
        return []
    
    @staticmethod
    def format_map_info(map_id, map_data):
        """Format thông tin map để hiển thị"""
        return (f"🗺️ {map_data['name']}\n"
                f"📝 {map_data['description']}\n"
                f"⭐ Level phù hợp: {map_data['level_range'][0]}-{map_data['level_range'][1]}\n"
                f"👹 Số loại quái: {len(map_data['monsters'])}")
    
    @staticmethod
    def list_all_maps(username=None):
        """Liệt kê tất cả các map
        
        Args:
            username: Tên người chơi (optional, để tương thích với COMMANDS dictionary)
        """
        all_maps = MapManager.get_all_maps()
        result = ["🗺️ Danh sách Map có thể khám phá:\n"]
        
        for map_id, map_data in all_maps.items():
            result.append(f"📍 {map_id} - {map_data['name']}")
            result.append(f"   Level: {map_data['level_range'][0]}-{map_data['level_range'][1]} | Quái: {len(map_data['monsters'])} loại")
        
        result.append("\n💡 Dùng /map <tên_map> để di chuyển (ví dụ: /map forest)")
        return "\n".join(result)