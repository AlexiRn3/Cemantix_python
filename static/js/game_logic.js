import { state } from "./state.js";
import { showModal, addHistoryMessage } from "./ui.js";

export function handleBlitzSuccess(data) {
    initGameUI({ 
        game_type: state.gameType, 
        public_state: data.new_public_state 
    });
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

export function startTimer(endTime) {
    const timerEl = document.getElementById('timer-display');
    const panel = document.getElementById('blitz-panel');
    if (panel) panel.style.display = 'block';

    // 1. Gestion de l'attente (si endTime est 0 ou null)
    if (!endTime || endTime === 0) {
        if (timerEl) timerEl.textContent = "En attente d'un joueur...";
        return;
    }

    // 2. Nettoyage de l'intervalle précédent s'il existe dans le state
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }

    // 3. Définition de la logique de mise à jour
    const updateTimer = () => {
        const now = Date.now() / 1000;
        const diff = endTime - now;

        if (diff <= 0) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            
            if (timerEl) timerEl.textContent = "00:00";

            if (state.gameType === "duel") {
                showModal("DUEL TERMINÉ ⚔️", `
                    <div style="margin-bottom: 20px;">
                        Le temps est écoulé !<br>
                        Regardez le tableau des scores pour voir qui a la meilleure proximité.
                    </div>
                `);
            } else {
                const scoreEl = document.getElementById('score-display');
                const score = scoreEl ? scoreEl.textContent : "0";

                showModal("TEMPS ÉCOULÉ", `
                    <div style="margin-bottom: 20px;">
                        C'est terminé !<br>
                        Score final : <strong style="color:var(--success); font-size:1.5rem;">${score}</strong> mots.
                    </div>
                `);
            }

            const actionsDiv = document.getElementById('modal-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = `
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="btn-blitz-replay" class="btn">Rejouer</button>
                        <button id="btn-hub-return" class="btn btn-outline">Retour au Hub</button>
                    </div>
                `;
                
                const btnHub = document.getElementById('btn-hub-return');
                if(btnHub) btnHub.onclick = () => window.location.href = "/";
                
                const btnReplay = document.getElementById('btn-blitz-replay');
                if(btnReplay) {
                    btnReplay.onclick = function() {
                        if(typeof sendResetRequest === 'function') {
                            sendResetRequest(this);
                        }
                    };
                }
            }
        } else {
            const m = Math.floor(diff / 60);
            const s = Math.floor(diff % 60);
            if (timerEl) timerEl.textContent = `${m}:${s < 10 ? '0' + s : s}`;
        }
    };
    updateTimer();
    state.timerInterval = setInterval(updateTimer, 1000);
}

export function initGameUI(data) {
    state.gameType = data.game_type;

    if (data.public_state) {
        state.public_state = data.public_state;
    }

    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario", "intruder": "L'Intrus", "hangman": "Pendu", "duel": "Duel de Concepts" };
    const titleEl = document.getElementById("game-title");
    if (titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    const btnSurrender = document.getElementById("btn-surrender");
    if (btnSurrender) {
        // On affiche le bouton UNIQUEMENT si le jeu est 'cemantix'
        if (data.game_type === "cemantix") {
            btnSurrender.style.display = "inline-block"; 
        } else {
            btnSurrender.style.display = "none";
        }
    }

    const elementsToHide = ["hangman-area", "game-instruction", "legend-panel", "intruder-area"];
    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = "none";
    });
    
    const form = document.getElementById("guess-form");

    const gameLayout = document.querySelector(".game-layout");
    if(gameLayout) gameLayout.classList.remove("intruder-focus");

    if (data.game_type === "hangman") {
        if(form) form.style.display = "flex";
        if(gameLayout) gameLayout.classList.add("intruder-focus");
        const area = document.getElementById("hangman-area");
        if(area) {
            area.style.display = "block";
            renderHangmanUI(data.public_state);
        }
    } else if (data.game_type === "intruder") {
        if(form) form.style.display = "flex";
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
    } else if (data.game_type === "duel") {
        const box = document.getElementById("game-instruction");
        if(box) {
            box.style.display = "block";
            if (data.end_time === 0 || !data.end_time) {
                document.getElementById("definition-text").innerHTML = `
                    <div style="animation: pulse 1.5s infinite;">⏳ Recherche d'adversaire...</div>
                `;
                document.getElementById("hint-text").innerHTML = `
                    <button class="btn btn-danger" onclick="window.location.href='/'" style="margin-top:20px; padding: 10px 20px; font-size: 1rem;">
                        Annuler la recherche
                    </button>
                `;
                if(form) form.style.display = "none";

            } else {
                document.getElementById("definition-text").innerHTML = `Thème : <strong style="color:var(--accent); text-transform:uppercase; font-size: 2.5rem;">${data.public_state.theme}</strong>`;
                document.getElementById("hint-text").textContent = "Trouvez le mot le plus proche !";
                
                // ON AFFICHE LE FORMULAIRE ICI
                if(form) {
                    form.style.display = "flex";
                    const input = form.querySelector('input');
                    if(input) input.focus();
                }
            }
        }
        const form = document.getElementById("guess-form");
        if(form) form.style.display = "flex";
    } else {
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

export function renderIntruderGrid(options) {
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

export function updateMusicContext(gameType, mode, duration) {
    if (window.musicManager && typeof window.musicManager.setContext === "function") {
        window.musicManager.setContext({ gameType, mode, duration });
    }
}

export async function submitIntruderGuess(word, buttonElement) {
    if (state.locked || !state.currentRoomId) return;
    buttonElement.disabled = true;

    try {
        const res = await fetch(`/rooms/${state.currentRoomId}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word, player_name: state.currentUser })
        });
        const data = await res.json();
        
        if (data.error) {
            showModal("Oups", data.message);
            buttonElement.disabled = false;
        } else if (!data.is_correct) {
            buttonElement.classList.add("wrong");
            addHistoryMessage(`❌ -1 point !`, 1000);
            const grid = document.getElementById("intruder-grid");
            const allButtons = grid.querySelectorAll("button");
            allButtons.forEach(btn => btn.disabled = true);
            setTimeout(() => {
                allButtons.forEach(btn => {
                    if (!btn.classList.contains("wrong")) btn.disabled = false;
                });
            }, 1000);
        } else {
            buttonElement.classList.add("correct");
        }
    } catch (err) {
        console.error(err);
        buttonElement.disabled = false;
    }
}

