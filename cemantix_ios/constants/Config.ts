// cemantix_ios/constants/Config.ts

// Remplace cette IP par l'adresse locale de ton PC où tourne app.py (port 8000 par défaut)
// Sur iOS Simulator, localhost peut fonctionner, mais sur un vrai iPhone, il faut l'IP.
export const API_BASE_URL = 'http://192.168.1.163:1256'; 
export const WS_BASE_URL = API_BASE_URL.replace('http', 'ws');

export const ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/auth/login`,
  REGISTER: `${API_BASE_URL}/auth/register`,
  CREATE_ROOM: `${API_BASE_URL}/rooms`,
  JOIN_RANDOM: `${API_BASE_URL}/rooms/join_random`,
};