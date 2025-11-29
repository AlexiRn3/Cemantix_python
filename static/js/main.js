import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti } from "./rendering.js";

// --- 1. Initialisation ---
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const playerName = params.get("player");

if (!roomId || !playerName) {
    console.error("Paramètres manquants, retour accueil.");
    window.location.href = "/";
}

if(document.getElementById("display-room-id")) {
    document.getElementById("display-room-id").textContent = roomId;
}

// --- 2. WebSocket ---
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${window.location.host}/rooms/${roomId}/ws?player_name=${encodeURIComponent(playerName)}`;
const ws = new WebSocket(wsUrl);

ws.onopen = () => { console.log("Connecté au WS"); };

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.error) {
        showModal("Erreur", data.message || "Une erreur est survenue");
        return;
    }

    switch (data.type) {
        case "state_sync":
            initGameUI(data);
            renderHistory(data.history || []);
            renderScoreboard(data.scoreboard || []);
            state.currentMode = data.mode;
            state.roomLocked = data.locked;
            state.scoreboard = data.scoreboard;
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
            state.currentMode = data.mode || state.currentMode;
            state.roomLocked = data.locked;
            state.scoreboard = data.scoreboard;
            if (data.victory && data.winner) {
                handleVictory(data.winner, data.scoreboard);
            }
            break;

        case "victory":
            handleVictory(data.winner, state.scoreboard || []);
            break;

        // --- NOUVEAUX CAS POUR LE RESET ---
        case "reset_update":
            updateResetStatus(data);
            break;

        case "game_reset":
            performGameReset(data);
            break;
    }
};

// --- 3. Logique UI & Victoire ---
function initGameUI(data) {
    state.gameType = data.game_type;
    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario" };
    const titleEl = document.getElementById("game-title");
    if (titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    const instrBox = document.getElementById("game-instruction");
    const legendPanel = document.getElementById("legend-panel");

    if (data.game_type === "definition") {
        if (instrBox) {
            instrBox.style.display = "block";
            document.getElementById("definition-text").textContent = `"${data.public_state.hint}"`;
            document.getElementById("hint-text").textContent = `Le mot fait ${data.public_state.word_length} lettres.`;
        }
        if (legendPanel) legendPanel.style.display = "none";
    } else {
        if (instrBox) instrBox.style.display = "none";
        if (legendPanel) {
            legendPanel.style.display = "block";
            document.getElementById("legend-content").innerHTML = `
                <div><span>💥 Top 1</span> <span>100°C</span></div>
                <div><span>🔥 Brûlant</span> <span>99°C</span></div>
                <div><span>🥵 Très proche</span> <span>90°C</span></div>
                <div><span>😎 Ça chauffe</span> <span>50°C</span></div>
                <div><span>🌡️ Tiède</span> <span>20°C</span></div>
                <div><span>💧 Frais</span> <span>0°C</span></div>
                <div><span>❄️ Gelé</span> <span>< 0°C</span></div>
            `;
        }
    }
}

function handleVictory(winnerName, scoreboardData) {
    if (state.locked) return;
    state.locked = true;

    triggerConfetti();

    let scoreTableHtml = `
        <p style="font-size:1.2rem; margin-bottom:20px; color:white;">Le mot a été trouvé par <strong style="color:var(--accent)">${winnerName}</strong> !</p>
        <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:15px; text-align:left; margin-bottom: 20px;">
    `;
    
    if (scoreboardData && scoreboardData.length > 0) {
        scoreboardData.forEach((p, index) => {
            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
            scoreTableHtml += `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-family:var(--font-heading);">
                    <span>${medal} ${p.player_name}</span>
                    <span>${p.attempts} essais</span>
                </div>
            `;
        });
    }
    scoreTableHtml += "</div>";
    
    // Zone pour afficher l'attente
    scoreTableHtml += `<div id="reset-status-msg" style="color:var(--text-muted); font-style:italic; min-height: 20px;"></div>`;

    setTimeout(() => {
        // On affiche la modale en mode victoire
        showModal("MISSION ACCOMPLIE", scoreTableHtml, true);
        
        // On reprogramme le bouton pour le reset
        const closeBtn = document.getElementById('modal-close-btn');
        if(closeBtn) {
            closeBtn.textContent = "Rejouer la partie";
            closeBtn.onclick = () => sendResetRequest(closeBtn);
        }
    }, 1000);
}

// Envoyer la demande de reset
async function sendResetRequest(btnElement) {
    btnElement.disabled = true;
    btnElement.textContent = "En attente des autres...";
    
    await fetch(`/rooms/${roomId}/reset`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ player_name: playerName })
    });
}

// Mettre à jour le texte d'attente dans la modale
function updateResetStatus(data) {
    const statusDiv = document.getElementById('reset-status-msg');
    if (statusDiv) {
        statusDiv.innerHTML = `Joueurs prêts : <strong style="color:white">${data.current_votes}/${data.total_players}</strong><br>En attente de : ${data.waiting_for.join(', ')}`;
    }
}

// Reset effectif du jeu
function performGameReset(data) {
    // 1. Fermer la modale
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('active');

    // 2. Reset état local
    state.entries = [];
    state.locked = false;
    state.roomLocked = false;
    
    // 3. Reset visuel
    if (elements.history) elements.history.innerHTML = "";
    if (elements.input) {
        elements.input.value = "";
        elements.input.focus();
    }

    // 4. Reset UI spécifique (nouvelle définition, etc)
    initGameUI({ 
        game_type: state.gameType, 
        public_state: data.public_state 
    });
    
    addHistoryMessage("🔄 Nouvelle partie commencée !");
}

// --- 4. Gestionnaire d'événement Formulaire ---
if (elements.form) {
    elements.form.addEventListener("submit", async (e) => {
        // C'EST ICI LE FIX POUR LA TOUCHE ENTREE QUI NE MARCHE PAS
        e.preventDefault();
        
        // Si la modale est ouverte, on ne joue pas !
        const overlay = document.getElementById('modal-overlay');
        if (overlay && overlay.classList.contains('active')) {
            return;
        }
        
        if (state.locked) return;
        
        const input = elements.input;
        const word = input.value.trim();
        
        if (!word) {
            showModal("Hey !", "Il faut écrire un mot avant d'essayer.");
            return;
        }

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
                if (data.error === "unknown_word") {
                    addHistoryMessage("⚠️ " + data.message);
                    elements.input.classList.add("error-shake");
                    setTimeout(() => elements.input.classList.remove("error-shake"), 500);
                } else {
                    showModal("Erreur", data.message);
                }
            }
        } catch (err) {
            console.error(err);
        }
    });
}