import { setCurrentUser, logout as sessionLogout } from "./session.js";
import { state } from "./state.js";
import { showModal } from "./ui.js";
import { openLoginModal } from "./modal.js"; 

document.addEventListener('DOMContentLoaded', () => {
    const isAdmin = localStorage.getItem("is_admin");
    console.log("Statut Admin au démarrage :", isAdmin);
    
    if (isAdmin === "true") {
        injectAdminButton();
    }

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
                if(errorElem) {
                    errorElem.textContent = "Pseudo invalide : 3-20 caractères, lettres, chiffres, - et _ uniquement.";
                    errorElem.style.color = "#ff6b6b";
                }
                usernameInput.classList.add('error-shake');
                setTimeout(() => usernameInput.classList.remove('error-shake'), 500);
                return;
            }
            await performAuth('/auth/register', { username, password }, 'register-error');
        });
    }
});

function injectAdminButton() {
    if (document.getElementById('admin-btn-panel')) return;

    const target = document.querySelector('.user-controls'); 
    
    if (target) {
        const btn = document.createElement('button');
        btn.id = 'admin-btn-panel';
        btn.className = 'btn btn-outline'; 
        btn.style.marginRight = '10px';
        btn.innerHTML = '🛠️';
        btn.title = "Panel Admin";
        btn.onclick = () => window.location.href = '/static/admin_panel.html';
    
        target.insertBefore(btn, target.firstChild);
        console.log("Bouton Admin inséré.");
    } else {
        console.warn("Impossible de trouver .user-controls pour insérer le bouton admin.");
    }
}

window.switchAuthTab = function(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    if (tab === 'login') {
        if(loginForm) loginForm.style.display = 'block';
        if(registerForm) registerForm.style.display = 'none';
        if(tabLogin) tabLogin.classList.add('active');
        if(tabRegister) tabRegister.classList.remove('active');
    } else {
        if(loginForm) loginForm.style.display = 'none';
        if(registerForm) registerForm.style.display = 'block';
        if(tabLogin) tabLogin.classList.remove('active');
        if(tabRegister) tabRegister.classList.add('active');
    }
};

function showSuccessModal(message) {
    const modal = document.getElementById('success-modal');
    if (!modal) {
        alert(message);
        return;
    }
    
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

async function performAuth(endpoint, data, errorId) {
    console.log(`Authentification vers ${endpoint}...`);
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

        console.log("Statut réponse:", response.status);

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Le serveur renvoie du HTML au lieu de JSON (Erreur 500 probable).");
        }

        const result = await response.json();
        console.log("🔍 RÉPONSE JSON REÇUE :", result);

        if (!response.ok) {
            throw new Error(result.detail || "Erreur inconnue");
        }

        localStorage.setItem('access_token', result.access_token);
        setCurrentUser(result.username); 

        // --- DEBUG DE LA VALEUR ADMIN ---
        console.log("Valeur is_admin brute :", result.is_admin);
        
        // On accepte true (booléen) ou "true" (chaine) ou 1 (int)
        if (result.is_admin === true || result.is_admin === "true" || result.is_admin === 1) {
            console.log("✅ Admin détecté ! Sauvegarde dans localStorage.");
            localStorage.setItem("is_admin", "true");
            if (typeof injectAdminButton === "function") injectAdminButton();
        } else {
            console.log("❌ Pas admin. Valeur reçue :", result.is_admin);
            localStorage.removeItem("is_admin");
        }
        
        const authModal = document.getElementById('auth-modal');
        if(authModal) authModal.classList.remove('active');
        
        const msg = endpoint.includes('register') ? "Compte créé !" : "Connexion réussie !";
        showSuccessModal(msg);

        window.location.reload();

    } catch (err) {
        console.error("ERREUR AUTH :", err);
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