export function renderHangmanUI(hangState) {
    if(!hangState) return;
    const wordEl = document.getElementById("hangman-word");
    if (wordEl && hangState.masked_word) wordEl.textContent = hangState.masked_word; 

    const bar = document.getElementById("hangman-battery");
    if (bar) {
        const pct = Math.max(0, (hangState.lives / hangState.max_lives) * 100);
        bar.style.width = `${pct}%`;
        if (pct < 30) bar.classList.add("battery-low");
        else bar.classList.remove("battery-low");
    }

    const kb = document.getElementById("hangman-keyboard");
    if (kb && kb.innerHTML === "") {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (let letter of alphabet) {
            const btn = document.createElement("button");
            btn.textContent = letter;
            btn.className = "key-btn";
            btn.id = `key-${letter}`;
            btn.onclick = () => submitHangmanGuess(letter, btn);
            kb.appendChild(btn);
        }
    }

    if (hangState.used_letters) {
        hangState.used_letters.forEach(letter => {
            const btn = document.getElementById(`key-${letter}`);
            if (btn) {
                btn.disabled = true;
                btn.classList.add("wrong"); 
            }
        });
        if (hangState.masked_word) {
            const revealedLetters = new Set(hangState.masked_word.replace(/_/g, '').replace(/ /g, '').split(''));
            revealedLetters.forEach(letter => {
                const btn = document.getElementById(`key-${letter}`);
                if (btn) {
                    btn.className = "key-btn correct";
                    btn.disabled = true;
                }
            });
        }
    }
}

