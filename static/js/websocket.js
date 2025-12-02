import { state } from "./state.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti, updateRoomStatus } from "./rendering.js";
import { addHistoryMessage, setRoomInfo } from "./ui.js";
import { addChatMessage } from "./chat_ui.js";

export function openWebsocket(playerName) {
    if (!state.currentRoomId) return;

    if (state.websocket) {
        state.websocket.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    state.websocket = new WebSocket(`${protocol}://${window.location.host}/rooms/${state.currentRoomId}/ws?player_name=${encodeURIComponent(playerName)}`);

    state.websocket.onopen = () => {
        setRoomInfo(`Connecté à la room ${state.currentRoomId} (${state.currentMode})`);
    };

    state.websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            addHistoryMessage(data.message || data.error);
            return;
        }

        switch (data.type) {
            case "state_sync":
                state.entries = (data.history || []).map(entry => ({
                    word: entry.word,
                    temp: entry.temperature,
                    progression: entry.progression,
                    player_name: entry.player_name,
                }));
                state.currentMode = data.mode;
                state.roomLocked = data.locked;
                renderHistory();
                renderScoreboard(data.scoreboard || []);
                setRoomInfo(`Room ${state.currentRoomId} (${state.currentMode}) prête.`);
                const chatHistory = data.chat_history || [];
                chatHistory.forEach(msg => addChatMessage(msg.player_name, msg.content));
                break;
            case "guess":
                addEntry({
                    word: data.word,
                    temp: data.temperature,
                    progression: data.progression,
                    player_name: data.player_name,
                });
                break;
            case "scoreboard_update":
                renderScoreboard(data.scoreboard || []);
                state.currentMode = data.mode || state.currentMode;
                state.roomLocked = data.locked;
                if (data.victory && data.winner) {
                    const label = state.currentMode === "race" ? "a gagné la course" : "a trouvé le mot";
                    addHistoryMessage(`🎉 ${data.winner} ${label} !`);
                    triggerConfetti();
                }
                updateRoomStatus();
                break;
            case "victory":
                addHistoryMessage(`🎉 ${data.player_name} a trouvé le mot !`);
                state.roomLocked = true;
                triggerConfetti();
                updateRoomStatus();
                break;
            case "chat_message":
                addChatMessage(data.player_name, data.content);
                break;
            default:
                break;
        }
    };

    state.websocket.onclose = () => {
        setRoomInfo("Déconnecté");
    };
}
