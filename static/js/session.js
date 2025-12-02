import { openLoginModal } from "./modal.js";

export const STORAGE_KEY = "arcade_user_pseudo";
export let currentUser = localStorage.getItem(STORAGE_KEY) || "";

export function setCurrentUser(name) {
    currentUser = name;
    localStorage.setItem(STORAGE_KEY, currentUser);
    updateSessionUI();
}

export function updateSessionUI() {
    const display = document.getElementById("profile-name-display");
    const btn = document.getElementById("btn-profile");
    
    if (currentUser) {
        if(display) display.textContent = currentUser;
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
        if (!name && currentUser) {
            name = currentUser;
            nameInput.value = name;
        }

        if (!name) {
            if(window.openLoginModal) window.openLoginModal();
            return false;
        }
        
        if (name !== currentUser) {
            setCurrentUser(name);
        }
        return true;
    }
    
    // Cas 2: Pas d'input
    if (!currentUser) {
        if(window.openLoginModal) window.openLoginModal();
        return false;
    }
    return true;
}

export function logout() {
    localStorage.removeItem(STORAGE_KEY);
    currentUser = "";
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