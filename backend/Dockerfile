# ── Etapa base ──────────────────────────────────────────────────────────────
FROM node:20-alpine

# Metadata
LABEL maintainer="Equipo Robot Oruga - SO2"
LABEL description="Backend Node.js - Log de eventos"

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar manifiestos primero (aprovecha caché de capas de Docker)
COPY package*.json ./

# Instalar dependencias de producción únicamente
RUN npm install --omit=dev

# Copiar el resto del código fuente
COPY . .

# Puerto expuesto (debe coincidir con el PORT en server.js)
EXPOSE 3000

# Comando de inicio
CMD ["node", "server.js"]
