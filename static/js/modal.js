import { showModal, closeModal } from "./ui.js";
import { state } from "./state.js";

// C'est cette fonction qui est appelée quand on clique sur le bouton "Connexion"
export async function openLoginModal() {
    // 1. Si on est sur le Hub (pas en jeu) et pas connecté -> Ouvrir le modal d'auth classique
    const authModal = document.getElementById('auth-modal');
    if (authModal && !state.currentUser) {
        authModal.classList.add('active');
        if (window.switchAuthTab) window.switchAuthTab('login');
        return;
    }

    // 2. Si on est connecté (Hub ou Jeu), on affiche le PROFIL STATISTIQUES
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    const actionsEl = document.getElementById('modal-actions');

    if (!overlay) return;

    // Affiche un chargement
    titleEl.textContent = `PROFIL DE ${state.currentUser.toUpperCase()}`;
    contentEl.innerHTML = '<div style="padding:20px;">Chargement des statistiques...</div>';
    overlay.classList.add('active');

    try {
        // Appel API
        const res = await fetch(`/users/${state.currentUser}/stats`);
        
        let statsHtml = '';
        
        if (res.ok) {
            const data = await res.json();
            statsHtml = `
                <div class="stats-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; text-align:center; margin-bottom:20px;">
                    <div style="background:#f8f9fa; padding:15px; border-radius:12px; border:1px solid #eee;">
                        <div style="font-size:2rem;">🎮</div>
                        <div style="font-weight:bold; font-size:1.2rem; color:var(--text-main);">${data.games_played}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">Parties Jouées</div>
                    </div>
                    
                    <div style="background:#fff3cd; padding:15px; border-radius:12px; border:1px solid #ffeeba;">
                        <div style="font-size:2rem;">📅</div>
                        <div style="font-weight:bold; font-size:1.2rem; color:#856404;">${data.daily_wins}</div>
                        <div style="font-size:0.8rem; color:#856404;">Défis Validés</div>
                    </div>

                    <div style="background:#d4edda; padding:15px; border-radius:12px; border:1px solid #c3e6cb;">
                        <div style="font-size:2rem;">🔥</div>
                        <div style="font-weight:bold; font-size:1.2rem; color:#155724;">${data.cemantix_wins}</div>
                        <div style="font-size:0.8rem; color:#155724;">Victoires Cémantix</div>
                    </div>

                    <div style="background:#f8d7da; padding:15px; border-radius:12px; border:1px solid #f5c6cb;">
                        <div style="font-size:2rem;">🏳️</div>
                        <div style="font-weight:bold; font-size:1.2rem; color:#721c24;">${data.cemantix_surrenders}</div>
                        <div style="font-size:0.8rem; color:#721c24;">Abandons</div>
                    </div>
                </div>
                <div style="text-align:center; font-size:0.9rem; color:var(--text-muted); font-style:italic;">
                    Victoires Pendu : ${data.hangman_wins}
                </div>
            `;
        } else {
            statsHtml = `<p style="color:red;">Impossible de charger les statistiques.</p>`;
        }

        contentEl.innerHTML = statsHtml;

        const isInGame = window.location.pathname.includes("/game");
        
        let buttonsHtml = '';
        if (isInGame) {
             buttonsHtml = `<button class="btn" onclick="closeModal()">Fermer</button>`;
        } else {
             buttonsHtml = `
                <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
                    <button class="btn" onclick="closeModal()">Fermer</button>
                    <button class="btn btn-danger" onclick="logout()">Se déconnecter</button>
                </div>`;
        }
        
        actionsEl.innerHTML = buttonsHtml;

    } catch (e) {
        console.error(e);
        contentEl.innerHTML = '<p>Erreur réseau.</p>';
    }
}

export function closeConfigModal() {
    const modal = document.getElementById('config-modal');
    if (modal) modal.classList.remove('active');
}

// --- Gestion des Bugs (Rien ne change ici) ---
export function openBugModal() {
    const htmlContent = `
        <div class="bug-form" style="text-align:left;">
            <p style="margin-bottom:10px;">Oups ! Quelque chose ne va pas ? Décrivez le problème :</p>
            <textarea id="bug-desc" placeholder="Ex: Le jeu plante quand je clique sur..."></textarea>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">
                Signalé par : <strong>${state.currentUser || "Anonyme"}</strong>
            </p>
        </div>
    `;

    showModal("SIGNALER UN BUG", htmlContent);
    
    const actionsDiv = document.getElementById('modal-actions');
    if (actionsDiv) {
        actionsDiv.innerHTML = `
            <div style="display: flex; gap: 10px; justify-content: center; width: 100%;">
                <button id="btn-submit-bug" class="btn btn-danger">Envoyer</button>
                <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
            </div>
        `;
    }

    // Attachement de l'événement au nouveau bouton créé
    setTimeout(() => {
        const submitBtn = document.getElementById('btn-submit-bug');
        if (submitBtn) {
            submitBtn.onclick = function() {
                sendBugReport(state.currentUser || "Anonyme");
            };
        }
        const txt = document.getElementById('bug-desc');
        if(txt) txt.focus();
    }, 50);
}

export async function sendBugReport(player) {
    const descInput = document.getElementById('bug-desc');
    const description = descInput.value.trim();
    
    if (!description) {
        descInput.style.borderColor = "red";
        return;
    }

    const btn = document.getElementById('btn-submit-bug');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Envoi...";
    }

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
            const modalContent = document.getElementById('modal-content');
            if(modalContent) modalContent.innerHTML = `<div style="color:var(--success); font-size:1.2rem; margin:20px 0;">✅ Message envoyé !</div>`;
            setTimeout(() => { if(window.closeModal) window.closeModal(); }, 1500);
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

export function injectBugButton() {
    if (document.getElementById('bug-trigger')) return;
    const btn = document.createElement('button');
    btn.id = 'bug-trigger';
    btn.className = 'bug-float-btn';
    btn.innerHTML = '🐛';
    btn.title = "Signaler un bug";
    btn.onclick = openBugModal;
    document.body.appendChild(btn);
}

// Initialisation globale
document.addEventListener("DOMContentLoaded", () => {
    injectBugButton();
});

// Exposition pour le HTML (onclick)
window.openLoginModal = openLoginModal;
window.closeModal = closeModal;