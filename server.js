import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Game state storage
const rooms = new Map();
const players = new Map();

// Word pairs for the game
const wordPairs = [
  { word: 'elephant', impostorWord: 'rhinoceros' },
  { word: 'ocean', impostorWord: 'lake' },
  { word: 'mountain', impostorWord: 'hill' },
  { word: 'fire', impostorWord: 'flame' },
  { word: 'sun', impostorWord: 'star' },
  { word: 'book', impostorWord: 'novel' },
  { word: 'car', impostorWord: 'vehicle' },
  { word: 'tree', impostorWord: 'plant' },
  { word: 'music', impostorWord: 'song' },
  { word: 'computer', impostorWord: 'machine' },
  { word: 'coffee', impostorWord: 'drink' },
  { word: 'phone', impostorWord: 'device' },
  { word: 'city', impostorWord: 'town' },
  { word: 'food', impostorWord: 'meal' },
  { word: 'game', impostorWord: 'sport' }
];

function generateWordPair() {
  return wordPairs[Math.floor(Math.random() * wordPairs.length)];
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room
  socket.on('join-room', (data) => {
    const { roomCode, playerName } = data;

    // Initialize room if it doesn't exist
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        players: [],
        gameState: 'lobby',
        currentWord: null,
        impostor: null,
        currentPlayer: 0,
        timeLeft: 300,
        descriptions: {},
        votes: {},
        timer: null
      });
    }

    const room = rooms.get(roomCode);

    // Check if room is full
    if (room.players.length >= 2) {
      socket.emit('room-full');
      return;
    }

    // Add player to room
    const player = {
      id: socket.id,
      name: playerName,
      socketId: socket.id
    };

    // Check if player already in room
    if (!room.players.find(p => p.id === socket.id)) {
      room.players.push(player);
    }
    players.set(socket.id, { roomCode, player });

    socket.join(roomCode);

    // Notify all players in room
    io.to(roomCode).emit('room-update', {
      players: room.players,
      gameState: room.gameState
    });

    console.log(`Player ${playerName} joined room ${roomCode}`);
  });

  // Start game
  socket.on('start-game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room || room.players.length < 2) return;

    // Generate word and assign impostor
    const wordPair = generateWordPair();
    const impostorIndex = Math.floor(Math.random() * room.players.length);

    room.currentWord = wordPair.word;
    room.impostor = room.players[impostorIndex];
    room.gameState = 'describing';
    room.currentPlayer = 0;
    room.descriptions = {};
    room.votes = {};

    // Start timer
    room.timeLeft = 30;
    if (room.timer) clearInterval(room.timer);
    room.timer = setInterval(() => {
      room.timeLeft--;
      io.to(roomCode).emit('timer-update', room.timeLeft);

      if (room.timeLeft <= 0) {
        if (room.gameState === 'describing') {
          room.gameState = 'voting';
          io.to(roomCode).emit('game-state-change', {
            gameState: room.gameState,
            descriptions: room.descriptions
          });
        }
      }
    }, 1000);

    // Send game start data to all players
    room.players.forEach(player => {
      io.to(player.socketId).emit('game-started', {
        players: room.players,
        isImpostor: player.id === room.impostor.id,
        currentWord: player.id === room.impostor.id ? null : room.currentWord,
        gameState: room.gameState,
        currentPlayer: room.currentPlayer
      });
    });

    console.log(`Game started in room ${roomCode}`);
  });

  // Submit description
  socket.on('submit-description', (data) => {
    const { roomCode, description } = data;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.descriptions[socket.id] = description;

    // Move to next player
    room.currentPlayer = (room.currentPlayer + 1) % room.players.length;

    // Check if all players have described
    if (Object.keys(room.descriptions).length === room.players.length) {
      room.gameState = 'voting';
    }

    io.to(roomCode).emit('description-submitted', {
      descriptions: room.descriptions,
      currentPlayer: room.currentPlayer,
      gameState: room.gameState
    });
  });

  // Submit vote
  socket.on('submit-vote', (data) => {
    const { roomCode, votedPlayerId } = data;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.votes[socket.id] = votedPlayerId;

    // Check if all players have voted
    if (Object.keys(room.votes).length === room.players.length) {
      // Determine winner
      const voteCounts = {};
      Object.values(room.votes).forEach(votedId => {
        voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
      });

      let mostVotedId = null;
      let maxVotes = 0;
      Object.entries(voteCounts).forEach(([id, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          mostVotedId = id;
        }
      });

      const impostorCaught = mostVotedId === room.impostor.id;

      io.to(roomCode).emit('game-ended', {
        impostor: room.impostor,
        votes: room.votes,
        impostorCaught,
        descriptions: room.descriptions
      });

      // Reset room
      room.gameState = 'lobby';
      room.currentWord = null;
      room.impostor = null;
      room.descriptions = {};
      room.votes = {};
      if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
      }
    } else {
      io.to(roomCode).emit('vote-submitted', room.votes);
    }
  });

  // Restart game
  socket.on('restart-game', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.gameState = 'lobby';
    room.currentWord = null;
    room.impostor = null;
    room.descriptions = {};
    room.votes = {};
    room.currentPlayer = 0;
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }

    io.to(roomCode).emit('game-restarted');
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    const playerData = players.get(socket.id);
    if (playerData) {
      const { roomCode } = playerData;
      const room = rooms.get(roomCode);

      if (room) {
        // Remove player from room
        room.players = room.players.filter(p => p.socketId !== socket.id);

        // If room is empty, delete it
        if (room.players.length === 0) {
          if (room.timer) clearInterval(room.timer);
          rooms.delete(roomCode);
        } else {
          // Notify remaining players
          io.to(roomCode).emit('player-disconnected', room.players);
        }
      }

      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});