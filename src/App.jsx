import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Ranking from './pages/Ranking';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Seasons from './pages/Seasons';
import Estadisticas from './pages/Estadisticas';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/profile/:discordId" element={<Profile />} />
            <Route path="/login" element={<Login />} />
            <Route path="/temporadas" element={<Seasons />} />
            <Route path="/estadisticas" element={<Estadisticas />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
