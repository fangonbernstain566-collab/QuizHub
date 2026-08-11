const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');

const { initDb } = require('./src/db');
const { GameManager } = require('./src/gameState');
const createApiRouter = require('./src/routes');

const PORT = process.env.PORT || 3000;

// The admin key stays the same across restarts (saved to a local, gitignored
// file) so the game master doesn't have to re-enter it every time the server
// is restarted mid-event. Set ADMIN_KEY yourself to override it.
const ADMIN_KEY_FILE = path.join(__dirname, 'admin-key.local');
let ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  try {
    ADMIN_KEY = fs.readFileSync(ADMIN_KEY_FILE, 'utf8').trim();
  } catch {
    ADMIN_KEY = '';
  }
}
if (!ADMIN_KEY) {
  ADMIN_KEY = String(crypto.randomInt(100000, 999999));
  fs.writeFileSync(ADMIN_KEY_FILE, ADMIN_KEY);
}

const db = initDb();
const app = express();
app.use(express.json());

// --- Static File Routing ---
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/display', express.static(path.join(__dirname, 'public/display')));
app.use('/play', express.static(path.join(__dirname, 'public/play')));
app.use('/shared', express.static(path.join(__dirname, 'public/shared')));

// Root redirect to Admin panel by default
app.get('/', (req, res) => res.redirect('/admin'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize game state manager
const game = new GameManager(db, io, ADMIN_KEY);
app.use('/api', createApiRouter(db, game));

// --- Socket.IO Event Handling ---
io.on('connection', (socket) => {
  // Delegate connection handling to GameManager (registers play:join, identify, etc.)
  game.handleConnection(socket);
});

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`QuizHub server running on port ${PORT}`);
  console.log('');
  console.log(`Admin key: ${ADMIN_KEY}`);
  console.log('(Enter this once on the Admin page — anyone controlling the game needs it.)');
  console.log('');
  console.log('On this PC:');
  console.log(`  Admin:   http://localhost:${PORT}/admin`);
  console.log(`  Display: http://localhost:${PORT}/display`);
  console.log(`  Play:    http://localhost:${PORT}/play`);
  console.log('');
  console.log('On phones/laptops on the same Wi-Fi (use this PC\'s LAN IP instead of localhost):');

  const nets = os.networkInterfaces();
  let found = false;
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        found = true;
        console.log(`  http://${net.address}:${PORT}/play`);
      }
    }
  }
  if (!found) {
    console.log('  (No LAN IPv4 address found — check your Wi-Fi connection.)');
  }
});