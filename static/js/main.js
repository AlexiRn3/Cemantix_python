import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal, closeModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti } from "./rendering.js";
import { initChat, addChatMessage } from "./chat_ui.js";
// --- GESTION DE SESSION ---
const STORAGE_KEY = "arcade_user_pseudo";
const DAILY_WIN_KEY = "arcade_daily_win";
let currentUser = localStorage.getItem(STORAGE_KEY) || "";

function checkDailyVictory() {
    const dailyBtn = document.getElementById("btn-daily");
    if (!dailyBtn) return;

    // Réinitialise l'état du bouton par défaut
    dailyBtn.textContent = "Relever le défi";
    dailyBtn.classList.remove("btn-disabled");
    dailyBtn.onclick = () => createGame('cemantix', 'daily');

    // Si pas d'utilisateur connecté, on ne peut pas vérifier sa victoire spécifique
    if (!currentUser) return;

    // Format YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    const userWinKey = `daily_win_${currentUser}_${today}`;

    if (localStorage.getItem(userWinKey)) {
        dailyBtn.textContent = "Défi du jour accompli ✅";
        dailyBtn.classList.add("btn-disabled"); // Grise le bouton
        dailyBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
    }
}

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

function updateSessionUI() {
    const display = document.getElementById("profile-name-display");
    const btn = document.getElementById("btn-profile");
    
    if (currentUser) {
        if(display) display.textContent = currentUser;
        if(btn) btn.classList.add("logged-in");
    } else {
        if(display) display.textContent = "Connexion";
        if(btn) btn.classList.remove("logged-in");
    }
}

// Fonction globale pour ouvrir la modale de connexion
window.openLoginModal = function() {
    const isInGame = window.location.pathname === "/game";
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    const actionsEl = document.getElementById('modal-actions') || document.querySelector('.modal-actions');

    if (!overlay || !actionsEl) return;

    let htmlContent = '';
    let buttonsHtml = '';

    if (isInGame) {
        // Mode Jeu : Verrouillé
        htmlContent = `
            <div style="margin-bottom: 20px;">
                <p>Vous êtes connecté en tant que :</p>
                <input type="text" value="${currentUser}" disabled style="margin-top:15px; text-align:center; opacity:0.7;">
                <p class="locked-message">🔒 Pseudo verrouillé en partie.</p>
            </div>`;
        buttonsHtml = `
            <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
                <button class="btn" onclick="closeModal()">Fermer</button>
                <button class="btn btn-danger" onclick="logout()">Se déconnecter & Quitter</button>
            </div>`;
    } else {
        // Mode Hub : Modifiable
        htmlContent = `
            <div style="margin-bottom: 20px;">
                <p>Votre pseudo pour la session :</p>
                <input type="text" id="login-pseudo" value="${currentUser}" placeholder="Pseudo..." style="margin-top:15px; text-align:center;">
            </div>`;
        const logoutBtn = currentUser ? `<button class="btn btn-danger" onclick="logout()">Se déconnecter</button>` : '';
        buttonsHtml = `
            <div style="display:flex; flex-direction:column; gap:15px; width:100%;">
                <button class="btn" onclick="saveSessionPseudo()">Valider</button>
                ${logoutBtn}
                <button class="btn btn-outline" onclick="closeModal()">Fermer</button> </div>`;
    }

    titleEl.textContent = "PROFIL";
    contentEl.innerHTML = htmlContent;
    actionsEl.innerHTML = buttonsHtml;
    overlay.classList.add('active');

    if (!isInGame) {
        setTimeout(() => {
            const input = document.getElementById('login-pseudo');
            if (input) {
                input.focus();
                input.onkeydown = (e) => { if(e.key === "Enter") saveSessionPseudo(); };
            }
        }, 100);
    }
};

window.logout = function() {
    localStorage.removeItem(STORAGE_KEY);
    currentUser = "";
    updateSessionUI();
    const nameInput = document.getElementById('player-name');
    if (nameInput) nameInput.value = "";
    
    if (window.location.pathname === "/game") {
        window.location.href = "/";
    } else {
        closeModal();
    }
};

