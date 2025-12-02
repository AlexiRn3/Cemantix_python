import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal, closeModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard } from "./rendering.js";
import { initChat, addChatMessage } from "./chat_ui.js";
import { verifierPseudo, logout, updateSessionUI, saveSessionPseudo } from "./session.js";
import { copyToClipboard } from "./utils.js";
import { initGameUI, handleDefeat, handleBlitzSuccess, updateHangmanUI, performGameReset, updateResetStatus, startTimer, sendResetRequest } from "./game_logic.js";
import { openGameConfig, openDictioConfig, submitGameConfig, toggleDurationDisplay, launchDictio } from "./launcher.js";
import { checkDailyVictory, handleVictory } from "./victory.js";
import { openWebsocket, initGameConnection } from "./websocket.js";
import { createGame } from "./api.js";
import { openLoginModal, closeConfigModal } from "./modal.js";

document.addEventListener("DOMContentLoaded", () => {
    updateSessionUI();
    checkDailyVictory();
    
    // Pré-remplissage du pseudo sur le Hub
    const nameInput = document.getElementById('player-name');
    if (nameInput && state.currentUser) {
        nameInput.value = state.currentUser;
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

export function initApp() {
    console.log("Initialisation de l'application...");

    elements.form = document.getElementById("guess-form");
    elements.input = document.getElementById("word-input");
    elements.history = document.getElementById("history");
    elements.scoreboard = document.getElementById("scoreboard");
    elements.roomInfo = document.getElementById("display-room-id");
    elements.messages = document.getElementById("messages");

    state.currentRoomId = null;
    state.locked = false;
    
    updateSessionUI();
    checkDailyVictory();

    const roomBadge = document.getElementById("room-badge");
    if (roomBadge) {
        roomBadge.style.cursor = "pointer";
        roomBadge.title = "Copier l'ID";
        
        const newBadge = roomBadge.cloneNode(true);
        roomBadge.parentNode.replaceChild(newBadge, roomBadge);
        
        newBadge.addEventListener("click", async () => {
            const idSpan = document.getElementById("display-room-id");
            const idText = idSpan ? idSpan.textContent : "";
            
            if (idText && idText !== "..." && idText !== "Déconnecté") {
                const success = await copyToClipboard(idText);
                
                if (success) {
                    // 1. Sauvegarde du contenu original
                    const originalHTML = newBadge.innerHTML;
                    const originalWidth = newBadge.offsetWidth; // Fixe la largeur pour éviter le "saut"
                    
                    newBadge.style.width = `${originalWidth}px`;
                    newBadge.style.textAlign = "center";

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

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('error') === 'room_not_found') {
            const missingRoom = urlParams.get('room') || 'Inconnue';
            
            // 1. Nettoyer l'URL proprement (supprime les paramètres sans recharger)
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
            
            // 2. Afficher la modale (avec un léger délai pour être sûr que l'UI est prête)
            setTimeout(() => {
                showModal("Room Introuvable", `
                    La room <strong style="color:var(--accent)">${missingRoom}</strong> n'existe pas ou la partie est terminée.
                    <br><br>
                    <small style="color:var(--text-muted)">Vérifiez le code ou créez une nouvelle partie !</small>
                `);
            }, 500);
        }

        const nameInput = document.getElementById('player-name');
        if (nameInput && state.currentUser) nameInput.value = state.currentUser;

        // ... (Logique couleurs cartes inchangée) ...

        const joinBtn = document.getElementById('btn-join');
        if (joinBtn) {
            joinBtn.onclick = async () => {
                if (!verifierPseudo()) return;
                
                const nameInput = document.getElementById('player-name');
                let name = nameInput ? nameInput.value : state.currentUser;
                if (!name && state.currentUser) name = state.currentUser;

                const roomIdInput = document.getElementById('room-id');
                const roomId = roomIdInput ? roomIdInput.value.trim() : null;

                if (!name || !roomId) {
                    return showModal("Données Manquantes", "Pseudo et ID de room requis.");
                }

                joinBtn.disabled = true;
                joinBtn.textContent = "Vérification...";

                try {
                    // 1. Check if the room exists
                    const resRoom = await fetch(`/rooms/${roomId}/check`);
                    if (!resRoom.ok) {
                        // If 404 or other error
                        showModal("Room introuvable", "Cet ID de room n'existe pas ou la partie est terminée.");
                        joinBtn.disabled = false;
                        joinBtn.textContent = "Rejoindre";
                        return;
                    }

                    // 2. Check if the pseudo is available (FIX: Added query param)
                    const resPseudo = await fetch(`/rooms/${roomId}/check_pseudo?player_name=${encodeURIComponent(name)}`);
                    
                    if (resPseudo.ok) {
                        // Everything is good, we go!
                        window.location.href = `/game?room=${roomId}&player=${encodeURIComponent(name)}`;
                    } else {
                        // If 409 (Conflict) or 422
                        const err = await resPseudo.json();
                        showModal("Impossible de rejoindre", err.message || "Ce pseudo est déjà pris dans cette partie.");
                        joinBtn.disabled = false;
                        joinBtn.textContent = "Rejoindre";
                    }

                } catch (e) {
                    console.error(e);
                    showModal("Erreur Réseau", "Impossible de contacter le serveur.");
                    joinBtn.disabled = false;
                    joinBtn.textContent = "Rejoindre";
                }
            };
        }

    // --- LOGIQUE SPECIFIQUE : JEU ---
    if (window.location.pathname.includes("/game")) {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get("room");
        let playerName = params.get("player");

        if (state.currentUser && playerName !== state.currentUser) {
            console.warn("Modification d'URL détectée : restauration du pseudo de session.");
            playerName = state.currentUser;
            
            const newUrl = new URL(window.location);
            newUrl.searchParams.set("player", playerName);
            window.history.replaceState(null, '', newUrl);
        }

        if (!roomId || !playerName) {
            window.location.href = "/";
        } else {
            fetch(`/rooms/${roomId}/check`)
                .then(response => {
                    if (response.status === 404) {
                        window.location.href = `/?error=room_not_found&room=${roomId}`;
                    } else {
                        initGameConnection(roomId, playerName);
                    }
                })
                .catch(err => {
                    console.error("Erreur check room:", err);
                    initGameConnection(roomId, playerName);
                });
        }
        if (elements.form) {
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

document.addEventListener("DOMContentLoaded", initApp);
const btnJoin = document.getElementById('btn-join');

if (btnJoin) {
    btnJoin.onclick = () => {
        if (!verifierPseudo()) return;
        
        const nameInput = document.getElementById('player-name');
        let name = nameInput ? nameInput.value : state.currentUser;
        if(!name && state.currentUser) name = state.currentUser;

        const room = document.getElementById('room-id').value;
        if(!name || !room) return showModal("Données Manquantes", "Pseudo et ID requis.");
        
        window.location.href = `/game?room=${room}&player=${encodeURIComponent(name)}`;
    };
}


window.createGame = createGame;
window.openGameConfig = openGameConfig;
window.openDictioConfig = openDictioConfig;
window.closeConfigModal = closeConfigModal;
window.submitGameConfig = submitGameConfig;
window.toggleDurationDisplay = toggleDurationDisplay;
window.openLoginModal = openLoginModal;
window.closeModal = closeModal;
window.logout = logout;
window.saveSessionPseudo = saveSessionPseudo;
