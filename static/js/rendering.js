import { state } from "./state.js";
import { elements } from "./dom.js";
import { setRoomInfo } from "./ui.js";

export function addEntry(entry) {
    // Ajoute en haut de la liste (unshift au lieu de push pour l'ordre chrono inverse visuel)
    state.entries.unshift(entry);
    renderHistory();
}

export function renderHistory() {
    elements.history.innerHTML = "";

    // 1. On prépare les données en attachant le numéro d'essai CHRONOLOGIQUE (Fix problème #3)
    // state.entries est stocké du plus récent au plus ancien (unshift).
    // Donc l'index 0 correspond au nombre total d'essais.
    const totalAttempts = state.entries.length;
    
    let displayEntries = state.entries.map((entry, index) => ({
        ...entry,
        // Le numéro est fixe : (Total - Index actuel dans la liste brute)
        attemptNumber: totalAttempts - index
    }));

    // 2. LOGIQUE DE TRI (Uniquement pour Cémantix)
    if (state.gameType === "cemantix") {
        displayEntries.sort((a, b) => {
            // Tri décroissant par score (progression)
            return (b.progression || 0) - (a.progression || 0);
        });
    }

    // 3. Affichage
    for (const entry of displayEntries) {
        const row = document.createElement("div");
        const isWin = (entry.game_type === 'definition' && entry.feedback === 'Correct !') || (entry.progression >= 1000);
        
        row.className = `line ${isWin ? 'win' : ''}`;

        // Fix #3 : On utilise le attemptNumber calculé plus haut au lieu d'un index de boucle
        const num = `<div class="num">#${entry.attemptNumber}</div>`;
        const word = `<div class="word">${entry.word} <span style="opacity:0.5; font-size:0.8em">(${entry.player_name})</span></div>`;
        
        let meta = "";
        let bar = "";

        if (entry.game_type === "cemantix") {
            const tempVal = entry.temp !== undefined ? `${entry.temp}°C` : "—";
            const icon = getIcon(entry.progression || 0);
            
            // Fix #2 : Gestion des pourcentages négatifs
            // Si la progression est négative, on force 0% pour éviter une erreur CSS
            const widthPercent = Math.max(0, (entry.progression || 0) / 10);
            
            meta = `<div class="meta">${icon} ${tempVal}</div>`;
            bar = `<div class="score-bar"><div class="fill" style="width:${widthPercent}%"></div></div>`;
        } else {
            // Dictionnario
            meta = `<div class="meta" style="color:var(--accent);">${entry.feedback || ""}</div>`;
            bar = `<div></div>`; 
        }

        row.innerHTML = `${num} ${word} ${meta} ${bar}`;
        elements.history.appendChild(row);
    }
}

export function renderScoreboard(data) {
    if (!elements.scoreboard) return;
    elements.scoreboard.innerHTML = "";
    
    // Tri : Similitude décroissante, puis tentatives croissantes
    data.sort((a, b) => (b.best_similarity - a.best_similarity) || (a.attempts - b.attempts));

    for (const entry of data) {
        const row = document.createElement("div");
        row.className = "score-row";
        
        // Affichage différent selon le jeu (pourcentage pour cemantix, juste essais pour dictio)
        // Mais comme on n'a pas le game_type ici facilement, on affiche les essais, c'est universel.
        row.innerHTML = `
            <div class="score-name">${entry.player_name}</div>
            <div style="color:var(--text-muted)">${entry.attempts} essais</div>
        `;
        elements.scoreboard.appendChild(row);
    }
    updateRoomStatus();
}

export function updateRoomStatus() {
    if (!state.currentRoomId) return;
    setRoomInfo(`Room ${state.currentRoomId} • ${state.currentMode === 'race' ? 'Course' : 'Coop'}`);
}

export function triggerConfetti() {
    // Canvas Confetti doit être chargé dans le HTML
    if (window.confetti) {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }
}

// static/js/rendering.js

function getIcon(value) {
    // value est le score sur 1000 (ex: 351 pour 35.19°C)
    if (value >= 1000) return "💥"; // Trouvé
    if (value >= 990) return "🔥";  // Brûlant
    if (value >= 900) return "🥵";  // Très chaud
    if (value >= 500) return "😎";  // Chaud
    if (value >= 200) return "🌡️";  // Tiède (Nouveau seuil pour les mots > 20°C)
    return "❄️"; // Froid (< 20°C)
}

function getColor(value) {
    // Plus utilisé avec le nouveau design CSS, mais gardé au cas où
    return `hsl(${value / 10}, 80%, 50%)`;
}