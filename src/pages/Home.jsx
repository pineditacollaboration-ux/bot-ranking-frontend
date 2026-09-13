import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RestrictedContent from '../components/RestrictedContent';
import './Home.css';

const Home = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  if (!user) {
    return <RestrictedContent />;
  }

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="home">
      <div className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            ROYAL <span className="hero-accent">RANKED</span>
          </h1>
          <p className="hero-subtitle">
            COMUNIDAD DESTINADA AL PÚBLICO DE FREE FIRE. CALLS DE INTERACCIÓN, JUEGO Y EVENTOS.
          </p>

          <div className="hero-actions">
            <a href="https://discord.gg/VBrarJu9DP" target="_blank" rel="noopener noreferrer" className="btn btn-discord">
              ÚNETE A NUESTRO DISCORD
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
