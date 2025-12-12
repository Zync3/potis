import { useState, useEffect } from 'react'
import Lobby from './components/Lobby'
import Game from './components/Game'
import Results from './components/Results'
import { getChannel } from './utils/socket'
import './App.css'

function App() {
  const [gameState, setGameState] = useState('lobby') // lobby, playing, results
  const [roomCode, setRoomCode] = useState('')
  const [gameResults, setGameResults] = useState(null)

  useEffect(() => {
    if (!roomCode) return;

    const channel = getChannel(roomCode);

    // Game restarted
    channel.subscribe('game-restarted', () => {
      setGameState('lobby');
      setRoomCode('');
      setGameResults(null);
    });

    return () => {
      channel.unsubscribe('game-restarted');
    };
  }, [roomCode]);

  const handleStartGame = (code) => {
    setRoomCode(code)
    setGameState('playing')
  }

  const handleGameEnd = (impostor, votes, impostorCaught) => {
    setGameResults({ impostor, votes, impostorCaught })
    setGameState('results')
  }

  const handleRestart = () => {
    const channel = getChannel(roomCode);
    channel.publish('game-restarted');
  }

  return (
    <div className="app">
      {gameState === 'lobby' && (
        <Lobby onStartGame={handleStartGame} />
      )}

      {gameState === 'playing' && (
        <Game
          roomCode={roomCode}
          onGameEnd={handleGameEnd}
        />
      )}

      {gameState === 'results' && (
        <Results
          impostor={gameResults.impostor}
          votes={gameResults.votes}
          players={[]} // Players will be managed by socket in Results if needed
          onRestart={handleRestart}
        />
      )}
    </div>
  )
}

export default App
