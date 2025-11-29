import { elements } from "./dom.js";

// --- Gestion des Messages Log ---
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

// --- NOUVEAU : Gestion des Modales ---
export function showModal(title, contentHTML, isVictory = false) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    const iconEl = document.getElementById('modal-icon');
    const closeBtn = document.getElementById('modal-close-btn');

    if (!overlay) return;

    titleEl.textContent = title;
    contentEl.innerHTML = contentHTML; // On autorise le HTML pour le tableau des scores

    if (isVictory) {
        iconEl.style.display = "block";
        iconEl.textContent = "🏆";
        closeBtn.textContent = "Rejouer (Retour Hub)";
        closeBtn.onclick = () => window.location.href = "/";
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