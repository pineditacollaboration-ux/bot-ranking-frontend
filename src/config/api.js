// API Configuration
const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || 'http://localhost:3000';

// En producción, usar URLs relativas (serán manejadas por rewrites en Vercel)
const USE_REWRITES = import.meta.env.MODE === 'production';

export const API_CONFIG = {
  BASE_URL: API_URL,
  FRONTEND_URL: FRONTEND_URL,
  USE_REWRITES: USE_REWRITES,
  ENDPOINTS: {
    AUTH: {
      USER: USE_REWRITES ? '/auth/user' : `${API_URL}/auth/user`,
      DISCORD: USE_REWRITES ? '/auth/discord' : `${API_URL}/auth/discord`,
      LOGOUT: USE_REWRITES ? '/auth/logout' : `${API_URL}/auth/logout`,
    },
    API: {
      STATS: USE_REWRITES ? '/api/stats' : `${API_URL}/api/stats`,
      RANKING: USE_REWRITES ? '/api/ranking' : `${API_URL}/api/ranking`,
      PROFILE: (discordId) => USE_REWRITES ? `/api/player/${discordId}` : `${API_URL}/api/player/${discordId}`,
      SEASONS: USE_REWRITES ? '/api/seasons' : `${API_URL}/api/seasons`,
      MATCHES: USE_REWRITES ? '/api/matches/recent' : `${API_URL}/api/matches/recent`,
      SYNC_USER: USE_REWRITES ? '/api/sync-user' : `${API_URL}/api/sync-user`,
    },
  },
};
