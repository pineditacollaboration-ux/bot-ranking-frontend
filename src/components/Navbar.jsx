import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'INICIO' },
    { path: '/ranking', label: 'RANKING' },
    { path: '/temporadas', label: 'TEMPORADAS' },
    { path: '/historial', label: 'HISTORIAL' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <span className="logo-text">RANKING</span>
          <span className="logo-accent">BOT</span>
        </Link>

        <div className="navbar-menu">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.label}
            </Link>
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
