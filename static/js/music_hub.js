let musicEnabled = false;
const music = document.getElementById("bg-music");
const toggle = document.getElementById("music-toggle");
const icon = document.getElementById("music-icon");

// Volume de fond (0.0 → 1.0)
music.volume = 0.25;

// Chrome bloque l’autoplay : on active au clic
toggle.addEventListener("click", () => {
    if (!musicEnabled) {
        music.play();
        icon.textContent = "🔈";
        musicEnabled = true;
    } else {
        music.pause();
        icon.textContent = "🔊";
        musicEnabled = false;
    }
});