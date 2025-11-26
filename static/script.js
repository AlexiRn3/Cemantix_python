const form = document.getElementById("form");
const input = document.getElementById("word");
const history = document.getElementById("history");
const scoreboard = document.getElementById("scoreboard");
const roomInfo = document.getElementById("room-info");
const createRoomBtn = document.getElementById("create-room");
const joinRoomBtn = document.getElementById("join-room");
const roomIdInput = document.getElementById("room-id-input");
const playerNameInput = document.getElementById("player-name");
const modeSelect = document.getElementById("mode-select");

let entries = [];
let currentRoomId = null;
let currentMode = "coop";
let roomLocked = false;
let websocket = null;

createRoomBtn.addEventListener("click", async () => {
    const playerName = playerNameInput.value.trim();
    if (!playerName) {
        addHistoryMessage("Choisissez un pseudo pour créer une room");
        return;
    }

    const mode = modeSelect.value;
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

    currentRoomId = data.room_id;
    currentMode = data.mode;
    roomIdInput.value = data.room_id;
    entries = [];
    renderHistory();
    renderScoreboard(data.scoreboard || []);
    setRoomInfo(`Room ${data.room_id} (${data.mode}) créée.`);
    openWebsocket(playerName);
});

joinRoomBtn.addEventListener("click", () => {
    const playerName = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    if (!playerName || !roomId) {
        addHistoryMessage("Pseudo et ID de room requis pour rejoindre");
        return;
    }
    currentRoomId = roomId;
    openWebsocket(playerName);
});

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentRoomId) {
        addHistoryMessage("Rejoignez ou créez une room avant de jouer");
        return;
    }

    if (roomLocked && currentMode === "race") {
        addHistoryMessage("La course est terminée dans cette room.");
        return;
    }

    const word = input.value.trim().toLowerCase();
    const playerName = playerNameInput.value.trim();
    if (!word || !playerName) return;

    const res = await fetch(`/rooms/${currentRoomId}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, player_name: playerName })
    });

    const data = await res.json();
    if (!res.ok) {
        addHistoryMessage(data.message || data.error || "Erreur lors de la proposition");
        input.value = "";
        return;
    }

    // Fallback si la websocket n'est pas connectée
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        addEntry({
            word,
            temp: data.temperature ?? null,
            progression: data.progression ?? 0,
            player_name: playerName,
        });
        renderScoreboard(data.scoreboard || []);
    }

    if (data.locked) {
        roomLocked = true;
    }

    input.value = "";
});

function openWebsocket(playerName) {
    if (!currentRoomId) return;

    if (websocket) {
        websocket.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    websocket = new WebSocket(`${protocol}://${window.location.host}/rooms/${currentRoomId}/ws?player_name=${encodeURIComponent(playerName)}`);

    websocket.onopen = () => {
        setRoomInfo(`Connecté à la room ${currentRoomId} (${currentMode})`);
    };

    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            addHistoryMessage(data.message || data.error);
            return;
        }

        switch (data.type) {
            case "state_sync":
                entries = (data.history || []).map(entry => ({
                    word: entry.word,
                    temp: entry.temperature,
                    progression: entry.progression,
                    player_name: entry.player_name,
                }));
                currentMode = data.mode;
                roomLocked = data.locked;
                renderHistory();
                renderScoreboard(data.scoreboard || []);
                setRoomInfo(`Room ${currentRoomId} (${currentMode}) prête.`);
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
                currentMode = data.mode || currentMode;
                roomLocked = data.locked;
                if (data.victory && data.winner) {
                    const label = currentMode === "race" ? "a gagné la course" : "a trouvé le mot";
                    addHistoryMessage(`🎉 ${data.winner} ${label} !`);
                    triggerConfetti();
                }
                updateRoomStatus();
                break;
            case "victory":
                addHistoryMessage(`🎉 ${data.player_name} a trouvé le mot !`);
                roomLocked = true;
                triggerConfetti();
                updateRoomStatus();
                break;
            default:
                break;
        }
    };

    websocket.onclose = () => {
        setRoomInfo("Déconnecté");
    };
}

