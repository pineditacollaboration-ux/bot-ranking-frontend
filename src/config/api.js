// API Configuration
const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || 'http://localhost:3000';

export const API_CONFIG = {
  BASE_URL: API_URL,
  FRONTEND_URL: FRONTEND_URL,
  ENDPOINTS: {
    AUTH: {
      USER: `${API_URL}/auth/user`,
      DISCORD: `${API_URL}/auth/discord`,
      LOGOUT: `${API_URL}/auth/logout`,
    },
    API: {
      STATS: `${API_URL}/api/stats`,
      RANKING: `${API_URL}/api/ranking`,
      PROFILE: (discordId) => `${API_URL}/api/player/${discordId}`,
      SEASONS: `${API_URL}/api/seasons`,
      MATCHES: `${API_URL}/api/matches/recent`,
      SYNC_USER: `${API_URL}/api/sync-user`,
    },
  },
};
