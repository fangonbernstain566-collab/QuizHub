const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');

const { initDb } = require('./src/db');
const { GameManager } = require('./src/gameState');
const createApiRouter = require('./src/routes');

const PORT = process.env.PORT || 3000;

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
const game = new GameManager(db, io);
app.use('/api', createApiRouter(db, game));

// --- Socket.IO Event Handling ---
io.on('connection', (socket) => {
  // Delegate connection handling to GameManager
  game.handleConnection(socket);

  // Directly support the streamlined player join event (Team Name + Player Name)
  socket.on('play:join', (data) => {
    if (typeof game.handlePlayerJoin === 'function') {
      game.handlePlayerJoin(socket, data);
    } else {
      // Fallback in case handlePlayerJoin isn't directly inside GameManager
      const { teamName, playerName } = data || {};
      if (!teamName || !playerName) {
        return socket.emit('play:joinError', 'Team name and player name are required.');
      }

      // Assign player session info
      socket.teamName = teamName;
      socket.playerName = playerName;
      socket.role = 'play';

      // Standard team ID generation based on lowercased team name
      const teamId = 'team_' + teamName.trim().toLowerCase().replace(/\s+/g, '_');
      socket.join(teamId);

      socket.emit('play:joined', {
        teamId,
        teamName: teamName.trim(),
        playerName: playerName.trim(),
        token: socket.id
      });

      // Notify the rest of the game state about updated connected teams/players
      if (typeof game.broadcastState === 'function') {
        game.broadcastState();
      }
    }
  });
});

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`QuizHub server running on port ${PORT}`);
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