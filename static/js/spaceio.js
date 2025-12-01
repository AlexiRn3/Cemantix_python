import { state } from "./state.js";

let canvas, ctx;
let animationId;
let lastTime = 0;
let isRunning = false;
let abortController = null; // Pour nettoyer les événements
let isGameInitialized = false;

let player = {
    x: 1000, y: 1000, vx: 0, vy: 0, angle: 0, radius: 20,
    class: 'fighter', level: 1, xp: 0, xpToNext: 50, score: 0,
    maxHealth: 100, health: 100, acceleration: 0.8, maxSpeed: 8, friction: 0.94,
    bullets: [], stats: { reloadTime: 400, damage: 10, bulletSpeed: 12, bulletSize: 5, bulletLife: 800 },
    lastShot: 0, upgrades: [], dashCooldown: 0
};

let orbs = [];
let mapSize = 2000;
let keys = {};
let mouse = { x: 0, y: 0 };
let camera = { x: 0, y: 0, targetX: 0, targetY: 0 };
let enemyBullets = [];
let enemies = {};

const CLASSES = {
    fighter: { name: "Fighter", color: "#3498db" },
    tank: { name: "Tank", color: "#e74c3c" },
    sniper: { name: "Sniper", color: "#9b59b6" }
};

export function addNewOrb(orbData) {
    if (orbData) orbs.push(orbData);
}

export function removeOrb(orbId) {
    const index = orbs.findIndex(o => o.id === orbId);
    if (index !== -1) orbs.splice(index, 1);
}
export function updateEnemy(data) {
    // On ignore nos propres messages (écho)
    if (!data.player_name || data.player_name === player.player_name_local) return;

    if (!enemies[data.player_name]) {
        enemies[data.player_name] = { 
            x: data.x, y: data.y, angle: data.angle, 
            class: data.class || 'fighter', 
            targetX: data.x, targetY: data.y // Pour interpolation future
        };
    } else {
        const en = enemies[data.player_name];
        en.x = data.x; // Pour l'instant on téléporte (mise à jour simple)
        en.y = data.y;
        en.angle = data.angle;
        en.class = data.class;
    }
}

export function spawnEnemyBullets(data) {
    if (!data.player_name || data.player_name === player.player_name_local) return;
    
    if (data.bullets && Array.isArray(data.bullets)) {
        data.bullets.forEach(b => {
            // On ajoute à la liste des dangers
            enemyBullets.push({
                x: b.x, y: b.y, 
                angle: b.angle, 
                speed: b.speed, 
                radius: b.radius, 
                life: b.life,
                damage: 10 // Dégât par défaut ou transmis par le serveur
            });
        });
    }
}

export function updateLeaderboard(playersList) {
    const listDiv = document.getElementById("io-leaderboard-list");
    if (!listDiv) return;
    playersList.sort((a, b) => b.level - a.level || b.score - a.score);
    listDiv.innerHTML = playersList.map(p => `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.9rem;">
            <span>${p.player_name}</span>
            <span style="color:var(--warning); font-weight:bold;">Niv. ${p.level}</span>
        </div>
    `).join('');
}

export function initSpaceIo(serverOrbs, size, localName) {
    // CORRECTION BUG : Si le jeu tourne déjà, on ne touche à rien !
    if (isGameInitialized) {
        console.log("SpaceIO déjà initialisé, reprise...");
        return;
    }
    isGameInitialized = true;

    console.log("SpaceIO Engine Starting...");
    player.player_name_local = localName; // On stocke notre pseudo pour filtrer les messages
    
    orbs = serverOrbs || [];
    mapSize = size || 2000;
    canvas = document.getElementById("spaceio-canvas");
    ctx = canvas.getContext("2d");
    
    // Reset interface
    document.getElementById("io-start-screen").style.display = "flex";
    document.getElementById("io-game-over").style.display = "none"; // On cache l'écran de mort

    resize();
    window.addEventListener("resize", resize);
    
    // Inputs
    window.addEventListener("keydown", e => keys[e.code] = true);
    window.addEventListener("keyup", e => keys[e.code] = false);
    canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    canvas.addEventListener("mousedown", () => keys['MouseLeft'] = true);
    canvas.addEventListener("mouseup", () => keys['MouseLeft'] = false);
    
    window.stopSpaceIo = () => {
        isRunning = false;
        isGameInitialized = false;
        if (animationId) cancelAnimationFrame(animationId);
    };

    window.startGameIo = (className) => {
        player.class = className;
        applyClassStats(className);
        document.getElementById("io-start-screen").style.display = "none";
        
        respawnPlayer();
        
        isRunning = true;
        lastTime = performance.now();
        loop(lastTime);
    };

    // Fonction pour revivre
    window.respawnIo = () => {
        document.getElementById("io-game-over").style.display = "none";
        respawnPlayer();
        isRunning = true;
        loop(performance.now());
    };
}

