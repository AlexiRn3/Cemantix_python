import { state } from "./state.js";
import { elements } from "./dom.js";
import { setRoomInfo } from "./ui.js";

export function addEntry(entry) {
    state.entries.push(entry);
    renderHistory();
}

export function renderHistory() {
    elements.history.innerHTML = "";

    state.entries.sort((a, b) => (b.progression ?? 0) - (a.progression ?? 0));

    let index = 1;
    for (const entry of state.entries) {
        const row = document.createElement("div");
        row.className = "line";

        const num = `<div class=\"num\">${index}&nbsp;</div>`;
        const word = `<div class=\"word\">${entry.word}</div>`;
        const player = `<div class=\"player\">${entry.player_name || "?"}</div>`;

        if (entry.temp === null || entry.temp === undefined) {
            row.innerHTML = `
                ${num}
                ${player}
                ${word}
                <div class=\"icon\">❓</div>
                <div class=\"temp\">—</div>
                <div class=\"bar\"><div class=\"fill\"></div></div>
            `;
        } else {
            row.innerHTML = `
                ${num}
                ${player}
                ${word}
                <div class=\"icon\">${getIcon(entry.progression)}</div>
                <div class=\"temp\">${entry.temp}°C</div>
                <div class=\"bar\"><div class=\"fill\"></div></div>
            `;
        }

        elements.history.appendChild(row);

        if (entry.progression !== null && entry.progression !== undefined) {
            animateBar(row.querySelector(".fill"), entry.progression);
        }

        index++;
    }
}

export function renderScoreboard(data) {
    elements.scoreboard.innerHTML = "";
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

    elements.scoreboard.appendChild(table);
    updateRoomStatus();
}

export function updateRoomStatus() {
    if (!state.currentRoomId) {
        setRoomInfo("Aucune room active");
        return;
    }
    const status = state.roomLocked && state.currentMode === "race" ? "(verrouillée)" : "";
    setRoomInfo(`Room ${state.currentRoomId} — mode ${state.currentMode} ${status}`);
}

export function triggerConfetti() {
    confetti({
        particleCount: 900,
        spread: 100,
        origin: { y: 0.6 }
    });
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