function addEntry(entry) {
    entries.push(entry);
    renderHistory();
}

function renderHistory() {
    history.innerHTML = "";

    entries.sort((a, b) => (b.progression ?? 0) - (a.progression ?? 0));

    let index = 1;
    for (const e of entries) {
        const row = document.createElement("div");
        row.className = "line";

        const num = `<div class="num">${index}&nbsp;</div>`;
        const word = `<div class="word">${e.word}</div>`;
        const player = `<div class="player">${e.player_name || "?"}</div>`;

        if (e.temp === null || e.temp === undefined) {
            row.innerHTML = `
                ${num}
                ${player}
                ${word}
                <div class="icon">❓</div>
                <div class="temp">—</div>
                <div class="bar"><div class="fill"></div></div>
            `;
        } else {
            row.innerHTML = `
                ${num}
                ${player}
                ${word}
                <div class="icon">${getIcon(e.progression)}</div>
                <div class="temp">${e.temp}°C</div>
                <div class="bar"><div class="fill"></div></div>
            `;
        }

        history.appendChild(row);

        if (e.progression !== null && e.progression !== undefined) {
            animateBar(row.querySelector(".fill"), e.progression);
        }

        index++;
    }
}

function renderScoreboard(data) {
    scoreboard.innerHTML = "";
    const table = document.createElement("div");
    table.className = "scoreboard-table";

    const header = document.createElement("div");
    header.className = "scoreboard-row header";
    header.innerHTML = `
        <div>Joueur</div>
        <div>Essais</div>
        <div>Meilleure similitude</div>
    `;
    table.appendChild(header);

    for (const entry of data) {
        const row = document.createElement("div");
        row.className = "scoreboard-row";
        row.innerHTML = `
            <div>${entry.player_name}</div>
            <div>${entry.attempts}</div>
            <div>${Math.round((entry.best_similarity || 0) * 100)}%</div>
        `;
        table.appendChild(row);
    }

    scoreboard.appendChild(table);
    updateRoomStatus();
}

function updateRoomStatus() {
    if (!currentRoomId) {
        setRoomInfo("Aucune room active");
        return;
    }
    const status = roomLocked && currentMode === "race" ? "(verrouillée)" : "";
    setRoomInfo(`Room ${currentRoomId} — mode ${currentMode} ${status}`);
}

function animateBar(fillElement, progression) {
    if (!fillElement) return;
    const target = progression / 10;
    let width = 0;

    fillElement.style.background = getColor(progression);

    const timer = setInterval(() => {
        width += 2;
        fillElement.style.width = width + "%";

        if (width >= target) {
            clearInterval(timer);
            fillElement.style.width = target + "%";
        }
    }, 10);
}

function getIcon(value) {
    if (value >= 900) return "💥";
    if (value >= 500) return "🔥";
    if (value >= 200) return "🙂";
    if (value >= 50) return "😐";
    return "🥶";
}

function getColor(value) {
    if (value >= 900) return "#ff0000";
    if (value >= 700) return "#ff6d00";
    if (value >= 500) return "#ffae00";
    if (value >= 200) return "#ffee00";
    if (value >= 50) return "#7ac6ff";
    return "#4da3ff";
}

function triggerConfetti() {
    confetti({
        particleCount: 900,
        spread: 100,
        origin: { y: 0.6 }
    });
}

function addHistoryMessage(text) {
    const messages = document.getElementById("messages");
    messages.innerHTML = "";

    const msg = document.createElement("div");
    msg.className = "log";
    msg.textContent = text;

    messages.appendChild(msg);
}

function setRoomInfo(text) {
    if (!roomInfo) return;
    roomInfo.textContent = text;
}