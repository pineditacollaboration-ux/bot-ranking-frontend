import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { isValidDiscordID, sanitizeInput } from '../utils/security';

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

  const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  const FRONTEND_URL = process.env.REACT_APP_FRONTEND_URL || 'http://localhost:3000';
  
  // Debug: Log the actual API URL being used
  console.log('AuthContext - API_URL:', API_URL);
  console.log('AuthContext - REACT_APP_BACKEND_URL env var:', process.env.REACT_APP_BACKEND_URL);

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
      const response = await axios.get(`${API_URL}/auth/user`, {
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
    
    const authUrl = new URL(`${API_URL}/auth/discord`);
    authUrl.searchParams.append('state', state);
    window.location.href = authUrl.toString();
  };

  const logout = async () => {
    try {
      await axios.get(`${API_URL}/auth/logout`, {
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
