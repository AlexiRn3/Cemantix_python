const SOUNDTRACK_URL = "https://soundcloud.com/monstercat/sets/monstercat-instinct-vol-1";

const toggleButton = document.getElementById("music-toggle");
const toggleIcon = document.getElementById("music-icon");

const playerFrame = document.getElementById("sc-player");

const widgetApiReady = new Promise((resolve) => {
    if (window.SC && window.SC.Widget) {
        resolve();
        return;
    }

    const apiScript = document.querySelector('script[src*="player/api.js"]');
    if (apiScript) {
        apiScript.addEventListener("load", () => resolve());
    } else {
        resolve();
    }
});

let widget = null;
let isPlaying = false;

function buildPlayerSrc(url, autoPlay = false) {
    const base = "https://w.soundcloud.com/player/";
    const params = new URLSearchParams({
        url,
        auto_play: autoPlay,
        hide_related: true,
        show_comments: false,
        show_user: false,
        show_reposts: false,
        visual: false,
    });

    return `${base}?${params.toString()}`;
}

function updateIcon() {
    toggleIcon.textContent = isPlaying ? "🔈" : "🔊";
}

function bindWidgetEvents(currentWidget) {
    currentWidget.bind(window.SC.Widget.Events.PLAY, () => {
        isPlaying = true;
        updateIcon();
    });

    currentWidget.bind(window.SC.Widget.Events.PAUSE, () => {
        isPlaying = false;
        updateIcon();
    });

    currentWidget.bind(window.SC.Widget.Events.FINISH, () => {
        isPlaying = false;
        updateIcon();
    });
}

function loadSoundtrack(url, autoPlay = false) {

    playerFrame.src = buildPlayerSrc(url, autoPlay);
    widget = window.SC.Widget(playerFrame);
    bindWidgetEvents(widget);
}

function init() {
    widgetApiReady.then(() => {
        if (!window.SC || !window.SC.Widget) {
            console.warn("L'API SoundCloud n'est pas disponible.");
            return;
        }

        loadSoundtrack(SOUNDTRACK_URL, false);

        toggleButton.addEventListener("click", () => {
            if (!widget) return;
            widget.toggle();
        });
    });
}

if (document.readyState !== "loading") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}
