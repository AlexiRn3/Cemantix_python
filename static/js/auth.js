document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('auth-modal');
    const btnLogin = document.getElementById('edit-username'); // Le bouton en haut à droite
    const btnClose = document.querySelector('.close-modal');
    
    // Vérifier si déjà connecté
    checkAuthStatus();

    // Ouvrir la modale
    if(btnLogin) {
        btnLogin.addEventListener('click', () => {
            modal.style.display = "block";
        });
    }

    // Fermer la modale
    if(btnClose) {
        btnClose.addEventListener('click', () => {
            modal.style.display = "none";
        });
    }

    // Gestion du formulaire Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        await performAuth('/auth/login', { username, password }, 'login-error');
    });

    // Gestion du formulaire Inscription
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        
        await performAuth('/auth/register', { username, password }, 'register-error');
    });
});

// Fonction pour changer d'onglet
function switchAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabs = document.querySelectorAll('.tab-btn');

    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

// Fonction générique d'appel API
async function performAuth(endpoint, data, errorId) {
    const errorElem = document.getElementById(errorId);
    errorElem.textContent = "";
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Erreur inconnue");
        }

        // Succès : On stocke le token et le pseudo
        localStorage.setItem('access_token', result.access_token);
        localStorage.setItem('username', result.username);

        // Mise à jour de l'interface
        updateUI(result.username);
        document.getElementById('auth-modal').style.display = "none";
        
        // Optionnel : Recharger la page pour rafraîchir les connexions sockets avec le bon token
        // location.reload(); 

    } catch (err) {
        errorElem.textContent = err.message;
    }
}

function checkAuthStatus() {
    const token = localStorage.getItem('access_token');
    const username = localStorage.getItem('username');
    if (token && username) {
        updateUI(username);
    }
}

function updateUI(username) {
    const btn = document.getElementById('edit-username');
    if(btn) {
        // Change le texte du bouton et ajoute une option de déconnexion si tu veux
        btn.innerHTML = `👤 ${username}`;
        // Tu pourrais ajouter un bouton logout ici ou modifier le comportement du clic
    }
}