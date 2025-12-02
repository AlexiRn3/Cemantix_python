import { verifierPseudo  } from "./session.js";
import { state } from "./state.js";
import { showModal } from "./ui.js";

export async function createGame(type, mode = 'coop', duration = 0) {
    if (!verifierPseudo()) return;
    
    const nameInput = document.getElementById('player-name');
    let name = nameInput ? nameInput.value : state.currentUser;
    if(!name && state.currentUser) name = state.currentUser;
    
    const res = await fetch('/rooms', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ player_name: name, game_type: type, mode: mode, duration: duration })
    });
    if (!res.ok) {
        const errorData = await res.json();
        showModal("Erreur de création de partie", errorData.message || "Erreur inconnue lors de la création de la room.");
        return;
    }
    const data = await res.json();
    window.location.href = `/game?room=${data.room_id}&player=${encodeURIComponent(name)}`;
};