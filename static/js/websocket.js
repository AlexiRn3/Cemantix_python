import { state } from "./state.js";
import { addEntry, renderHistory, renderScoreboard, triggerConfetti, updateRoomStatus } from "./rendering.js";
import { addHistoryMessage, setRoomInfo, showModal } from "./ui.js";
import { addChatMessage } from "./chat_ui.js";
import { initGameUI, performGameReset, updateHangmanUI, startTimer, updateMusicContext, handleDefeat, handleBlitzSuccess, updateResetStatus } from "./game_logic.js";
import { handleVictory } from "./victory.js";

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

function initGameConnection(roomId, playerName) {
    if(document.getElementById("display-room-id")) {
        document.getElementById("display-room-id").textContent = roomId;
    }

    setRoomInfo(`Connexion à la Room ${roomId}...`);

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/rooms/${roomId}/ws?player_name=${encodeURIComponent(playerName)}`;
    
    // Fermeture propre de l'ancien socket s'il existe
    if (state.websocket) {
        state.websocket.close();
    }

    const ws = new WebSocket(wsUrl);
    state.websocket = ws; 

    ws.onopen = () => { console.log("WS Connecté"); };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            showModal("Erreur", data.message || "Erreur inconnue");
            return;
        }

        switch (data.type) {
            case "state_sync":
                initGameUI(data);
                renderHistory(data.history || []);
                renderScoreboard(data.scoreboard || []);
                state.currentMode = data.mode;
                state.roomLocked = data.locked;
                if (data.mode === "blitz" && data.end_time) startTimer(data.end_time);
                updateMusicContext(data.game_type, data.mode, data.duration);
                
                // On met à jour le statut maintenant que la connexion est confirmée
                setRoomInfo(`${roomId} • ${data.mode === 'race' ? 'Course' : 'Coop'}`); 

                if (data.history && Array.isArray(data.history)) {
                    state.entries = data.history.map(entry => ({
                        ...entry,
                        temp: entry.temperature
                    })).reverse();
                    renderHistory();
                }

                if (data.chat_history) {
                    data.chat_history.forEach(msg => addChatMessage(msg.player_name, msg.content));
                }
                break;

            case "guess":
                addEntry({
                    word: data.word,
                    temp: data.temperature,
                    progression: data.progression,
                    player_name: data.player_name,
                    feedback: data.feedback,
                    game_type: data.game_type
                });
                if (data.team_score !== undefined) {
                    const scoreEl = document.getElementById('score-display');
                    if (scoreEl) scoreEl.textContent = data.team_score;
                }
                // Mise à jour Pendu
                if (data.game_type === "hangman") updateHangmanUI(data);
                // Défaite
                if (data.defeat) handleDefeat(data);
                break;

            case "scoreboard_update":
                renderScoreboard(data.scoreboard || []);
                state.roomLocked = data.locked;
                if (data.victory && data.winner) handleVictory(data.winner, data.scoreboard);
                break;

            case "victory": // Fallback
                handleVictory(data.winner, state.scoreboard || []);
                break;

            case "chat_message":
                addChatMessage(data.player_name, data.content);
                break;
                
            case "game_reset":
                performGameReset(data);
                break;
                
            case "reset_update":
                updateResetStatus(data);
                break;
        }

        if (data.blitz_success) handleBlitzSuccess(data);
    };

    ws.onclose = () => { setRoomInfo("Déconnecté"); };
}