// Cherche la fonction window.saveSessionPseudo et ajoute la ligne à la fin
window.saveSessionPseudo = function() {
    const input = document.getElementById('login-pseudo');
    const newName = input.value.trim();
    if (newName) {
        currentUser = newName;
        localStorage.setItem(STORAGE_KEY, currentUser);
        updateSessionUI();
        const hubInput = document.getElementById('player-name');
        if (hubInput) hubInput.value = currentUser;
        
        // AJOUT ICI : On vérifie si ce nouveau pseudo a déjà gagné aujourd'hui
        checkDailyVictory(); 
        
        closeModal();
    } else {
        input.classList.add('error-shake');
        setTimeout(() => input.classList.remove('error-shake'), 500);
    }
};


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

function handleBlitzSuccess(data) {
    // 1. Mise à jour de l'UI du nouveau jeu
    initGameUI({ 
        game_type: state.gameType, 
        public_state: data.new_public_state 
    });
    // 2. Si c'est l'intrus, on réactive tous les boutons pour la nouvelle grille
    if (state.gameType === "intruder") {
        const grid = document.getElementById("intruder-grid");
        if (grid) {
            grid.querySelectorAll("button").forEach(btn => {
                btn.disabled = false;
                btn.classList.remove("correct", "wrong");
            });
        }
        addHistoryMessage("✅ Nouveau mot !");
    }
}

function handleDefeat(data) {
    if (state.locked) return;
    state.locked = true;
    
    showModal("GAME OVER", `
        <div style="margin-bottom: 20px;">
            La batterie est à plat ! 💀<br>
            Le mot à trouver était : <strong style="color:var(--accent); font-size:1.5rem;">${data.target_reveal.toUpperCase()}</strong>.
        </div>
    `);

    // On utilise la logique de victoire pour afficher les boutons Rejouer/Hub
    const actionsDiv = document.getElementById('modal-actions');
    if (actionsDiv) {
        actionsDiv.innerHTML = `
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="btn-replay" class="btn">Rejouer la partie</button>
                <button id="btn-hub" class="btn btn-outline">Retour au Hub</button>
            </div>
        `;
        document.getElementById('btn-replay').onclick = function() {
            sendResetRequest(this);
        };
        document.getElementById('btn-hub').onclick = function() {
            window.location.href = "/";
        };
    }
}

function initGameUI(data) {
    state.gameType = data.game_type;
    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario", "intruder": "L'Intrus", "hangman": "Pendu" };
    const titleEl = document.getElementById("game-title");
    if (titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    // Gestion de l'affichage des panneaux
    const elementsToHide = ["hangman-area", "game-instruction", "legend-panel", "intruder-area"];
    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = "none";
    });
    
    const form = document.getElementById("guess-form");
    if(form) form.style.display = "flex";

    const gameLayout = document.querySelector(".game-layout");
    if(gameLayout) gameLayout.classList.remove("intruder-focus");

    // Affichage spécifique
    if (data.game_type === "hangman") {
        if(form) form.style.display = "none";
        if(gameLayout) gameLayout.classList.add("intruder-focus");
        const area = document.getElementById("hangman-area");
        if(area) {
            area.style.display = "block";
            renderHangmanUI(data.public_state);
        }
    } else if (data.game_type === "intruder") {
        if(form) form.style.display = "none";
        if(gameLayout) gameLayout.classList.add("intruder-focus");
        const area = document.getElementById("intruder-area");
        if(area) {
            area.style.display = "block";
            if(data.public_state) renderIntruderGrid(data.public_state.options);
        }
    } else if (data.game_type === "definition") {
        const box = document.getElementById("game-instruction");
        if(box) {
            box.style.display = "block";
            document.getElementById("definition-text").textContent = `"${data.public_state.hint}"`;
            document.getElementById("hint-text").textContent = `Le mot fait ${data.public_state.word_length} lettres.`;
        }
    } else {
        // Cemantix par défaut
        const legend = document.getElementById("legend-panel");
        if(legend) {
            legend.style.display = "block";
            document.getElementById("legend-content").innerHTML = `
                <div><span>💥 Top 1</span> <span>100°C</span></div>
                <div><span>🔥 Brûlant</span> <span>99°C</span></div>
                <div><span>🥵 Très proche</span> <span>90°C</span></div>
                <div><span>😎 Ça chauffe</span> <span>50°C</span></div>
                <div><span>🌡️ Tiède</span> <span>20°C</span></div>
                <div><span>💧 Frais</span> <span>0°C</span></div>
            `;
        }
    }
}

