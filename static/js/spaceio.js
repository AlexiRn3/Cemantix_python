// static/js/spaceio.js

import { state } from "./state.js";
import { elements } from "./dom.js";

let canvas, ctx;
let animationId;
let lastTime = 0;

// Configuration du joueur local
let player = {
    x: 1000, y: 1000,
    angle: 0,
    radius: 20,
    class: 'fighter',
    level: 1,
    xp: 0,
    xpToNext: 50,
    maxHealth: 100,
    health: 100,
    speed: 4,
    bullets: [],
    stats: {
        reloadTime: 500, // ms
        damage: 10,
        bulletSpeed: 8,
        bulletSize: 5,
        bulletLife: 1000
    },
    lastShot: 0,
    upgrades: [], // Liste des upgrades acquis
    dashCooldown: 0
};

// État du monde
let orbs = [];
let mapSize = 2000;
let keys = {};
let mouse = { x: 0, y: 0 };
let camera = { x: 0, y: 0 };

// Définition des classes et évolutions
const CLASSES = {
    fighter: { name: "Fighter", color: "#3498db" },
    tank: { name: "Tank", color: "#e74c3c" }, // Rouge
    sniper: { name: "Sniper", color: "#9b59b6" } // Violet
};

export function initSpaceIo(serverOrbs, size) {
    orbs = serverOrbs || [];
    mapSize = size || 2000;
    canvas = document.getElementById("spaceio-canvas");
    ctx = canvas.getContext("2d");
    
    resize();
    window.addEventListener("resize", resize);
    
    // Inputs
    window.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
    window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
    canvas.addEventListener("mousemove", e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener("mousedown", () => keys['mouse'] = true);
    canvas.addEventListener("mouseup", () => keys['mouse'] = false);

    // Exposition globale pour le bouton de démarrage
    window.startGameIo = (className) => {
        player.class = className;
        applyClassStats(className);
        document.getElementById("io-start-screen").style.display = "none";
        loop(0);
    };
}

function applyClassStats(className) {
    if (className === 'tank') {
        player.maxHealth = 200; player.health = 200; player.speed = 3;
        player.stats.damage = 15; player.stats.reloadTime = 800; player.radius = 25;
    } else if (className === 'sniper') {
        player.speed = 3.5;
        player.stats.damage = 30; player.stats.bulletSpeed = 15; 
        player.stats.reloadTime = 1000; player.stats.bulletLife = 1500;
    }
}

function resize() {
    canvas.width = window.innerWidth; // Ou container width
    canvas.height = window.innerHeight * 0.8;
}

function loop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    update(dt);
    draw();
    
    if (!state.roomLocked) animationId = requestAnimationFrame(loop);
}

