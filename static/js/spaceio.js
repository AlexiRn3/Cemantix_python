import { state } from "./state.js";

let canvas, ctx;
let animationId;
let lastTime = 0;
let isRunning = false;

// JOUEUR AVEC PHYSIQUE AMÉLIORÉE
let player = {
    x: 1000, y: 1000,
    vx: 0, vy: 0,          // Vélocité (Vitesse actuelle)
    angle: 0,
    radius: 20,
    class: 'fighter',
    level: 1, xp: 0, xpToNext: 50, score: 0,
    maxHealth: 100, health: 100,
    
    // Stats de pilotage
    acceleration: 0.8,     // Puissance du moteur
    maxSpeed: 8,           // Vitesse max
    friction: 0.94,        // Frottement de l'espace (0.9 = glisse beaucoup, 0.99 = glisse infini)
    
    bullets: [],
    stats: { reloadTime: 400, damage: 10, bulletSpeed: 12, bulletSize: 5, bulletLife: 800 },
    lastShot: 0,
    upgrades: [],
    dashCooldown: 0
};

let orbs = [];
let mapSize = 2000;
let keys = {};
let mouse = { x: 0, y: 0 };

// CAMÉRA FLUIDE
let camera = { 
    x: 0, y: 0,
    targetX: 0, targetY: 0 
};

// ... (CLASSES inchangées) ...
const CLASSES = {
    fighter: { name: "Fighter", color: "#3498db" },
    tank: { name: "Tank", color: "#e74c3c" },
    sniper: { name: "Sniper", color: "#9b59b6" }
};

export function addNewOrb(orbData) {
    if (orbData) {
        orbs.push(orbData);
    }
}

