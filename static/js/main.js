import { elements } from "./dom.js";
import { state } from "./state.js";
import { addHistoryMessage, setRoomInfo } from "./ui.js";
import { addEntry, renderHistory, renderScoreboard } from "./rendering.js";
import { openWebsocket } from "./websocket.js";

elements.createRoomBtn.addEventListener("click", async () => {
    const playerName = elements.playerNameInput.value.trim();
    if (!playerName) {
        addHistoryMessage("Choisissez un pseudo pour créer une room");
        return;
    }

    const mode = elements.modeSelect.value;
    const res = await fetch(`/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_name: playerName, mode })
    });

    const data = await res.json();
    if (!res.ok) {
        addHistoryMessage(data.message || "Impossible de créer la room");
        return;
    }

    state.currentRoomId = data.room_id;
    state.currentMode = data.mode;
    state.roomLocked = false;
    elements.roomIdInput.value = data.room_id;
    state.entries = [];
    renderHistory();
    renderScoreboard(data.scoreboard || []);
    setRoomInfo(`Room ${data.room_id} (${data.mode}) créée.`);
    openWebsocket(playerName);
});

elements.joinRoomBtn.addEventListener("click", () => {
    const playerName = elements.playerNameInput.value.trim();
    const roomId = elements.roomIdInput.value.trim();
    if (!playerName || !roomId) {
        addHistoryMessage("Pseudo et ID de room requis pour rejoindre");
        return;
    }
    state.currentRoomId = roomId;
    openWebsocket(playerName);
});

elements.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentRoomId) {
        addHistoryMessage("Rejoignez ou créez une room avant de jouer");
        return;
    }

    if (state.roomLocked && state.currentMode === "race") {
        addHistoryMessage("La course est terminée dans cette room.");
        return;
    }

    const word = elements.input.value.trim().toLowerCase();
    const playerName = elements.playerNameInput.value.trim();
    if (!word || !playerName) return;

    const res = await fetch(`/rooms/${state.currentRoomId}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, player_name: playerName })
    });

    const data = await res.json();
    if (!res.ok) {
        addHistoryMessage(data.message || data.error || "Erreur lors de la proposition");
        elements.input.value = "";
        return;
    }

    if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
        addEntry({
            word,
            temp: data.temperature ?? null,
            progression: data.progression ?? 0,
            player_name: playerName,
        });
        renderScoreboard(data.scoreboard || []);
    }

    if (data.locked) {
        state.roomLocked = true;
    }

    elements.input.value = "";
});
