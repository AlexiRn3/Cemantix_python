import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from "./state.js";
import { verifierPseudo } from "./session.js";

/* =========================================
   1. CONFIGURATION DU JEU (LOGIQUE)
   ========================================= */
const CONFIG = {
    upgrades: {
        stagiaire: { id: 'stagiaire', name: "Poste Stagiaire", baseCost: 15, production: 1, color: 0x00ff00 },
        correcteur: { id: 'correcteur', name: "Bureau Correcteur", baseCost: 100, production: 5, color: 0x00ffff },
        imprimerie: { id: 'imprimerie', name: "Imprimante 3D", baseCost: 1100, production: 40, color: 0xffaa00 },
        serveur: { id: 'serveur', name: "Serveur Rack", baseCost: 12000, production: 250, color: 0xff0000 },
        ia: { id: 'ia', name: "Supercalculateur", baseCost: 130000, production: 1500, color: 0xff00ff }
    }
};

let gameState = {
    currency: 0,
    inventory: { stagiaire: 0, correcteur: 0, imprimerie: 0, serveur: 0, ia: 0 },
    lastSaveTime: Date.now()
};

/* =========================================
   2. MOTEUR 3D (THREE.JS)
   ========================================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Gris très foncé
scene.fog = new THREE.FogExp2(0x111111, 0.02); // Brouillard pour la profondeur

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// Contrôles caméra (Orbit)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.1; // Empêche de passer sous le sol
controls.minDistance = 3;
controls.maxDistance = 20;

// Éclairage
const ambientLight = new THREE.AmbientLight(0x404040, 2); // Lumière douce
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 2, 50);
pointLight.position.set(0, 10, 0);
pointLight.castShadow = true;
scene.add(pointLight);

// Sol (Grille style TRON)
const gridHelper = new THREE.GridHelper(100, 100, 0x00ff00, 0x444444);
scene.add(gridHelper);

const planeGeometry = new THREE.PlaneGeometry(100, 100);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.8 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);

// --- GROUPE DES OBJETS DU JEU ---
const worldGroup = new THREE.Group();
scene.add(worldGroup);

// LE "CŒUR" (Clicker principal)
const coreGeometry = new THREE.IcosahedronGeometry(1.5, 0);
const coreMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x6c5ce7, 
    emissive: 0x6c5ce7, 
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.8
});
const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
coreMesh.position.set(0, 2, 0);
coreMesh.castShadow = true;
coreMesh.userData = { isClickable: true, type: 'core' }; // Tag pour le raycaster
scene.add(coreMesh);

// Anneaux autour du cœur (animation)
const ringGeo = new THREE.TorusGeometry(2.5, 0.05, 16, 100);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
const ringMesh = new THREE.Mesh(ringGeo, ringMat);
ringMesh.rotation.x = Math.PI / 2;
scene.add(ringMesh);

// --- RAYCASTER (Interaction Souris) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', onMouseClick);
window.addEventListener('mousemove', onMouseMove);

function onMouseMove(event) {
    // Convertir souris en coordonnées normalisées (-1 à +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onMouseClick(event) {
    // Si on clique sur l'UI, on ignore la 3D
    if (event.target.closest('.hud-bottom') || event.target.closest('.hud-top')) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.userData.isClickable && object.userData.type === 'core') {
            // CLIC SUR LE CŒUR
            clickCoreEffect();
        }
    }
}

function clickCoreEffect() {
    gameState.currency += 1; // Gain au clic
    updateUI();
    
    // Animation visuelle (Scale Up rapide)
    coreMesh.scale.set(1.2, 1.2, 1.2);
    coreMaterial.emissiveIntensity = 2;
    setTimeout(() => {
        coreMesh.scale.set(1, 1, 1);
        coreMaterial.emissiveIntensity = 0.5;
    }, 100);
}

// --- GESTION DES BÂTIMENTS 3D ---
const spawnedObjects = {
    stagiaire: [], correcteur: [], imprimerie: [], serveur: [], ia: []
};

// Fonction pour ajouter visuellement un objet
function spawnBuilding(type) {
    const info = CONFIG.upgrades[type];
    const index = spawnedObjects[type].length;
    
    // Définir la géométrie selon le type (Formes simples pour l'instant)
    let mesh;
    const color = info.color;
    
    if (type === 'stagiaire') {
        // Petit cube
        const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
        const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 });
        mesh = new THREE.Mesh(geo, mat);
        // Positionnement en cercle autour du centre (rayon 5)
        const angle = index * 0.5;
        mesh.position.set(Math.cos(angle) * 5, 0.5, Math.sin(angle) * 5);
        
    } else if (type === 'serveur') {
        // Grand prisme
        const geo = new THREE.BoxGeometry(1, 3, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0x222, emissive: color, emissiveIntensity: 0.5 });
        mesh = new THREE.Mesh(geo, mat);
        // Positionnement en cercle plus loin (rayon 12)
        const angle = index * 0.4;
        mesh.position.set(Math.cos(angle) * 12, 1.5, Math.sin(angle) * 12);
    } else {
        // Par défaut (sphères pour les autres)
        const geo = new THREE.SphereGeometry(0.5);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        mesh = new THREE.Mesh(geo, mat);
        // Positionnement aléatoire "organisé"
        const radius = 8 + (Object.keys(CONFIG.upgrades).indexOf(type) * 3);
        const angle = index * 0.5 + 1;
        mesh.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Animation d'apparition
    mesh.scale.set(0,0,0);
    
    scene.add(mesh);
    spawnedObjects[type].push(mesh);
    
    // Animation tween simple (sans library externe)
    let s = 0;
    const anim = setInterval(() => {
        s += 0.1;
        mesh.scale.set(s, s, s);
        if(s >= 1) clearInterval(anim);
    }, 16);
}

function sync3DWorld() {
    // Vérifie si le nombre d'objets 3D correspond à l'inventaire
    for (const [key, count] of Object.entries(gameState.inventory)) {
        if (!spawnedObjects[key]) continue;
        const diff = count - spawnedObjects[key].length;
        if (diff > 0) {
            for(let i=0; i<diff; i++) spawnBuilding(key);
        }
    }
}

/* =========================================
   3. BOUCLE DE JEU & LOGIQUE TYCOON
   ========================================= */

