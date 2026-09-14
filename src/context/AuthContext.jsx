import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { isValidDiscordID, sanitizeInput } from '../utils/security';
import { API_CONFIG } from '../config/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const FRONTEND_URL = API_CONFIG.FRONTEND_URL;

  useEffect(() => {
    checkAuth();
  }, []);

  const validateUser = (userData) => {
    if (!userData || typeof userData !== 'object') {
      throw new Error('Invalid user data');
    }

    if (!userData.id || !isValidDiscordID(userData.id)) {
      throw new Error('Invalid Discord ID');
    }

    if (!userData.username || typeof userData.username !== 'string') {
      throw new Error('Invalid username');
    }

    // Sanitize user data
    return {
      id: userData.id,
      username: sanitizeInput(userData.username),
      avatar: userData.avatar || null,
      discriminator: userData.discriminator || null
    };
  };

  const checkAuth = async () => {
    try {
      const response = await axios.get(API_CONFIG.ENDPOINTS.AUTH.USER, {
        withCredentials: true,
        timeout: 10000
      });
      
      const validatedUser = validateUser(response.data);
      setUser(validatedUser);
      setError(null);
    } catch (error) {
      setUser(null);
      setError(error.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    // Generate state parameter for OAuth security
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem('oauth_state', state);
    
    const authUrl = API_CONFIG.ENDPOINTS.AUTH.DISCORD;
    const urlWithState = `${authUrl}?state=${state}`;
    window.location.href = urlWithState;
  };

  const logout = async () => {
    try {
      await axios.get(API_CONFIG.ENDPOINTS.AUTH.LOGOUT, {
        withCredentials: true,
        timeout: 10000
      });
      setUser(null);
      setError(null);
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = FRONTEND_URL;
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      setError('Logout failed');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
