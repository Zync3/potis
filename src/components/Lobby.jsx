import { useState, useEffect } from 'react';
import { getChannel, getAblyConnection } from '../utils/socket';

const Lobby = ({ onStartGame }) => {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ablyConnection = getAblyConnection();

    ablyConnection.on('connected', () => {
      setIsConnected(true);
      console.log('Connected to Ably');
    });

    ablyConnection.on('disconnected', () => {
      setIsConnected(false);
      console.log('Disconnected from Ably');
    });

    return () => {
      ablyConnection.off('connected');
      ablyConnection.off('disconnected');
    };
  }, []);

  useEffect(() => {
    if (!roomCode) return;

    const channel = getChannel(roomCode);

    channel.presence.enter(playerName.trim());

    channel.presence.subscribe('enter', async () => {
      const members = await channel.presence.get();
      const playersList = members.map(m => ({ id: m.clientId, name: m.data }));
      setPlayers(playersList);
      if (playersList.length > 2) {
        setError('Room is full! Maximum 2 players allowed.');
      } else {
        setError('');
      }
    });

    channel.presence.subscribe('leave', async () => {
      const members = await channel.presence.get();
      const playersList = members.map(m => ({ id: m.clientId, name: m.data }));
      setPlayers(playersList);
    });

    channel.subscribe('game-started', () => {
      onStartGame(roomCode);
    });

    return () => {
      channel.presence.leave();
      channel.presence.unsubscribe('enter');
      channel.presence.unsubscribe('leave');
      channel.unsubscribe('game-started');
    };
  }, [roomCode, playerName, onStartGame]);

  console.log("test ");
  
  const generateRoomCode = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(code);
    setError('');
  };

  const joinRoom = () => {
    if (!isConnected) {
      setError('Not connected to Ably. Please wait...');
      return;
    }

    if (roomCode.length === 4 && playerName.trim()) {
      // Presence enter is handled in useEffect
      setError('');
    } else {
      setError('Please enter a valid 4-digit room code and your name.');
    }
  };

  const startGame = () => {
    if (players.length >= 2) {
      const channel = getChannel(roomCode);
      const hostId = getAblyConnection().id;

      // Generate game data
      const impostorIndex = Math.floor(Math.random() * players.length);
      const impostor = players[impostorIndex].id;
      const currentWord = 'test word'; // Replace with word generator
      const gamePlayers = players.map(player => ({
        ...player,
        isImpostor: player.id === impostor
      }));

      channel.publish('game-started', {
        hostId,
        players: gamePlayers,
        currentWord,
        gameState: 'describing',
        currentPlayer: 0
      });
    }
  };

  return (
    <div className="lobby">
      <h1>Guess The Pootis</h1>

      <div className="connection-status">
        <span className={isConnected ? 'connected' : 'disconnected'}>
          {isConnected ? '🟢 Connected to Ably' : '🔴 Connecting to Ably...'}
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