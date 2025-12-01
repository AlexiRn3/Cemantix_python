import { elements } from "./dom.js";

let messageTimeout;

export function addHistoryMessage(text, duration = 0) {
    if (!elements.messages) return;
    
    // Annule le timer précédent s'il y en a un (pour ne pas effacer le nouveau message trop vite)
    if (messageTimeout) clearTimeout(messageTimeout);

    elements.messages.innerHTML = "";
    
    const msg = document.createElement("div");
    msg.className = "log";
    msg.textContent = text;
    elements.messages.appendChild(msg);

    // Si une durée est précisée, on efface après X millisecondes
    if (duration > 0) {
        messageTimeout = setTimeout(() => {
            elements.messages.innerHTML = ""; // Efface le message
            messageTimeout = null;
        }, duration);
    }
}

export function setRoomInfo(text) {
    if (!elements.roomInfo) return;
    elements.roomInfo.textContent = text;
}

export function showModal(title, contentHTML, isVictory = false) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    const iconEl = document.getElementById('modal-icon'); // Peut être absent (null) sur le Hub
    const actionsDiv = document.getElementById('modal-actions');

    if (!overlay) return;

    // Mise à jour du texte
    if (titleEl) titleEl.textContent = title;
    if (contentEl) contentEl.innerHTML = contentHTML;

    // --- CORRECTION DU BUG ICI ---
    // On vérifie que iconEl existe avant de toucher à son style
    if (iconEl) {
        if (isVictory) {
            iconEl.style.display = "block";
            iconEl.textContent = "🏆";
        } else {
            iconEl.style.display = "none";
        }
    }
    // -----------------------------

    // Gestion des boutons par défaut (pour éviter qu'ils ne manquent si on ne personnalise pas)
    if (!isVictory && actionsDiv) {
        actionsDiv.innerHTML = `<button id="modal-close-btn" class="btn">Fermer</button>`;
        const closeBtn = document.getElementById('modal-close-btn');
        if (closeBtn) closeBtn.onclick = closeModal;
    }

    overlay.classList.add('active');
}

export function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

// --- FIX TOUCHE ENTREE ---
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('modal-overlay');
    
    if (e.key === "Enter" && overlay && overlay.classList.contains('active')) {
        e.preventDefault(); 
        e.stopPropagation(); 
        
        // On cherche d'abord le bouton rejouer, sinon le bouton fermer
        const replayBtn = document.getElementById('btn-replay');
        const closeBtn = document.getElementById('modal-close-btn');
        
        const targetBtn = replayBtn || closeBtn;

        if (targetBtn && !targetBtn.disabled) {
            targetBtn.click();
        }
    }
});