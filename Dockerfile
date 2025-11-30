FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y wget && apt-get clean

# Copie du code
COPY app.py .
COPY core/ core/
COPY static/ static/
COPY requirements.txt .
COPY music/ music/

# Téléchargement du modèle
RUN mkdir -p model && \
    wget -O model/frWac.bin \
    https://embeddings.net/embeddings/frWac_no_postag_no_phrase_700_skip_cut50.bin

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "app.py"]
