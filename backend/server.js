const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ======================================================
// MIDDLEWARES
// ======================================================

app.use(cors());
app.use(express.json());

// ======================================================
// CONEXIÓN MONGODB
// ======================================================

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb://mongo:27017/robotlogs';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[DB] Conectado a MongoDB');
  })
  .catch((err) => {
    console.error('[DB] Error:', err);
  });

// ======================================================
// MODELO EVENTOS
// ======================================================

const eventSchema = new mongoose.Schema({

  origen: {
    type: String,
    enum: ['U', 'B', 'R', 'SERVER'],
    default: 'U'
  },

  accion: {
    type: String,
    required: true
  },

  humedad: {
    type: Number,
    default: null
  },

  distancia: {
    type: Number,
    default: null
  },

  modo: {
    type: String,
    default: 'LOCAL'
  },

  timestamp: {
    type: Date,
    default: Date.now
  }

});

const Event = mongoose.model('Event', eventSchema);

// ======================================================
// MODELO COMANDOS
// ======================================================

const commandSchema = new mongoose.Schema({

  comando: {
    type: String,
    required: true
  },

  ejecutado: {
    type: Boolean,
    default: false
  },

  creadoEn: {
    type: Date,
    default: Date.now
  }

});

const Command = mongoose.model('Command', commandSchema);

// ======================================================
// COLA DE COMANDOS EN MEMORIA
// ======================================================

const commandQueue = [];

// ======================================================
// ROBOT -> SERVIDOR
// ======================================================

// ----------------------------------------------
// POST /api/log
// Robot envía logs y sensores
// ----------------------------------------------

app.post('/api/log', async (req, res) => {

  try {

    const {
      origen,
      accion,
      humedad,
      distancia,
      modo
    } = req.body;

    if (!accion) {

      return res.status(400).json({
        error: 'Campo accion requerido'
      });

    }

    const evento = new Event({

      origen,
      accion,
      humedad,
      distancia,
      modo

    });

    await evento.save();

    // Tiempo real dashboard
    io.emit('nuevo_evento', evento);

    console.log(
      `[LOG] ${accion} | hum:${humedad} | dist:${distancia}`
    );

    res.status(201).json({
      ok: true,
      id: evento._id
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

// ----------------------------------------------
// GET /api/comando
// Robot consulta comandos pendientes
// ----------------------------------------------

app.get('/api/comando', async (req, res) => {

  try {

    // Primero cola rápida en memoria
    if (commandQueue.length > 0) {

      const cmd = commandQueue.shift();

      const evento = new Event({

        origen: 'SERVER',
        accion: cmd,
        modo: 'REMOTO'

      });

      await evento.save();

      io.emit('nuevo_evento', evento);

      return res.json({
        comando: cmd
      });

    }

    // Luego MongoDB
    const cmd = await Command.findOneAndUpdate(

      { ejecutado: false },

      { ejecutado: true },

      {
        sort: { creadoEn: 1 },
        new: true
      }

    );

    if (cmd) {

      const evento = new Event({

        origen: 'SERVER',
        accion: cmd.comando,
        modo: 'REMOTO'

      });

      await evento.save();

      io.emit('nuevo_evento', evento);

      return res.json({
        comando: cmd.comando
      });

    }

    res.json({
      comando: null
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

// ======================================================
// DASHBOARD -> SERVIDOR
// ======================================================

// ----------------------------------------------
// GET /api/eventos
// ----------------------------------------------

app.get('/api/eventos', async (req, res) => {

  try {

    const limit =
      parseInt(req.query.limit) || 100;

    const eventos = await Event
      .find()
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json(eventos);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

// ----------------------------------------------
// POST /api/enviar-comando
// Dashboard envía comandos
// ----------------------------------------------

app.post('/api/enviar-comando', async (req, res) => {

  try {

    const { comando } = req.body;

    if (!comando) {

      return res.status(400).json({
        error: 'Campo comando requerido'
      });

    }

    // Cola rápida RAM
    commandQueue.push(comando);

    // Guardar en MongoDB
    const nuevoComando = new Command({

      comando,
      ejecutado: false

    });

    await nuevoComando.save();

    // Emitir tiempo real
    io.emit('comando_enviado', {

      comando

    });

    console.log(
      `[CMD] Comando recibido: ${comando}`
    );

    res.status(201).json({

      ok: true,
      comando

    });

  } catch (err) {

    console.error(err);

    res.status(500).json({

      error: err.message

    });

  }

});

// ----------------------------------------------
// GET /api/stats
// ----------------------------------------------

app.get('/api/stats', async (req, res) => {

  try {

    const total =
      await Event.countDocuments();

    const ultima =
      await Event.findOne()
      .sort({ timestamp: -1 });

    res.json({

      total,
      ultima,
      comandosPendientes:
        commandQueue.length

    });

  } catch (err) {

    res.status(500).json({

      error: err.message

    });

  }

});

// ======================================================
// HEALTH CHECK
// ======================================================

app.get('/health', (_, res) => {

  res.json({

    status: 'ok',
    timestamp: new Date()

  });

});

// ======================================================
// SOCKET.IO
// ======================================================

io.on('connection', (socket) => {

  console.log(
    `[WS] Cliente conectado: ${socket.id}`
  );

  socket.on('disconnect', () => {

    console.log(
      `[WS] Cliente desconectado: ${socket.id}`
    );

  });

});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

const PORT =
  process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log(
    `[SERVER] Ejecutándose en puerto ${PORT}`
  );

});