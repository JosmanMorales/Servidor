# ── Imagen base: Nginx Alpine (muy ligera) ───────────────────────────────────
FROM nginx:alpine

LABEL maintainer="Equipo Robot Oruga - SO2"
LABEL description="Frontend Dashboard - Nginx"

# Copiar configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos estáticos del dashboard
COPY index.html /usr/share/nginx/html/index.html

# Puerto expuesto
EXPOSE 80

# Nginx arranca automáticamente con el CMD por defecto de la imagen base
