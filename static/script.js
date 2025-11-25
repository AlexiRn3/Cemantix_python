const form = document.getElementById("form");
const input = document.getElementById("word");
const history = document.getElementById("history");

let entries = []; // stockage interne avant affichage

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let word = input.value.trim().toLowerCase();
    if (!word) return;

     if (entries.some(e => e.word === word)) {
    addHistoryMessage(`Mot déjà proposé : ${word}`);
    input.value = "";
    return;
}

    const res = await fetch(`/guess?word=${word}`, { method: "POST" });
    const data = await res.json();

    let entry;

    if (data.exists) {

        entry = {
            word,
            temp: data.temperature,
            progression: Math.round(data.similarity * 1000),
        };
    }

    if (!entries.some(e => e.word === word)) {
    entries.push(entry);
    }
    renderHistory(); // TRI + ANIMATION

    // gestion des messages & confettis
    if (data.exists && data.similarity >= 0.99) {
        triggerConfetti();
        addHistoryMessage(`🎉 BINGO ! Mot trouvé : ${word}`);
    } else if (data.exists) {
        addHistoryMessage(`🔥 ${word} → ${data.temperature} °C`);
    } else {
        addHistoryMessage(`❓ ${word} inconnu`);
    }

    input.value = "";
});

/* ---------- AFFICHAGE AVEC TRI ---------- */

function renderHistory() {
    history.innerHTML = "";

    // Tri décroissant par température
    entries.sort((a, b) => {
        const ta = a.temp ?? -9999;
        const tb = b.temp ?? -9999;
        return tb - ta;
    });

    let index = 1;
    for (const e of entries) {
        const row = document.createElement("div");
        row.className = "line";

       const num = `<div class="num">${index}&nbsp;</div>`;

        const word = `<div class="word">${e.word}</div>`;

        if (e.temp === null) {
            row.innerHTML = `
                ${num}
                ${word}
                <div class="icon">❓</div>
                <div class="temp">—</div>
                <div class="bar"><div class="fill"></div></div>
            `;
        } else {
            row.innerHTML = `
                ${num}
                ${word}
                <div class="icon">${getIcon(e.progression)}</div>
                <div class="temp">${e.temp}°C</div>
                <div class="bar"><div class="fill"></div></div>
            `;
        }

        history.appendChild(row);

        // ANIMATION → après insertion (fixe l’erreur fill=null)
        if (e.progression !== null) {
            animateBar(row.querySelector(".fill"), e.progression);
        }

        index++;
    }
}

/* ----------- ANIMATION DOUCE DE LA BARRE ----------- */

function animateBar(fillElement, progression) {
    if (!fillElement) return;

    const target = progression / 10; // 0 à 100 %
    let width = 0;

    fillElement.style.background = getColor(progression);

    const timer = setInterval(() => {
        width += 2;
        fillElement.style.width = width + "%";

        if (width >= target) {
            clearInterval(timer);
            fillElement.style.width = target + "%"; // final
        }
    }, 10);
}

/* ---------- ICONES / COULEURS ---------- */

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

/* ---------- CONFETTIS ---------- */

function triggerConfetti() {
    confetti({
        particleCount: 900,
        spread: 100,
        origin: { y: 0.6 }
    });
}

/* ---------- MESSAGES D’INFO ---------- */

function addHistoryMessage(text) {
    const messages = document.getElementById("messages");
    messages.innerHTML = "";  // efface les anciens messages

    const msg = document.createElement("div");
    msg.className = "log";
    msg.textContent = text;

    messages.appendChild(msg); // affiche uniquement le dernier
}
