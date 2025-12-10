import { useState, useEffect } from 'react';
import { initSocket, getSocket } from '../utils/socket';

const Lobby = ({ onStartGame }) => {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const socket = initSocket();

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    socket.on('room-update', (data) => {
      setPlayers(data.players);
      setError('');
    });

    socket.on('room-full', () => {
      setError('Room is full! Maximum 2 players allowed.');
    });

    socket.on('game-started', (data) => {
      onStartGame(roomCode);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room-update');
      socket.off('room-full');
      socket.off('game-started');
    };
  }, []);

  const generateRoomCode = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(code);
    setError('');
  };

  const joinRoom = () => {
    if (!isConnected) {
      setError('Not connected to server. Please wait...');
      return;
    }

    if (roomCode.length === 4 && playerName.trim()) {
      const socket = getSocket();
      socket.emit('join-room', {
        roomCode: roomCode,
        playerName: playerName.trim()
      });
      setError('');
    } else {
      setError('Please enter a valid 4-digit room code and your name.');
    }
  };

  const startGame = () => {
    if (players.length >= 2) {
      const socket = getSocket();
      socket.emit('start-game', roomCode);
    }
  };

  return (
    <div className="lobby">
      <h1>Guess the Impostor</h1>

      <div className="connection-status">
        <span className={isConnected ? 'connected' : 'disconnected'}>
          {isConnected ? '🟢 Connected' : '🔴 Connecting...'}
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="room-section">
        <h2>Create or Join Room</h2>
        <button onClick={generateRoomCode} disabled={!isConnected}>
          Generate
        </button>
        {roomCode && <p>Room Code: <strong>{roomCode}</strong></p>}

        <div className="join-section">
          <input
            type="text"
            placeholder="Enter 4-digit room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.slice(0, 4))}
            maxLength="4"
            disabled={!isConnected}
          />
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            disabled={!isConnected}
          />
          <button onClick={joinRoom} disabled={!isConnected}>
            Join Room
          </button>
        </div>
      </div>

      <div className="players-section">
        <h3>Players in Room ({players.length}/2):</h3>
        <ul>
          {players.map(player => (
            <li key={player.id}>{player.name}</li>
          ))}
        </ul>
      </div>

      {players.length >= 2 && (
        <button className="start-button" onClick={startGame}>
          Start Game
        </button>
      )}
    </div>
  );
};

export default Lobby;