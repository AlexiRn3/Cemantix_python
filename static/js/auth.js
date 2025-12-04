import { setCurrentUser, logout as sessionLogout } from "./session.js";
import { state } from "./state.js";
import { showModal } from "./ui.js";
// AJOUT : Import de la fonction qui gère le profil et les stats
import { openLoginModal } from "./modal.js"; 

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Récupération des éléments DOM ---
    const authModal = document.getElementById('auth-modal');
    const btnProfile = document.getElementById('btn-profile');
    
    const logoutModal = document.getElementById('logout-modal');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');

    const token = localStorage.getItem('access_token');
    const username = localStorage.getItem('arcade_user_pseudo'); 
    
    if (token && username) {
        updateProfileUI(username);
    }

    // --- MODIFICATION ICI : Délégation à openLoginModal ---
    if (btnProfile) {
        btnProfile.addEventListener('click', (e) => {
            e.preventDefault();
            // On appelle la fonction centrale qui gère maintenant :
            // 1. L'affichage des stats (si connecté)
            // 2. L'authentification (si déconnecté)
            openLoginModal();
        });
    }

    // --- 4. Logique de la modale de déconnexion (Toujours utile si appelée via le bouton "Se déconnecter" des stats) ---
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
            const usernameInput = document.getElementById('register-username');
            const passwordInput = document.getElementById('register-password');
            const errorElem = document.getElementById('register-error');
            
            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            // --- DEBUT VALIDATION STRICTE ---
            const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
            
            if (!usernameRegex.test(username)) {
                errorElem.textContent = "Pseudo invalide : 3-20 caractères, lettres, chiffres, - et _ uniquement.";
                errorElem.style.color = "#ff6b6b";
                
                // Petite animation d'erreur
                usernameInput.classList.add('error-shake');
                setTimeout(() => usernameInput.classList.remove('error-shake'), 500);
                return; // On arrête tout, pas d'envoi au serveur
            }
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
    // Création dynamique de la modale si elle n'existe pas (fallback)
    if (!modal) {
        alert(message);
        return;
    }
    
    // Si la modale existe mais n'a pas la structure attendue, on adapte
    let msgElement = document.getElementById('success-message');
    if (!msgElement && modal) {
        modal.innerHTML = `<div class="modal-content" style="background:white; padding:20px; border-radius:10px; text-align:center;">
            <h3 style="color:var(--success)">${message}</h3>
        </div>`;
    } else if (msgElement) {
        msgElement.textContent = message;
    }

    modal.classList.add('active');
    setTimeout(() => {
        modal.classList.remove('active');
    }, 2000);
}

// Exécuter l'appel API (Login ou Register)
async function performAuth(endpoint, data, errorId) {
    const errorElem = document.getElementById(errorId);
    if(errorElem) errorElem.textContent = "";
    
    const btn = document.querySelector(endpoint.includes('login') ? '#login-form button' : '#register-form button');
    const originalText = btn ? btn.textContent : "...";
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Chargement...";
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

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
        
        const msg = endpoint.includes('register') ? "Compte créé avec succès !" : "Connexion réussie !";
        showSuccessModal(msg);

    } catch (err) {
        console.error(err);
        if(errorElem) {
            errorElem.textContent = err.message;
            errorElem.style.color = "#ff6b6b";
        } else {
            alert(err.message);
        }
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
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
    
    const display = document.getElementById('profile-name-display');
    const btn = document.getElementById('btn-profile');
    
    if (display) display.textContent = "Connexion";
    if (btn) {
        btn.classList.remove('logged-in');
        const avatar = btn.querySelector('.avatar');
        if(avatar) avatar.textContent = "👤";
    }

    showSuccessModal("Vous êtes déconnecté.");

    print('rechargement de la page après déconnexion');
    
    setTimeout(() => location.reload(), 0);
}