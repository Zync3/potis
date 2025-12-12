import { useState, useEffect } from 'react';
import { getChannel, getAblyConnection } from '../utils/socket';

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
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    const channel = getChannel(roomCode);

    // Game started event
    channel.subscribe('game-started', (message) => {
      const data = message.data;
      setPlayers(data.players);
      const myPlayer = data.players.find(p => p.id === getAblyConnection().id);
      setIsImpostor(myPlayer ? myPlayer.isImpostor : false);
      setCurrentWord(data.currentWord);
      setGameState(data.gameState);
      setCurrentPlayer(data.currentPlayer);
      setTimeLeft(30);
      setIsHost(data.hostId === getAblyConnection().id);
    });

    // Timer update
    channel.subscribe('timer-update', (message) => {
      setTimeLeft(message.data);
    });

    // Description submitted
    channel.subscribe('description-submitted', (message) => {
      const data = message.data;
      setDescriptions(data.descriptions);
      setCurrentPlayer(data.currentPlayer);
      setGameState(data.gameState);
    });

    // Vote submitted
    channel.subscribe('vote-submitted', (message) => {
      setVotes(message.data);
    });

    // Game state change
    channel.subscribe('game-state-change', (message) => {
      const data = message.data;
      setGameState(data.gameState);
      if (data.descriptions) {
        setDescriptions(data.descriptions);
      }
    });

    // Game ended
    channel.subscribe('game-ended', (message) => {
      const data = message.data;
      setImpostor(data.impostor);
      setVotes(data.votes);
      setDescriptions(data.descriptions);
      setGameState('ended');
      onGameEnd(data.impostor, data.votes, data.impostorCaught);
    });

    // Player disconnected
    channel.presence.subscribe('leave', async () => {
      const members = await channel.presence.get();
      const playersList = members.map(m => ({ id: m.clientId, name: m.data }));
      setPlayers(playersList);
    });

    return () => {
      channel.unsubscribe('game-started');
      channel.unsubscribe('timer-update');
      channel.unsubscribe('description-submitted');
      channel.unsubscribe('vote-submitted');
      channel.unsubscribe('game-state-change');
      channel.unsubscribe('game-ended');
      channel.presence.unsubscribe('leave');
    };
  }, [roomCode, onGameEnd]);

  useEffect(() => {
    if (!isHost) return;

    const channel = getChannel(roomCode);
    const collectedDescriptions = {};
    const collectedVotes = {};

    const handleSubmitDescription = (message) => {
      const { description } = message.data;
      const playerId = message.clientId;
      collectedDescriptions[playerId] = description;

      if (Object.keys(collectedDescriptions).length === players.length) {
        // All submitted, move to voting
        setGameState('voting');
        channel.publish('game-state-change', {
          gameState: 'voting',
          descriptions: collectedDescriptions
        });
      }
    };

    const handleSubmitVote = (message) => {
      const { votedPlayerId } = message.data;
      const voterId = message.clientId;
      collectedVotes[voterId] = votedPlayerId;

      if (Object.keys(collectedVotes).length === players.length) {
        // All voted, calculate winner
        const voteCounts = {};
        Object.values(collectedVotes).forEach(id => {
          voteCounts[id] = (voteCounts[id] || 0) + 1;
        });
        const maxVotes = Math.max(...Object.values(voteCounts));
        const votedOut = Object.keys(voteCounts).find(id => voteCounts[id] === maxVotes);
        const impostorCaught = votedOut === impostor;

        channel.publish('game-ended', {
          impostor,
          votes: collectedVotes,
          descriptions: collectedDescriptions,
          impostorCaught
        });
      } else {
        channel.publish('vote-submitted', collectedVotes);
      }
    };

    channel.subscribe('submit-description', handleSubmitDescription);
    channel.subscribe('submit-vote', handleSubmitVote);

    return () => {
      channel.unsubscribe('submit-description', handleSubmitDescription);
      channel.unsubscribe('submit-vote', handleSubmitVote);
    };
  }, [isHost, players.length, roomCode, impostor]);

  const submitDescription = () => {
    if (currentDescription.trim()) {
      const channel = getChannel(roomCode);
      channel.publish('submit-description', {
        description: currentDescription.trim()
      });
      setCurrentDescription('');
    }
  };

  const voteForPlayer = (playerId) => {
    const channel = getChannel(roomCode);
    channel.publish('submit-vote', {
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
              const player = players.find(p => p.id === playerId);
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
                key={player.id}
                onClick={() => voteForPlayer(player.id)}
                className="vote-button"
              >
                Vote for {player.name} ({votes[player.id] || 0} votes)
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="players-list">
        <h3>Players ({players.length}):</h3>
        <ul>
          {players.map(player => (
            <li key={player.id}>{player.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Game;