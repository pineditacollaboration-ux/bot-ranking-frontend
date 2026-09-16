import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import './Home.css';

const Home = () => {
  const { user } = useAuth();
  const [stats, setStats]   = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sRes = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
        setStats(sRes.data);
      } catch (_) {}
    };
    fetchData();
    const iv = setInterval(fetchData, 20000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="home-page-real">
      <div className="home-hero-real">

        {/* ── LEFT ── */}
        <div className="hhr-left">
          <div className="hhr-subtitle">
            <span className="hhr-line" />
            LIGA COMPETITIVA OFICIAL
          </div>

          <h1 className="hhr-title">
            ROYAL <span className="hhr-title-red">RANKED</span>
          </h1>

          <p className="hhr-desc">
            La plataforma definitiva para el público competitivo.<br/>
            Salas privadas, partidas rankeadas y premios reales.
          </p>

          <div className="hhr-actions">
            <a href="https://discord.gg/zscGKBdfGA" target="_blank" rel="noreferrer" className="btn-primary-massive">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              ENTRA EN DISCORD
            </a>
            <Link to="/ranking" className="btn-secondary-massive">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
            </Link>
          </div>

          {/* Live stats bar */}
          <div className="hhr-stats-bar">
            <div className="hhr-stat">
              <span className="hst-val">{stats ? stats.totalPlayers.toLocaleString() : '—'}</span>
              <span className="hst-key">JUGADORES</span>
            </div>
            <div className="hhr-stat-div" />
            <div className="hhr-stat">
              <span className="hst-val">{stats ? stats.totalMatches.toLocaleString() : '—'}</span>
              <span className="hst-key">PARTIDAS JUGADAS</span>
            </div>
            <div className="hhr-stat-div" />
            <div className="hhr-stat">
              <span className="hst-val" style={{ color: stats?.botOnline ? '#00e06a' : '#ff4444' }}>
                {stats?.botOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
              <span className="hst-key">ESTADO BOT</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: How It Works Panel ── */}
        <div className="hhr-right">
           <div className="hhr-info-card">
              <div className="hhr-info-title">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--crimson)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                ¿CÓMO FUNCIONA?
              </div>
              
              <div className="hhr-steps">
                <div className="hhr-step">
                  <div className="step-num">1</div>
                  <div className="step-text">
                    <strong>Únete a la comunidad</strong>
                    <span>Entra a nuestro servidor de Discord oficial para empezar.</span>
                  </div>
                </div>
                
                <div className="hhr-step">
                  <div className="step-num">2</div>
                  <div className="step-text">
                    <strong>Juega en lobbies</strong>
                    <span>Compite contra otros jugadores reales y suma victorias.</span>
                  </div>
                </div>
                
                <div className="hhr-step">
                  <div className="step-num">3</div>
                  <div className="step-text">
                    <strong>Escala en el ranking</strong>
                    <span>Gana puntos ELO, sube de rango mundial y llévate premios.</span>
                  </div>
                </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
