import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti, updateRoomStatus } from "./rendering.js";

// --- 1. Initialisation ---
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const playerName = params.get("player");

// Redirection si infos manquantes
if (!roomId || !playerName) {
    window.location.href = "/";
}

// Affichage ID Room
if(document.getElementById("display-room-id")) {
    document.getElementById("display-room-id").textContent = roomId;
}

// --- 2. WebSocket Logic (Intégrée ici pour éviter les bugs) ---
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${window.location.host}/rooms/${roomId}/ws?player_name=${encodeURIComponent(playerName)}`;
const ws = new WebSocket(wsUrl);

state.websocket = ws; // On stocke dans le state global si besoin

ws.onopen = () => {
    console.log("WebSocket connecté");
    setRoomInfo(`Connecté`);
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Gestion d'erreur globale
    if (data.error) {
        showModal("Oups", data.message || "Erreur serveur");
        return;
    }

    switch (data.type) {
        case "state_sync":
            initGameUI(data); // C'est ici que le titre change !
            renderHistory(data.history || []);
            renderScoreboard(data.scoreboard || []);
            state.currentMode = data.mode;
            state.roomLocked = data.locked;
            state.scoreboard = data.scoreboard; // Sauvegarde pour la victoire
            break;

        case "guess":
            addEntry({
                word: data.word,
                temp: data.temperature,
                progression: data.progression,
                player_name: data.player_name,
                feedback: data.feedback,
                game_type: data.game_type
            });
            break;

        case "scoreboard_update":
            renderScoreboard(data.scoreboard || []);
            state.roomLocked = data.locked;
            state.scoreboard = data.scoreboard;
            // Victoire détectée via broadcast
            if (data.victory && data.winner) {
                handleVictory(data.winner, data.scoreboard);
            }
            break;

        case "victory":
            handleVictory(data.winner, state.scoreboard || []);
            break;
    }
};

ws.onclose = () => {
    setRoomInfo("Déconnecté (Rechargez la page)");
};

// --- 3. UI Helpers ---
function initGameUI(data) {
    state.gameType = data.game_type; // Stocke le type de jeu
    
    const titles = { 
        "cemantix": "Cémantix", 
        "definition": "Dictionnario" 
    };
    
    // Mise à jour du Titre
    const titleEl = document.getElementById("game-title");
    if(titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    // Mise à jour des Instructions (Spécifique Dictionnario)
    const instrBox = document.getElementById("game-instruction");
    const legendPanel = document.getElementById("legend-panel");

    if (data.game_type === "definition") {
        if(instrBox) {
            instrBox.style.display = "block";
            document.getElementById("definition-text").textContent = `"${data.public_state.hint}"`;
            document.getElementById("hint-text").textContent = `Le mot fait ${data.public_state.word_length} lettres.`;
        }
        if(legendPanel) legendPanel.style.display = "none"; // Pas de température en mode définition
    } else {
        // Mode Cémantix
        if(instrBox) instrBox.style.display = "none";
        if(legendPanel) {
            legendPanel.style.display = "block";
            document.getElementById("legend-content").innerHTML = `
                <div><span>💥 Top 1000</span> <span>100°C</span></div>
                <div><span>🥵 Proche</span> <span>90°C</span></div>
                <div><span>😎 Ça chauffe</span> <span>10°C</span></div>
                <div><span>❄️ Loin</span> <span>0°C</span></div>
            `;
        }
    }
}

function handleVictory(winnerName, scoreboardData) {
    if (state.locked) return;
    state.locked = true;

    triggerConfetti();

    let scoreTableHtml = `
        <p style="font-size:1.2rem; margin-bottom:20px;">Le mot a été trouvé par <strong style="color:var(--accent)">${winnerName}</strong> !</p>
        <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:15px; text-align:left;">
    `;
    
    scoreboardData.forEach((p, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
        scoreTableHtml += `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-family:var(--font-heading);">
                <span>${medal} ${p.player_name}</span>
                <span>${p.attempts} essais</span>
            </div>
        `;
    });
    scoreTableHtml += "</div>";

    setTimeout(() => {
        showModal("MISSION ACCOMPLIE", scoreTableHtml, true);
    }, 1000);
}

// --- 4. Interaction Formulaire ---
// On attache l'événement sur le formulaire existant
if (elements.form) {
    elements.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        if (state.locked) return;
        
        const input = document.getElementById("word-input");
        const word = input.value.trim();
        
        if (!word) {
            showModal("Hey !", "Il faut écrire un mot avant d'essayer.");
            return;
        }

        // On vide l'input tout de suite pour l'UX
        input.value = "";
        input.focus();
        
        try {
            const res = await fetch(`/rooms/${roomId}/guess`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ word, player_name: playerName })
            });
            
            const data = await res.json();
            if (data.error) {
                showModal("Erreur", data.message);
            }
        } catch (err) {
            console.error(err);
            showModal("Erreur Réseau", "Impossible de contacter le serveur.");
        }
    });
}