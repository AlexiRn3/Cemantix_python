import { elements } from "./dom.js";

export function addHistoryMessage(text) {
    if (!elements.messages) return;
    elements.messages.innerHTML = "";

    const msg = document.createElement("div");
    msg.className = "log";
    msg.textContent = text;

    elements.messages.appendChild(msg);
}

export function setRoomInfo(text) {
    if (!elements.roomInfo) return;
    elements.roomInfo.textContent = text;
}
