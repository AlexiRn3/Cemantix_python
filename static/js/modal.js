import { currentUser } from "./main";
import { showModal, closeModal } from "./ui.js";

import { STORAGE_KEY } from "./main.js";

window.openLoginModal = function() {
    const isInGame = window.location.pathname === "/game";
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    const actionsEl = document.getElementById('modal-actions') || document.querySelector('.modal-actions');

    if (!overlay || !actionsEl) return;

    let htmlContent = '';
    let buttonsHtml = '';

    if (isInGame) {
        // Mode Jeu : Verrouillé
        htmlContent = `
            <div style="margin-bottom: 20px;">
                <p>Vous êtes connecté en tant que :</p>
                <input type="text" value="${currentUser}" disabled style="margin-top:15px; text-align:center; opacity:0.7;">
                <p class="locked-message">🔒 Pseudo verrouillé en partie.</p>
            </div>`;
        buttonsHtml = `
            <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
                <button class="btn" onclick="closeModal()">Fermer</button>
                <button class="btn btn-danger" onclick="logout()">Se déconnecter & Quitter</button>
            </div>`;
    } else {
        // Mode Hub : Modifiable
        htmlContent = `
            <div style="margin-bottom: 20px;">
                <p>Votre pseudo pour la session :</p>
                <input type="text" id="login-pseudo" value="${currentUser}" placeholder="Pseudo..." style="margin-top:15px; text-align:center;">
            </div>`;
        const logoutBtn = currentUser ? `<button class="btn btn-danger" onclick="logout()">Se déconnecter</button>` : '';
        buttonsHtml = `
            <div style="display:flex; flex-direction:column; gap:15px; width:100%;">
                <button class="btn" onclick="saveSessionPseudo()">Valider</button>
                ${logoutBtn}
                <button class="btn btn-outline" onclick="closeModal()">Fermer</button> </div>`;
    }

    titleEl.textContent = "PROFIL";
    contentEl.innerHTML = htmlContent;
    actionsEl.innerHTML = buttonsHtml;
    overlay.classList.add('active');

    if (!isInGame) {
        setTimeout(() => {
            const input = document.getElementById('login-pseudo');
            if (input) {
                input.focus();
                input.onkeydown = (e) => { if(e.key === "Enter") saveSessionPseudo(); };
            }
        }, 100);
    }
};

window.saveSessionPseudo = function() {
    const input = document.getElementById('login-pseudo');
    const newName = input.value.trim();
    if (newName) {
        currentUser = newName;
        localStorage.setItem(STORAGE_KEY, currentUser);
        updateSessionUI();
        const hubInput = document.getElementById('player-name');
        if (hubInput) hubInput.value = currentUser;
        
        // AJOUT ICI : On vérifie si ce nouveau pseudo a déjà gagné aujourd'hui
        checkDailyVictory(); 
        
        closeModal();
    } else {
        input.classList.add('error-shake');
        setTimeout(() => input.classList.remove('error-shake'), 500);
    }
};


function closeConfigModal() {
    document.getElementById('config-modal').classList.remove('active');
}

function openBugModal() {
    const currentUser = localStorage.getItem("arcade_user_pseudo") || "Anonyme"; 
    
    const htmlContent = `
        <div class="bug-form" style="text-align:left;">
            <p style="margin-bottom:10px;">Oups ! Quelque chose ne va pas ? Décrivez le problème :</p>
            <textarea id="bug-desc" placeholder="Ex: Le jeu plante quand je clique sur..."></textarea>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">
                Signalé par : <strong>${currentUser}</strong>
            </p>
        </div>
    `;

    // CORRECTION : On appelle directement la fonction importée, sans "window."
    showModal("SIGNALER UN BUG", htmlContent);
    
    // Remplacement des boutons de la modale
    const actionsDiv = document.getElementById('modal-actions');
    if (actionsDiv) {
        actionsDiv.innerHTML = `
            <div style="display: flex; gap: 10px; justify-content: center; width: 100%;">
                <button id="btn-submit-bug" class="btn btn-danger">Envoyer</button>
                <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
            </div>
        `;
    }

    const submitBtn = document.getElementById('btn-submit-bug');
        if (submitBtn) {
            submitBtn.onclick = function() {
                sendBugReport(currentUser);
            };
        }
    
    // Focus automatique sur la zone de texte
    setTimeout(() => {
        const txt = document.getElementById('bug-desc');
        if(txt) txt.focus();
    }, 100);
}

window.sendBugReport = async function(player) {
    const descInput = document.getElementById('bug-desc');
    const description = descInput.value.trim();
    
    if (!description) {
        descInput.style.borderColor = "red";
        return;
    }

    // Bouton chargement
    const btn = document.querySelector('#modal-actions .btn-danger');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Envoi...";
    }

    // Détection du contexte (Hub ou Room ID)
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    const context = roomId ? `Room ${roomId}` : "Hub Principal";

    try {
        const res = await fetch('/report-bug', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                player_name: player,
                description: description,
                context: context
            })
        });

        if (res.ok) {
            // Confirmation visuelle réutilisant la modale
            const modalContent = document.getElementById('modal-content');
            if(modalContent) modalContent.innerHTML = `<div style="color:var(--success); font-size:1.2rem; margin:20px 0;">✅ Message envoyé aux développeurs !</div>`;
            
            // Fermeture auto après 2s
            setTimeout(() => {
                if(window.closeModal) window.closeModal();
            }, 1500);
        } else {
            alert("Erreur lors de l'envoi.");
            if(window.closeModal) window.closeModal();
        }
    } catch (e) {
        console.error(e);
        alert("Erreur réseau.");
        if(window.closeModal) window.closeModal();
    }
};

function injectBugButton() {
    // Vérifie si le bouton existe déjà pour éviter les doublons
    if (document.getElementById('bug-trigger')) return;

    const btn = document.createElement('button');
    btn.id = 'bug-trigger';
    btn.className = 'bug-float-btn';
    btn.innerHTML = '🐛';
    btn.title = "Signaler un bug";
    btn.onclick = openBugModal;
    
    document.body.appendChild(btn);
}

window.logout = function() {
    localStorage.removeItem(STORAGE_KEY);
    currentUser = "";
    updateSessionUI();
    const nameInput = document.getElementById('player-name');
    if (nameInput) nameInput.value = "";
    
    if (window.location.pathname === "/game") {
        window.location.href = "/";
    } else {
        closeModal();
    }
};

document.addEventListener("DOMContentLoaded", () => {
    injectBugButton();
});