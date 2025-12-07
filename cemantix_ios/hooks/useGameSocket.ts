// cemantix_ios/hooks/useGameSocket.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { WS_BASE_URL } from '@/constants/Config';

export type GameEntry = {
  word: string;
  temp: number;
  progression: number;
  player_name: string;
  feedback?: string;
};

export type PlayerStats = {
  player_name: string;
  attempts: number;
  best_similarity: number;
};

export function useGameSocket(roomId: string | null, playerName: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [entries, setEntries] = useState<GameEntry[]>([]);
  const [scoreboard, setScoreboard] = useState<PlayerStats[]>([]);
  const [messages, setMessages] = useState<{player: string, content: string}[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomId || !playerName) return;

    // Fermeture de l'ancienne connexion si elle existe
    if (ws.current) ws.current.close();

    const url = `${WS_BASE_URL}/rooms/${roomId}/ws?player_name=${encodeURIComponent(playerName)}`;
    console.log("Connexion WS:", url);
    
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      console.log("WebSocket connecté");
      setIsConnected(true);
    };

    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);

      switch (data.type) {
        case 'state_sync':
          // Chargement de l'historique complet
          if (data.history) {
            const formattedHistory = data.history.map((h: any) => ({
              word: h.word,
              temp: h.temperature,
              progression: h.progression,
              player_name: h.player_name
            })).reverse(); // On veut les plus récents en haut
            setEntries(formattedHistory);
          }
          if (data.scoreboard) setScoreboard(data.scoreboard);
          break;

        case 'guess':
          // Nouveau mot proposé
          const newEntry: GameEntry = {
            word: data.word,
            temp: data.temperature,
            progression: data.progression,
            player_name: data.player_name,
            feedback: data.feedback
          };
          setEntries(prev => [newEntry, ...prev]);
          break;

        case 'scoreboard_update':
          if (data.scoreboard) setScoreboard(data.scoreboard);
          if (data.victory) {
            setLastMessage(`🏆 Victoire de ${data.winner} !`);
          }
          break;

        case 'chat_message':
          setMessages(prev => [...prev, { player: data.player_name, content: data.content }]);
          break;
          
        case 'error':
          setLastMessage(`Erreur: ${data.message}`);
          break;
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket déconnecté");
      setIsConnected(false);
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [roomId, playerName]);

  const sendGuess = useCallback((word: string) => {
    // Note: Dans ton app.py, le guess se fait via POST HTTP, pas via WS direct,
    // mais le WS reçoit le résultat. Il faut donc appeler l'API HTTP ici.
    // Pour simplifier l'exemple, supposons que tu gardes la logique HTTP pour l'envoi.
    // Si tu veux envoyer via WS, il faudrait adapter le backend.
  }, []);

  return { isConnected, entries, scoreboard, messages, lastMessage };
}