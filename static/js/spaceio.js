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
    if (className === 'fighter') {
        player.acceleration = 0.9; player.maxSpeed = 9; player.friction = 0.95;
    } else if (className === 'tank') {
        player.maxHealth = 200; player.health = 200; 
        player.acceleration = 0.5; player.maxSpeed = 6; player.friction = 0.92; // Lourd
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

function update(dt) {
    // 1. PHYSIQUE DE MOUVEMENT (Inertie)
    // Accélération (Input)
    if (keys['KeyW'] || keys['ArrowUp'] || keys['KeyZ']) player.vy -= player.acceleration;
    if (keys['KeyS'] || keys['ArrowDown']) player.vy += player.acceleration;
    if (keys['KeyA'] || keys['ArrowLeft'] || keys['KeyQ']) player.vx -= player.acceleration;
    if (keys['KeyD'] || keys['ArrowRight']) player.vx += player.acceleration;

    // Dash
    if (keys['Space'] && player.dashCooldown <= 0) {
        // Boost instantané dans la direction actuelle
        player.vx *= 3;
        player.vy *= 3;
        player.dashCooldown = 2000;
    }
    if (player.dashCooldown > 0) player.dashCooldown -= dt;

    // Friction (L'espace freine doucement)
    player.vx *= player.friction;
    player.vy *= player.friction;

    // Limitation de vitesse (Cap)
    const speed = Math.sqrt(player.vx*player.vx + player.vy*player.vy);
    if (speed > player.maxSpeed) {
        const ratio = player.maxSpeed / speed;
        player.vx *= ratio;
        player.vy *= ratio;
    }

    // Application de la vélocité
    player.x += player.vx;
    player.y += player.vy;

    // Bordures (Rebond simple)
    if (player.x < player.radius) { player.x = player.radius; player.vx *= -0.5; }
    if (player.x > mapSize - player.radius) { player.x = mapSize - player.radius; player.vx *= -0.5; }
    if (player.y < player.radius) { player.y = player.radius; player.vy *= -0.5; }
    if (player.y > mapSize - player.radius) { player.y = mapSize - player.radius; player.vy *= -0.5; }

    // 2. ROTATION FLUIDE
    // On calcule l'angle vers la souris (ajusté par la caméra)
    const targetAngle = Math.atan2(
        mouse.y - (player.y - camera.y), 
        mouse.x - (player.x - camera.x)
    );
    player.angle = targetAngle; // Rotation instantanée pour la réactivité du tir

    // 3. CAMÉRA FLUIDE (Lerp)
    // La caméra veut être centrée sur le joueur
    player.cameraTargetX = player.x - canvas.width / 2;
    player.cameraTargetY = player.y - canvas.height / 2;

    // Interpolation linéaire : on se déplace de 10% de la distance à chaque frame
    // Cela crée cet effet de "retard" naturel
    camera.x += (player.cameraTargetX - camera.x) * 0.1;
    camera.y += (player.cameraTargetY - camera.y) * 0.1;

    // 4. TIRS
    if (keys['MouseLeft'] && Date.now() - player.lastShot > player.stats.reloadTime) {
        shoot();
        player.lastShot = Date.now();
    }

    // Mise à jour balles
    for (let i = player.bullets.length - 1; i >= 0; i--) {
        let b = player.bullets[i];
        b.x += Math.cos(b.angle) * b.speed; // Pas besoin de dt si 60fps stable, sinon *(dt/16)
        b.y += Math.sin(b.angle) * b.speed;
        b.life -= dt;
        if (b.life <= 0) player.bullets.splice(i, 1);
    }

    // Collisions
    for (let i = orbs.length - 1; i >= 0; i--) {
        let orb = orbs[i];
        // Hitbox un peu plus permissive (+10) pour que ce soit agréable
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        if (dist < player.radius + orb.radius + 10) {
            gainXp(orb.value);
            orbs.splice(i, 1);
            if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
                state.websocket.send(JSON.stringify({ type: "guess", word: orb.id, player_name: "system" }));
            }
        }
    }
}

// ... (shoot, gainXp, showUpgradeMenu, getUpgradeOptionsForClass, applyUpgrade restent similaires) ...
// (Assurez-vous de copier ces fonctions du message précédent si besoin, elles n'ont pas besoin de changer pour la physique)

// ... (Fonction draw reste similaire, juste utiliser la camera.x / camera.y lissés) ...
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