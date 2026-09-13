import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'HOME' },
    { path: '/ranking', label: 'RANKING' },
    { path: '/temporadas', label: 'TEMPORADA' },
    { path: '/estadisticas', label: 'ESTADÍSTICAS' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img src="/logo.png" alt="ROYAL RANKED" className="logo-image" />
          <span className="logo-text">Royal Ranked</span>
        </Link>

        <div className="navbar-menu">
          {navItems.map((item) => (
            item.external ? (
              <a
                key={item.path}
                href={item.path}
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            )
          ))}
        </div>

        <div className="navbar-auth">
          {user ? (
            <div className="user-menu">
              <Link to={`/profile/${user.id}`} className="user-profile">
                <img
                  src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                  alt={user.username}
                  className="user-avatar"
                />
                <span className="user-name">{user.username}</span>
              </Link>
              <button onClick={logout} className="logout-btn">
                Cerrar Sesión
              </button>
            </div>
          ) : (
            <Link to="/login" className="login-btn">
              ENTRAR
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