function respawnPlayer() {
    player.x = Math.random() * mapSize;
    player.y = Math.random() * mapSize;
    player.vx = 0; player.vy = 0;
    player.health = player.maxHealth;
    player.bullets = [];
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;
    updateHud();
}

function sendStatsUpdate() {
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify({
            type: "player_update",
            level: player.level,
            score: player.score
        }));
    }
}

function loop(timestamp) {
    if (!isRunning) return;
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    if (dt < 100) { update(dt); draw(); }
    animationId = requestAnimationFrame(loop);
}

function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Remplir immédiatement le fond pour éviter l'écran "bleu" (transparent/défaut)
    if(ctx) {
        ctx.fillStyle = "#161625"; // Fond sombre
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function applyClassStats(className) {
    player.upgrades = [];
    player.level = 1;
    player.xp = 0;
    
    if (className === 'fighter') {
        player.acceleration = 0.5; player.maxSpeed = 6; player.friction = 0.96;
    } else if (className === 'tank') {
        player.maxHealth = 200; player.health = 200; 
        player.acceleration = 0.3; player.maxSpeed = 4; player.friction = 0.94;
        player.stats.damage = 20; player.stats.reloadTime = 600; player.radius = 30;
    } else if (className === 'sniper') {
        player.acceleration = 0.4; player.maxSpeed = 5;
        player.stats.damage = 40; player.stats.bulletSpeed = 18; 
        player.stats.reloadTime = 1100; player.stats.bulletLife = 1500;
    }
}

function loop(timestamp) {
    if (!isRunning) return;
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    if (dt < 100) { update(dt); draw(); }
    animationId = requestAnimationFrame(loop);
}

function update(dt) {
    // 1. Physique Joueur (Inchangé)
    if (keys['KeyW'] || keys['ArrowUp'] || keys['KeyZ']) player.vy -= player.acceleration;
    if (keys['KeyS'] || keys['ArrowDown']) player.vy += player.acceleration;
    if (keys['KeyA'] || keys['ArrowLeft'] || keys['KeyQ']) player.vx -= player.acceleration;
    if (keys['KeyD'] || keys['ArrowRight']) player.vx += player.acceleration;
    
    if (keys['Space'] && player.dashCooldown <= 0) {
        player.vx *= 3; player.vy *= 3; player.dashCooldown = 2000;
    }
    if (player.dashCooldown > 0) player.dashCooldown -= dt;

    player.vx *= player.friction; player.vy *= player.friction;
    if(isNaN(player.vx)) player.vx = 0; if(isNaN(player.vy)) player.vy = 0;
    player.x += player.vx; player.y += player.vy;

    // Bordures
    if (player.x < player.radius) player.x = player.radius;
    if (player.x > mapSize - player.radius) player.x = mapSize - player.radius;
    if (player.y < player.radius) player.y = player.radius;
    if (player.y > mapSize - player.radius) player.y = mapSize - player.radius;

    // Caméra
    player.cameraTargetX = player.x - canvas.width / 2;
    player.cameraTargetY = player.y - canvas.height / 2;
    camera.x += (player.cameraTargetX - camera.x) * 0.1;
    camera.y += (player.cameraTargetY - camera.y) * 0.1;

    // Angle & Tir
    const targetAngle = Math.atan2(mouse.y - (player.y - camera.y), mouse.x - (player.x - camera.x));
    if (!isNaN(targetAngle)) player.angle = targetAngle;

    if (keys['MouseLeft'] && Date.now() - player.lastShot > player.stats.reloadTime) {
        shoot();
        player.lastShot = Date.now();
    }

    // 2. Mise à jour Balles (Locales)
    for (let i = player.bullets.length - 1; i >= 0; i--) {
        let b = player.bullets[i];
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
        b.life -= dt;
        if (b.life <= 0) player.bullets.splice(i, 1);
    }

    // 3. Mise à jour Balles (Ennemies) & Dégâts
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let b = enemyBullets[i];
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
        b.life -= dt;

        // Collision Balle Ennemie -> MOI
        const dist = Math.hypot(player.x - b.x, player.y - b.y);
        if (dist < player.radius + b.radius) {
            takeDamage(b.damage || 10); // Aïe
            enemyBullets.splice(i, 1); // La balle disparaît
            continue;
        }

        if (b.life <= 0) enemyBullets.splice(i, 1);
    }

    // 4. Orbes
    for (let i = orbs.length - 1; i >= 0; i--) {
        let orb = orbs[i];
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        if (dist < player.radius + orb.radius + 10) {
            gainXp(orb.value);
            if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
                state.websocket.send(JSON.stringify({ type: "guess", word: orb.id, player_name: "system" }));
            }
            orbs.splice(i, 1);
        }
    }

    // 5. Envoi position (Réseau) - Tous les 50ms environ
    if (Date.now() - lastPosUpdate > 50) {
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            state.websocket.send(JSON.stringify({
                type: "player_move",
                x: Math.round(player.x),
                y: Math.round(player.y),
                angle: parseFloat(player.angle.toFixed(2)),
                class: player.class
            }));
        }
        lastPosUpdate = Date.now();
    }
}