function renderIntruderGrid(options) {
    const grid = document.getElementById("intruder-grid");
    if(!grid || !options) return;
    
    grid.innerHTML = "";
    
    options.forEach(word => {
        const btn = document.createElement("button");
        btn.className = "intruder-btn";
        btn.textContent = word;
        btn.onclick = () => submitIntruderGuess(word, btn);
        grid.appendChild(btn);
    });
}

async function submitIntruderGuess(word, buttonElement) {
    if (state.locked) return;

    // On désactive immédiatement le bouton cliqué
    buttonElement.disabled = true;

    try {
        const res = await fetch(`/rooms/${roomId}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word, player_name: playerName })
        });
        const data = await res.json();
        
        if (data.error) {
            showModal("Oups", data.message);
            buttonElement.disabled = false;
        } else {
            if (!data.is_correct) {
                // --- CAS : ERREUR ---
                buttonElement.classList.add("wrong");
                addHistoryMessage(`❌ -1 point !`, 1000); // Petit feedback visuel

                // 1. On récupère tous les boutons de la grille
                const grid = document.getElementById("intruder-grid");
                const allButtons = grid.querySelectorAll("button");

                // 2. On les désactive tous (Cooldown global)
                allButtons.forEach(btn => btn.disabled = true);

                // 3. On attend 1 seconde (1000 ms)
                setTimeout(() => {
                    allButtons.forEach(btn => {
                        // On réactive seulement ceux qui ne sont pas déjà marqués "faux"
                        if (!btn.classList.contains("wrong")) {
                            btn.disabled = false;
                        }
                    });
                }, 1000);

            } else {
                // --- CAS : VICTOIRE ---
                buttonElement.classList.add("correct");
                // Pas besoin de gérer le timer ici, le WebSocket va recharger la grille
            }
        }
    } catch (err) {
        console.error(err);
        buttonElement.disabled = false;
    }
}

// --- MODIFICATION MAJEURE ICI ---
function handleVictory(winnerName, scoreboardData) {
    if (state.locked) return;
    state.locked = true;
    triggerConfetti();

    // --- MODIFICATION 1 : Enregistrement lié au pseudo ---
    if (state.currentMode === "daily") {
        const today = new Date().toISOString().split('T')[0];
        // On utilise winnerName (celui qui a trouvé) ou currentUser pour être sûr
        // Ici on suppose que c'est le joueur local qui voit sa victoire
        const userWinKey = `daily_win_${currentUser}_${today}`;
        localStorage.setItem(userWinKey, "true");
    }

    let scoreTableHtml = `
        <p style="font-size:1.2rem; margin-bottom:20px;">Le mot a été trouvé par <strong style="color:var(--accent)">${winnerName}</strong> !</p>
        <div style="background:#f8f9fa; border-radius:12px; padding:15px; text-align:left; margin-bottom: 20px; border: 1px solid #eee;">
    `;
    
    if (scoreboardData && scoreboardData.length > 0) {
        scoreboardData.forEach((p, index) => {
            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
            scoreTableHtml += `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee; font-family:var(--font-heading); color:var(--text-main);">
                    <span>${medal} ${p.player_name}</span>
                    <span>${p.attempts} essais</span>
                </div>
            `;
        });
    }
    scoreTableHtml += "</div>";
    
    // Zone pour le statut d'attente
    scoreTableHtml += `<div id="reset-status-msg" style="color:var(--text-muted); font-style:italic; min-height: 20px; margin-bottom: 10px;"></div>`;

    setTimeout(() => {
        showModal("MISSION ACCOMPLIE", scoreTableHtml, true);
        
        const actionsDiv = document.getElementById('modal-actions');
        if (actionsDiv) {
            // --- MODIFICATION 2 : Affichage conditionnel des boutons ---
            let buttonsHtml = "";
            
            // Si c'est le mode Daily, on affiche SEULEMENT le retour au Hub
            if (state.currentMode === "daily") {
                 buttonsHtml = `
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="btn-hub" class="btn">Retour au Hub</button>
                    </div>
                `;
            } else {
                // Sinon (Coop, Blitz...), on affiche Rejouer + Retour
                buttonsHtml = `
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="btn-replay" class="btn">Rejouer la partie</button>
                        <button id="btn-hub" class="btn btn-outline">Retour au Hub</button>
                    </div>
                `;
            }

            actionsDiv.innerHTML = buttonsHtml;

            // Attacher les écouteurs (avec vérification d'existence)
            const replayBtn = document.getElementById('btn-replay');
            if (replayBtn) {
                replayBtn.onclick = function() {
                    sendResetRequest(this);
                };
            }
            
            const hubBtn = document.getElementById('btn-hub');
            if (hubBtn) {
                hubBtn.onclick = function() {
                    window.location.href = "/";
                };
            }
        }
    }, 1000);
}

// Envoyer la demande de reset
async function sendResetRequest(btnElement) {
    btnElement.disabled = true;
    btnElement.textContent = "En attente...";
    
    await fetch(`/rooms/${roomId}/reset`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ player_name: playerName })
    });
}

function updateResetStatus(data) {
    const statusDiv = document.getElementById('reset-status-msg');
    if (statusDiv) {
        // color:white -> color:var(--text-main) ou on laisse hériter
        statusDiv.innerHTML = `Joueurs prêts : <strong style="color:var(--accent)">${data.current_votes}/${data.total_players}</strong><br>En attente de : ${data.waiting_for.join(', ')}`;
    }
}

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

    const kb = document.getElementById("hangman-keyboard");
    if (kb) kb.innerHTML = "";

    // 4. Reset UI spécifique
    initGameUI({ 
        game_type: state.gameType, 
        public_state: data.public_state 
    });
    
    addHistoryMessage("🔄 Nouvelle partie commencée !");
}

function startTimer(endTime) {
    const timerEl = document.getElementById('timer-display');
    document.getElementById('blitz-panel').style.display = 'block';

    const updateTimer = () => {
        const now = Date.now() / 1000;
        const diff = endTime - now;

        if (diff <= 0) {
            clearInterval(interval);
            timerEl.textContent = "00:00";
            
            // --- MODIFICATION ICI : Contenu de la modale de fin ---
            const score = document.getElementById('score-display').textContent;
            
            // 1. On affiche la modale
            showModal("TEMPS ÉCOULÉ", `
                <div style="margin-bottom: 20px;">
                    C'est terminé !<br>
                    Score final : <strong style="color:var(--success); font-size:1.5rem;">${score}</strong> mots.
                </div>
            `);

            // 2. On injecte les boutons d'action spécifiques
            const actionsDiv = document.getElementById('modal-actions');
            actionsDiv.innerHTML = `
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="btn-blitz-replay" class="btn">Rejouer</button>
                    <button id="btn-hub-return" class="btn btn-outline">Retour au Hub</button>
                </div>
            `;

            // 3. On attache les actions
            document.getElementById('btn-hub-return').onclick = () => window.location.href = "/";
            
            document.getElementById('btn-blitz-replay').onclick = function() {
                // On réutilise la logique de reset existante
                this.disabled = true;
                this.textContent = "Chargement...";
                sendResetRequest(this);
            };
            // ------------------------------------------------------

        } else {
            const m = Math.floor(diff / 60);
            const s = Math.floor(diff % 60);
            timerEl.textContent = `${m}:${s < 10 ? '0'+s : s}`;
        }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
}

function renderHangmanUI(state) {
    // 1. Mise à jour du mot masqué
    const wordEl = document.getElementById("hangman-word");
    if (wordEl && state.masked_word) {
        // Ajoute des espaces pour la lisibilité si le backend ne le fait pas
        wordEl.textContent = state.masked_word; 
    }

    // 2. Mise à jour de la barre de batterie
    const bar = document.getElementById("hangman-battery");
    if (bar) {
        // Calcul du pourcentage de vie
        const pct = Math.max(0, (state.lives / state.max_lives) * 100);
        bar.style.width = `${pct}%`;

        // Changement de couleur si critique (< 30%)
        if (pct < 30) {
            bar.classList.add("battery-low");
        } else {
            bar.classList.remove("battery-low");
        }
    }

    // 3. Génération du clavier (seulement si vide)
    const kb = document.getElementById("hangman-keyboard");
    if (kb && kb.innerHTML === "") {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (let letter of alphabet) {
            const btn = document.createElement("button");
            btn.textContent = letter;
            btn.className = "key-btn"; // Nouvelle classe CSS
            btn.id = `key-${letter}`;
            
            // L'événement clic déclenche l'envoi
            btn.onclick = () => submitHangmanGuess(letter, btn);
            
            kb.appendChild(btn);
        }
    }

    // 4. Mise à jour de l'état des touches (pour les reconnexions ou refresh)
    if (state.used_letters) {
        state.used_letters.forEach(letter => {
            const btn = document.getElementById(`key-${letter}`);
            if (btn) {
                btn.disabled = true;
                // On ne sait pas ici si c'était correct ou faux (le serveur ne renvoie pas le détail dans public_state pour l'instant)
                // Donc on le grise par défaut. Le WebSocket en temps réel gérera la couleur précise.
                btn.classList.add("wrong"); 
            }
        });
        
        // Petite astuce : on peut déduire les lettres correctes en regardant le mot masqué !
        if (state.masked_word) {
            const revealedLetters = new Set(state.masked_word.replace(/_/g, '').replace(/ /g, '').split(''));
            revealedLetters.forEach(letter => {
                const btn = document.getElementById(`key-${letter}`);
                if (btn) {
                    btn.className = "key-btn correct"; // Force le vert pour les lettres visibles
                    btn.disabled = true;
                }
            });
        }
    }
}

async function submitHangmanGuess(letter, btnElement) {
    if (state.locked) return;

    // Feedback visuel immédiat (Optimistic UI)
    btnElement.disabled = true;

    try {
        // Note: on envoie bien { word: letter } pour correspondre à la signature backend
        const res = await fetch(`/rooms/${roomId}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word: letter, player_name: playerName })
        });
        
        const data = await res.json();
        
        if (data.error) {
            // Si erreur (ex: lettre déjà jouée), on réactive
            btnElement.disabled = false;
            // showModal("Oups", data.message); // Optionnel
            return;
        }

        // Note : La mise à jour finale de l'UI se fera via le WebSocket (ws.onmessage)
        // pour que tous les joueurs voient l'action en même temps.

    } catch (err) {
        console.error("Erreur réseau:", err);
        btnElement.disabled = false;
    }
}

