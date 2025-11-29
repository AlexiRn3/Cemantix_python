// --- Utils ---
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const playerName = params.get("player");
let gameState = { type: null, locked: false };

if (!roomId || !playerName) {
    window.location.href = "/";
}

document.getElementById("display-room-id").textContent = roomId;

// --- WebSocket ---
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${window.location.host}/rooms/${roomId}/ws?player_name=${encodeURIComponent(playerName)}`);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === "state_sync") {
        initGameUI(data);
        renderHistory(data.history);
        renderScoreboard(data.scoreboard);
    } 
    else if (data.type === "guess") {
        addHistoryEntry(data);
    }
    else if (data.type === "scoreboard_update") {
        renderScoreboard(data.scoreboard);
    }
    else if (data.type === "victory") {
        document.getElementById("messages").textContent = `🎉 ${data.winner} a trouvé le mot !`;
        confetti();
        gameState.locked = true;
    }
};

// --- UI Logic ---
function initGameUI(data) {
    gameState.type = data.game_type;
    gameState.locked = data.locked;
    
    // Titre
    const titles = { "cemantix": "Cémantix", "definition": "Dictionnario" };
    document.getElementById("game-title").textContent = titles[data.game_type] || "Jeu";

    // Instructions
    if (data.game_type === "definition") {
        document.getElementById("game-instruction").style.display = "block";
        document.getElementById("definition-text").textContent = `"${data.public_state.hint}"`;
        document.getElementById("hint-text").textContent = `Le mot fait ${data.public_state.word_length} lettres.`;
        document.getElementById("legend-panel").style.display = "none"; // Pas besoin de légende thermique
    } else {
        // Légende Cemantix
        document.getElementById("legend-content").innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px"><span>💥</span> <span>Top 1000</span></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px"><span>🥵</span> <span>Proche</span></div>
            <div style="display:flex; justify-content:space-between;"><span>❄️</span> <span>Loin</span></div>
        `;
    }
}

function renderScoreboard(players) {
    const div = document.getElementById("scoreboard");
    div.innerHTML = players.map(p => `
        <div class="score-row">
            <span class="score-name">${p.player_name}</span>
            <span>${p.attempts} essais</span>
        </div>
    `).join("");
}

function addHistoryEntry(entry) {
    const container = document.getElementById("history");
    const div = document.createElement("div");
    div.className = `line ${entry.game_type === 'definition' && entry.feedback === 'Correct !' ? 'win' : ''}`;
    
    // Contenu différent selon le jeu
    let metaHtml = "";
    let barHtml = "";
    
    if (entry.game_type === "cemantix") {
        const icon = getIcon(entry.progression);
        metaHtml = `<div class="meta">${icon} ${entry.temperature}°C</div>`;
        barHtml = `<div class="score-bar"><div class="fill" style="width:${entry.progression/10}%"></div></div>`;
    } else {
        // Dictionnario
        metaHtml = `<div class="meta">${entry.feedback || "-"}</div>`;
    }

    div.innerHTML = `
        <div style="font-weight:bold; color:#64748b;">#</div>
        <div class="word">${entry.word} <span style="font-size:0.8em; opacity:0.6">(${entry.player_name})</span></div>
        ${metaHtml}
        ${barHtml}
    `;
    
    container.prepend(div);
}

function renderHistory(history) {
    document.getElementById("history").innerHTML = "";
    // On doit rajouter le game_type dans l'historique s'il n'y est pas, 
    // ou utiliser le global. Ici on suppose que le format est compatible.
    history.forEach(h => {
        h.game_type = gameState.type; // Force le type actuel
        addHistoryEntry(h);
    });
}

function getIcon(val) {
    if (val >= 990) return "💥";
    if (val >= 900) return "🥵";
    if (val >= 500) return "🔥";
    return "❄️";
}

// --- Interaction ---
document.getElementById("guess-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (gameState.locked) return;
    
    const input = document.getElementById("word-input");
    const word = input.value.trim();
    if (!word) return;

    input.value = "";
    
    await fetch(`/rooms/${roomId}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, player_name: playerName })
    });
});