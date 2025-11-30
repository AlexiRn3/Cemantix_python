const PLAYLIST_PATH = "/music/Playlist.md";

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
let currentGameType = null;
let currentMode = null;
let currentDuration = null;

function parseDataJson(value) {
    if (!value) return {};
    try {
        return JSON.parse(value);
    } catch (err) {
        console.warn("Configuration musique invalide :", err);
        return {};
    }
}

function parsePlaylistMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const data = {};
    let currentSection = null;
    let currentSub = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith("# ")) {
            currentSection = line.slice(2).toLowerCase();
            data[currentSection] = data[currentSection] || {};
            currentSub = null;
            continue;
        }

        if (line.startsWith("## ")) {
            currentSub = line.slice(3).toLowerCase();
            data[currentSection] = data[currentSection] || {};
            data[currentSection][currentSub] = data[currentSection][currentSub] || null;
            continue;
        }

        if (line.startsWith("http")) {
            if (currentSection && currentSub) {
                data[currentSection][currentSub] = line;
            } else if (currentSection) {
                data[currentSection] = line;
            }
        }
    }

    return data;
}

function mapPlaylistToConfig(playlist) {
    if (!playlist || typeof playlist !== "object") return null;

    const normalizeSeconds = (label) => {
        const match = label.match(/(\d+)/);
        if (!match) return null;
        const minutes = parseInt(match[1], 10);
        return Number.isFinite(minutes) ? String(minutes * 60) : null;
    };

    const config = {
        defaultTrack: typeof playlist.hub === "string" ? playlist.hub : null,
        modeTracks: {},
        gameTracks: {},
        gameModeTracks: {},
        gameDurationTracks: {},
    };

    // Dictionnary / Definition (coop & blitz)
    const dictionnary = playlist.dictionnary || playlist.dictionnario || {};
    if (typeof dictionnary === "object") {
        if (dictionnary.coop) config.modeTracks.coop = dictionnary.coop;
        if (dictionnary.blitz) config.modeTracks.blitz = dictionnary.blitz;
        if (!config.gameTracks.definition && dictionnary.coop) {
            config.gameTracks.definition = dictionnary.coop;
        }
    }

    // Cémantix
    if (playlist.cemantics || playlist.cemantix) {
        config.gameTracks.cemantix = playlist.cemantics || playlist.cemantix;
    }

    // Pendu
    if (playlist.pendu) {
        config.gameTracks.hangman = playlist.pendu;
    }

    // Intrus (durée en minutes)
    const intrus = playlist.intrus || playlist["l'intrus"] || {};
    if (typeof intrus === "object") {
        config.gameDurationTracks.intruder = {};
        Object.entries(intrus).forEach(([label, url]) => {
            const durationKey = normalizeSeconds(label);
            if (durationKey && url) {
                config.gameDurationTracks.intruder[durationKey] = url;
            }
        });
        // Choisir une piste par défaut pour l'intrus si aucune durée ne correspond
        const firstIntrusTrack = Object.values(config.gameDurationTracks.intruder)[0];
        if (firstIntrusTrack) {
            config.gameTracks.intruder = firstIntrusTrack;
        }
    }

    return config;
}

function buildPlayerSrc(url, autoPlay = false) {
    if (!url) return "";
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
    if (!toggleIcon) return;
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
    console.log(url);
    if (!url) {
        console.warn("Aucune piste de musique définie pour ce contexte.");
        return;
    }

    if (!playerFrame) return;
    playerFrame.src = buildPlayerSrc(url, autoPlay);
    widget = window.SC.Widget(playerFrame);
    bindWidgetEvents(widget);
}

function resolveTrackUrl(config, gameType, mode, durationKey) {
    const { defaultTrack, modeTracks, gameTracks, gameModeTracks, gameDurationTracks } = config;

    if (durationKey && gameDurationTracks[gameType] && gameDurationTracks[gameType][durationKey]) {
        return gameDurationTracks[gameType][durationKey];
    }

    if (gameModeTracks[gameType] && gameModeTracks[gameType][mode]) {
        return gameModeTracks[gameType][mode];
    }

    if (modeTracks[mode]) {
        return modeTracks[mode];
    }

    if (gameTracks[gameType]) {
        return gameTracks[gameType];
    }

    return defaultTrack;
}

