import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti } from "./rendering.js";

// --- 1. Initialisation ---
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const playerName = params.get("player");

// Redirection si infos manquantes
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

ws.onopen = () => {
    console.log("Connecté au WS");
};

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
            state.roomLocked = data.locked;
            state.scoreboard = data.scoreboard;
            if (data.victory && data.winner) {
                handleVictory(data.winner, data.scoreboard);
            }
            break;

        case "victory":
            handleVictory(data.winner, state.scoreboard || []);
            break;
    }
};

// --- 3. Logique UI & Victoire ---
function initGameUI(data) {
    state.gameType = data.game_type;
    
    // Titres
    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario" };
    const titleEl = document.getElementById("game-title");
    if (titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    // Affichage conditionnel (Instructions vs Température)
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
        <p style="font-size:1.2rem; margin-bottom:20px; color:white;">Le mot a été trouvé par <strong style="color:var(--accent)">${winnerName}</strong> !</p>
        <div style="background:rgba(255,255,255,0.05); border-radius:8px; padding:15px; text-align:left;">
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

    setTimeout(() => {
        showModal("MISSION ACCOMPLIE", scoreTableHtml, true);
    }, 1000);
}

// --- 4. Gestionnaire d'événement Formulaire ---
// On vérifie que 'elements.form' existe avant d'ajouter l'écouteur
if (elements.form) {
    elements.form.addEventListener("submit", async (e) => {
        // EMPÊCHE LE RECHARGEMENT DE LA PAGE
        e.preventDefault();
        
        if (state.locked) return;
        
        const input = elements.input; // Utilise l'élément récupéré dans dom.js
        const word = input.value.trim();
        
        if (!word) {
            showModal("Hey !", "Il faut écrire un mot avant d'essayer.");
            return;
        }

        // UX : Vider et remettre le focus
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
            // On ne montre pas de modal pour ne pas spammer si le serveur est juste lent
        }
    });
} else {
    console.error("ERREUR CRITIQUE : Le formulaire n'a pas été trouvé dans le DOM. Vérifiez les IDs.");
}