// Init HTML UI
function initHUD() {
    const container = document.getElementById("upgrades-container");
    container.innerHTML = "";

    for (const key in CONFIG.upgrades) {
        const item = CONFIG.upgrades[key];
        const div = document.createElement("div");
        div.className = "upgrade-card-3d";
        div.id = `card-${key}`;
        div.onclick = () => buyUpgrade(key);
        
        div.innerHTML = `
            <div style="font-weight:bold; font-size:0.9rem;">${item.name}</div>
            <div style="font-size:0.8rem; color:#aaa;">+${item.production}/s</div>
            <div style="color:var(--accent); font-weight:bold; margin-top:5px;" id="cost-${key}">...</div>
            <div style="font-size:0.7rem;">Possédé: <span id="count-${key}">0</span></div>
        `;
        container.appendChild(div);
    }
}

function getCost(id) {
    const base = CONFIG.upgrades[id].baseCost;
    const count = gameState.inventory[id];
    return Math.floor(base * Math.pow(1.15, count));
}

function calculatePPS() {
    let pps = 0;
    for (const [key, count] of Object.entries(gameState.inventory)) {
        if (CONFIG.upgrades[key]) pps += count * CONFIG.upgrades[key].production;
    }
    return pps;
}

function buyUpgrade(id) {
    const cost = getCost(id);
    if (gameState.currency >= cost) {
        gameState.currency -= cost;
        gameState.inventory[id]++;
        
        spawnBuilding(id); // Ajout visuel immédiat
        updateUI();
        saveGame();
    }
}

function updateUI() {
    document.getElementById("currency-display").textContent = Math.floor(gameState.currency).toLocaleString();
    document.getElementById("pps-display").textContent = calculatePPS().toLocaleString();

    for (const key in CONFIG.upgrades) {
        const cost = getCost(key);
        const card = document.getElementById(`card-${key}`);
        
        document.getElementById(`cost-${key}`).textContent = cost.toLocaleString();
        document.getElementById(`count-${key}`).textContent = gameState.inventory[key];

        if (gameState.currency < cost) card.classList.add("disabled");
        else card.classList.remove("disabled");
    }
}

/* =========================================
   4. SYSTEME DE SAUVEGARDE (Même API)
   ========================================= */
async function saveGame() {
    if (!state.currentUser) return;
    try {
        await fetch("/tycoon/save", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${localStorage.getItem("access_token")}` 
            },
            body: JSON.stringify({ save_data: { 
                currency: gameState.currency, 
                inventory: gameState.inventory, 
                last_timestamp: Date.now() 
            }})
        });
    } catch (e) { console.error(e); }
}

async function loadGame() {
    if (!state.currentUser) return;
    try {
        const res = await fetch("/tycoon/load", {
            headers: { "Authorization": `Bearer ${localStorage.getItem("access_token")}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.inventory) {
                gameState.currency = data.currency || 0;
                gameState.inventory = { ...gameState.inventory, ...data.inventory };
                
                // Calcul Offline
                if (data.last_timestamp) {
                    const sec = (Date.now() - data.last_timestamp) / 1000;
                    const gain = calculatePPS() * sec;
                    if (gain > 0) gameState.currency += gain;
                }
            }
        }
    } catch (e) { console.error(e); }
}

/* =========================================
   5. MAIN LOOP
   ========================================= */

let lastTime = 0;

function animate(time) {
    requestAnimationFrame(animate);
    
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    // Rotation douce du cœur
    coreMesh.rotation.y += 0.01;
    coreMesh.rotation.z += 0.005;
    ringMesh.rotation.z -= 0.02;
    
    // Pulsation de lumière
    const pulse = Math.sin(time * 0.002) * 0.5 + 1;
    pointLight.intensity = 2 * pulse;

    controls.update();
    renderer.render(scene, camera);

    // Tycoon Logic (Ajout des revenus auto)
    const pps = calculatePPS();
    if (pps > 0 && delta < 1) { // Evite les sauts énormes si on change d'onglet
        gameState.currency += pps * delta;
        updateUI();
    }
}

// Redimensionnement fenêtre
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// START
document.addEventListener("DOMContentLoaded", async () => {
    if (!verifierPseudo()) return;
    
    initHUD();
    await loadGame();
    sync3DWorld(); // Faire apparaître les objets sauvegardés
    
    // Sauvegarde auto
    setInterval(saveGame, 30000);
    
    animate(0);
});