import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal, closeModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard } from "./rendering.js";
import { initChat, addChatMessage } from "./chat_ui.js";
import { initApp, verifierPseudo, currentUser, logout, updateSessionUI } from "./session.js"; // J'ai ajouté initApp dans main mais verifierPseudo est dans session
import { copyToClipboard } from "./utils.js";
import { 
    initGameUI, handleDefeat, handleBlitzSuccess, updateHangmanUI,
    performGameReset, updateResetStatus, startTimer, sendResetRequest
} from "./game_logic.js";
import { openGameConfig, openDictioConfig, closeConfigModal, submitGameConfig, toggleDurationDisplay, launchDictio, createGame } from "./launcher.js";

document.addEventListener("DOMContentLoaded", () => {
    updateSessionUI();
    checkDailyVictory(); // Vérifie si le défi est déjà fait
    
    // Pré-remplissage du pseudo sur le Hub
    const nameInput = document.getElementById('player-name');
    if (nameInput && currentUser) {
        nameInput.value = currentUser;
    }

    const cards = document.querySelectorAll('.game-card');
    const colors = [
        'var(--accent)',    // Corail
        'var(--secondary)', // Violet
        'var(--success)',   // Menthe
        'var(--warning)',   // Jaune
        '#54a0ff',          // Bleu ciel
        '#ff9ff3',          // Rose bonbon
        '#00d2d3',          // Cyan
        '#ff4757',          // Rouge vif
        '#2e86de'           // Bleu profond
    ];

    cards.forEach(card => {
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        card.style.setProperty('--card-color', randomColor);
    });

    // Initialisation du Chat (Si présent)
    initChat();
});

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const playerName = params.get("player");

function updateMusicContext(gameType, mode, duration) {
    if (window.musicManager && typeof window.musicManager.setContext === "function") {
        window.musicManager.setContext({ gameType, mode, duration });
    }
}

