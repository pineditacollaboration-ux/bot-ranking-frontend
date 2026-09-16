import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, login } = useAuth();

  return (
    <nav className="navbar-premium">
      <div className="navbar-container">
        
        <Link to="/" className="nav-logo">
          <img src="/logo.gif" alt="Royal Ranked" className="logo-img" />
        </Link>
        
        <div className="nav-links">
          <Link to="/" className="nav-link">HOME</Link>
          <Link to="/ranking" className="nav-link active">RANKING</Link>
          <Link to="/temporadas" className="nav-link">TEMPORADAS</Link>
          <Link to="/estadisticas" className="nav-link">ESTADÍSTICAS</Link>
          <a href="https://discord.gg/zscGKBdfGA" target="_blank" rel="noreferrer" className="nav-link">DISCORD ↗</a>
        </div>

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

      </div>
    </nav>
  );
};
export default Navbar;
