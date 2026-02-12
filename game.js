// ═══════════════════════════════════════════════════════════════════════════
// Game Module - WebSocket Version - FIXED ALL LOGIC ERRORS
// ═══════════════════════════════════════════════════════════════════════════

const Game = {
    player: null,
    currentMap: 1,
    currentEnemy: null,
    inBattle: false,

    MAPS: [
        { id: 0, name: 'Leaf Hamlet',     minLevel: 1,  maxLevel: 1,  icon: '🏡', desc: 'Safe zone with weak creatures' },
        { id: 1, name: 'Slum',            minLevel: 1,  maxLevel: 10, icon: '🏚', desc: 'Crime-ridden streets (Starting area)' },
        { id: 2, name: 'Plains',          minLevel: 10, maxLevel: 20, icon: '🌾', desc: 'Wide grasslands with common monsters' },
        { id: 3, name: 'Black Leaf Zone', minLevel: 20, maxLevel: 30, icon: '🍃', desc: 'Black Leaf gang territory' },
        { id: 4, name: 'Jungle',          minLevel: 30, maxLevel: 40, icon: '🌴', desc: 'Dense forest with wild beasts' },
        { id: 5, name: 'Coastline',       minLevel: 40, maxLevel: 50, icon: '🌊', desc: 'Dangerous waters and sea creatures' }
    ],

    async init() {
        this.setupNavigation();
        await this.loadPlayerData();
        this.renderMapsTab();
        this.updateCurrentMapBar();
        this.updateUI();
    },

    setupNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');

                if (tab.dataset.tab === 'chat') {
                    document.getElementById('chat-unread-badge').style.display = 'none';
                    if (typeof Chat !== 'undefined') Chat.onTabOpen();
                }
            });
        });
    },

    goToMaps() {
        const mapsTab = document.querySelector('[data-tab="maps"]');
        if (mapsTab) mapsTab.click();
    },

    async loadPlayerData() {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'player',
                token: Auth.token
            });
            
            if (response.success && response.player) {
                this.player = response.player;
                
                // FIX: Ensure equipped object exists with all slots
                if (!this.player.equipped) {
                    this.player.equipped = { weapon: null, armor: null, helmet: null, boots: null };
                }
                
                // FIX: Ensure inventory array exists
                if (!this.player.inventory) {
                    this.player.inventory = [];
                }
            } else {
                console.error('Failed to load player');
            }
        } catch (error) {
            console.error('Error loading player:', error);
        }
    },

    renderMapsTab() {
        const grid = document.getElementById('maps-grid');
        if (!grid || !this.player) return;

        grid.innerHTML = this.MAPS.map(map => {
            const isLocked  = this.player.level < map.minLevel;
            const isActive  = this.currentMap === map.id;
            let cls = 'map-card';
            if (isLocked)  cls += ' locked';
            if (isActive)  cls += ' active';

            return `
            <div class="${cls}" ${!isLocked ? `onclick="Game.selectMap(${map.id})"` : ''}>
                <div class="map-card-icon">${map.icon}</div>
                <div class="map-card-body">
                    <div class="map-card-name">${map.name}</div>
                    <div class="map-card-range">Lv ${map.minLevel}${map.maxLevel > map.minLevel ? ` – ${map.maxLevel}` : ''}</div>
                    <div class="map-card-desc">${map.desc}</div>
                </div>
                ${isActive  ? '<div class="map-card-badge active-badge">CURRENT LOCATION</div>' : ''}
                ${isLocked  ? `<div class="map-card-badge lock-badge">🔒 Lv ${map.minLevel}</div>` : ''}
            </div>`;
        }).join('');
    },

    updateCurrentMapBar() {
        const map = this.MAPS.find(m => m.id === this.currentMap);
        const el = document.getElementById('current-map-name');
        if (el && map) el.textContent = `${map.icon} ${map.name}`;
    },

    selectMap(mapId) {
        if (this.inBattle) {
            this.addLog('You are currently in battle!');
            const mainTab = document.querySelector('[data-tab="main"]');
            if (mainTab) mainTab.click();
            return;
        }

        this.currentMap = mapId;
        this.renderMapsTab();
        this.updateCurrentMapBar();

        const map = this.MAPS.find(m => m.id === mapId);
        this.addLog(`✈ Traveled to ${map ? map.name : 'map ' + mapId}`);

        setTimeout(() => {
            const mainTab = document.querySelector('[data-tab="main"]');
            if (mainTab) mainTab.click();
        }, 300);
    },

    async findMonster() {
        if (this.inBattle) {
            this.addLog('You are currently in battle!');
            return;
        }
        
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'find_monster',
                token: Auth.token,
                map: this.currentMap
            });
            
            if (response.success && response.monster) {
                this.currentEnemy = response.monster;
                this.inBattle = true;
                this.showBattle();
                this.addLog(`You encountered ${this.currentEnemy.name} (Lv ${this.currentEnemy.level})!`);
            } else {
                this.addLog('No monsters found');
            }
        } catch (error) {
            console.error('Error finding monster:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async attack() {
        if (!this.inBattle || !this.currentEnemy) return;
        
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'attack',
                token: Auth.token
            });
            
            if (response.success) {
                this.handleAttackResult(response);
            } else {
                this.addLog('Error: ' + (response.error || 'Attack failed'));
            }
        } catch (error) {
            console.error('Error attacking:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    handleAttackResult(result) {
        // FIX: Update player from server response first
        if (result.player) {
            this.player = result.player;
        }

        // Player's attack log
        this.addLog(`You attack ${this.currentEnemy.name} dealing ${result.playerDamage} damage`, 'damage');
        
        // FIX: Update enemy HP safely
        this.currentEnemy.hp = Math.max(0, this.currentEnemy.hp - result.playerDamage);
        this.updateEnemyHP();

        if (result.enemyDefeated) {
            // Enemy defeated
            this.addLog(`${this.currentEnemy.name} has been defeated!`, 'levelup');
            
            // FIX: Display rewards clearly
            if (result.expGained !== undefined) {
                this.addLog(`+${result.expGained} EXP`, 'exp');
            }
            if (result.goldGained !== undefined) {
                this.addLog(`+${result.goldGained} Gold`, 'exp');
            }
            
            // FIX: Display dropped items - THIS WAS MISSING!
            if (result.droppedItems && result.droppedItems.length > 0) {
                result.droppedItems.forEach(itemName => {
                    this.addLog(`📦 Dropped: ${itemName}`, 'exp');
                });
            }

            // Check level up
            if (result.levelUp) {
                this.addLog('🎉 LEVEL UP! You reached level ' + this.player.level + '!', 'levelup');
                this.renderMapsTab(); // Update map locks
            }
            
            this.endBattle();
        } else {
            // Enemy counterattack
            this.addLog(`${this.currentEnemy.name} counterattacks dealing ${result.enemyDamage} damage`, 'damage');
            this.updatePlayerHP();

            if (result.playerDefeated) {
                this.addLog('💀 You have been defeated! HP restored.', 'damage');
                this.endBattle();
            }
        }
        
        this.updateUI();
    },

    async usePotion() {
        // FIX: Safe check for inventory
        if (!this.player || !this.player.inventory || !Array.isArray(this.player.inventory)) {
            this.addLog('❌ You have no Health Potions!');
            return;
        }
        
        const potion = this.player.inventory.find(i => i && i.name === 'Health Potion');
        if (!potion || potion.quantity <= 0) {
            this.addLog('❌ You have no Health Potions!');
            return;
        }

        // FIX: Check if HP is already full
        if (this.player.hp >= this.player.max_hp) {
            this.addLog('❌ HP is already full!');
            return;
        }

        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'use_potion',
                token: Auth.token,
                item: 'Health Potion'
            });
            
            if (response.success) {
                // FIX: Update player from server response
                if (response.player) {
                    this.player = response.player;
                }
                
                // FIX: Backend returns 'healed' not 'message'
                const healAmount = response.healed || 0;
                this.addLog(`💊 Used Health Potion! Restored ${healAmount} HP`, 'exp');
                this.updateUI();
            } else {
                this.addLog(`❌ ${response.error || 'Failed to use potion'}`);
            }
        } catch (error) {
            console.error('Error using potion:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async flee() {
        if (!this.inBattle) return;
        
        try {
            await wsManager.send({
                type: 'game',
                action: 'flee',
                token: Auth.token
            });
            
            this.addLog('You fled from battle!');
            this.endBattle();
        } catch (error) {
            console.error('Error fleeing:', error);
            this.endBattle(); // Flee anyway on client side
        }
    },

    showBattle() {
        document.getElementById('enemy-info').style.display = 'flex';
        document.getElementById('enemy-hp-container').style.display = 'block';
        document.getElementById('find-monster-btn').style.display = 'none';
        document.getElementById('attack-btn').style.display = 'inline-block';
        document.getElementById('potion-btn').style.display = 'inline-block';
        document.getElementById('flee-btn').style.display = 'inline-block';

        document.getElementById('enemy-name').textContent = this.currentEnemy.name;
        document.getElementById('enemy-level').textContent = this.currentEnemy.level;
        document.getElementById('enemy-dmg').textContent = this.currentEnemy.dmg;
        this.updateEnemyHP();
    },

    endBattle() {
        this.inBattle = false;
        this.currentEnemy = null;

        document.getElementById('enemy-info').style.display = 'none';
        document.getElementById('enemy-hp-container').style.display = 'none';
        document.getElementById('find-monster-btn').style.display = 'inline-block';
        document.getElementById('attack-btn').style.display = 'none';
        document.getElementById('potion-btn').style.display = 'none';
        document.getElementById('flee-btn').style.display = 'none';

        this.renderMapsTab();
    },

    updateEnemyHP() {
        if (!this.currentEnemy) return;
        
        // FIX: Ensure HP doesn't go negative
        const hp = Math.max(0, this.currentEnemy.hp);
        const pct = (hp / this.currentEnemy.max_hp) * 100;
        
        document.getElementById('enemy-hp-bar').style.width = pct + '%';
        document.getElementById('enemy-hp-text').textContent = `${hp}/${this.currentEnemy.max_hp}`;
    },

    updatePlayerHP() {
        if (!this.player) return;
        
        const pct = (this.player.hp / this.player.max_hp) * 100;
        document.getElementById('player-hp-bar').style.width = pct + '%';
        document.getElementById('player-hp-text').textContent = `${this.player.hp}/${this.player.max_hp}`;
    },

    updateUI() {
        if (!this.player) return;

        document.getElementById('player-name').textContent = this.player.username || 'Player';
        
        const totalDmg = this.calculateTotalDmg();
        
        document.getElementById('player-level-main').textContent = this.player.level;
        document.getElementById('player-dmg-main').textContent = totalDmg;
        this.updatePlayerHP();

        document.getElementById('player-level').textContent = this.player.level;
        document.getElementById('player-hp').textContent = this.player.hp;
        document.getElementById('player-max-hp').textContent = this.player.max_hp;
        document.getElementById('player-dmg').textContent = totalDmg;

        // FIX: Use backend formula: 100 + (level * 15)
        const expNeeded = this.getExpNeeded(this.player.level);
        document.getElementById('player-exp').textContent = `${this.player.exp}/${expNeeded}`;
        document.getElementById('exp-bar-fill').style.width = Math.min((this.player.exp / expNeeded * 100), 100) + '%';
        document.getElementById('player-gold').textContent = this.player.gold;

        this.updateEquipmentSlots();
        this.updateInventory();
    },

    // FIX: Match backend formula exactly
    getExpNeeded(level) {
        return 100 + (level * 15);
    },

    calculateTotalDmg() {
        let totalDmg = this.player.dmg;
        
        // FIX: Safe check for equipped weapon
        if (this.player.equipped && this.player.equipped.weapon) {
            const weaponData = this.getItemData(this.player.equipped.weapon);
            if (weaponData && weaponData.value) {
                totalDmg += weaponData.value;
            }
        }
        
        return totalDmg;
    },

    getItemData(itemName) {
        const items = {
            'Health Potion': { type: 'consumable', effect: 'heal', value: 50, description: 'Restores 50 HP', icon: '💊' },
            'Bronze Sword': { type: 'weapon', stat: 'dmg', value: 1, description: '+1 DMG', icon: '🗡' },
            'Bronze Armor': { type: 'armor', stat: 'max_hp', value: 3, description: '+3 HP', icon: '🛡' },
            'Bronze Helmet': { type: 'helmet', stat: 'max_hp', value: 3, description: '+3 HP', icon: '⛑' },
            'Bronze Boots': { type: 'boots', stat: 'max_hp', value: 3, description: '+3 HP', icon: '👢' },
            'Stone Sword': { type: 'weapon', stat: 'dmg', value: 2, description: '+2 DMG', icon: '⚔' },
            'Stone Armor': { type: 'armor', stat: 'max_hp', value: 5, description: '+5 HP', icon: '🛡' },
            'Stone Helmet': { type: 'helmet', stat: 'max_hp', value: 5, description: '+5 HP', icon: '⛑' },
            'Stone Boots': { type: 'boots', stat: 'max_hp', value: 5, description: '+5 HP', icon: '👢' },
            'Iron Sword': { type: 'weapon', stat: 'dmg', value: 3, description: '+3 DMG', icon: '⚔' },
            'Iron Armor': { type: 'armor', stat: 'max_hp', value: 7, description: '+7 HP', icon: '🛡' },
            'Iron Helmet': { type: 'helmet', stat: 'max_hp', value: 7, description: '+7 HP', icon: '⛑' },
            'Iron Boots': { type: 'boots', stat: 'max_hp', value: 7, description: '+7 HP', icon: '👢' },
            'Mithril Sword': { type: 'weapon', stat: 'dmg', value: 4, description: '+4 DMG', icon: '⚔' },
            'Mithril Armor': { type: 'armor', stat: 'max_hp', value: 9, description: '+9 HP', icon: '🛡' },
            'Mithril Helmet': { type: 'helmet', stat: 'max_hp', value: 9, description: '+9 HP', icon: '⛑' },
            'Mithril Boots': { type: 'boots', stat: 'max_hp', value: 9, description: '+9 HP', icon: '👢' },
            'Adamantine Sword': { type: 'weapon', stat: 'dmg', value: 5, description: '+5 DMG', icon: '⚔' },
            'Adamantine Armor': { type: 'armor', stat: 'max_hp', value: 11, description: '+11 HP', icon: '🛡' },
            'Adamantine Helmet': { type: 'helmet', stat: 'max_hp', value: 11, description: '+11 HP', icon: '⛑' },
            'Adamantine Boots': { type: 'boots', stat: 'max_hp', value: 11, description: '+11 HP', icon: '👢' }
        };
        return items[itemName] || null;
    },

    updateEquipmentSlots() {
        const equipped = this.player.equipped || {};
        
        ['weapon', 'armor', 'helmet', 'boots'].forEach(slot => {
            const el = document.getElementById(`equipped-${slot}`);
            const gridSlot = el?.closest('.grid-slot');
            
            if (el) {
                const itemName = equipped[slot];
                if (itemName) {
                    const itemData = this.getItemData(itemName);
                    if (gridSlot) gridSlot.setAttribute('data-has-item', 'true');
                    
                    el.innerHTML = `
                        <div class="slot-item-name">${itemName}</div>
                        <div class="slot-item-stat">${itemData ? itemData.description : ''}</div>
                    `;
                    
                    if (gridSlot) {
                        gridSlot.style.cursor = 'pointer';
                        gridSlot.onclick = () => this.unequipItem(slot);
                    }
                } else {
                    if (gridSlot) {
                        gridSlot.removeAttribute('data-has-item');
                        gridSlot.onclick = null;
                    }
                    el.innerHTML = '<div class="slot-empty">EMPTY</div>';
                }
            }
        });
    },

    updateInventory() {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;
        
        // FIX: Safe check for inventory
        if (!this.player.inventory || !Array.isArray(this.player.inventory) || this.player.inventory.length === 0) {
            grid.innerHTML = '<p class="empty">— no items yet —</p>';
            return;
        }

        const equipped = this.player.equipped || {};
        const equippedItems = Object.values(equipped);
        
        grid.innerHTML = this.player.inventory.map(item => {
            // FIX: Safe check for item object
            if (!item || !item.name) return '';
            
            const itemData = this.getItemData(item.name);
            const isEquipped = equippedItems.includes(item.name);
            const icon = itemData?.icon || '📦';
            
            return `
            <div class="inv-slot" 
                 onclick="Game.handleInventoryClick('${item.name}')"
                 data-tooltip="${itemData ? itemData.description : item.name}">
                ${isEquipped ? '<div class="inv-slot-equipped"></div>' : ''}
                <div class="inv-slot-icon">${icon}</div>
                <div class="inv-slot-name">${this.shortenItemName(item.name)}</div>
                <div class="inv-slot-qty">×${item.quantity || 1}</div>
            </div>
            `;
        }).join('');
    },

    shortenItemName(name) {
        if (!name) return '';
        return name.replace('Adamantine', 'Adam.')
                   .replace('Mithril', 'Mith.')
                   .replace('Bronze', 'Brz.')
                   .replace('Stone', 'Stn.')
                   .replace('Iron', 'Irn.')
                   .replace('Health', 'HP')
                   .replace('Potion', 'Pot.');
    },

    handleInventoryClick(itemName) {
        const itemData = this.getItemData(itemName);
        
        if (!itemData) return;
        
        if (itemData.type === 'consumable') {
            this.useItemFromInventory(itemName);
        } else {
            const isEquipped = this.player.equipped && Object.values(this.player.equipped).includes(itemName);
            
            if (isEquipped) {
                const slot = Object.keys(this.player.equipped).find(s => this.player.equipped[s] === itemName);
                if (slot) this.unequipItem(slot);
            } else {
                this.equipItem(itemName);
            }
        }
    },

    async equipItem(itemName) {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'equip',
                token: Auth.token,
                item: itemName
            });
            
            if (response.success && response.player) {
                this.player = response.player;
                this.updateUI();
                this.addLog(`⚔ Equipped ${itemName}`, 'exp');
            } else {
                this.addLog(`❌ ${response.error || 'Failed to equip'}`);
            }
        } catch (error) {
            console.error('Error equipping:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async unequipItem(slot) {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'unequip',
                token: Auth.token,
                slot: slot
            });
            
            if (response.success && response.player) {
                this.player = response.player;
                this.updateUI();
                this.addLog(`⚔ Unequipped from ${slot}`, 'exp');
            } else {
                this.addLog(`❌ ${response.error || 'Failed to unequip'}`);
            }
        } catch (error) {
            console.error('Error unequipping:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async useItemFromInventory(itemName) {
        await this.usePotion();
    },

    addLog(message, type = '') {
        const log = document.getElementById('battle-log');
        if (!log) return;
        
        const p = document.createElement('p');
        p.textContent = message;
        if (type) p.classList.add(type);
        log.appendChild(p);
        log.scrollTop = log.scrollHeight;
        
        // Keep max 50 entries
        while (log.children.length > 50) {
            log.removeChild(log.firstChild);
        }
    }
};