function buildDatasetConfig() {
    const dataset = playerFrame ? playerFrame.dataset : {};
    const defaultTrack = dataset.soundUrl || dataset.defaultTrack || null;

    return {
        defaultTrack,
        modeTracks: parseDataJson(dataset.modeTracks),
        gameTracks: parseDataJson(dataset.gameTracks),
        gameModeTracks: parseDataJson(dataset.gameModeTracks),
        gameDurationTracks: parseDataJson(dataset.gameDurationTracks),
        autoPlay: dataset.autoplay === "true"
    };
}

function mergeConfigs(base, override) {
    if (!override) return base;

    const mergeNested = (src = {}, add = {}) => {
        const merged = { ...src };
        Object.entries(add).forEach(([key, value]) => {
            merged[key] = { ...(src[key] || {}), ...(value || {}) };
        });
        return merged;
    };

    return {
        defaultTrack: override.defaultTrack || base.defaultTrack,
        autoPlay: typeof override.autoPlay === "boolean" ? override.autoPlay : base.autoPlay,
        modeTracks: { ...base.modeTracks, ...override.modeTracks },
        gameTracks: { ...base.gameTracks, ...override.gameTracks },
        gameModeTracks: mergeNested(base.gameModeTracks, override.gameModeTracks),
        gameDurationTracks: mergeNested(base.gameDurationTracks, override.gameDurationTracks),
    };
}

async function fetchPlaylistConfig() {
    try {
        const response = await fetch(PLAYLIST_PATH, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const markdown = await response.text();
        const parsed = parsePlaylistMarkdown(markdown);
        return mapPlaylistToConfig(parsed);
    } catch (err) {
        console.warn("Impossible de charger la playlist depuis music/Playlist.md :", err);
        return null;
    }
}

function chooseFallbackTrack(config) {
    const candidates = [
        config.defaultTrack,
        ...Object.values(config.modeTracks || {}),
        ...Object.values(config.gameTracks || {}),
    ];
    return candidates.find(Boolean) || null;
}

async function init() {
    if (!playerFrame || !toggleButton || !toggleIcon) return;

    updateIcon();

    const datasetConfig = buildDatasetConfig();
    const playlistConfig = await fetchPlaylistConfig();
    const config = mergeConfigs(datasetConfig, playlistConfig);

    if (!config.defaultTrack) {
        config.defaultTrack = chooseFallbackTrack(config);
    }

    widgetApiReady.then(() => {
        if (!window.SC || !window.SC.Widget) {
            console.warn("L'API SoundCloud n'est pas disponible.");
            return;
        }

        currentGameType = playerFrame.dataset.currentGame || null;
        currentMode = playerFrame.dataset.currentMode || null;
        currentDuration = playerFrame.dataset.currentDuration || null;
        const durationKey = currentDuration ? String(currentDuration) : null;

        const initialTrack = resolveTrackUrl(config, currentGameType, currentMode, durationKey);
        loadSoundtrack(initialTrack, config.autoPlay);

        toggleButton.addEventListener("click", () => {
            if (!widget) return;
            widget.toggle();
        });

        window.musicManager = {
            setContext({ gameType = currentGameType, mode = currentMode, duration = currentDuration, autoPlay = false } = {}) {
                currentGameType = gameType;
                currentMode = mode;
                currentDuration = duration;
                const durationKey = duration ? String(duration) : null;
                const targetUrl = resolveTrackUrl(config, currentGameType, currentMode, durationKey);
                if (targetUrl) {
                    loadSoundtrack(targetUrl, autoPlay);
                }
            },
            setMode(mode, autoPlay = false) {
                this.setContext({ mode, autoPlay });
            },
            setTracks(newConfig = {}) {
                const mergeNested = (target = {}, incoming = {}) => {
                    const result = { ...target };
                    Object.entries(incoming).forEach(([key, value]) => {
                        result[key] = { ...(target[key] || {}), ...(value || {}) };
                    });
                    return result;
                };

                config.modeTracks = { ...config.modeTracks, ...(newConfig.modeTracks || {}) };
                config.gameTracks = { ...config.gameTracks, ...(newConfig.gameTracks || {}) };
                config.gameModeTracks = mergeNested(config.gameModeTracks, newConfig.gameModeTracks || {});
                config.gameDurationTracks = mergeNested(config.gameDurationTracks, newConfig.gameDurationTracks || {});
                if (newConfig.defaultTrack) config.defaultTrack = newConfig.defaultTrack;
                const durationKey = currentDuration ? String(currentDuration) : null;
                const refreshedUrl = resolveTrackUrl(config, currentGameType, currentMode, durationKey);
                if (refreshedUrl) {
                    loadSoundtrack(refreshedUrl, false);
                }
            },
        };
    });
}

if (document.readyState !== "loading") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}
