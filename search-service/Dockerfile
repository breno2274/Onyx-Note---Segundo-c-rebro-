FROM python:3.12-slim

WORKDIR /app

# Instalar dependências do sistema para o ChromaDB
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Criar diretório para persistência do ChromaDB
RUN mkdir -p /app/chroma_data

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