export function initSpaceIo(serverOrbs, size) {
    console.log("SpaceIO Engine Starting...");
    orbs = serverOrbs || [];
    mapSize = size || 2000;
    canvas = document.getElementById("spaceio-canvas");
    ctx = canvas.getContext("2d");
    
    resize();
    window.addEventListener("resize", resize);
    
    // Inputs
    window.addEventListener("keydown", e => keys[e.code] = true);
    window.addEventListener("keyup", e => keys[e.code] = false);
    canvas.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    canvas.addEventListener("mousedown", () => keys['MouseLeft'] = true);
    canvas.addEventListener("mouseup", () => keys['MouseLeft'] = false);
    
    // Fonctions globales pour l'UI
    window.stopSpaceIo = () => {
        isRunning = false;
        cancelAnimationFrame(animationId);
    };

    window.startGameIo = (className) => {
        console.log("Class selected:", className);
        player.class = className;
        applyClassStats(className);
        
        const startScreen = document.getElementById("io-start-screen");
        if (startScreen) startScreen.style.display = "none";
        
        // Reset
        player.x = Math.random() * mapSize;
        player.y = Math.random() * mapSize;
        player.vx = 0; player.vy = 0;
        camera.x = player.x - canvas.width / 2;
        camera.y = player.y - canvas.height / 2;
        
        isRunning = true;
        loop(0);
    };
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Stats ajustées pour le gameplay "smooth"
function applyClassStats(className) {
    // Reset stats de base avant d'appliquer la classe
    player.upgrades = [];
    player.level = 1;
    player.xp = 0;
    
    if (className === 'fighter') {
        player.acceleration = 0.9; player.maxSpeed = 9; player.friction = 0.95;
    } else if (className === 'tank') {
        player.maxHealth = 200; player.health = 200; 
        player.acceleration = 0.5; player.maxSpeed = 6; player.friction = 0.92;
        player.stats.damage = 20; player.stats.reloadTime = 600; player.radius = 30;
    } else if (className === 'sniper') {
        player.acceleration = 0.7; player.maxSpeed = 7;
        player.stats.damage = 40; player.stats.bulletSpeed = 20; 
        player.stats.reloadTime = 1100; player.stats.bulletLife = 1500;
    }
}

function loop(timestamp) {
    if (!isRunning) return;
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    update(dt);
    draw();
    animationId = requestAnimationFrame(loop);
}

export function removeOrb(orbId) {
    const index = orbs.findIndex(o => o.id === orbId);
    if (index !== -1) {
        orbs.splice(index, 1);
    }
}

function update(dt) {
    // 1. Physique (Avec sécurité NaN)
    if (keys['KeyW'] || keys['ArrowUp'] || keys['KeyZ']) player.vy -= player.acceleration;
    if (keys['KeyS'] || keys['ArrowDown']) player.vy += player.acceleration;
    if (keys['KeyA'] || keys['ArrowLeft'] || keys['KeyQ']) player.vx -= player.acceleration;
    if (keys['KeyD'] || keys['ArrowRight']) player.vx += player.acceleration;

    if (keys['Space'] && player.dashCooldown <= 0) {
        player.vx *= 3; player.vy *= 3; player.dashCooldown = 2000;
    }
    if (player.dashCooldown > 0) player.dashCooldown -= dt;

    player.vx *= player.friction;
    player.vy *= player.friction;
    
    // SÉCURITÉ : Empêcher les valeurs infinies/NaN qui figent le canvas
    if (isNaN(player.vx)) player.vx = 0;
    if (isNaN(player.vy)) player.vy = 0;

    player.x += player.vx;
    player.y += player.vy;

    // Bordures
    if (player.x < player.radius) { player.x = player.radius; player.vx *= -0.5; }
    if (player.x > mapSize - player.radius) { player.x = mapSize - player.radius; player.vx *= -0.5; }
    if (player.y < player.radius) { player.y = player.radius; player.vy *= -0.5; }
    if (player.y > mapSize - player.radius) { player.y = mapSize - player.radius; player.vy *= -0.5; }

    // 2. Caméra & Angle
    player.cameraTargetX = player.x - canvas.width / 2;
    player.cameraTargetY = player.y - canvas.height / 2;
    camera.x += (player.cameraTargetX - camera.x) * 0.1;
    camera.y += (player.cameraTargetY - camera.y) * 0.1;

    const targetAngle = Math.atan2(mouse.y - (player.y - camera.y), mouse.x - (player.x - camera.x));
    if (!isNaN(targetAngle)) player.angle = targetAngle;

    // 3. Tir
    if (keys['MouseLeft'] && Date.now() - player.lastShot > player.stats.reloadTime) {
        shoot();
        player.lastShot = Date.now();
    }

    // 4. Balles
    for (let i = player.bullets.length - 1; i >= 0; i--) {
        let b = player.bullets[i];
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
        b.life -= dt;
        if (b.life <= 0) player.bullets.splice(i, 1);
    }

    // 5. Collisions Orbes
    for (let i = orbs.length - 1; i >= 0; i--) {
        let orb = orbs[i];
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        
        // Hitbox un peu plus large (+10) pour le confort
        if (dist < player.radius + orb.radius + 10) {
            gainXp(orb.value);
            
            // Notification Serveur
            if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
                state.websocket.send(JSON.stringify({ 
                    type: "guess", 
                    word: orb.id, // On envoie l'ID de la bille
                    player_name: "system" 
                }));
            }
            orbs.splice(i, 1); // Suppression locale immédiate pour fluidité
        }
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

    // Logique de classe
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
    if (player.xp >= player.xpToNext) {
        player.level++;
        player.xp = 0;
        player.xpToNext = Math.floor(player.xpToNext * 1.5);
        document.getElementById("io-level").textContent = player.level;
        if (player.level % 5 === 0) showUpgradeMenu();
    }
    const pct = (player.xp / player.xpToNext) * 100;
    document.getElementById("io-xp-bar").style.width = `${pct}%`;
}

function showUpgradeMenu() {
    const modal = document.getElementById("upgrade-modal");
    const optionsDiv = document.getElementById("upgrade-options");
    if (!optionsDiv) return; // Sécurité
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
    // Fond Galactique
    ctx.fillStyle = "#161625"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(-camera.x, -camera.y); // Caméra lissée

    // Grille Parallaxe (Optionnel : effet de profondeur)
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    const gridSize = 100;
    // Optimisation : ne dessiner que la grille visible
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    
    for (let x = startX; x < camera.x + canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, camera.y); ctx.lineTo(x, camera.y + canvas.height); ctx.stroke();
    }
    for (let y = startY; y < camera.y + canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(camera.x, y); ctx.lineTo(camera.x + canvas.width, y); ctx.stroke();
    }
    
    // Limites de la map
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    // Orbs (avec petit effet de brillance)
    orbs.forEach(o => {
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fillStyle = o.color;
        ctx.shadowBlur = 10; ctx.shadowColor = o.color; // Glow
        ctx.fill();
        ctx.shadowBlur = 0; // Reset
    });

    // Balles
    ctx.fillStyle = "#fff";
    player.bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Joueur
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    
    // Canon
    ctx.fillStyle = "#95a5a6";
    if (player.class === 'tank' && player.upgrades.includes('octo_tank')) {
        for(let i=0; i<8; i++) { ctx.fillRect(10, -8, 25, 16); ctx.rotate(Math.PI/4); }
    } else {
        ctx.fillRect(5, -12, 35, 24); 
    }
    
    // Corps
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = CLASSES[player.class].color;
    ctx.fill();
    // Bordure joueur
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.restore();
    ctx.restore();

    // Minimap
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
    
    // Point Joueur
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + player.x * scale, y + player.y * scale, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
}