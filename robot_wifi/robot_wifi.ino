// ============================================================
//  Robot Oruga — Módulo WiFi (ESP8266 / ESP32)
//  Envía logs al servidor y consulta comandos pendientes
// ============================================================
//  Librerías necesarias (instalar desde el Library Manager):
//    - ESP8266WiFi.h  (si usas ESP8266) o WiFi.h (ESP32)
//    - ESP8266HTTPClient.h / HTTPClient.h
//    - ArduinoJson  (versión 6.x)
// ============================================================

// ── Selección automática de plataforma ──────────────────────
#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #define PLATAFORMA "ESP8266"
#else
  #include <WiFi.h>
  #include <HTTPClient.h>
  #define PLATAFORMA "ESP32"
#endif

#include <ArduinoJson.h>

// ── Configuración de red ─────────────────────────────────────
const char* WIFI_SSID     = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";

// ── Configuración del servidor ────────────────────────────────
// Reemplaza con la IP pública de tu Droplet de DigitalOcean
const char* SERVER_HOST = "http://TU_IP_DROPLET";
const String URL_LOG    = String(SERVER_HOST) + "/api/log";
const String URL_CMD    = String(SERVER_HOST) + "/api/comando";

// ── Intervalo de polling (consultar comandos) ─────────────────
const unsigned long POLL_INTERVAL = 2000; // 2 segundos
unsigned long lastPoll = 0;

// ── Variables de estado de los sensores ──────────────────────
int humedad    = 0;
int distancia  = 0;
char modoActual[10] = "LOCAL";

// Callback para notificar al Arduino principal el comando recibido
// (Usa Serial para comunicarse con el Arduino Nano)
void enviarComandoAlArduino(char cmd) {
  Serial.write(cmd);  // El Arduino Nano lo leerá por Serial
}

// ════════════════════════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(9600);  // Velocidad igual al Arduino Nano
  delay(100);

  Serial.println("[WIFI] Iniciando " + String(PLATAFORMA));
  conectarWiFi();
}

// ════════════════════════════════════════════════════════════════
//  LOOP
// ════════════════════════════════════════════════════════════════
void loop() {
  // Reconectar WiFi si se perdió la conexión
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Reconectando...");
    conectarWiFi();
    return;
  }

  // ── Leer datos del Arduino Nano por Serial ──────────────────
  // El Arduino Nano imprime JSON en su Serial.println(log)
  // Este módulo lo captura y lo reenvía al servidor
  if (Serial.available() > 0) {
    String linea = Serial.readStringUntil('\n');
    linea.trim();
    if (linea.startsWith("{")) {
      procesarYEnviarLog(linea);
    }
  }

  // ── Polling de comandos pendientes ──────────────────────────
  unsigned long ahora = millis();
  if (ahora - lastPoll >= POLL_INTERVAL) {
    lastPoll = ahora;
    consultarComando();
  }
}

// ════════════════════════════════════════════════════════════════
//  FUNCIONES
// ════════════════════════════════════════════════════════════════

// ── Conexión WiFi ─────────────────────────────────────────────
void conectarWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    delay(500);
    intentos++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] Conectado. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("[WIFI] No se pudo conectar. Reintentando en el próximo ciclo.");
  }
}

// ── Parsear y enviar log JSON al servidor ────────────────────
void procesarYEnviarLog(String jsonStr) {
  // Parsear el JSON que genera el Arduino Nano
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, jsonStr);
  if (err) return; // JSON malformado, ignorar

  // Extraer valores para actualizar estado local
  if (doc.containsKey("humedad"))   humedad   = doc["humedad"].as<int>();
  if (doc.containsKey("distancia")) distancia = doc["distancia"].as<int>();
  if (doc.containsKey("modo")) {
    strlcpy(modoActual, doc["modo"].as<const char*>(), sizeof(modoActual));
  }

  // Enviar al servidor
  enviarLog(
    doc["origen"] | "U",
    doc["accion"] | "?",
    humedad,
    distancia,
    modoActual
  );
}

// ── POST /api/log ─────────────────────────────────────────────
void enviarLog(const char* origen, const char* accion, int hum, int dist, const char* modo) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  WiFiClient client;

  http.begin(client, URL_LOG);
  http.addHeader("Content-Type", "application/json");

  // Construir payload JSON
  StaticJsonDocument<256> doc;
  doc["origen"]    = origen;
  doc["accion"]    = accion;
  doc["humedad"]   = hum;
  doc["distancia"] = dist;
  doc["modo"]      = modo;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);

  if (code == 201) {
    // Éxito silencioso (no imprimimos para no interferir con la lectura Serial)
  } else {
    // Error — podrías encender un LED de error aquí
  }

  http.end();
}

// ── GET /api/comando ──────────────────────────────────────────
void consultarComando() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  WiFiClient client;

  http.begin(client, URL_CMD);
  int code = http.GET();

  if (code == 200) {
    String payload = http.getString();

    StaticJsonDocument<128> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      const char* cmd = doc["comando"];
      if (cmd != nullptr && strlen(cmd) > 0) {
        // Reenviar el comando al Arduino Nano por Serial
        enviarComandoAlArduino(cmd[0]);
      }
    }
  }

  http.end();
}
