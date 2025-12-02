import { state } from "./state.js";
import { showModal, addHistoryMessage } from "./ui.js";
import { currentUser } from "./session.js";

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
    if(panel) panel.style.display = 'block';

    const updateTimer = () => {
        const now = Date.now() / 1000;
        const diff = endTime - now;

        if (diff <= 0) {
            clearInterval(interval);
            if(timerEl) timerEl.textContent = "00:00";
            
            const scoreEl = document.getElementById('score-display');
            const score = scoreEl ? scoreEl.textContent : "0";
            
            showModal("TEMPS ÉCOULÉ", `
                <div style="margin-bottom: 20px;">
                    C'est terminé !<br>
                    Score final : <strong style="color:var(--success); font-size:1.5rem;">${score}</strong> mots.
                </div>
            `);

            const actionsDiv = document.getElementById('modal-actions');
            if(actionsDiv) {
                actionsDiv.innerHTML = `
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="btn-blitz-replay" class="btn">Rejouer</button>
                        <button id="btn-hub-return" class="btn btn-outline">Retour au Hub</button>
                    </div>
                `;
                document.getElementById('btn-hub-return').onclick = () => window.location.href = "/";
                document.getElementById('btn-blitz-replay').onclick = function() {
                    sendResetRequest(this);
                };
            }
        } else {
            const m = Math.floor(diff / 60);
            const s = Math.floor(diff % 60);
            if(timerEl) timerEl.textContent = `${m}:${s < 10 ? '0'+s : s}`;
        }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
}

export function initGameUI(data) {
    state.gameType = data.game_type;
    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario", "intruder": "L'Intrus", "hangman": "Pendu" };
    const titleEl = document.getElementById("game-title");
    if (titleEl) titleEl.textContent = titles[data.game_type] || "Jeu";

    const elementsToHide = ["hangman-area", "game-instruction", "legend-panel", "intruder-area"];
    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = "none";
    });
    
    const form = document.getElementById("guess-form");
    if(form) form.style.display = "flex";

    const gameLayout = document.querySelector(".game-layout");
    if(gameLayout) gameLayout.classList.remove("intruder-focus");

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

async function submitIntruderGuess(word, buttonElement) {
    if (state.locked || !state.currentRoomId) return;
    buttonElement.disabled = true;

    try {
        const res = await fetch(`/rooms/${state.currentRoomId}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word, player_name: currentUser })
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

async function submitHangmanGuess(letter, btnElement) {
    if (state.locked || !state.currentRoomId) return;
    btnElement.disabled = true;

    try {
        await fetch(`/rooms/${state.currentRoomId}/guess`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word: letter, player_name: currentUser })
        });
    } catch (err) {
        console.error("Erreur réseau:", err);
        btnElement.disabled = false;
    }
}

export function handleDefeat(data) {
    if (state.locked) return;
    state.locked = true;
    
    showModal("GAME OVER", `
        <div style="margin-bottom: 20px;">
            La batterie est à plat ! 💀<br>
            Le mot à trouver était : <strong style="color:var(--accent); font-size:1.5rem;">${data.target_reveal.toUpperCase()}</strong>.
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
        body: JSON.stringify({ player_name: currentUser })
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