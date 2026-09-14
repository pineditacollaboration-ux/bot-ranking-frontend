// API Configuration
const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || 'http://localhost:3000';

// Usar proxy local en Vercel para evitar mixed content
const USE_PROXY = import.meta.env.MODE === 'production';
const PROXY_URL = '/api/proxy';

export const API_CONFIG = {
  BASE_URL: API_URL,
  FRONTEND_URL: FRONTEND_URL,
  USE_PROXY: USE_PROXY,
  PROXY_URL: PROXY_URL,
  ENDPOINTS: {
    AUTH: {
      USER: USE_PROXY ? `${PROXY_URL}/auth/user` : `${API_URL}/auth/user`,
      DISCORD: USE_PROXY ? `${PROXY_URL}/auth/discord` : `${API_URL}/auth/discord`,
      LOGOUT: USE_PROXY ? `${PROXY_URL}/auth/logout` : `${API_URL}/auth/logout`,
    },
    API: {
      STATS: USE_PROXY ? `${PROXY_URL}/api/stats` : `${API_URL}/api/stats`,
      RANKING: USE_PROXY ? `${PROXY_URL}/api/ranking` : `${API_URL}/api/ranking`,
      PROFILE: (discordId) => USE_PROXY ? `${PROXY_URL}/api/player/${discordId}` : `${API_URL}/api/player/${discordId}`,
      SEASONS: USE_PROXY ? `${PROXY_URL}/api/seasons` : `${API_URL}/api/seasons`,
      MATCHES: USE_PROXY ? `${PROXY_URL}/api/matches/recent` : `${API_URL}/api/matches/recent`,
      SYNC_USER: USE_PROXY ? `${PROXY_URL}/api/sync-user` : `${API_URL}/api/sync-user`,
    },
  },
};
