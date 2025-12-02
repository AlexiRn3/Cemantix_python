# Cemantix Python

## Installation

Installez les dépendances Python nécessaires via :

```bash
pip install -r requirements.txt
```

Assurez-vous de disposer du modèle `frWac_no_postag_no_phrase_700_skip_cut50.bin` dans un dossier `model/` à la racine du projet, conformément au chemin utilisé dans `app.py`.
https://embeddings.net/embeddings/frWac_no_postag_no_phrase_700_skip_cut50.bin

## Démarrage de l'application

Après installation des dépendances et ajout du modèle, lancez l'API avec :

```bash
uvicorn app:app --host 0.0.0.0 --port 1256
```

L'application expose une interface web servie depuis le dossier `static/`.

## Consultation sécurisée des logs

Une page dédiée permet de consulter les rapports enregistrés dans `bugs.log` :

- Rendez-vous sur `/logs` dans votre navigateur.
- Saisissez le mot de passe administrateur pour charger les 200 dernières lignes du journal.

> **Important :** définissez le mot de passe via la variable d'environnement `ADMIN_LOG_PASSWORD` (ou dans un fichier `.env` ignoré par git). Sans ce secret externe, la page affichera une erreur et l'accès restera bloqué.