async function copyToClipboard(text) {
    // Méthode 1 : API moderne (si disponible et sécurisée)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn("Clipboard API failed, switching to fallback", err);
        }
    }
    
    // Méthode 2 : Fallback compatible partout (HTTP, vieilles WebViews)
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // On cache l'élément mais il doit être visible pour que execCommand fonctionne
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.error("Fallback copy failed", err);
        return false;
    }
}

// --- FONCTION D'INITIALISATION GLOBALE (SPA) ---
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
// 2. Fermer la modale
function closeConfigModal() {
    document.getElementById('config-modal').classList.remove('active');
}

function verifierPseudo() {
    // Cas 1: On est sur le Hub avec un input
    const nameInput = document.getElementById('player-name');
    
    if (nameInput) {
        let name = nameInput.value.trim();
        
        // Si vide, on regarde si on a une session
        if (!name && currentUser) {
            name = currentUser;
            nameInput.value = name;
        }

        if (!name) {
            // Si toujours vide, on force l'ouverture de la modale de login
            openLoginModal();
            return false;
        }
        
        // Si l'utilisateur a tapé un nouveau nom, on met à jour la session
        if (name !== currentUser) {
            currentUser = name;
            localStorage.setItem(STORAGE_KEY, currentUser);
            updateSessionUI();
        }
        return true;
    }
    
    // Cas 2: On n'a pas d'input (ex: autre page), on vérifie juste la session
    if (!currentUser) {
        openLoginModal();
        return false;
    }
    return true;
}


