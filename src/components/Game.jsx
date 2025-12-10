import { useState, useEffect } from 'react';
import { getSocket } from '../utils/socket';

const Game = ({ roomCode, onGameEnd }) => {
  const [gameState, setGameState] = useState('waiting'); // waiting, describing, voting, ended
  const [currentWord, setCurrentWord] = useState('');
  const [players, setPlayers] = useState([]);
  const [impostor, setImpostor] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300);
  const [votes, setVotes] = useState({});
  const [isImpostor, setIsImpostor] = useState(false);
  const [descriptions, setDescriptions] = useState({});
  const [currentDescription, setCurrentDescription] = useState('');

  useEffect(() => {
    const socket = getSocket();

    // Game started event
    socket.on('game-started', (data) => {
      setPlayers(data.players);
      setIsImpostor(data.isImpostor);
      setCurrentWord(data.currentWord);
      setGameState(data.gameState);
      setCurrentPlayer(data.currentPlayer);
      setTimeLeft(30);
    });

    // Timer update
    socket.on('timer-update', (time) => {
      setTimeLeft(time);
    });

    // Description submitted
    socket.on('description-submitted', (data) => {
      setDescriptions(data.descriptions);
      setCurrentPlayer(data.currentPlayer);
      setGameState(data.gameState);
    });

    // Vote submitted
    socket.on('vote-submitted', (votes) => {
      setVotes(votes);
    });

    // Game state change
    socket.on('game-state-change', (data) => {
      setGameState(data.gameState);
      if (data.descriptions) {
        setDescriptions(data.descriptions);
      }
    });

    // Game ended
    socket.on('game-ended', (data) => {
      setImpostor(data.impostor);
      setVotes(data.votes);
      setDescriptions(data.descriptions);
      setGameState('ended');
      onGameEnd(data.impostor, data.votes, data.impostorCaught);
    });

    // Player disconnected
    socket.on('player-disconnected', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    return () => {
      socket.off('game-started');
      socket.off('timer-update');
      socket.off('description-submitted');
      socket.off('vote-submitted');
      socket.off('game-state-change');
      socket.off('game-ended');
      socket.off('player-disconnected');
    };
  }, [onGameEnd]);

  const submitDescription = () => {
    if (currentDescription.trim()) {
      const socket = getSocket();
      socket.emit('submit-description', {
        roomCode,
        description: currentDescription.trim()
      });
      setCurrentDescription('');
    }
  };

  const voteForPlayer = (playerId) => {
    const socket = getSocket();
    socket.emit('submit-vote', {
      roomCode,
      votedPlayerId: playerId
    });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (gameState === 'waiting') {
    return <div className="game">Waiting for game to start...</div>;
  }

  return (
    <div className="game">
      <div className="game-header">
        <h1>Room: {roomCode}</h1>
        <div className="timer">Time: {formatTime(timeLeft)}</div>
      </div>

      {!isImpostor && gameState !== 'voting' && gameState !== 'ended' && (
        <div className="word-display">
          <h2>Your Word: {currentWord}</h2>
          <p>Describe this word without saying it directly!</p>
        </div>
      )}

      {isImpostor && gameState !== 'voting' && gameState !== 'ended' && (
        <div className="word-display">
          <h2>You are the Impostor!</h2>
          <p>You don't know the word. Try to blend in!</p>
        </div>
      )}

      {gameState === 'describing' && (
        <div className="turn-section">
          <h3>Current Turn: {players[currentPlayer]?.name}</h3>
          <div className="description-input">
            <textarea
              value={currentDescription}
              onChange={(e) => setCurrentDescription(e.target.value)}
              placeholder="Describe the word..."
              rows="3"
              maxLength="200"
            />
            <p>{currentDescription.length}/200 characters</p>
            <button onClick={submitDescription} disabled={!currentDescription.trim()}>
              Submit Description
            </button>
          </div>
        </div>
      )}

      {gameState === 'voting' && (
        <div className="voting-section">
          <h3>Vote for who you think is the Impostor!</h3>

          <div className="descriptions-review">
            <h4>All Descriptions:</h4>
            {Object.entries(descriptions).map(([playerId, desc]) => {
              const player = players.find(p => p.socketId === playerId);
              return (
                <div key={playerId} className="description-item">
                  <strong>{player?.name}:</strong> {desc}
                </div>
              );
            })}
          </div>

          <div className="vote-buttons">
            {players.map(player => (
              <button
                key={player.socketId}
                onClick={() => voteForPlayer(player.socketId)}
                className="vote-button"
              >
                Vote for {player.name} ({votes[player.socketId] || 0} votes)
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="players-list">
        <h3>Players ({players.length}):</h3>
        <ul>
          {players.map(player => (
            <li key={player.socketId}>{player.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Game;