import { state } from "./state.js";

// Configuration du jeu
const CONFIG = {
    upgrades: {
        stagiaire: { 
            id: 'stagiaire', 
            name: "Stagiaire Littéraire", 
            baseCost: 15, 
            production: 1, 
            icon: "☕" 
        },
        correcteur: { 
            id: 'correcteur', 
            name: "Correcteur Ortho.", 
            baseCost: 100, 
            production: 5, 
            icon: "📝" 
        },
        imprimerie: { 
            id: 'imprimerie', 
            name: "Imprimerie Rotative", 
            baseCost: 1100, 
            production: 40, 
            icon: "🖨️" 
        },
        serveur: { 
            id: 'serveur', 
            name: "Cluster de Données", 
            baseCost: 12000, 
            production: 250, 
            icon: "💾" 
        },
        ia: { 
            id: 'ia', 
            name: "IA Générative", 
            baseCost: 130000, 
            production: 1500, 
            icon: "🤖" 
        }
    }
};

// État local du jeu
let gameState = {
    currency: 0,
    inventory: {
        stagiaire: 0,
        correcteur: 0,
        imprimerie: 0,
        serveur: 0,
        ia: 0
    },
    lastSaveTime: Date.now()
};

let lastTick = Date.now();
let saveInterval = null;

// Initialisation
document.addEventListener("DOMContentLoaded", async () => {
    // Attendre que state.currentUser soit peuplé par session.js
    setTimeout(async () => {
        if (localStorage.getItem("arcade_user_pseudo")) {
            state.currentUser = localStorage.getItem("arcade_user_pseudo");
            await loadGame();
        }
        initUI();
        startGameLoop();
    }, 500);
});

// --- LOGIQUE MOTEUR ---

function startGameLoop() {
    // Boucle principale (10 FPS pour fluidité visuelle)
    setInterval(() => {
        const now = Date.now();
        const delta = (now - lastTick) / 1000; // temps en secondes
        lastTick = now;

        const pps = calculatePPS();
        if (pps > 0) {
            gameState.currency += pps * delta;
        }
        updateUI();
    }, 100);

    // Sauvegarde auto toutes les 30s
    saveInterval = setInterval(saveGame, 30000);
    
    // Sauvegarde avant de quitter
    window.addEventListener("beforeunload", () => saveGame());
}

function calculatePPS() {
    let pps = 0;
    for (const [key, count] of Object.entries(gameState.inventory)) {
        if (CONFIG.upgrades[key]) {
            pps += count * CONFIG.upgrades[key].production;
        }
    }
    return pps;
}

function getCost(id) {
    const base = CONFIG.upgrades[id].baseCost;
    const count = gameState.inventory[id];
    // Formule classique : Base * 1.15^count
    return Math.floor(base * Math.pow(1.15, count));
}

function buyUpgrade(id) {
    const cost = getCost(id);
    if (gameState.currency >= cost) {
        gameState.currency -= cost;
        gameState.inventory[id]++;
        updateUI();
        saveGame(); // Petite sauvegarde après achat important
    }
}

// --- INTERFACE ---

function initUI() {
    // Clic manuel
    document.getElementById("click-btn").onclick = () => {
        gameState.currency += 1;
        updateUI();
        
        // Petit effet visuel
        const btn = document.getElementById("click-btn");
        btn.style.transform = "scale(0.98)";
        setTimeout(() => btn.style.transform = "scale(1)", 50);
    };

    // Génération des cartes d'upgrade
    const container = document.getElementById("upgrades-container");
    container.innerHTML = "";

    for (const key in CONFIG.upgrades) {
        const item = CONFIG.upgrades[key];
        const div = document.createElement("div");
        div.className = "upgrade-card";
        div.id = `card-${key}`;
        div.onclick = () => buyUpgrade(key);
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:1.5rem;">${item.icon}</span>
                <span style="font-weight:bold; font-family:var(--font-heading);">${item.name}</span>
            </div>
            <div style="margin:10px 0; color:var(--text-muted); font-size:0.9rem;">
                +${item.production} / sec
            </div>
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <strong style="color:var(--accent); font-size:1.1rem;" id="cost-${key}">...</strong>
                <span style="background:#eee; padding:2px 8px; border-radius:10px; font-size:0.8rem;" id="count-${key}">0</span>
            </div>
        `;
        container.appendChild(div);
    }
}

function updateUI() {
    // Affichage monnaie (sans décimales)
    document.getElementById("currency-display").textContent = Math.floor(gameState.currency).toLocaleString();
    document.getElementById("pps-display").textContent = calculatePPS().toLocaleString();

    // Mise à jour des boutons
    for (const key in CONFIG.upgrades) {
        const cost = getCost(key);
        const card = document.getElementById(`card-${key}`);
        const costEl = document.getElementById(`cost-${key}`);
        const countEl = document.getElementById(`count-${key}`);

        if (costEl) costEl.textContent = cost.toLocaleString() + " Savoir";
        if (countEl) countEl.textContent = gameState.inventory[key];

        // Griser si pas assez d'argent
        if (gameState.currency < cost) {
            card.classList.add("disabled");
        } else {
            card.classList.remove("disabled");
        }
    }
}

// --- PERSISTANCE ---

async function saveGame() {
    if (!state.currentUser) return;

    const notif = document.getElementById("save-notification");
    if(notif) notif.style.opacity = "1";

    const payload = {
        currency: gameState.currency,
        inventory: gameState.inventory,
        last_timestamp: Date.now()
    };

    try {
        const token = localStorage.getItem("access_token");
        await fetch("/tycoon/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ save_data: payload })
        });
        
        setTimeout(() => { if(notif) notif.style.opacity = "0"; }, 1000);
    } catch (e) {
        console.error("Erreur save:", e);
    }
}

async function loadGame() {
    if (!state.currentUser) return;

    try {
        const token = localStorage.getItem("access_token");
        const res = await fetch("/tycoon/load", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            // Fusionner avec l'état par défaut (pour éviter les crashs si save vide)
            if (data && data.inventory) {
                gameState.currency = data.currency || 0;
                gameState.inventory = { ...gameState.inventory, ...data.inventory };
                
                // Calcul gain Offline
                if (data.last_timestamp) {
                    const now = Date.now();
                    const secondsOffline = (now - data.last_timestamp) / 1000;
                    if (secondsOffline > 60) { // Si plus d'une minute d'absence
                        const pps = calculatePPS();
                        const gain = pps * secondsOffline;
                        if (gain > 0) {
                            gameState.currency += gain;
                            alert(`Bon retour ! Pendant votre absence (${Math.floor(secondsOffline/60)} min), vos systèmes ont généré ${Math.floor(gain)} unités de Savoir.`);
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Erreur load:", e);
    }
}