// 3. Gérer l'affichage dynamique (Coop vs Blitz)
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

function updateHangmanUI(data) {
    // 1. Mise à jour UI
    renderHangmanUI(data); 
    
    // 2. Mise à jour clavier
    const letter = data.word.toUpperCase();
    const btn = document.getElementById(`key-${letter}`);
    
    if (btn) {
        btn.disabled = true; 
        if (data.similarity >= 1.0) { 
             btn.classList.remove("wrong");
             btn.classList.add("correct");
             addHistoryMessage("✅ Bonne lettre !", 1000); 
        } else {
             btn.classList.add("wrong");
             addHistoryMessage("❌ Mauvaise lettre !", 1000); 
        }
    }
    
    if (data.defeat) handleDefeat(data);
}

// 4. Lancer la partie avec les paramètres choisis
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

function injectBugButton() {
    // Vérifie si le bouton existe déjà pour éviter les doublons
    if (document.getElementById('bug-trigger')) return;

    const btn = document.createElement('button');
    btn.id = 'bug-trigger';
    btn.className = 'bug-float-btn';
    btn.innerHTML = '🐛';
    btn.title = "Signaler un bug";
    btn.onclick = openBugModal;
    
    document.body.appendChild(btn);
}

function openBugModal() {
    const currentUser = localStorage.getItem("arcade_user_pseudo") || "Anonyme"; 
    
    const htmlContent = `
        <div class="bug-form" style="text-align:left;">
            <p style="margin-bottom:10px;">Oups ! Quelque chose ne va pas ? Décrivez le problème :</p>
            <textarea id="bug-desc" placeholder="Ex: Le jeu plante quand je clique sur..."></textarea>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">
                Signalé par : <strong>${currentUser}</strong>
            </p>
        </div>
    `;

    // CORRECTION : On appelle directement la fonction importée, sans "window."
    showModal("SIGNALER UN BUG", htmlContent);
    
    // Remplacement des boutons de la modale
    const actionsDiv = document.getElementById('modal-actions');
    if (actionsDiv) {
        actionsDiv.innerHTML = `
            <div style="display: flex; gap: 10px; justify-content: center; width: 100%;">
                <button id="btn-submit-bug" class="btn btn-danger">Envoyer</button>
                <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
            </div>
        `;
    }

    const submitBtn = document.getElementById('btn-submit-bug');
        if (submitBtn) {
            submitBtn.onclick = function() {
                sendBugReport(currentUser);
            };
        }
    
    // Focus automatique sur la zone de texte
    setTimeout(() => {
        const txt = document.getElementById('bug-desc');
        if(txt) txt.focus();
    }, 100);
}

