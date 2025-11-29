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
    const actionsDiv = document.getElementById('modal-actions'); // On cible le conteneur

    if (!overlay) return;

    titleEl.textContent = title;
    contentEl.innerHTML = contentHTML;

    if (isVictory) {
        iconEl.style.display = "block";
        iconEl.textContent = "🏆";
        // NOTE : On laisse main.js gérer les boutons spécifiques de victoire
    } else {
        iconEl.style.display = "none";
        
        // Pour une erreur standard, on remet proprement le bouton Fermer par défaut
        // Cela "nettoie" les boutons Rejouer/Hub s'ils étaient là avant
        actionsDiv.innerHTML = `<button id="modal-close-btn" class="btn">Fermer</button>`;
        document.getElementById('modal-close-btn').onclick = closeModal;
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