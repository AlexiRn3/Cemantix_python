import { createGame } from "./api.js";
import { verifierPseudo } from "./session.js";
import { closeConfigModal } from "./modal.js";
import { state } from "./state.js";

// Variable locale pour stocker le type en cours
let currentConfigType = "definition";

// Logique pour rejoindre un duel aléatoire
async function joinRandomDuel() {
    if (!verifierPseudo()) return; // Vérifie et ouvre la modale login si besoin
    
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

// Fonction principale pour ouvrir la modale de configuration
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

    const existingDuelMenu = document.getElementById('duel-menu-container');
    if (existingDuelMenu) existingDuelMenu.remove();

    // Reset de l'affichage par défaut
    if (defaultActions) defaultActions.style.display = 'flex';
    if (desc) desc.style.display = 'block';
    if (modeGroup) modeGroup.style.display = 'block';

    // --- CONFIGURATION DUEL ---
    if (type === 'duel') {
        if(title) title.textContent = "⚔️ Duel de Concepts";

        // 1. On masque TOUTE l'interface standard (Inputs + Bouton Lancer)
        [modeGroup, durationGroup, desc, defaultActions].forEach(el => { 
            if(el) el.style.display = 'none'; 
        });

        // 2. On injecte le menu spécifique au Duel
        const duelMenu = document.createElement('div');
        duelMenu.id = 'duel-menu-container';
        
        duelMenu.innerHTML = `
            <p style="text-align:center; margin-bottom: 30px; color: var(--text-muted); line-height: 1.5;">
                Affrontez un autre joueur en temps réel.<br>
                Un thème, 60 secondes, le meilleur mot gagne.
            </p>
            
            <div style="display: flex; flex-direction: column; gap: 15px; align-items: center;">
                <button id="btn-invite" class="btn" style="width: 100%; background: #a29bfe;">🤝 Créer et Inviter un ami</button>
                <button id="btn-random" class="btn" style="width: 100%; background: #ff7675;">🎲 Adversaire Aléatoire</button>
                <button id="btn-cancel-duel" class="btn btn-outline" style="width: 100%;">Annuler</button>
            </div>
        `;

        // Insertion après le titre
        title.insertAdjacentElement('afterend', duelMenu);

        // 3. Attachement des événements (SANS setTimeout hasardeux)
        
        // Bouton Inviter
        document.getElementById('btn-invite').onclick = async () => {
            // On lance la création directement. createGame gère la redirection.
            // Note: 'duel' type, 'blitz' mode, 60s duration
            await createGame('duel', 'blitz', 60);
            closeConfigModal();
        };

        // Bouton Aléatoire
        document.getElementById('btn-random').onclick = () => {
             joinRandomDuel();
        };

        // Bouton Annuler
        document.getElementById('btn-cancel-duel').onclick = () => {
            closeConfigModal();
        };

        return; 
    } 

    // --- CONFIGURATION INTRUS ---
    if (type === 'intruder') {
        if(title) title.textContent = "L'Intrus : Contre la montre";
        if(modeGroup) modeGroup.style.display = 'none'; 
        if(modeSelect) modeSelect.value = 'blitz'; // Force le mode
        if(durationGroup) durationGroup.style.display = 'block';
        if(desc) desc.textContent = "Trouvez un maximum d'intrus avant la fin du temps imparti !";
    } 
    // --- CONFIGURATION STANDARD (Dictionnario) ---
    else {
        if(title) title.textContent = "Config. Dictionnario";
        if(modeGroup) modeGroup.style.display = 'block';
        if(modeSelect) modeSelect.value = 'coop';
        toggleDurationDisplay();
    }
}

// Gestion de l'affichage dynamique (Coop vs Blitz) pour Dictionnario
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

// Fonction appelée par le bouton "Lancer" (Standard uniquement)
export async function submitGameConfig() {
    const mode = document.getElementById('config-mode').value;
    let duration = 0;

    if (mode === 'blitz') {
        duration = parseInt(document.getElementById('config-duration').value);
    }

    closeConfigModal();
    await createGame(currentConfigType, mode, duration);
}

// Fonction spécifique pour le bouton config Dictionnario du Hub
export function openDictioConfig() {
    openGameConfig('definition');
}