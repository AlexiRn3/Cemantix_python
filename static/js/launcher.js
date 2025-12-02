import { openGameConfig, toggleDurationDisplay } from "./launcher.js";
import { currentConfigType } from "./main.js";
import { verifierPseudo } from "./session.js";

async function submitGameConfig() {
    // Récupération des valeurs
    // Pour l'intrus, mode sera 'blitz' car on l'a forcé dans openGameConfig
    const mode = document.getElementById('config-mode').value;
    let duration = 0;

    if (mode === 'blitz') {
        duration = parseInt(document.getElementById('config-duration').value);
    }

    closeConfigModal();
    
    // Lancement universel
    await createGame(currentConfigType, mode, duration);
}

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
function openDictioConfig() {
    if (!verifierPseudo()) return;
    const modal = document.getElementById('config-modal');
    modal.classList.add('active');
    
    // CORRECTION : On définit explicitement le type de jeu
    currentConfigType = "definition"; 
    openGameConfig('definition');
    
    document.getElementById('config-mode').value = "coop";
    toggleDurationDisplay();
}

