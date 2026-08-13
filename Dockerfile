FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
ENV HOME=/home/user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

COPY auth-service/requirements.txt /tmp/req-auth.txt
RUN sed -i 's/\r$//' /tmp/req-auth.txt && pip install --no-cache-dir -r /tmp/req-auth.txt

COPY user-service/requirements.txt /tmp/req-user.txt
RUN sed -i 's/\r$//' /tmp/req-user.txt && pip install --no-cache-dir -r /tmp/req-user.txt

COPY search-service/requirements.txt /tmp/req-search.txt
RUN sed -i 's/\r$//' /tmp/req-search.txt && pip install --no-cache-dir -r /tmp/req-search.txt

COPY api-gateway/requirements.txt /tmp/req-gateway.txt
RUN sed -i 's/\r$//' /tmp/req-gateway.txt && pip install --no-cache-dir -r /tmp/req-gateway.txt

RUN rm -f /tmp/req-*.txt

COPY auth-service/ /app/auth-service/
COPY user-service/ /app/user-service/
COPY search-service/ /app/search-service/
COPY api-gateway/ /app/api-gateway/

ARG FRONTEND_BUILD_VERSION=9.0
COPY frontend/ /usr/share/nginx/html/

COPY nginx-hf.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN rm -f /etc/nginx/sites-enabled/default \
    && find /app -type f \( -name "*.py" -o -name "*.txt" -o -name "*.conf" \) -exec sed -i 's/\r$//' {} + \
    && sed -i 's/\r$//' /etc/nginx/nginx.conf \
    && sed -i 's/\r$//' /etc/supervisor/conf.d/supervisord.conf

RUN mkdir -p /home/user/data/auth \
    && mkdir -p /home/user/data/search \
    && mkdir -p /var/log/supervisor \
    && mkdir -p /var/lib/nginx \
    && mkdir -p /var/log/nginx \
    && mkdir -p /tmp/nginx \
    && chown -R user:user /app \
    && chown -R user:user /home/user/data \
    && chown -R user:user /var/log/supervisor \
    && chown -R user:user /var/lib/nginx \
    && chown -R user:user /var/log/nginx \
    && chown -R user:user /tmp/nginx \
    && chown -R user:user /usr/share/nginx/html \
    && chown -R user:user /etc/nginx \
    && chown -R user:user /run

ENV AUTH_DB_DIR="/home/user/data/auth"
ENV CHROMA_PERSIST_DIR="/home/user/data/search"

ENV MAIL_USERNAME=""
ENV MAIL_PASSWORD=""
ENV MAIL_FROM=""
ENV MAIL_PORT=587
ENV MAIL_SERVER="smtp.gmail.com"
ENV MAIL_FROM_NAME="Onyx Note"
ENV MAIL_STARTTLS="True"
ENV MAIL_SSL_TLS="False"
ENV GOOGLE_CLIENT_ID=""
ENV GOOGLE_CLIENT_SECRET=""
ENV GOOGLE_REDIRECT_URI=""
ENV FRONTEND_URL=""

EXPOSE 7860

USER user

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
