import React from 'react';
import { useAuth } from '../context/AuthContext';
import './ServerRequired.css';

const ServerRequired = () => {
  const { user, isInServer, DISCORD_INVITE_URL } = useAuth();

  if (!user || isInServer) {
    return null;
  }

  return (
    <div className="server-required-container">
      <div className="server-required-box">
        <div className="server-required-icon">🔒</div>
        <h2 className="server-required-title">Acceso Restringido</h2>
        <p className="server-required-message">
          No estás en el servidor de Discord de Royal para interactuar con la página.
        </p>
        <p className="server-required-submessage">
          Necesitas entrar al servidor para acceder a todas las funcionalidades.
        </p>
        <a 
          href={DISCORD_INVITE_URL} 
          target="_blank" 
          rel="noopener noreferrer"
          className="server-required-button"
        >
          <span className="button-icon">🎮</span>
          Unirse al Servidor
        </a>
        <p className="server-required-note">
          Una vez que te hayas unido, recarga la página para continuar.
        </p>
      </div>
    </div>
  );
};

export default ServerRequired;
