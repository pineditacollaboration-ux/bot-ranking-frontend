import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import './App.css';

// Lazy load components for better performance
const Home = lazy(() => import('./pages/Home'));
const Ranking = lazy(() => import('./pages/Ranking'));
const Profile = lazy(() => import('./pages/Profile'));
const Login = lazy(() => import('./pages/Login'));
const Seasons = lazy(() => import('./pages/Seasons'));
const Estadisticas = lazy(() => import('./pages/Estadisticas'));

// Loading component for lazy loaded routes
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '50vh',
    fontSize: '1.5rem',
    color: '#ef4444',
    fontFamily: 'Inter, sans-serif'
  }}>
    Cargando...
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Navbar />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/profile/:discordId" element={<Profile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/temporadas" element={<Seasons />} />
              <Route path="/estadisticas" element={<Estadisticas />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