function takeDamage(amount) {
    player.health -= amount;
    if (player.health <= 0) {
        player.health = 0;
        handleDeath();
    }
    updateHud();
}

function updateHud() {
    // Barre de vie
    const hpBar = document.getElementById("io-hp-bar");
    if (hpBar) {
        const pct = (player.health / player.maxHealth) * 100;
        hpBar.style.width = `${pct}%`;
        // Changement couleur selon PV
        if (pct < 30) hpBar.style.background = "#e74c3c";
        else hpBar.style.background = "#2ecc71";
    }
}

function handleDeath() {
    isRunning = false;
    
    // Envoyer notif mort
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify({ type: "player_death" }));
    }
    
    // Afficher écran de fin
    const deadScreen = document.getElementById("io-game-over");
    if (deadScreen) {
        deadScreen.style.display = "flex";
        document.getElementById("io-final-score").textContent = player.score;
    }
}

function shoot() {
    const createBullet = (angleOffset = 0, speedMult = 1, sizeMult = 1) => {
        player.bullets.push({
            x: player.x + Math.cos(player.angle) * player.radius,
            y: player.y + Math.sin(player.angle) * player.radius,
            angle: player.angle + angleOffset,
            speed: player.stats.bulletSpeed * speedMult,
            radius: player.stats.bulletSize * sizeMult,
            life: player.stats.bulletLife
        });
    };

    if (player.class === 'fighter') {
        if (player.upgrades.includes('spread_shot')) {
             createBullet(0); createBullet(0.1); createBullet(-0.1);
             createBullet(Math.PI/4); createBullet(-Math.PI/4);
        } else if (player.upgrades.includes('triple_shot')) {
             createBullet(0); createBullet(0.2); createBullet(-0.2);
        } else if (player.upgrades.includes('double_shot')) {
             createBullet(0.1); createBullet(-0.1);
        } else {
             createBullet(0);
        }
    } else if (player.class === 'sniper') {
        let size = 1;
        if (player.upgrades.includes('caliber')) size = 2.5;
        if (player.upgrades.includes('railgun')) createBullet(0, 3, size); 
        else createBullet(0, 1, size);
    } else if (player.class === 'tank') {
        if (player.upgrades.includes('octo_tank')) {
            for(let i=0; i<8; i++) createBullet(i * (Math.PI/4));
        } else if (player.upgrades.includes('quad_tank')) {
            createBullet(0); createBullet(Math.PI/2); createBullet(Math.PI); createBullet(-Math.PI/2);
        } else if (player.upgrades.includes('twin_flank')) {
            createBullet(0); createBullet(Math.PI);
        } else {
            createBullet(0);
        }
    }
}

function gainXp(amount) {
    player.xp += amount;
    player.score += amount;
    if (player.xp >= player.xpToNext) {
        player.level++;
        player.xp = 0;
        player.xpToNext = Math.floor(player.xpToNext * 1.5);
        document.getElementById("io-level").textContent = player.level;
        if (player.level % 5 === 0) showUpgradeMenu();
        sendStatsUpdate();
    }
    const pct = (player.xp / player.xpToNext) * 100;
    document.getElementById("io-xp-bar").style.width = `${pct}%`;
}

