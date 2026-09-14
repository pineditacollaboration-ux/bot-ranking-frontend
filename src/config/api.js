// API Configuration
const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || 'http://localhost:3000';

// En producción, usar proxy de Vercel para evitar mixed content
const USE_PROXY = import.meta.env.MODE === 'production';
const PROXY_BASE = USE_PROXY ? '/api/proxy' : API_URL;

export const API_CONFIG = {
  BASE_URL: API_URL,
  FRONTEND_URL: FRONTEND_URL,
  USE_PROXY,
  PROXY_BASE,
  ENDPOINTS: {
    AUTH: {
      USER: USE_PROXY ? `/api/proxy/auth/user` : `${API_URL}/auth/user`,
      DISCORD: USE_PROXY ? `/api/proxy/auth/discord` : `${API_URL}/auth/discord`,
      LOGOUT: USE_PROXY ? `/api/proxy/auth/logout` : `${API_URL}/auth/logout`,
    },
    API: {
      STATS: USE_PROXY ? `/api/proxy/api/stats` : `${API_URL}/api/stats`,
      RANKING: USE_PROXY ? `/api/proxy/api/ranking` : `${API_URL}/api/ranking`,
      PROFILE: (discordId) => USE_PROXY ? `/api/proxy/api/player/${discordId}` : `${API_URL}/api/player/${discordId}`,
      SEASONS: USE_PROXY ? `/api/proxy/api/seasons` : `${API_URL}/api/seasons`,
      MATCHES: USE_PROXY ? `/api/proxy/api/matches/recent` : `${API_URL}/api/matches/recent`,
      SYNC_USER: USE_PROXY ? `/api/proxy/api/sync-user` : `${API_URL}/api/sync-user`,
    },
  },
};
