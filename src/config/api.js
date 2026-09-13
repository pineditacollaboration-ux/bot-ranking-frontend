// API Configuration
const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.REACT_APP_FRONTEND_URL || 'http://localhost:3000';

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
      PROFILE: (discordId) => `${API_URL}/api/profile/${discordId}`,
      SEASONS: `${API_URL}/api/seasons`,
      MATCHES: `${API_URL}/api/matches`,
      SYNC_USER: `${API_URL}/api/sync-user`,
    },
  },
};
