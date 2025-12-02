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
