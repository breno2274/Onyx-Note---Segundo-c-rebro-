# Usa um mini-Linux já com o Python instalado
FROM python:3.12-slim

# Cria uma pasta de trabalho lá dentro
WORKDIR /app

# Copia a lista de ingredientes (bibliotecas) e instala-os
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o seu código (main.py) lá para dentro
COPY . .

# O comando mágico para ligar o servidor na porta 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]