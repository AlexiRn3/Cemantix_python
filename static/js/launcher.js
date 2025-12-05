import { createGame } from "./api.js";
import { verifierPseudo } from "./session.js";
import { closeConfigModal } from "./modal.js";
import { state } from "./state.js";

let currentConfigType = "definition";

async function joinRandomDuel() {
    console.log("🎲 Recherche d'adversaire...");
    if (!verifierPseudo()) return;
    
    const pseudo = state.currentUser; 
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
        
        if (!response.ok) throw new Error("Erreur serveur");
        
        const data = await response.json();
        
        if (data.room_id) {
            closeConfigModal();
            window.location.href = `/game?room=${data.room_id}&player=${encodeURIComponent(pseudo)}`;
        }
    } catch (e) {
        console.error(e);
        alert("Impossible de trouver ou créer un duel.");
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
    const title = document.getElementById('config-modal-title');
    const desc = document.getElementById('mode-desc');
    const modeGroup = document.getElementById('mode-group');
    const durationGroup = document.getElementById('duration-group');
    const modeSelect = document.getElementById('config-mode');
    const defaultActions = document.getElementById('config-actions-default');

    if(modal) modal.classList.add('active');

    // Nettoyage ancien menu duel si présent
    const existingDuelMenu = document.getElementById('duel-menu-container');
    if (existingDuelMenu) existingDuelMenu.remove();

    // Reset affichage standard
    if (defaultActions) defaultActions.style.display = 'flex';
    if (desc) desc.style.display = 'block';
    if (modeGroup) modeGroup.style.display = 'block';

    // --- CONFIG DUEL ---
    if (type === 'duel') {
        if(title) title.textContent = "⚔️ Duel de Concepts";

        // Masquer l'interface standard
        [modeGroup, durationGroup, desc, defaultActions].forEach(el => { 
            if(el) el.style.display = 'none'; 
        });

        // Injecter le menu Duel
        const duelMenu = document.createElement('div');
        duelMenu.id = 'duel-menu-container';
        duelMenu.innerHTML = `
            <p style="text-align:center; margin-bottom: 30px; color: var(--text-muted);">
                Affrontez un joueur en temps réel (60s).<br>
                Le mot le plus proche gagne !
            </p>
            <div style="display: flex; flex-direction: column; gap: 15px;">
                <button id="btn-invite" class="btn" style="background: #a29bfe;">🤝 Créer et Inviter</button>
                <button id="btn-random" class="btn" style="background: #ff7675;">🎲 Adversaire Aléatoire</button>
                <button id="btn-cancel-duel" class="btn btn-outline">Annuler</button>
            </div>
        `;

        title.insertAdjacentElement('afterend', duelMenu);

        // Attacher les événements
        document.getElementById('btn-invite').onclick = async () => {
            console.log("🤝 Création Duel (Invitation)...");
            // Force 60s et mode blitz pour le duel
            await createGame('duel', 'blitz', 60);
            closeConfigModal();
        };

        document.getElementById('btn-random').onclick = () => {
             joinRandomDuel();
        };

        document.getElementById('btn-cancel-duel').onclick = () => {
            closeConfigModal();
        };
        return; 
    } 

    // --- CONFIG INTRUS ---
    if (type === 'intruder') {
        if(title) title.textContent = "L'Intrus : Contre la montre";
        if(modeGroup) modeGroup.style.display = 'none'; 
        if(modeSelect) modeSelect.value = 'blitz';
        if(durationGroup) durationGroup.style.display = 'block';
        if(desc) desc.textContent = "Trouvez l'intrus avant la fin du temps !";
    } 
    // --- CONFIG STANDARD ---
    else {
        if(title) title.textContent = "Config. Dictionnario";
        if(modeGroup) modeGroup.style.display = 'block';
        if(modeSelect) modeSelect.value = 'coop';
        toggleDurationDisplay();
    }
}

export function toggleDurationDisplay() {
    const mode = document.getElementById('config-mode').value;
    const durationGroup = document.getElementById('duration-group');
    
    if (currentConfigType === 'definition' && durationGroup) {
        durationGroup.style.display = (mode === 'blitz') ? 'block' : 'none';
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

export function openDictioConfig() {
    openGameConfig('definition');
}