export function updateHangmanUI(data) {
    renderHangmanUI(data.public_state || data); // Fallback
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

export async function submitHangmanGuess(letter, btnElement) {
    if (state.locked || !state.currentRoomId) return;
    btnElement.disabled = true;

    try {
        await fetch(`/rooms/${state.currentRoomId}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word: letter, player_name: state.currentUser })
        });
    } catch (err) {
        console.error("Erreur réseau:", err);
        btnElement.disabled = false;
    }
}

export function handleDefeat(data) {
    if (state.locked) return;
    state.locked = true;

    const wordToReveal = data.target_reveal ? data.target_reveal.toUpperCase() : "???";
    
    showModal("GAME OVER", `
        <div style="margin-bottom: 20px;">
            La batterie est à plat ! 💀<br>
            Le mot à trouver était : <strong style="color:var(--accent); font-size:1.5rem;">${wordToReveal}</strong>.
        </div>
    `);

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

export async function sendResetRequest(btnElement) {
    if(!state.currentRoomId) return;
    btnElement.disabled = true;
    btnElement.textContent = "En attente...";
    
    await fetch(`/rooms/${state.currentRoomId}/reset`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ player_name: state.currentUser })
    });
}

export function updateResetStatus(data) {
    const statusDiv = document.getElementById('reset-status-msg');
    if (statusDiv) {
        statusDiv.innerHTML = `Joueurs prêts : <strong style="color:var(--accent)">${data.current_votes}/${data.total_players}</strong><br>En attente de : ${data.waiting_for.join(', ')}`;
    }
}

export function performGameReset(data) {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('active');

    state.entries = [];
    state.locked = false;
    state.roomLocked = false;
    
    const hist = document.getElementById("history");
    if (hist) hist.innerHTML = "";
    
    const input = document.getElementById("word-input");
    if (input) {
        input.value = "";
        input.focus();
    }

    const kb = document.getElementById("hangman-keyboard");
    if (kb) kb.innerHTML = "";

    initGameUI({ 
        game_type: state.gameType, 
        public_state: data.public_state 
    });
    
    addHistoryMessage("🔄 Nouvelle partie commencée !");
}

export async function requestSurrender(vote = true) {
    if (state.roomLocked) return;

    try {
        const res = await fetch(`/rooms/${state.currentRoomId}/surrender`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                player_name: state.currentUser,
                vote: vote 
            })
        });
        
        const data = await res.json();
        if (res.status === 429) {
            showModal("Patience...", data.message);
        } else if (res.status === 403) {
            showModal("Impossible", data.message);
        }
        

        if (!vote) closeModal();

    } catch (e) {
        console.error(e);
    }
}


export function handleSurrenderVote(data) {

    if (data.initiator === state.currentUser) {
        addHistoryMessage(`⏳ Vote d'abandon lancé (${data.current_votes}/${data.total_players})...`);
        return;
    }

    showModal("🏳️ Abandon proposé", `
        <div style="text-align:center;">
            <p><strong>${data.initiator}</strong> propose de révéler le mot.</p>
            <p>Acceptez-vous la défaite ?</p>
            <p style="font-size:0.9em; color:var(--text-muted); margin-top:10px;">L'unanimité est requise.</p>
            <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                <button class="btn" style="background:var(--accent);" onclick="window.confirmSurrender(true)">Oui, révéler</button>
                <button class="btn btn-outline" onclick="window.confirmSurrender(false)">Non, continuer</button>
            </div>
        </div>
    `);
}


window.confirmSurrender = function(decision) {
    requestSurrender(decision);
};


export function handleSurrenderCancel(data) {
    closeModal();
    addHistoryMessage(`❌ ${data.message}`);
    const btn = document.getElementById('btn-surrender');
    if(btn) {
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        setTimeout(() => {
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
        }, data.cooldown * 1000);
    }
}

export function handleSurrenderSuccess(data) {
    closeModal(); 
    
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    let count = 3;

    showModal("Révélation...", `<h1 id="surrender-countdown" style="font-size:6rem; color:var(--accent);">3</h1>`);
    
    const actions = document.getElementById('modal-actions');
    if(actions) actions.style.display = 'none';

    const interval = setInterval(() => {
        count--;
        const el = document.getElementById('surrender-countdown');
        if (el) el.textContent = count > 0 ? count : "💥";

        if (count <= 0) {
            clearInterval(interval);
            import("./game_logic.js").then(mod => {
                if(actions) actions.style.display = 'block';
                mod.handleDefeat({
                    target_reveal: data.word,
                    message: "Partie abandonnée."
                });
            });
        }
    }, 1000);
}