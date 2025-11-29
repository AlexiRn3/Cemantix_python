# Cemantix Python

## Installation

Installez les dépendances Python nécessaires via :

```bash
pip install -r requirements.txt
```

Assurez-vous de disposer du modèle `frWac_no_postag_phrase_500_cbow_cut10_stripped.bin` dans un dossier `model/` à la racine du projet, conformément au chemin utilisé dans `app.py`.
https://embeddings.net/embeddings/frWac_no_postag_phrase_500_cbow_cut10.bin
## Démarrage de l'application

Après installation des dépendances et ajout du modèle, lancez l'API avec :

```bash
uvicorn app:app --host 0.0.0.0 --port 1256
```

L'application expose une interface web servie depuis le dossier `static/`.

Metionner https://fauconnier.github.io/