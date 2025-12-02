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
    const pseudo = localStorage.getItem("player_name");
    try {
        const response = await fetch("/rooms/join_random", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_name: pseudo })
        });
        const data = await response.json();
        if (data.room_id) {
            window.location.hash = `#room=${data.room_id}`;
            closeConfigModal();
        }
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la recherche d'adversaire.");
    }
}

export function openGameConfig(type) {
    if (!verifierPseudo()) return;
    
    currentConfigType = type;
    const modal = document.getElementById('config-modal');
    const contentDiv = modal.querySelector('.modal-box');
    const modeGroup = document.getElementById('mode-group');
    const durationGroup = document.getElementById('duration-group');
    const title = document.getElementById('config-modal-title');
    const desc = document.getElementById('mode-desc');
    const modeSelect = document.getElementById('config-mode');

    if(modal) modal.classList.add('active');

    if (type === 'duel') {
        const originalContent = contentDiv.innerHTML;
        
        contentDiv.innerHTML = `
            <h2>⚔️ Duel de Concepts</h2>
            <p style="text-align:center; margin-bottom: 20px;">
                Affrontez un autre joueur en temps réel.<br>
                Trouvez le mot le plus proche du thème en 60 secondes.
            </p>
            
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button id="btn-invite" class="btn" style="background: #a29bfe;">🤝 Inviter un ami</button>
                <button id="btn-random" class="btn" style="background: #ff7675;">🎲 Adversaire Aléatoire</button>
            </div>
            <button class="btn-close" style="margin-top:20px;">Annuler</button>
        `;

        // Gestionnaire pour "Inviter un ami" (Créer une salle privée)
        contentDiv.querySelector('#btn-invite').onclick = () => {
            // On lance la création classique, mais on force les params
            closeConfigModal();
            // On restaure le contenu pour la prochaine fois (optionnel si tu recharges la page)
             setTimeout(() => contentDiv.innerHTML = originalContent, 500);
            createGame('duel', 'blitz', 60);
        };

        // Gestionnaire pour "Aléatoire"
        contentDiv.querySelector('#btn-random').onclick = () => {
            joinRandomDuel();
             setTimeout(() => contentDiv.innerHTML = originalContent, 500);
        };

        contentDiv.querySelector('.btn-close').onclick = () => {
            closeConfigModal();
            setTimeout(() => contentDiv.innerHTML = originalContent, 500);
        };
        return;
    } else if (type === 'intruder') {
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
