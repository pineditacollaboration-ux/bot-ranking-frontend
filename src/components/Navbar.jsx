import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, login } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  const links = [
    { to: '/', label: 'INICIO' },
    { to: '/ranking', label: 'RANKING' },
    { to: '/temporadas', label: 'TEMPORADAS' },
    { to: '/estadisticas', label: 'ESTADÍSTICAS' },
    { href: 'https://discord.gg/zscGKBdfGA', label: 'DISCORD ↗', external: true },
  ];

  return (
    <>
      <nav className="navbar-premium">
        <div className="navbar-container">

          <Link to="/" className="nav-logo">
            <img src="/logo.gif" alt="Royal Ranked" className="logo-img"
              onError={e => { e.target.onerror = null; e.target.src = '/logo.png'; }}
            />
          </Link>

          {/* Desktop links */}
          <div className="nav-links">
            {links.map(l => l.external
              ? <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="nav-link">{l.label}</a>
              : <Link key={l.label} to={l.to} className={`nav-link ${isActive(l.to) ? 'active' : ''}`}>{l.label}</Link>
            )}
          </div>

          {/* Desktop CTA */}
          <div className="nav-right">
            {user ? (
              <Link to={`/profile/${user.id}`} className="btn-skewed btn-white">
                <span className="btn-skewed-content">{user.username}</span>
              </Link>
            ) : (
              <button onClick={login} className="btn-skewed btn-white">
                <span className="btn-skewed-content">ENTRAR</span>
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button className="nav-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menú">
            <span style={{ transform: menuOpen ? 'rotate(45deg) translate(5px,5px)' : 'none' }}></span>
            <span style={{ opacity: menuOpen ? 0 : 1 }}></span>
            <span style={{ transform: menuOpen ? 'rotate(-45deg) translate(5px,-5px)' : 'none' }}></span>
          </button>

        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`nav-drawer ${menuOpen ? 'open' : ''}`}>
        {links.map(l => l.external
          ? <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="nav-link" onClick={() => setMenuOpen(false)}>{l.label}</a>
          : <Link key={l.label} to={l.to} className={`nav-link ${isActive(l.to) ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>{l.label}</Link>
        )}
        <div className="nav-drawer-btn">
          {user ? (
            <Link to={`/profile/${user.id}`} className="btn-skewed btn-red" onClick={() => setMenuOpen(false)}>
              <span className="btn-skewed-content">{user.username}</span>
            </Link>
          ) : (
            <button onClick={() => { login(); setMenuOpen(false); }} className="btn-skewed btn-red">
              <span className="btn-skewed-content">ENTRAR CON DISCORD</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};
export default Navbar;
