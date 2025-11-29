import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo, showModal } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti } from "./rendering.js";

// ... (Le début du fichier : Initialisation, WebSocket reste inchangé) ...
// ... (Copiez le code existant jusqu'à handleVictory) ...

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
            if (data.mode === "blitz" && data.end_time) {
                // On lance le timer avec l'heure de fin reçue du serveur
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
                document.getElementById('score-display').textContent = "0"; // Reset visuel du score
            }
            break;
    }

    if (data.blitz_success) {
        // 1. Animation confetti petite
        //triggerConfetti(); 
        // 2. Mettre à jour le score
        document.getElementById('score-display').textContent = data.team_score;
        
        // 3. Mettre à jour l'interface (UI)
        // CORRECTION ICI : On utilise le type de jeu actuel au lieu de forcer 'definition'
        initGameUI({ 
            game_type: state.gameType, // <--- C'était 'definition' avant
            public_state: data.new_public_state 
        });
        
        // 4. Vider l'historique visuel pour le nouveau mot
        state.entries = [];
        renderHistory();
        
        addHistoryMessage(`✨ Mot trouvé ! Au suivant !`, 2000);
    }
};

function initGameUI(data) {
    // 1. Mise à jour de l'état global
    state.gameType = data.game_type;

    // 2. Gestion du Titre
    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario", "intruder": "L'Intrus" };
    const titleEl = document.getElementById("game-title");
    if (titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    // 3. Récupération des éléments d'interface
    const form = document.getElementById("guess-form");
    const instrBox = document.getElementById("game-instruction");
    const legendPanel = document.getElementById("legend-panel");
    const intruderArea = document.getElementById("intruder-area");
    const gameLayout = document.querySelector(".game-layout");

    // 4. Réinitialisation de l'affichage (Tout masquer par précaution)
    if (form) form.style.display = "flex"; // Par défaut on affiche le formulaire
    if (instrBox) instrBox.style.display = "none";
    if (legendPanel) legendPanel.style.display = "none";
    if (intruderArea) intruderArea.style.display = "none";

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
async function submitIntruderGuess(word, buttonElement) {
    if (state.locked) return;

    // Petit effet visuel immédiat pour dire "j'ai cliqué"
    buttonElement.disabled = true; // Évite le double clic

    try {
        const res = await fetch(`/rooms/${roomId}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word, player_name: playerName })
        });
        const data = await res.json();
        
        if (data.error) {
            showModal("Oups", data.message);
            buttonElement.disabled = false; // Réactive si erreur technique
        } else {
            if (!data.is_correct) {
                // CAS : MAUVAISE RÉPONSE -> ROUGE
                buttonElement.classList.add("wrong");
                // On réactive le bouton après un petit délai si on veut permettre de spammer, 
                // ou on le laisse désactivé pour dire "ce n'est pas celui là".
                // Ici je le laisse désactivé "wrong" pour montrer qu'il a été éliminé.
            } else {
                // CAS : BONNE RÉPONSE -> VERT
                buttonElement.classList.add("correct");
                // Le passage au mot suivant se fera via le WebSocket (data.blitz_success)
                // qui va recharger toute la grille.
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