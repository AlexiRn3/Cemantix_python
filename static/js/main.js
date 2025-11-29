import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal, closeModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti } from "./rendering.js";

// --- GESTION DE SESSION ---
const STORAGE_KEY = "arcade_user_pseudo";
let currentUser = localStorage.getItem(STORAGE_KEY) || "";

document.addEventListener("DOMContentLoaded", () => {
    updateSessionUI();
    
    // Si on est sur le Hub, on pré-remplit l'input s'il existe
    const nameInput = document.getElementById('player-name');
    if (nameInput && currentUser) {
        nameInput.value = currentUser;
    }
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
    const content = `
        <div style="margin-bottom: 20px;">
            <p>Choisissez votre pseudo pour cette session.</p>
            <input type="text" id="login-pseudo" value="${currentUser}" placeholder="Votre Pseudo..." style="margin-top:15px; text-align:center;">
        </div>
    `;
    
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    
    // CORRECTION ICI : On cherche par ID OU par classe pour être sûr de le trouver
    const actionsEl = document.getElementById('modal-actions') || document.querySelector('.modal-actions');
    
    if(overlay && actionsEl) {
        titleEl.textContent = "IDENTIFICATION";
        contentEl.innerHTML = content;
        
        // Bouton de validation
        actionsEl.innerHTML = `<button class="btn" onclick="saveSessionPseudo()">Valider</button>`;
        
        overlay.classList.add('active');
        
        // Focus sur l'input après un court instant
        setTimeout(() => {
            const input = document.getElementById('login-pseudo');
            if(input) {
                input.focus();
                // Ajout : valider avec la touche Entrée
                input.onkeydown = function(e) {
                    if(e.key === "Enter") saveSessionPseudo();
                };
            }
        }, 100);
    } else {
        console.error("Impossible de trouver les éléments de la modale (overlay ou actions).");
    }
};

window.saveSessionPseudo = function() {
    const input = document.getElementById('login-pseudo');
    const newName = input.value.trim();
    
    if (newName) {
        currentUser = newName;
        localStorage.setItem(STORAGE_KEY, currentUser);
        updateSessionUI();
        
        // Mise à jour des inputs sur la page si présents
        const hubInput = document.getElementById('player-name');
        if (hubInput) hubInput.value = currentUser;
        
        closeModal();
    } else {
        input.classList.add('error-shake');
        setTimeout(() => input.classList.remove('error-shake'), 500);
    }
};


const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const playerName = params.get("player");

if (window.location.pathname === "/game") {

    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    const playerName = params.get("player");

    if (!roomId || !playerName) {
        console.error("Paramètres manquants, retour accueil.");
        window.location.href = "/";
    } else {
        // On lance le jeu uniquement si les paramètres sont là
        initGameConnection(roomId, playerName);
    }
}

function initGameConnection(roomId, playerName) {
    if(document.getElementById("display-room-id")) {
        document.getElementById("display-room-id").textContent = roomId;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    // Utilisation de encodeURIComponent pour gérer les caractères spéciaux dans le pseudo
    const wsUrl = `${protocol}://${window.location.host}/rooms/${roomId}/ws?player_name=${encodeURIComponent(playerName)}`;
    const ws = new WebSocket(wsUrl);
    
    // On stocke le websocket dans l'état global pour pouvoir le fermer si besoin
    state.websocket = ws;

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
                if (data.mode === "blitz" && data.end_time) {
                    startTimer(data.end_time);
                }
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
                if (data.team_score !== undefined) {
                    const scoreEl = document.getElementById('score-display');
                    if (scoreEl) scoreEl.textContent = data.team_score;
                }
                
                // Gestion Pendu
                if (data.game_type === "hangman") {
                     const wordEl = document.getElementById("hangman-word");
                     if(wordEl && data.masked_word) wordEl.textContent = data.masked_word;
                     
                     const letterPlayed = data.word.toUpperCase();
                     const btn = document.getElementById(`key-${letterPlayed}`);
                     if(btn) {
                         btn.disabled = true;
                         if (data.similarity > 0 || data.is_correct) btn.className = "key-btn correct";
                         else btn.className = "key-btn wrong";
                     }
                     
                     const bar = document.getElementById("hangman-battery");
                     if(bar && data.lives !== undefined) {
                         const maxLives = 7; 
                         const pct = Math.max(0, (data.lives / maxLives) * 100);
                         bar.style.width = `${pct}%`;
                         if (pct < 30) bar.classList.add("battery-low");
                         else bar.classList.remove("battery-low");
                     }
                }

                if (data.defeat) {
                    state.locked = true;
                    state.roomLocked = true;
                    const bar = document.getElementById("hangman-battery");
                    if(bar) { bar.style.width = "0%"; bar.classList.add("battery-low"); }

                    setTimeout(() => {
                        showModal("GAME OVER", `
                            <div style="text-align:center;">
                                <p style="font-size:1.2rem; color:var(--text-muted);">Plus de batterie...</p>
                                <p style="margin-top:20px;">Le mot était :</p>
                                <h2 style="font-size:2.5rem; color:var(--accent); margin:10px 0;">${data.target_reveal.toUpperCase()}</h2>
                            </div>
                        `);
                        
                        const actionsDiv = document.getElementById('modal-actions');
                        if (actionsDiv) {
                            actionsDiv.innerHTML = `
                                <div style="display: flex; gap: 10px; justify-content: center;">
                                    <button id="btn-replay" class="btn">Recommencer</button>
                                    <button id="btn-hub" class="btn btn-outline">Quitter</button>
                                </div>
                            `;
                            document.getElementById('btn-replay').onclick = function() { sendResetRequest(this); };
                            document.getElementById('btn-hub').onclick = function() { window.location.href = "/"; };
                        }
                    }, 500);
                }
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
            case "reset_update":
                updateResetStatus(data);
                break;
            case "game_reset":
                performGameReset(data);
                if (data.mode === "blitz" && data.end_time) {
                    startTimer(data.end_time);
                    const s = document.getElementById('score-display');
                    if(s) s.textContent = "0";
                }
                break;
        }

        if (data.blitz_success) {
            const s = document.getElementById('score-display');
            if(s) s.textContent = data.team_score;
            
            initGameUI({ 
                game_type: state.gameType, 
                public_state: data.new_public_state 
            });
            
            state.entries = [];
            renderHistory();
            addHistoryMessage(`✨ Mot trouvé ! Au suivant !`, 2000);
        }
    };

    ws.onclose = () => {
        setRoomInfo("Déconnecté");
    };
}

