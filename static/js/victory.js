import { createGame, currentUser } from "./main.js";
import { elements } from "./dom.js";
import { state } from "./state.js";
const DAILY_WIN_KEY = "arcade_daily_win";

export function checkDailyVictory() {
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