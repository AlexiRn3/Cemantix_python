import { openLoginModal } from "./modal.js";
import { state } from "./state.js";

export const STORAGE_KEY = "arcade_user_pseudo";

export function setCurrentUser(name) {
    state.currentUser = name;
    localStorage.setItem(STORAGE_KEY, state.currentUser);
    updateSessionUI();
}

export function updateSessionUI() {
    const display = document.getElementById("profile-name-display");
    const btn = document.getElementById("btn-profile");
    
    if (state.currentUser) {
        if(display) display.textContent = state.currentUser;
        if(btn) btn.classList.add("logged-in");
    } else {
        if(display) display.textContent = "Connexion";
        if(btn) btn.classList.remove("logged-in");
    }
}

export function verifierPseudo() {
    const nameInput = document.getElementById('player-name');
    
    // Cas 1: Input présent (Hub)
    if (nameInput) {
        let name = nameInput.value.trim();
        if (!name && state.currentUser) {
            name = state.currentUser;
            nameInput.value = name;
        }

        if (!name) {
            if(window.openLoginModal) window.openLoginModal();
            return false;
        }
        
        if (name !== state.currentUser) {
            setCurrentUser(name);
        }
        return true;
    }
    
    // Cas 2: Pas d'input
    if (!state.currentUser) {
        if(window.openLoginModal) window.openLoginModal();
        return false;
    }
    return true;
}

export function logout() {
    localStorage.removeItem(STORAGE_KEY);
    state.currentUser = "";
    updateSessionUI();
    const nameInput = document.getElementById('player-name');
    if (nameInput) nameInput.value = "";
    
    // Si on est en jeu, retour au hub
    if (window.location.pathname.includes("/game")) {
        window.location.href = "/";
    } else {
        if(window.closeModal) window.closeModal();
    }
}

export function saveSessionPseudo() {
    const input = document.getElementById('login-pseudo');
    const newName = input.value.trim();
    if (newName) {
        state.currentUser = newName;
        localStorage.setItem(STORAGE_KEY, state.currentUser);
        updateSessionUI();
        const hubInput = document.getElementById('player-name');
        if (hubInput) hubInput.value = state.currentUser;
        
        // AJOUT ICI : On vérifie si ce nouveau pseudo a déjà gagné aujourd'hui
        checkDailyVictory(); 
        
        closeModal();
    } else {
        input.classList.add('error-shake');
        setTimeout(() => input.classList.remove('error-shake'), 500);
    }
};