function update(dt) {
    // 1. Mouvement
    let dx = 0, dy = 0;
    if (keys['z'] || keys['w']) dy -= 1;
    if (keys['s']) dy += 1;
    if (keys['q'] || keys['a']) dx -= 1;
    if (keys['d']) dx += 1;

    // Dash (Espace)
    if (keys[' '] && player.dashCooldown <= 0) {
        player.speed *= 3;
        player.dashCooldown = 1000; // 1s cooldown
        setTimeout(() => player.speed /= 3, 200); // 0.2s dash
    }
    if (player.dashCooldown > 0) player.dashCooldown -= dt;

    if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx*dx + dy*dy);
        player.x += (dx / length) * player.speed * (dt/16);
        player.y += (dy / length) * player.speed * (dt/16);
        
        // Bordures
        player.x = Math.max(player.radius, Math.min(mapSize - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(mapSize - player.radius, player.y));
    }

    // 2. Rotation vers la souris
    // La position souris est relative à l'écran, le joueur est au centre (virtuellement)
    const screenCx = canvas.width / 2;
    const screenCy = canvas.height / 2;
    player.angle = Math.atan2(mouse.y - screenCy, mouse.x - screenCx);

    // 3. Caméra qui suit le joueur
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;

    // 4. Tirs
    if (keys['mouse'] && Date.now() - player.lastShot > player.stats.reloadTime) {
        shoot();
        player.lastShot = Date.now();
    }

    // Mise à jour balles
    player.bullets.forEach((b, i) => {
        b.x += Math.cos(b.angle) * b.speed * (dt/16);
        b.y += Math.sin(b.angle) * b.speed * (dt/16);
        b.life -= dt;
        if (b.life <= 0) player.bullets.splice(i, 1);
    });

    // 5. Collisions Orbs
    orbs.forEach((orb, index) => {
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        if (dist < player.radius + orb.radius) {
            // Manger
            gainXp(orb.value);
            orbs.splice(index, 1);
            // Envoyer au serveur
            if (state.websocket) {
                state.websocket.send(JSON.stringify({
                    type: "guess", // Détournement du type guess
                    word: orb.id,  // ID de l'orb
                    player_name: "system" 
                }));
            }
        }
    });
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

    // --- LOGIQUE DES CLASSES ET UPGRADES ---
    
    // FIGHTER
    if (player.class === 'fighter') {
        if (player.upgrades.includes('spread_shot')) { // Lvl 15
             createBullet(0); createBullet(0.1); createBullet(-0.1);
             createBullet(Math.PI/4); createBullet(-Math.PI/4); // Côtés
        } else if (player.upgrades.includes('triple_shot')) { // Lvl 10
             createBullet(0); createBullet(0.2); createBullet(-0.2);
        } else if (player.upgrades.includes('double_shot')) { // Lvl 5
             createBullet(0.1); createBullet(-0.1);
        } else {
             createBullet(0);
        }
    } 
    // SNIPER
    else if (player.class === 'sniper') {
        let size = 1;
        if (player.upgrades.includes('caliber')) size = 2.5; // Lvl 10
        
        if (player.upgrades.includes('railgun')) { // Lvl 15 - TRES RAPIDE
            createBullet(0, 3, size); 
        } else {
            createBullet(0, 1, size);
        }
    }
    // TANK
    else if (player.class === 'tank') {
        if (player.upgrades.includes('octo_tank')) { // Lvl 15
            for(let i=0; i<8; i++) createBullet(i * (Math.PI/4));
        } else if (player.upgrades.includes('quad_tank')) { // Lvl 10
            createBullet(0); createBullet(Math.PI/2); createBullet(Math.PI); createBullet(-Math.PI/2);
        } else if (player.upgrades.includes('twin_flank')) { // Lvl 5
            createBullet(0); createBullet(Math.PI); // Devant Derrière
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
        
        // Check Upgrade
        if (player.level % 5 === 0) {
            showUpgradeMenu();
        }
    }
    // Update UI Bar
    const pct = (player.xp / player.xpToNext) * 100;
    document.getElementById("io-xp-bar").style.width = `${pct}%`;
}

function showUpgradeMenu() {
    const modal = document.getElementById("upgrade-modal");
    const optionsDiv = document.getElementById("upgrade-options");
    optionsDiv.innerHTML = "";
    
    const options = getUpgradeOptionsForClass(player.class, player.level);
    
    // Ajout options génériques
    options.push({id: 'stat_dmg', name: "💪 Dégâts +", desc: "Augmente les dégâts"});
    options.push({id: 'stat_spd', name: "⚡ Vitesse +", desc: "Déplacement plus rapide"});

    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "btn";
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
    
    // Logique stats passives
    if (id === 'stat_dmg') player.stats.damage += 5;
    if (id === 'stat_spd') player.speed += 1;
    if (id === 'scope') {
        // Hack simple pour "dézoomer" : on réduit la taille de tout le monde au rendu
        // Mais ici on va juste décaler les limites de caméras si on pouvait
    }
}

function draw() {
    // Fond
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // Caméra
    ctx.translate(-camera.x, -camera.y);

    // Grille
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < mapSize; i+=100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, mapSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(mapSize, i); ctx.stroke();
    }

    // Orbs
    orbs.forEach(o => {
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fillStyle = o.color;
        ctx.fill();
    });

    // Balles
    ctx.fillStyle = "#fff";
    player.bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Joueur (Base)
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    
    // Canon(s) - Dessin simple
    ctx.fillStyle = "#555";
    if (player.class === 'tank' && player.upgrades.includes('octo_tank')) {
        for(let i=0; i<8; i++) { ctx.fillRect(10, -5, 25, 10); ctx.rotate(Math.PI/4); }
    } else {
        // Canon standard
        ctx.fillRect(0, -10, 30, 20); 
    }
    
    // Corps
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = CLASSES[player.class].color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
    
    ctx.restore();

    // --- HUD ---
    drawMinimap();
}

function drawMinimap() {
    const size = 150;
    const pad = 20;
    const scale = size / mapSize;
    
    const x = canvas.width - size - pad;
    const y = canvas.height - size - pad;

    // Fond Minimap
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "white";
    ctx.strokeRect(x, y, size, size);

    // Joueur sur minimap
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x + player.x * scale, y + player.y * scale, 3, 0, Math.PI*2);
    ctx.fill();
}