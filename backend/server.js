const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// ─── Conexión MongoDB ────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/robotlogs';

mongoose.connect(MONGO_URI)
  .then(() => console.log('[DB] Conectado a MongoDB'))
  .catch(err => console.error('[DB] Error:', err));

// ─── Modelo de Evento ────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema({
  origen:     { type: String, enum: ['U', 'B', 'R', 'SERVER'], default: 'U' },
  accion:     { type: String, required: true },
  humedad:    { type: Number, default: null },
  distancia:  { type: Number, default: null },
  modo:       { type: String, default: 'LOCAL' },
  timestamp:  { type: Date,   default: Date.now }
});

const Event = mongoose.model('Event', eventSchema);

// ─── Modelo de Comando pendiente ─────────────────────────────────────────────
const commandSchema = new mongoose.Schema({
  comando:   { type: String, required: true },
  ejecutado: { type: Boolean, default: false },
  creadoEn:  { type: Date,   default: Date.now }
});

const Command = mongoose.model('Command', commandSchema);

// ─── Cola de comandos en memoria (para respuesta rápida al robot) ─────────────
const commandQueue = [];

// ════════════════════════════════════════════════════════════════════════════
//  ENDPOINTS ROBOT → SERVIDOR
// ════════════════════════════════════════════════════════════════════════════

// POST /api/log — Robot envía evento
app.post('/api/log', async (req, res) => {
  try {
    const { origen, accion, humedad, distancia, modo } = req.body;

    if (!accion) return res.status(400).json({ error: 'Campo accion requerido' });

    const evento = new Event({ origen, accion, humedad, distancia, modo });
    await evento.save();

    // Emitir en tiempo real al dashboard
    io.emit('nuevo_evento', evento);

    console.log(`[LOG] ${accion} | hum:${humedad} | dist:${distancia} | ${new Date().toISOString()}`);
    res.status(201).json({ ok: true, id: evento._id });
  } catch (err) {
    console.error('[LOG] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/comando — Robot consulta si hay comandos pendientes (polling)
app.get('/api/comando', async (req, res) => {
  try {
    // Primero intenta la cola en memoria (más rápido)
    if (commandQueue.length > 0) {
      const cmd = commandQueue.shift();
      // Registrar el despacho como evento
      const evento = new Event({ origen: 'SERVER', accion: cmd, modo: 'REMOTO' });
      await evento.save();
      io.emit('nuevo_evento', evento);
      return res.json({ comando: cmd });
    }

    // Luego intenta MongoDB (comandos enviados por dashboard)
    const cmd = await Command.findOneAndUpdate(
      { ejecutado: false },
      { ejecutado: true },
      { sort: { creadoEn: 1 }, new: true }
    );

    if (cmd) {
      const evento = new Event({ origen: 'SERVER', accion: cmd.comando, modo: 'REMOTO' });
      await evento.save();
      io.emit('nuevo_evento', evento);
      return res.json({ comando: cmd.comando });
    }

    res.json({ comando: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ENDPOINTS DASHBOARD → SERVIDOR
// ════════════════════════════════════════════════════════════════════════════

// GET /api/eventos — Últimos N eventos para el dashboard
app.get('/api/eventos', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const eventos = await Event.find().sort({ timestamp: -1 }).limit(limit);
    res.json(eventos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enviar-comando — Dashboard envía comando al robot
app.post('/api/enviar-comando', async (req, res) => {
  try {
    const { comando } = req.body;
    if (!comando) return res.status(400).json({ error: 'Campo comando requerido' });

    // Guardar en cola en memoria Y en MongoDB
    commandQueue.push(comando);
    const cmd = new Command({ comando });
    await cmd.save();

    io.emit('comando_enviado', { comando });
    console.log(`[CMD] Comando encolado: ${comando}`);
    res.status(201).json({ ok: true, encolado: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats — Estadísticas rápidas para el dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const total = await Event.countDocuments();
    const porOrigen = await Event.aggregate([
      { $group: { _id: '$origen', count: { $sum: 1 } } }
    ]);
    const ultima = await Event.findOne().sort({ timestamp: -1 });
    res.json({ total, porOrigen, ultima, comandosPendientes: commandQueue.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── WebSocket (dashboard tiempo real) ────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Cliente conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`[WS] Cliente desconectado: ${socket.id}`));
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[SERVER] Escuchando en puerto ${PORT}`));