window.sendBugReport = async function(player) {
    const descInput = document.getElementById('bug-desc');
    const description = descInput.value.trim();
    
    if (!description) {
        descInput.style.borderColor = "red";
        return;
    }

    // Bouton chargement
    const btn = document.querySelector('#modal-actions .btn-danger');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Envoi...";
    }

    // Détection du contexte (Hub ou Room ID)
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    const context = roomId ? `Room ${roomId}` : "Hub Principal";

    try {
        const res = await fetch('/report-bug', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player_name: player,
                description: description,
                context: context
            })
        });

        if (res.ok) {
            // Confirmation visuelle réutilisant la modale
            const modalContent = document.getElementById('modal-content');
            if(modalContent) modalContent.innerHTML = `<div style="color:var(--success); font-size:1.2rem; margin:20px 0;">✅ Message envoyé aux développeurs !</div>`;
            
            // Fermeture auto après 2s
            setTimeout(() => {
                if(window.closeModal) window.closeModal();
            }, 1500);
        } else {
            alert("Erreur lors de l'envoi.");
            if(window.closeModal) window.closeModal();
        }
    } catch (e) {
        console.error(e);
        alert("Erreur réseau.");
        if(window.closeModal) window.closeModal();
    }
};

// Injection au chargement
document.addEventListener("DOMContentLoaded", () => {
    injectBugButton();
});


window.createGame = createGame;
window.openGameConfig = openGameConfig;
window.openDictioConfig = openDictioConfig;
window.closeConfigModal = closeConfigModal;
window.submitGameConfig = submitGameConfig;
window.toggleDurationDisplay = toggleDurationDisplay;
window.closeModal = closeModal;
