import { elements } from "./dom.js";

export function addHistoryMessage(text) {
    if (!elements.messages) return;
    elements.messages.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "log";
    msg.textContent = text;
    elements.messages.appendChild(msg);
}

export function setRoomInfo(text) {
    if (!elements.roomInfo) return;
    elements.roomInfo.textContent = text;
}

export function showModal(title, contentHTML, isVictory = false) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    const iconEl = document.getElementById('modal-icon');
    const closeBtn = document.getElementById('modal-close-btn');

    if (!overlay) return;

    titleEl.textContent = title;
    contentEl.innerHTML = contentHTML;

    if (isVictory) {
        iconEl.style.display = "block";
        iconEl.textContent = "🏆";
        // Le comportement du bouton sera écrasé par handleVictory dans main.js
    } else {
        iconEl.style.display = "none";
        closeBtn.textContent = "Continuer";
        closeBtn.onclick = closeModal;
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
    
    // Si Entrée est pressée ET que la modale est visible
    if (e.key === "Enter" && overlay && overlay.classList.contains('active')) {
        // On empêche absolument le formulaire derrière de s'activer
        e.preventDefault(); 
        e.stopPropagation(); 
        
        const closeBtn = document.getElementById('modal-close-btn');
        // On clique sur le bouton seulement s'il n'est pas désactivé (cas "En attente...")
        if (closeBtn && !closeBtn.disabled) {
            closeBtn.click();
        }
    }
});