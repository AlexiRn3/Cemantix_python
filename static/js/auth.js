import { setCurrentUser, logout as sessionLogout } from "./session.js";
import { state } from "./state.js";
import { showModal } from "./ui.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Récupération des éléments DOM ---
    const authModal = document.getElementById('auth-modal');
    const btnProfile = document.getElementById('btn-profile');
    
    const logoutModal = document.getElementById('logout-modal');
    const successModal = document.getElementById('success-modal');
    
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');

    const token = localStorage.getItem('access_token');
    const username = localStorage.getItem('arcade_user_pseudo'); 
    
    if (token && username) {
        updateProfileUI(username);
    }


    if (btnProfile) {
        btnProfile.addEventListener('click', (e) => {
            e.preventDefault();

            if (state.currentRoomId) {
                showModal("Action Impossible", "Vous ne pouvez pas changer de compte ou vous déconnecter pendant une partie.<br><br>Retournez au Hub pour quitter proprement.");
                return;
            }
            
            if (state.currentUser) {
                if (logoutModal) logoutModal.classList.add('active');
            } else {
                if (authModal) authModal.classList.add('active');
            }
        });
    }

    // --- 4. Logique de la modale de déconnexion ---
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            logout(); // Action de déconnexion
            if (logoutModal) logoutModal.classList.remove('active');
        });
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', () => {
            if (logoutModal) logoutModal.classList.remove('active');
        });
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            await performAuth('/auth/login', { username, password }, 'login-error');
        });
    }

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const password = document.getElementById('register-password').value;
            await performAuth('/auth/register', { username, password }, 'register-error');
        });
    }
});

// Basculer entre les onglets
window.switchAuthTab = function(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
    }
};

function showSuccessModal(message) {
    const modal = document.getElementById('success-modal');
    const msgElement = document.getElementById('success-message');
    
    if (modal && msgElement) {
        msgElement.textContent = message;
        modal.classList.add('active');
        
        setTimeout(() => {
            modal.classList.remove('active');
        }, 2000);
    } else {
        console.log("Succès:", message);
    }
}

// Exécuter l'appel API (Login ou Register)
async function performAuth(endpoint, data, errorId) {
    const errorElem = document.getElementById(errorId);
    errorElem.textContent = "";
    
    const btn = document.querySelector(endpoint.includes('login') ? '#login-form button' : '#register-form button');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Chargement...";

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        // Gestion de l'erreur 503 ou HTML renvoyé par erreur
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Le serveur est indisponible (Erreur 503). Vérifiez les logs Python.");
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Erreur inconnue");
        }

        localStorage.setItem('access_token', result.access_token);
        
        setCurrentUser(result.username); 
        
        // Fermer la modale d'auth
        const authModal = document.getElementById('auth-modal');
        if(authModal) authModal.classList.remove('active');
        
        const msg = endpoint.includes('register') ? "Compte créé avec succès !" : "Connexion réussie !auth";
        showSuccessModal(msg);

    } catch (err) {
        console.error(err);
        errorElem.textContent = err.message;
        errorElem.style.color = "#ff6b6b";
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function updateProfileUI(username) {
    const display = document.getElementById('profile-name-display');
    const btn = document.getElementById('btn-profile');
    
    if (display) display.textContent = username;
    if (btn) {
        btn.classList.add('logged-in');
        const avatar = btn.querySelector('.avatar');
        if(avatar) avatar.textContent = "😎";
    }
}

function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('arcade_user_pseudo');
    
    // Mise à jour visuelle immédiate
    const display = document.getElementById('profile-name-display');
    const btn = document.getElementById('btn-profile');
    
    if (display) display.textContent = "Connexion";
    if (btn) {
        btn.classList.remove('logged-in');
        const avatar = btn.querySelector('.avatar');
        if(avatar) avatar.textContent = "👤";
    }

    showSuccessModal("Vous êtes déconnecté.");
    
    setTimeout(() => location.reload(), 1500);
}