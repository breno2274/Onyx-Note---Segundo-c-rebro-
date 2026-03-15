FROM nginx:alpine

# Remover config padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copiar a nossa config
COPY nginx.conf /etc/nginx/conf.d/

# Copiar ficheiros estáticos do frontend
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
