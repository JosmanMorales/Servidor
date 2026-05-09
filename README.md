# 🤖 Robot Oruga — Sistema de Monitoreo de Eventos
**Universidad Mariano Gálvez — Centro Universitario de Chimaltenango**  
**Curso:** Sistemas Operativos II | **Proyecto Final**

---

## 📡 Servidor en producción

> Reemplaza esta línea con la IP pública de tu Droplet una vez desplegado.

**IP Pública:** `http://TU_IP_DROPLET`  
**Dashboard:** `http://TU_IP_DROPLET` (puerto 80)  
**API Backend:** `http://TU_IP_DROPLET/api`

---

## 🏗️ Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────┐
│               DROPLET DIGITALOCEAN (Ubuntu)              │
│                                                         │
│  ┌─────────────┐   proxy   ┌──────────────┐            │
│  │  Frontend   │──────────▶│   Backend    │            │
│  │  (Nginx)    │  /api/    │  (Node.js)   │            │
│  │  Puerto 80  │  /socket  │  Puerto 3000 │            │
│  └─────────────┘           └──────┬───────┘            │
│         ▲                         │ mongoose            │
│         │                  ┌──────▼───────┐            │
│    HTTP/WS                 │   MongoDB    │            │
│         │                  │  Puerto 27017│            │
│         │                  └──────────────┘            │
└─────────┼───────────────────────────────────────────────┘
          │ Puerto 80 (público)
    ┌─────┴──────┐
    │  Navegador │  (Dashboard)
    └────────────┘
          
┌─────────────────────────┐
│   Arduino Nano          │
│   (robot_oruga_v2.ino)  │        POST /api/log
│                         │───────────────────────▶ Backend
│   Serial (9600 baud)    │
│         ▲               │◀─────────────────────── Backend
└─────────┼───────────────┘        GET /api/comando
          │ Serial
┌─────────┴───────────────┐
│   ESP8266 / ESP32       │
│   (robot_wifi.ino)      │
│   WiFi → HTTP           │
└─────────────────────────┘
```

### Flujo de comunicación

1. El **Arduino Nano** genera logs JSON y los imprime por `Serial.println()`.
2. El **ESP8266/ESP32** lee esos logs por Serial y los envía por WiFi al servidor vía `POST /api/log`.
3. El **Backend** guarda el evento en **MongoDB** y lo emite por **WebSocket** al dashboard.
4. El **Dashboard** muestra los eventos en tiempo real y permite enviar comandos.
5. El ESP8266 hace **polling** cada 2 segundos a `GET /api/comando` y reenvía cualquier comando al Arduino Nano por Serial.

---

## 🛠️ Tecnologías utilizadas

| Capa        | Tecnología              | Versión  |
|-------------|-------------------------|----------|
| Frontend    | HTML/CSS/JS + Nginx     | nginx:alpine |
| Backend     | Node.js + Express       | 20-alpine |
| Base de datos | MongoDB               | 7.0      |
| WebSockets  | Socket.io               | 4.6.x    |
| Contenedores | Docker + Compose       | 3.9      |
| Robot MCU   | Arduino Nano            | —        |
| WiFi MCU    | ESP8266 / ESP32         | —        |
| Servidor    | Ubuntu 22.04 LTS        | —        |
| Nube        | DigitalOcean Droplet    | —        |

---

## 🚀 Guía de despliegue en DigitalOcean

### 1. Crear el Droplet

En DigitalOcean:
- **Imagen:** Ubuntu 22.04 LTS x64
- **Plan:** Basic — $6/mes (1 vCPU, 1GB RAM) es suficiente
- **Región:** New York o la más cercana a Guatemala
- **Autenticación:** Llave SSH (recomendado) o contraseña

### 2. Conectarse al servidor

```bash
ssh root@TU_IP_DROPLET
```

### 3. Instalar Docker y Docker Compose

```bash
# Actualizar el sistema
apt update && apt upgrade -y

# Instalar dependencias
apt install -y ca-certificates curl gnupg lsb-release

# Agregar repositorio oficial de Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verificar instalación
docker --version
docker compose version
```

### 4. Clonar el repositorio

```bash
# Ir al directorio home
cd /root

# Clonar el repo (reemplaza con la URL real del grupo)
git clone https://github.com/TU_USUARIO/robot-oruga.git
cd robot-oruga
```

### 5. Configurar variables de entorno (opcional)

El archivo `docker-compose.yml` ya incluye las variables por defecto. Si deseas personalizarlas:

```bash
# Crear archivo de variables (no subir al repo)
cat > .env << 'EOF'
MONGO_URI=mongodb://mongo:27017/robotlogs
PORT=3000
NODE_ENV=production
EOF
```

### 6. Levantar los servicios

```bash
# Construir imágenes y levantar en segundo plano
docker compose up -d --build

# Verificar que los tres contenedores estén corriendo
docker compose ps

# Ver logs en tiempo real
docker compose logs -f
```

### 7. Verificar el despliegue

```bash
# Health check del backend
curl http://localhost/api/   # Debe responder (a través del proxy Nginx)

