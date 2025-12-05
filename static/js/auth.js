import { setCurrentUser, logout as sessionLogout } from "./session.js";
import { state } from "./state.js";
import { showModal } from "./ui.js";
import { openLoginModal } from "./modal.js"; 

document.addEventListener('DOMContentLoaded', () => {
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

    // Vérification au chargement de la page
    if (localStorage.getItem("is_admin") === "true") {
        injectAdminButton();
    }

    if (btnProfile) {
        btnProfile.addEventListener('click', (e) => {
            e.preventDefault();
            openLoginModal();
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            logout();
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
            const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
            
            if (!usernameRegex.test(username)) {
                errorElem.textContent = "Pseudo invalide : 3-20 caractères, lettres, chiffres, - et _ uniquement.";
                errorElem.style.color = "#ff6b6b";
                usernameInput.classList.add('error-shake');
                setTimeout(() => usernameInput.classList.remove('error-shake'), 500);
                return; 
            }
            await performAuth('/auth/register', { username, password }, 'register-error');
        });
    }
});

// --- FONCTION D'INJECTION CORRIGÉE ---
function injectAdminButton() {
    if (document.getElementById('admin-btn-panel')) return; // Déjà là ?

    // On cible .user-controls qui existe sur TOUTES les pages (Hub et Jeu)
    const target = document.querySelector('.user-controls'); 
    
    if (target) {
        const btn = document.createElement('button');
        btn.id = 'admin-btn-panel';
        btn.className = 'btn btn-outline'; // Style existant
        btn.style.marginRight = '10px';    // Espace avec le bouton profil
        btn.innerHTML = '🛠️ Admin';       // Icône + Texte
        btn.onclick = () => window.location.href = '/static/admin_panel.html';
        
        // On l'ajoute AVANT le bouton de profil (premier élément)
        target.insertBefore(btn, target.firstChild);
    }
}

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
    if (!modal) { alert(message); return; }
    
    let msgElement = document.getElementById('success-message');
    if (!msgElement && modal) {
        modal.innerHTML = `<div class="modal-content" style="background:white; padding:20px; border-radius:10px; text-align:center;">
            <h3 style="color:var(--success)">${message}</h3>
        </div>`;
    } else if (msgElement) {
        msgElement.textContent = message;
    }

    modal.classList.add('active');
    setTimeout(() => { modal.classList.remove('active'); }, 2000);
}

// --- FONCTION DE CONNEXION CORRIGÉE ---
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
            throw new Error("Le serveur est indisponible (Erreur 503).");
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Erreur inconnue");
        }

        localStorage.setItem('access_token', result.access_token);
        setCurrentUser(result.username); 

        // --- CORRECTION DE LA DÉTECTION ---
        if (result.is_admin === true) {
            console.log("Admin détecté !");
            localStorage.setItem("is_admin", "true");
            injectAdminButton();
        } else {
            localStorage.removeItem("is_admin");
        }
        
        const authModal = document.getElementById('auth-modal');
        if(authModal) authModal.classList.remove('active');
        
        const msg = endpoint.includes('register') ? "Compte créé !" : "Connexion réussie !";
        showSuccessModal(msg);

        // --- RECHARGEMENT UNIQUEMENT EN CAS DE SUCCÈS ---
        setTimeout(() => location.reload(), 500);

    } catch (err) {
        console.error(err);
        if(errorElem) {
            errorElem.textContent = err.message;
            errorElem.style.color = "#ff6b6b";
        } else {
            alert(err.message);
        }
        // Pas de reload ici pour laisser l'utilisateur lire l'erreur
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
    localStorage.removeItem('is_admin'); // On nettoie le statut admin aussi
    
    const display = document.getElementById('profile-name-display');
    const btn = document.getElementById('btn-profile');
    
    if (display) display.textContent = "Connexion";
    if (btn) {
        btn.classList.remove('logged-in');
        const avatar = btn.querySelector('.avatar');
        if(avatar) avatar.textContent = "👤";
    }

    showSuccessModal("Vous êtes déconnecté.");
    setTimeout(() => location.reload(), 500);
}