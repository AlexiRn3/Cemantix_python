import { state } from "./state.js";
import { elements } from "./dom.js";
import currentUser from "./main.js";

export function initChat() {
    const chatForm = document.getElementById("chat-form");
    
    window.toggleChat = function() {
        const chat = document.getElementById("chat-container");
        const icon = document.getElementById("chat-toggle-icon");
        if(chat) {
            chat.classList.toggle("collapsed");
            if(icon) icon.textContent = chat.classList.contains("collapsed") ? "▲" : "▼";
        }
    };

    if (chatForm) {
        chatForm.addEventListener("submit", function(e) {
            e.preventDefault(); 
            const input = document.getElementById("chat-input");
            const text = input.value.trim();
            if (text && state.websocket && state.websocket.readyState === WebSocket.OPEN) {
                state.websocket.send(JSON.stringify({
                    type: "chat",
                    content: text
                }));
                input.value = "";
            }
        });
    }
}

window.toggleChat = function() {
    const chat = document.getElementById("chat-container");
    const icon = document.getElementById("chat-toggle-icon");
    
    if (chat) {
        chat.classList.toggle("collapsed");
        // Change la flèche selon l'état
        if (icon) {
            icon.textContent = chat.classList.contains("collapsed") ? "▲" : "▼";
        }
    }
};

export function addChatMessage(player, content) {
    const container = document.getElementById("chat-messages");
    if (!container) return;
    const div = document.createElement("div");
    const isMe = player === currentUser; 
    div.className = `chat-msg ${isMe ? 'me' : 'others'}`;
    div.innerHTML = `<strong>${player}</strong> ${content}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight; 
}

const chatForm = document.getElementById("chat-form");
if (chatForm) {
    chatForm.addEventListener("submit", function(e) {
        e.preventDefault(); 
        const input = document.getElementById("chat-input");
        const text = input.value.trim();
        if (text && state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            state.websocket.send(JSON.stringify({
                type: "chat",
                content: text
            }));
            input.value = "";
        }
    });
}

window.toggleChat = function() {
    const chat = document.getElementById("chat-container");
    const icon = document.getElementById("chat-toggle-icon");
    
    if (chat) {
        chat.classList.toggle("collapsed");
        if (icon) {
            icon.textContent = chat.classList.contains("collapsed") ? "▲" : "▼";
        }
    }
};
