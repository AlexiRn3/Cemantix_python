// static/js/router.js

document.addEventListener('click', (e) => {
    // On détecte le clic sur un lien <a>
    const link = e.target.closest('a');
    
    // Si c'est un lien interne (pas externe comme GitHub)
    if (link && link.href.startsWith(window.location.origin) && !link.getAttribute('target')) {
        e.preventDefault(); // On bloque le rechargement normal
        navigateTo(link.href);
    }
});

// Gestion du bouton "Précédent" du navigateur
window.addEventListener('popstate', () => {
    loadPage(window.location.href, false);
});

// Fonction principale de navigation
async function navigateTo(url) {
    history.pushState(null, null, url); // Change l'URL dans la barre d'adresse
    await loadPage(url);
}

async function loadPage(url) {
    try {
        // 1. On récupère le contenu de la page cible
        const response = await fetch(url);
        const text = await response.text();
        
        // 2. On convertit le texte en HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        // 3. On remplace le contenu de #app-content par celui de la nouvelle page
        const newContent = doc.getElementById('app-content').innerHTML;
        document.getElementById('app-content').innerHTML = newContent;
        document.title = doc.title; // Mise à jour du titre de l'onglet

        // 4. On relance la logique de l'application (le JS du jeu)
        if (window.initApp) {
            window.initApp(); 
        }

        // 5. Gestion de la musique pour le HUB
        // (Pour les jeux, c'est main.js qui s'en occupe via le WebSocket)
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            if (window.musicManager) {
                window.musicManager.setContext({ gameType: 'hub' });
            }
        }

    } catch (error) {
        console.error("Erreur de navigation :", error);
        window.location.href = url; // Fallback : rechargement normal si erreur
    }
}

// Rendre la fonction navigateTo accessible globalement (pour les boutons onclick)
window.navigateTo = navigateTo;