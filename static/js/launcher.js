import { createGame } from "./api.js";
import { verifierPseudo } from "./session.js";
import { closeConfigModal } from "./modal.js";

// Variable locale pour stocker le type en cours
let currentConfigType = "definition";

export function toggleDurationDisplay() {
    const mode = document.getElementById('config-mode').value;
    const durationGroup = document.getElementById('duration-group');
    const desc = document.getElementById('mode-desc');

    if (currentConfigType === 'definition') {
        if (mode === 'blitz') {
            if(durationGroup) durationGroup.style.display = 'block';
            if(desc) desc.textContent = "Trouvez un maximum de mots dans le temps imparti.";
        } else {
            if(durationGroup) durationGroup.style.display = 'none';
            if(desc) desc.textContent = "Trouvez un mot unique ensemble sans limite de temps.";
        }
    }
}

export async function submitGameConfig() {
    const mode = document.getElementById('config-mode').value;
    let duration = 0;

    if (mode === 'blitz') {
        duration = parseInt(document.getElementById('config-duration').value);
    }

    closeConfigModal();
    await createGame(currentConfigType, mode, duration);
}

async function joinRandomDuel() {
    const pseudo = state.currentUser; 
    
    if (!pseudo) {
        alert("Vous devez être connecté.");
        return;
    }

    const btn = document.getElementById('btn-random');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Recherche...";
    }

    try {
        const response = await fetch("/rooms/join_random", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_name: pseudo })
        });
        const data = await response.json();
        
        if (data.room_id) {
            closeConfigModal();
            window.location.href = `/game?room=${data.room_id}&player=${encodeURIComponent(pseudo)}`;
        }
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la recherche d'adversaire.");
        const btn = document.getElementById('btn-random');
        if(btn) {
            btn.disabled = false;
            btn.textContent = "🎲 Adversaire Aléatoire";
        }
    }
}

export function openGameConfig(type) {
    if (!verifierPseudo()) return;
    
    currentConfigType = type;
    const modal = document.getElementById('config-modal');
    const modeGroup = document.getElementById('mode-group');
    const durationGroup = document.getElementById('duration-group');
    const title = document.getElementById('config-modal-title');
    const desc = document.getElementById('mode-desc');
    const modeSelect = document.getElementById('config-mode');

    if(modal) modal.classList.add('active');

    const existingDuelMenu = document.getElementById('duel-menu-container');
    if (existingDuelMenu) existingDuelMenu.remove();

    if (type === 'duel') {

        if(title) title.textContent = "⚔️ Duel de Concepts";

        // On masque les éléments standards
        [modeGroup, durationGroup, desc].forEach(el => { if(el) el.style.display = 'none'; });

        const originalContent = duelMenu.innerHTML;
        
        duelMenu.innerHTML = `
            <h2 style="text-align: center; margin-bottom: 30px;">⚔️ Duel de Concepts</h2>
            <p style="text-align:center; margin-bottom: 20px; color: var(--text-muted);">
                Affrontez un autre joueur en temps réel.<br>
                Trouvez le mot le plus proche du thème en 60 secondes.
            </p>
            
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px;">
                <button id="btn-invite" class="btn" style="background: #a29bfe;">🤝 Inviter un ami</button>
                <button id="btn-random" class="btn" style="background: #ff7675;">🎲 Adversaire Aléatoire</button>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button class="btn-close btn btn-outline">Annuler</button>
            </div>
        `;

        title.insertAdjacentElement('afterend', duelMenu);

        const inviteBtn = duelMenu.querySelector('#btn-invite');
        if (inviteBtn) {
            inviteBtn.onclick = () => {
                closeConfigModal();
                setTimeout(() => createGame('duel', 'blitz', 60), 100);
            };
        }

        document.getElementById('btn-random').onclick = () => {
            if (typeof joinRandomDuel === 'function') {
                 joinRandomDuel();
             } else {
                 console.error("joinRandomDuel n'est pas définie dans ce scope");
             };
        };

        const closeBtn = duelMenu.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                closeConfigModal();
                setTimeout(() => duelMenu.innerHTML = originalContent, 100);
            };
        }
        return;
    } 

    if(title) title.textContent = (type === 'intruder') ? "L'Intrus : Contre la montre" : "Config. Dictionnario";
    
    if (type === 'intruder') {
        if(title) title.textContent = "L'Intrus : Contre la montre";
        if(modeGroup) modeGroup.style.display = 'none'; 
        if(modeSelect) modeSelect.value = 'blitz';
        if(durationGroup) durationGroup.style.display = 'block';
        if(desc) desc.textContent = "Trouvez un maximum d'intrus avant la fin du temps imparti !";
    } else {
        if(title) title.textContent = "Config. Dictionnario";
        if(modeGroup) modeGroup.style.display = 'block';
        if(modeSelect) modeSelect.value = 'coop';
        toggleDurationDisplay();
    }
}

export function openDictioConfig() {
    if (!verifierPseudo()) return;
    const modal = document.getElementById('config-modal');
    if(modal) modal.classList.add('active');
    
    currentConfigType = "definition"; 
    
    // Reset UI
    const modeSelect = document.getElementById('config-mode');
    const title = document.getElementById('config-modal-title');
    const modeGroup = document.getElementById('mode-group');
    
    if(title) title.textContent = "Config. Dictionnario";
    if(modeGroup) modeGroup.style.display = 'block';
    if(modeSelect) {
        modeSelect.value = "coop";
        toggleDurationDisplay();
    }
}
export function launchDictio() {
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