function showUpgradeMenu() {
    const modal = document.getElementById("upgrade-modal");
    const optionsDiv = document.getElementById("upgrade-options");
    if (!optionsDiv) return;
    optionsDiv.innerHTML = "";
    
    const options = getUpgradeOptionsForClass(player.class, player.level);
    options.push({id: 'stat_dmg', name: "💪 Dégâts +", desc: "Augmente les dégâts"});
    options.push({id: 'stat_spd', name: "⚡ Vitesse +", desc: "Déplacement plus rapide"});

    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.style.margin = "5px";
        btn.innerHTML = `<strong>${opt.name}</strong><br><small>${opt.desc}</small>`;
        btn.onclick = () => {
            applyUpgrade(opt.id);
            modal.classList.remove("active");
        };
        optionsDiv.appendChild(btn);
    });
    modal.classList.add("active");
}

function getUpgradeOptionsForClass(cls, lvl) {
    const opts = [];
    if (cls === 'fighter') {
        if (lvl === 5) opts.push({id: 'double_shot', name: "Double Tir", desc: "Tire 2 balles parallèles"});
        if (lvl === 10 && player.upgrades.includes('double_shot')) opts.push({id: 'triple_shot', name: "Triple Tir", desc: "Tire 3 balles en éventail"});
        if (lvl === 15 && player.upgrades.includes('triple_shot')) opts.push({id: 'spread_shot', name: "Omni-Fighter", desc: "Tirs avant et latéraux"});
    }
    if (cls === 'sniper') {
        if (lvl === 5) opts.push({id: 'scope', name: "Lunette de visée", desc: "La caméra voit plus loin"});
        if (lvl === 10) opts.push({id: 'caliber', name: "Gros Calibre", desc: "Balles 2.5x plus larges"});
        if (lvl === 15) opts.push({id: 'railgun', name: "Railgun", desc: "Vitesse de balle hypersonique"});
    }
    if (cls === 'tank') {
        if (lvl === 5) opts.push({id: 'twin_flank', name: "Arrière-Garde", desc: "Tire devant et derrière"});
        if (lvl === 10) opts.push({id: 'quad_tank', name: "Quadra-Tank", desc: "Tire dans les 4 directions"});
        if (lvl === 15) opts.push({id: 'octo_tank', name: "Forteresse Octo", desc: "Tire dans 8 directions !"});
    }
    return opts;
}

function applyUpgrade(id) {
    player.upgrades.push(id);
    if (id === 'stat_dmg') player.stats.damage += 5;
    if (id === 'stat_spd') player.speed += 1;
}

function draw() {
    if (!ctx) return;
    ctx.fillStyle = "#161625"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    const gridSize = 100;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    
    for (let x = startX; x < camera.x + canvas.width + gridSize; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, camera.y); ctx.lineTo(x, camera.y + canvas.height); ctx.stroke();
    }
    for (let y = startY; y < camera.y + canvas.height + gridSize; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(camera.x, y); ctx.lineTo(camera.x + canvas.width, y); ctx.stroke();
    }

    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    orbs.forEach(o => {
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fillStyle = o.color;
        ctx.fill();
    });

    ctx.fillStyle = "#fff";
    player.bullets.forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
    });

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#95a5a6";
    if (player.class === 'tank' && player.upgrades.includes('octo_tank')) {
        for(let i=0; i<8; i++) { ctx.fillRect(10, -8, 25, 16); ctx.rotate(Math.PI/4); }
    } else {
        ctx.fillRect(0, -10, 30, 20); 
    }
    
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = CLASSES[player.class].color;
    ctx.fill();
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    
    ctx.restore();

    drawMinimap();
}

function drawMinimap() {
    const size = 120;
    const margin = 20;
    const scale = size / mapSize;
    const x = canvas.width - size - margin;
    const y = canvas.height - size - margin;

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + player.x * scale, y + player.y * scale, 3, 0, Math.PI*2);
    ctx.fill();
    
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    orbs.forEach(o => {
        ctx.beginPath();
        ctx.rect(x + o.x * scale, y + o.y * scale, 1, 1);
        ctx.fill();
    });
    
    ctx.restore();
}