# Ver logs del backend
docker compose logs backend

# Acceder al dashboard
# Abre en tu navegador: http://TU_IP_DROPLET
```

### 8. Abrir el firewall (si es necesario)

```bash
# Permitir puerto 80 (HTTP)
ufw allow 80/tcp
ufw allow 22/tcp   # SSH
ufw enable
```

---

## 📋 Comandos útiles de operación

```bash
# Ver estado de los contenedores
docker compose ps

# Ver logs de un servicio específico
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongo

# Reiniciar un servicio
docker compose restart backend

# ── Para la demostración ──────────────────────────────────────

# Pausar SOLO el backend (los eventos no se registran)
docker compose stop backend

# Pausar SOLO MongoDB (eventos se reciben, no se persisten)
docker compose stop mongo

# Pausar SOLO el frontend (no se puede acceder al dashboard)
docker compose stop frontend

# Reanudar todos
docker compose start

# Detener todo completamente
docker compose down

# Detener y eliminar datos de MongoDB
docker compose down -v
```

---

## 🔧 Configuración del robot (ESP8266/ESP32)

En el archivo `robot_wifi/robot_wifi.ino`, modifica estas líneas:

```cpp
const char* WIFI_SSID     = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";
const char* SERVER_HOST   = "http://TU_IP_DROPLET";
```

### Conexión física (Arduino Nano ↔ ESP8266)

| Arduino Nano | ESP8266 |
|---|---|
| TX (pin 1) | RX |
| RX (pin 0) | TX |
| GND | GND |
| 3.3V | VCC / CH_PD |

> ⚠️ El ESP8266 opera a 3.3V. Si el Arduino es 5V, usa un divisor de voltaje en la línea TX del Arduino.

---

## 🌐 API Reference

### POST `/api/log`
Recibe un evento del robot.
```json
{
  "origen":    "U",
  "accion":    "a",
  "humedad":   450,
  "distancia": 23,
  "modo":      "LOCAL"
}
```

### GET `/api/comando`
El robot consulta si hay comandos pendientes.
```json
{ "comando": "a" }   // o { "comando": null }
```

### POST `/api/enviar-comando`
El dashboard envía un comando al robot.
```json
{ "comando": "p" }
```

### GET `/api/eventos?limit=100`
Obtiene los últimos N eventos.

### GET `/api/stats`
Estadísticas generales del sistema.

---

## 👥 Guía de colaboración en GitHub

### Configuración inicial (cada integrante)

```bash
# Clonar el repo
git clone https://github.com/TU_USUARIO/robot-oruga.git
cd robot-oruga

# Configurar identidad (importante para que aparezca en el historial)
git config --global user.name  "Tu Nombre Completo"
git config --global user.email "tu.correo@universidad.edu"
```

### Flujo de trabajo recomendado por área

| Integrante | Área de trabajo         | Archivos principales |
|---|---|---|
| Integrante 1 | Backend + API           | `backend/server.js` |
| Integrante 2 | Base de datos + modelos | `backend/server.js` (modelos) |
| Integrante 3 | Frontend + Dashboard    | `frontend/index.html` |
| Integrante 4 | Docker + Despliegue     | `docker-compose.yml`, `Dockerfiles` |
| Integrante 5 | Robot + ESP / Docs      | `robot_wifi/`, `README.md` |

### Flujo de commits

```bash
# Siempre trabajar en una rama propia
git checkout -b feature/nombre-de-la-funcionalidad

# Hacer cambios y commitear frecuentemente
git add .
git commit -m "feat: agregar endpoint GET /api/stats"

# Subir la rama al repositorio
git push origin feature/nombre-de-la-funcionalidad

# Crear un Pull Request en GitHub para revisión del equipo
# Después de aprobado, fusionar con main
```

### Convención de commits (para historial claro)

```
feat:     nueva funcionalidad
fix:      corrección de bug
docs:     cambios en documentación
chore:    configuración, Docker, deps
refactor: refactorización sin cambio de funcionalidad
```

### Estructura del repositorio

```
robot-oruga/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── index.html
│   ├── nginx.conf
│   └── Dockerfile
├── robot_wifi/
│   └── robot_wifi.ino
├── docker-compose.yml
└── README.md
```

---

## 📅 Fechas de entrega

| Actividad | Fecha |
|---|---|
| Entrega del repositorio | 22 de mayo de 2025 |
| Demostración de funcionamiento | 23 de mayo de 2025 |

---

## ✅ Checklist de demostración

- [ ] Servidor Linux visible en DigitalOcean
- [ ] Los tres contenedores corriendo (`docker compose ps`)
- [ ] Dashboard accesible desde navegador en `http://TU_IP`
- [ ] Robot enviando eventos visibles en el dashboard
- [ ] Pausar backend → eventos no se registran
- [ ] Pausar MongoDB → eventos llegan al backend pero no persisten
- [ ] Pausar frontend → dashboard inaccesible, eventos siguen funcionando