function initGameUI(data) {
    // 1. Mise à jour de l'état global
    state.gameType = data.game_type;

    // 2. Gestion du Titre
    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario", "intruder": "L'Intrus", "hangman": "Pendu" };
    const titleEl = document.getElementById("game-title");
    const hangmanArea = document.getElementById("hangman-area");
    if (titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    // 3. Récupération des éléments d'interface
    const form = document.getElementById("guess-form");
    const instrBox = document.getElementById("game-instruction");
    const legendPanel = document.getElementById("legend-panel");
    const intruderArea = document.getElementById("intruder-area");
    const gameLayout = document.querySelector(".game-layout");

    // 4. Réinitialisation de l'affichage (Tout masquer par précaution)
    if (form) form.style.display = "flex";
    if (hangmanArea) hangmanArea.style.display = "none";
    if (instrBox) instrBox.style.display = "none";
    if (legendPanel) legendPanel.style.display = "none";
    if (intruderArea) intruderArea.style.display = "none";

    if (data.game_type === "hangman") {
        if (form) form.style.display = "none"; // On cache l'input texte standard
        if (gameLayout) gameLayout.classList.add("intruder-focus"); // On centre (réutilisation du style intruder)
        
        if (hangmanArea) {
            hangmanArea.style.display = "block";
            renderHangmanUI(data.public_state);
        }
    }

    // 5. Logique spécifique par mode de jeu
    if (data.game_type === "intruder") {
        if (form) form.style.display = "none";
        
        // AJOUT : On active le mode centré
        if (gameLayout) gameLayout.classList.add("intruder-focus");

        if (intruderArea) {
            intruderArea.style.display = "block";
            if (typeof renderIntruderGrid === "function" && data.public_state) {
                renderIntruderGrid(data.public_state.options);
            }
        }

    } else if (data.game_type === "definition") {
        // --- MODE DICTIONNARIO ---
        if (instrBox) {
            instrBox.style.display = "block";
            document.getElementById("definition-text").textContent = `"${data.public_state.hint}"`;
            document.getElementById("hint-text").textContent = `Le mot fait ${data.public_state.word_length} lettres.`;
        }

    } else {
        // --- MODE CÉMANTIX (Par défaut) ---
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

// 3. Fonction d'envoi du guess (similaire au submit du formulaire)
// Dans static/js/main.js

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

    let scoreTableHtml = `
        <p style="font-size:1.2rem; margin-bottom:20px;">Le mot a été trouvé par <strong style="color:var(--accent)">${winnerName}</strong> !</p>
        <div style="background:#f8f9fa; border-radius:12px; padding:15px; text-align:left; margin-bottom: 20px; border: 1px solid #eee;">
    `;
    
    if (scoreboardData && scoreboardData.length > 0) {
        scoreboardData.forEach((p, index) => {
            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
            // NOTE : J'ai retiré le border-bottom blanc transparent
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
        
        // ON RÉGÉNÈRE COMPLÈTEMENT LES BOUTONS ICI
        // Cela garantit qu'ils sont frais et non désactivés pour la nouvelle partie
        const actionsDiv = document.getElementById('modal-actions');
        if (actionsDiv) {
            actionsDiv.innerHTML = `
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="btn-replay" class="btn">Rejouer la partie</button>
                    <button id="btn-hub" class="btn btn-outline">Retour au Hub</button>
                </div>
            `;

            // Attacher les écouteurs
            document.getElementById('btn-replay').onclick = function() {
                sendResetRequest(this);
            };
            
            document.getElementById('btn-hub').onclick = function() {
                window.location.href = "/";
            };
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

// --- Gestionnaire Formulaire ---
if (elements.form) {
    elements.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        // Empêche de jouer si une modale est ouverte
        const overlay = document.getElementById('modal-overlay');
        if (overlay && overlay.classList.contains('active')) return;
        
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
                    // On ajoute 3000 (3 secondes) comme second paramètre
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

document.addEventListener('DOMContentLoaded', () => {
    const helpBtn = document.getElementById('help-trigger');
    const helpModal = document.getElementById('help-modal');

    if (helpBtn && helpModal) {
        helpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            helpModal.classList.add('active');
        });

        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.remove('active');
            }
        });
    }
});

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
    // Reset à l'état par défaut (Coop)
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

// 4. Lancer la partie avec les paramètres choisis
function submitGameConfig() {
    // Récupération des valeurs
    // Pour l'intrus, mode sera 'blitz' car on l'a forcé dans openGameConfig
    const mode = document.getElementById('config-mode').value;
    let duration = 0;

    if (mode === 'blitz') {
        duration = parseInt(document.getElementById('config-duration').value);
    }

    closeConfigModal();
    
    // Lancement universel
    createGame(currentConfigType, mode, duration);
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