function initGameConnection(roomId, playerName) {
    if(document.getElementById("display-room-id")) {
        document.getElementById("display-room-id").textContent = roomId;
    }

    setRoomInfo(`Connexion à la Room ${roomId}...`);

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/rooms/${roomId}/ws?player_name=${encodeURIComponent(playerName)}`;
    
    // Fermeture propre de l'ancien socket s'il existe
    if (state.websocket) {
        state.websocket.close();
    }

    const ws = new WebSocket(wsUrl);
    state.websocket = ws; 

    ws.onopen = () => { console.log("WS Connecté"); };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            showModal("Erreur", data.message || "Erreur inconnue");
            return;
        }

        switch (data.type) {
            case "state_sync":
                initGameUI(data);
                renderHistory(data.history || []);
                renderScoreboard(data.scoreboard || []);
                state.currentMode = data.mode;
                state.roomLocked = data.locked;
                if (data.mode === "blitz" && data.end_time) startTimer(data.end_time);
                updateMusicContext(data.game_type, data.mode, data.duration);
                
                // On met à jour le statut maintenant que la connexion est confirmée
                setRoomInfo(`${roomId} • ${data.mode === 'race' ? 'Course' : 'Coop'}`); 

                if (data.history && Array.isArray(data.history)) {
                    state.entries = data.history.map(entry => ({
                        ...entry,
                        temp: entry.temperature
                    })).reverse();
                    renderHistory();
                }

                if (data.chat_history) {
                    data.chat_history.forEach(msg => addChatMessage(msg.player_name, msg.content));
                }
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
                if (data.team_score !== undefined) {
                    const scoreEl = document.getElementById('score-display');
                    if (scoreEl) scoreEl.textContent = data.team_score;
                }
                // Mise à jour Pendu
                if (data.game_type === "hangman") updateHangmanUI(data);
                // Défaite
                if (data.defeat) handleDefeat(data);
                break;

            case "scoreboard_update":
                renderScoreboard(data.scoreboard || []);
                state.roomLocked = data.locked;
                if (data.victory && data.winner) handleVictory(data.winner, data.scoreboard);
                break;

            case "victory": // Fallback
                handleVictory(data.winner, state.scoreboard || []);
                break;

            case "chat_message":
                addChatMessage(data.player_name, data.content);
                break;
                
            case "game_reset":
                performGameReset(data);
                break;
                
            case "reset_update":
                updateResetStatus(data);
                break;
        }

        if (data.blitz_success) handleBlitzSuccess(data);
    };

    ws.onclose = () => { setRoomInfo("Déconnecté"); };
}

export function initApp() {
    console.log("Initialisation de l'application...");

    // 1. Mise à jour des références DOM
    elements.form = document.getElementById("guess-form");
    elements.input = document.getElementById("word-input");
    elements.history = document.getElementById("history");
    elements.scoreboard = document.getElementById("scoreboard");
    elements.roomInfo = document.getElementById("display-room-id");
    elements.messages = document.getElementById("messages");

    // 2. Nettoyage de l'état
    state.currentRoomId = null;
    state.locked = false;
    
    updateSessionUI();
    checkDailyVictory();

    const roomBadge = document.getElementById("room-badge");
    if (roomBadge) {
        roomBadge.style.cursor = "pointer";
        roomBadge.title = "Copier l'ID";
        
        // Clonage pour nettoyer les anciens écouteurs
        const newBadge = roomBadge.cloneNode(true);
        roomBadge.parentNode.replaceChild(newBadge, roomBadge);
        
        newBadge.addEventListener("click", async () => {
            const idSpan = document.getElementById("display-room-id");
            const idText = idSpan ? idSpan.textContent : "";
            
            if (idText && idText !== "..." && idText !== "Déconnecté") {
                // Utilisation de la fonction robuste
                const success = await copyToClipboard(idText);
                
                if (success) {
                    // 1. Sauvegarde du contenu original
                    const originalHTML = newBadge.innerHTML;
                    const originalWidth = newBadge.offsetWidth; // Fixe la largeur pour éviter le "saut"
                    
                    newBadge.style.width = `${originalWidth}px`;
                    newBadge.style.textAlign = "center";

                    // 2. Animation "Copié !"
                    newBadge.style.transition = "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
                    newBadge.style.transform = "scale(1.1)";
                    newBadge.style.backgroundColor = "var(--success)";
                    newBadge.style.color = "white";
                    newBadge.style.borderColor = "var(--success)";
                    
                    // On change le texte
                    newBadge.textContent = "Copié !";
                    
                    // 3. Retour à la normale après 1.5s
                    setTimeout(() => {
                        newBadge.style.transform = "scale(1)";
                        newBadge.style.backgroundColor = "";
                        newBadge.style.color = "";
                        newBadge.style.borderColor = "";
                        newBadge.style.width = ""; // Relâche la largeur
                        newBadge.innerHTML = originalHTML; // Restaure le HTML avec le <span>
                        
                        // TRES IMPORTANT : Reconnecter la référence DOM pour les futures mises à jour WS
                        elements.roomInfo = document.getElementById("display-room-id");
                    }, 1500);
                } else {
                    // En cas d'échec total (rare), on affiche juste l'ID dans les logs
                    addHistoryMessage(`ID : ${idText}`, 5000);
                }
            }
        });
    }

    // --- LOGIQUE SPECIFIQUE : HUB ---
    if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
        if (window.musicManager) window.musicManager.setContext({ gameType: 'hub' });

        const nameInput = document.getElementById('player-name');
        if (nameInput && currentUser) nameInput.value = currentUser;

        // ... (Logique couleurs cartes inchangée) ...

        const joinBtn = document.getElementById('btn-join');
        if (joinBtn) {
            joinBtn.onclick = () => {
                if (!verifierPseudo()) return;
                const pInput = document.getElementById('player-name');
                let name = pInput ? pInput.value : currentUser;
                if(!name && currentUser) name = currentUser;
                const room = document.getElementById('room-id').value;
                if(!name || !room) return showModal("Données Manquantes", "Pseudo et ID requis.");
                window.location.href = `/game?room=${room}&player=${encodeURIComponent(name)}`;
            };
        }
    }

    // --- LOGIQUE SPECIFIQUE : JEU ---
    if (window.location.pathname.includes("/game")) {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get("room");
        const playerName = params.get("player");

        if (!roomId || !playerName) {
            window.location.href = "/";
        } else {
            initGameConnection(roomId, playerName);
        }
        
        // Réattachement du formulaire de jeu (CORRECTION BUG 1)
        if (elements.form) {
            // On supprime l'ancien listener pour éviter les doublons si on est en SPA pure
            const newForm = elements.form.cloneNode(true);
            elements.form.parentNode.replaceChild(newForm, elements.form);
            elements.form = newForm; // Mise à jour référence
            elements.input = document.getElementById("word-input"); // Ré-ref input

            elements.form.addEventListener("submit", async (e) => {
                e.preventDefault();
                const overlay = document.getElementById('modal-overlay');
                if (overlay && overlay.classList.contains('active')) return;
                if (state.locked) return;
                
                const word = elements.input.value.trim();
                
                // CORRECTION : Plus de modale, juste une animation et un message
                if (!word) {
                    addHistoryMessage("⚠️ Il faut écrire un mot avant d'essayer.", 2000); 
                    elements.input.classList.add("error-shake");
                    setTimeout(() => elements.input.classList.remove("error-shake"), 500);
                    return;
                }

                elements.input.value = "";
                elements.input.focus();
                
                try {
                    const res = await fetch(`/rooms/${roomId}/guess`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ word, player_name: playerName })
                    });
                    const data = await res.json();
                    
                    if (data.error) {
                        if (data.error === "unknown_word") {
                            addHistoryMessage("⚠️ " + data.message, 3000);
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
    }

    initChat();
    
    const helpBtn = document.getElementById('help-trigger');
    const helpModal = document.getElementById('help-modal');
    if (helpBtn && helpModal) {
        helpBtn.onclick = (e) => {
            e.preventDefault();
            helpModal.classList.add('active');
        };
        helpModal.onclick = (e) => {
            if (e.target === helpModal) helpModal.classList.remove('active');
        };
    }
}

// Exposition globale pour le routeur
window.initApp = initApp;

// Premier lancement au chargement réel de la page
document.addEventListener("DOMContentLoaded", initApp);

let currentConfigType = "definition"; // 'definition' ou 'intruder'

function openGameConfig(type) {
    if (!verifierPseudo()) return;
    
    currentConfigType = type;
    const modal = document.getElementById('config-modal');
    const modeGroup = document.getElementById('mode-group');
    const durationGroup = document.getElementById('duration-group');
    const title = document.getElementById('config-modal-title');
    const desc = document.getElementById('mode-desc');
    const modeSelect = document.getElementById('config-mode');

    modal.classList.add('active');

    if (type === 'intruder') {
        // --- CONFIGURATION INTRUS (Timer Obligatoire) ---
        title.textContent = "L'Intrus : Contre la montre";
        
        // On cache le choix du mode car c'est forcé en Blitz
        modeGroup.style.display = 'none'; 
        modeSelect.value = 'blitz'; // Force la valeur interne
        
        // On affiche toujours la durée
        durationGroup.style.display = 'block';
        
        desc.textContent = "Trouvez un maximum d'intrus avant la fin du temps imparti !";
    } else {
        // --- CONFIGURATION DICTIONNARIO (Choix Libre) ---
        title.textContent = "Config. Dictionnario";
        
        // On affiche le choix du mode
        modeGroup.style.display = 'block';
        modeSelect.value = 'coop'; // Défaut
        
        toggleDurationDisplay(); // Gère l'affichage de la durée selon le mode choisi
    }
}

// 1. Ouvrir la modale
function openDictioConfig() {
    if (!verifierPseudo()) return;
    const modal = document.getElementById('config-modal');
    modal.classList.add('active');
    
    // CORRECTION : On définit explicitement le type de jeu
    currentConfigType = "definition"; 
    openGameConfig('definition');
    
    document.getElementById('config-mode').value = "coop";
    toggleDurationDisplay();
}



function toggleDurationDisplay() {
    // Cette fonction ne sert maintenant que pour Dictionnario
    // car pour l'Intrus, le select "config-mode" est caché mais vaut "blitz"
    const mode = document.getElementById('config-mode').value;
    const durationGroup = document.getElementById('duration-group');
    const desc = document.getElementById('mode-desc');

    if (currentConfigType === 'definition') {
        if (mode === 'blitz') {
            durationGroup.style.display = 'block';
            desc.textContent = "Trouvez un maximum de mots dans le temps imparti.";
        } else {
            durationGroup.style.display = 'none';
            desc.textContent = "Trouvez un mot unique ensemble sans limite de temps.";
        }
    }
}

async function submitGameConfig() {
    // Récupération des valeurs
    // Pour l'intrus, mode sera 'blitz' car on l'a forcé dans openGameConfig
    const mode = document.getElementById('config-mode').value;
    let duration = 0;

    if (mode === 'blitz') {
        duration = parseInt(document.getElementById('config-duration').value);
    }

    closeConfigModal();
    
    // Lancement universel
    await createGame(currentConfigType, mode, duration);
}

function launchDictio() {
    const modeSelect = document.getElementById('dictio-mode').value;
    let mode = 'coop'; // Mode par défaut
    let duration = 0;

    if (modeSelect.startsWith('blitz')) {
        mode = 'blitz';
        // On extrait le chiffre (3 ou 5) et on convertit en secondes
        duration = parseInt(modeSelect.split('_')[1]) * 60; 
    }

    createGame('definition', mode, duration);
}

window.createGame = async function(type, mode = 'coop', duration = 0) {
    if (!verifierPseudo()) return;
    
    // CORRECTION : On vérifie si l'input existe, sinon on utilise le currentUser stocké
    const nameInput = document.getElementById('player-name');
    let name = nameInput ? nameInput.value : currentUser;
    
    // Si l'input est vide mais qu'on a un currentUser, on l'utilise
    if(!name && currentUser) name = currentUser;
    
    const res = await fetch('/rooms', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ player_name: name, game_type: type, mode: mode, duration: duration })
    });
    if (!res.ok) {
        const errorData = await res.json();
        showModal("Erreur de création de partie", errorData.message || "Erreur inconnue lors de la création de la room.");
        return;
    }
    const data = await res.json();
    window.location.href = `/game?room=${data.room_id}&player=${encodeURIComponent(name)}`;
};

document.getElementById('btn-join').onclick = () => {
    if (!verifierPseudo()) return;
    
    // CORRECTION : Même sécurisation que pour createGame
    const nameInput = document.getElementById('player-name');
    let name = nameInput ? nameInput.value : currentUser;
    if(!name && currentUser) name = currentUser;

    const room = document.getElementById('room-id').value;
    if(!name || !room) return showModal("Données Manquantes", "Pseudo et ID requis.");
    window.location.href = `/game?room=${room}&player=${encodeURIComponent(name)}`;
};


window.createGame = createGame;
window.openGameConfig = openGameConfig;
window.openDictioConfig = openDictioConfig;
window.closeConfigModal = closeConfigModal;
window.submitGameConfig = submitGameConfig;
window.toggleDurationDisplay = toggleDurationDisplay;
window.closeModal = closeModal;
