/**
 * ROYAL RANKED — API en Tiempo Real
 * Express server que expone datos reales de MongoDB al frontend Next.js
 * Puerto: 3001
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

let _clientRef = null;
let _matchesRef = null;
let _settingsRef = null;
let _startedAt = Date.now();

// Modelos de Mongoose (ya conectados por el bot principal)
let Player, MatchHistory, ActiveMatch;
try {
  ({ Player, MatchHistory, ActiveMatch } = require('../../models'));
} catch (e) {
  console.error('[API] Error cargando modelos:', e.message);
}

// ─── Caché en memoria para evitar golpear Mongo en cada request ───
const CACHE_TTL_MS = 8_000; // 8 segundos — datos casi en tiempo real
const cache = new Map();

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Helpers ───
function buildAvatarUrl(discordId, avatarHash) {
  if (!avatarHash) {
    const defaultIdx = BigInt(discordId) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIdx}.png`;
  }
  const animated = avatarHash.startsWith('a_');
  const ext = animated ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`;
}

async function resolveDiscordUser(discordId) {
  if (!_clientRef) return null;
  try {
    const user = await _clientRef.users.fetch(discordId, { force: false }).catch(() => null);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.globalName || user.username,
      avatar: buildAvatarUrl(user.id, user.avatar),
    };
  } catch (_) {
    return null;
  }
}

// ─── App Express ───
const app = express();

// 1. Seguridad de cabeceras HTTP (oculta que es Express, protege contra XSS, etc.)
app.use(helmet());

// 2. Limitar peticiones (previene ataques DDoS o spam a la API)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 120, // máximo 120 peticiones por minuto por IP
  message: { error: 'Demasiadas peticiones. Intenta más tarde.' }
});
app.use(limiter);

// 3. CORS (solo necesario si se llama desde el navegador, pero lo mantenemos cerrado)
app.use(cors({
  origin: ['http://localhost:3000', 'https://royalranked.xyz', 'https://www.royalranked.xyz', 'http://localhost:5173', 'http://45.126.208.136:7000'],
  credentials: true,
  methods: ['GET', 'POST'],
  optionsSuccessStatus: 200,
}));
app.use(express.json());

// 4. Configurar sesión (antes de passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'secreto_session_bot_ranking_2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// 5. Passport config
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// Discord OAuth Strategy
let discordConfigured = false;

function configureDiscordOAuth(config) {
  if (discordConfigured) return;
  
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID || '1548895109221842994',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || 'D_8DQHmtMzMwc981OzKVbCBHAwep0cVtnUrJoM',
    callbackURL: process.env.DISCORD_REDIRECT_URI || 'https://royalranked.xyz/auth/discord/callback',
    scope: ['identify', 'guilds']
  }, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
  }));
  
  discordConfigured = true;
}

// 6. Middleware de API Key (La verdadera protección) - NO aplica a rutas de auth ni de lectura pública
app.use((req, res, next) => {
  // Skip API key check for auth routes and public read-only views
  const publicPaths = ['/auth/', '/api/health', '/api/stats', '/api/ranking', '/api/matches/active', '/api/matches/recent'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  const apiKey = req.headers.authorization;
  const validKey = process.env.ROYAL_API_KEY || 'royal_secure_key_123';
  
  if (!apiKey || apiKey !== validKey) {
    console.warn(`[API] Intento de acceso bloqueado (IP: ${req.ip})`);
    return res.status(401).json({ error: 'Acceso Denegado. API Key inválida o no proporcionada.' });
  }
  next();
});

// ─── Middleware de logs ───
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// ══════════════════════════════════════════
// Rutas de autenticación Discord OAuth
// ══════════════════════════════════════════
app.get('/auth/discord', (req, res, next) => {
  if (!discordConfigured) {
    return res.status(500).json({ error: 'Discord OAuth no configurado' });
  }
  passport.authenticate('discord')(req, res, next);
});

app.get('/auth/discord/callback', 
  passport.authenticate('discord', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'No autenticado' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

// ══════════════════════════════════════════
// GET /api/health
// Estado del bot y la API
// ══════════════════════════════════════════
app.get('/api/health', (req, res) => {
  const botReady = _clientRef && _clientRef.isReady();
  const uptimeSeconds = Math.floor((Date.now() - _startedAt) / 1000);
  res.json({
    status: 'ok',
    bot: botReady ? 'online' : 'offline',
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
  });
});

// ══════════════════════════════════════════
// GET /api/stats
// Estadísticas globales reales desde MongoDB
// ══════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
  try {
    const cached = getCache('stats');
    if (cached) return res.json(cached);

    const [totalPlayers, totalMatches, activePlayers] = await Promise.all([
      Player.countDocuments(),
      MatchHistory.countDocuments(),
      Player.countDocuments({ points: { $gt: 0 } }),
    ]);

    // Partidas activas en memoria
    const activeMatchCount = _matchesRef ? _matchesRef.size : 0;

    // Obtener la cantidad real de miembros en el Discord
    let discordMembers = totalPlayers;
    if (_clientRef) {
      const totalGuildMembers = _clientRef.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      if (totalGuildMembers > 0) discordMembers = totalGuildMembers;
    }

    const data = {
      totalPlayers,
      discordMembers,
      totalMatches,
      activePlayers,
      activeMatches: activeMatchCount,
      botOnline: _clientRef ? _clientRef.isReady() : false,
      timestamp: new Date().toISOString(),
    };

    setCache('stats', data);
    res.json(data);
  } catch (err) {
    console.error('[API /stats]', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ══════════════════════════════════════════
// GET /api/ranking?limit=10&type=points|wins|mvps|season
// Leaderboard en tiempo real
// ══════════════════════════════════════════
app.get('/api/ranking', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const type = req.query.type || 'points';
    const cacheKey = `ranking_${type}_${limit}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    let query;
    let sortField;

    if (type === 'season') {
      sortField = { 'currentSeason.points': -1 };
      query = Player.find({ 'currentSeason.points': { $gt: 0 } })
        .sort(sortField)
        .limit(limit)
        .lean();
    } else if (type === 'wins') {
      sortField = { wins: -1 };
      query = Player.find({ wins: { $gt: 0 } })
        .sort(sortField)
        .limit(limit)
        .lean();
    } else if (type === 'mvps') {
      sortField = { mvps: -1 };
      query = Player.find({ mvps: { $gt: 0 } })
        .sort(sortField)
        .limit(limit)
        .lean();
    } else {
      // default: puntos globales
      sortField = { points: -1 };
      query = Player.find({ points: { $gt: 0 } })
        .sort(sortField)
        .limit(limit)
        .lean();
    }

    const players = await query;

    // Resolver usuarios de Discord en paralelo
    const resolved = await Promise.all(
      players.map(async (p, i) => {
        const discordUser = await resolveDiscordUser(p._id);
        return {
          rank: i + 1,
          discordId: p._id,
          username: discordUser?.displayName || p.customName || `Usuario#${p._id.slice(-4)}`,
          avatar: discordUser?.avatar || buildAvatarUrl(p._id, null),
          points: p.points || 0,
          wins: p.wins || 0,
          losses: p.losses || 0,
          mvps: p.mvps || 0,
          streak: p.streak || 0,
          maxStreak: p.maxStreak || 0,
          seasonPoints: p.currentSeason?.points || 0,
          seasonWins: p.currentSeason?.wins || 0,
        };
      })
    );

    const data = { type, players: resolved, total: resolved.length, timestamp: new Date().toISOString() };
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[API /ranking]', err);
    res.status(500).json({ error: 'Error al obtener ranking' });
  }
});

// ══════════════════════════════════════════
// GET /api/matches/active
// Partidas activas en este momento
// ══════════════════════════════════════════
app.get('/api/matches/active', async (req, res) => {
  try {
    // Obtener de la base de datos (fuente de verdad)
    const activeMatches = await ActiveMatch.find({ closed: false, statsApplied: false }).lean();

    const resolved = await Promise.all(
      activeMatches.map(async (m) => {
        // Resolver nombres de los jugadores
        const team1Users = await Promise.all(
          (m.team1 || []).map(async (id) => {
            const u = await resolveDiscordUser(id);
            return {
              id,
              username: u?.displayName || `Jugador#${id.slice(-4)}`,
              avatar: u?.avatar || buildAvatarUrl(id, null),
            };
          })
        );
        const team2Users = await Promise.all(
          (m.team2 || []).map(async (id) => {
            const u = await resolveDiscordUser(id);
            return {
              id,
              username: u?.displayName || `Jugador#${id.slice(-4)}`,
              avatar: u?.avatar || buildAvatarUrl(id, null),
            };
          })
        );

        return {
          matchId: m._id,
          matchNumber: m.matchNumber,
          mode: m.mode || '?v?',
          team1: team1Users,
          team2: team2Users,
          wager: m.wagerAmount || 0,
          startedAt: m.createdAt || null,
        };
      })
    );

    res.json({
      count: resolved.length,
      matches: resolved,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API /matches/active]', err);
    res.status(500).json({ error: 'Error al obtener partidas activas' });
  }
});

// ══════════════════════════════════════════
// GET /api/matches/recent?limit=10
// Historial de partidas recientes
// ══════════════════════════════════════════
app.get('/api/matches/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const cacheKey = `recent_matches_${limit}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const matches = await MatchHistory.find({})
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    const resolved = await Promise.all(
      matches.map(async (m) => {
        const mvpUser = m.mvp ? await resolveDiscordUser(m.mvp) : null;
        const winnerLabel = m.winner === 'team1' ? 'Equipo 1' : m.winner === 'team2' ? 'Equipo 2' : 'Sin ganador';

        const team1Users = await Promise.all(
          (m.team1 || []).map(async (id) => {
            const u = await resolveDiscordUser(id);
            return {
              id,
              username: u?.displayName || `Jugador#${id.slice(-4)}`,
              avatar: u?.avatar || buildAvatarUrl(id, null),
            };
          })
        );

        const team2Users = await Promise.all(
          (m.team2 || []).map(async (id) => {
            const u = await resolveDiscordUser(id);
            return {
              id,
              username: u?.displayName || `Jugador#${id.slice(-4)}`,
              avatar: u?.avatar || buildAvatarUrl(id, null),
            };
          })
        );

        return {
          matchId: m._id,
          matchNumber: m.matchNumber,
          mode: m.mode || '?v?',
          winner: winnerLabel,
          team1: team1Users,
          team2: team2Users,
          mvp: mvpUser ? { id: m.mvp, username: mvpUser.displayName, avatar: mvpUser.avatar } : null,
          date: m.date,
          season: m.season || null,
        };
      })
    );

    const data = { matches: resolved, total: resolved.length, timestamp: new Date().toISOString() };
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[API /matches/recent]', err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// ══════════════════════════════════════════
// GET /api/player/:discordId
// Perfil de un jugador específico
// ══════════════════════════════════════════
app.get('/api/player/:discordId', async (req, res) => {
  try {
    const { discordId } = req.params;
    if (!discordId || !/^\d+$/.test(discordId)) {
      return res.status(400).json({ error: 'ID de Discord inválido' });
    }

    const player = await Player.findById(discordId).lean();
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

    const discordUser = await resolveDiscordUser(discordId);

    // Calcular rango (posición en leaderboard)
    const rankPosition = await Player.countDocuments({ 'currentSeason.points': { $gt: player.currentSeason?.points || 0 } }) + 1;

    const recentMatchesRaw = await MatchHistory.find({
      $or: [{ team1: discordId }, { team2: discordId }]
    })
      .sort({ date: -1 })
      .limit(10)
      .lean();

    const recentMatches = await Promise.all(
      recentMatchesRaw.map(async (m) => {
        const team1Users = await Promise.all((m.team1 || []).map(async (id) => {
          const u = await resolveDiscordUser(id);
          return { id, username: u?.displayName || `Jugador#${id.slice(-4)}`, avatar: u?.avatar || buildAvatarUrl(id, null) };
        }));
        const team2Users = await Promise.all((m.team2 || []).map(async (id) => {
          const u = await resolveDiscordUser(id);
          return { id, username: u?.displayName || `Jugador#${id.slice(-4)}`, avatar: u?.avatar || buildAvatarUrl(id, null) };
        }));
        const mvpUser = m.mvp ? await resolveDiscordUser(m.mvp) : null;
        return {
          matchId: m._id,
          matchNumber: m.matchNumber,
          mode: m.mode || '?v?',
          winner: m.winner === 'team1' ? 'Equipo 1' : m.winner === 'team2' ? 'Equipo 2' : 'Sin ganador',
          team1: team1Users,
          team2: team2Users,
          mvp: mvpUser ? { id: m.mvp, username: mvpUser.displayName, avatar: mvpUser.avatar } : null,
          date: m.date,
          season: m.season || null,
        };
      })
    );

    res.json({
      discordId: player._id,
      username: discordUser?.displayName || player.customName || `Usuario#${discordId.slice(-4)}`,
      avatar: discordUser?.avatar || buildAvatarUrl(discordId, null),
      rank: rankPosition,
      points: player.currentSeason?.points || 0,
      wins: player.currentSeason?.wins || 0,
      losses: player.currentSeason?.losses || 0,
      mvps: player.currentSeason?.mvps || 0,
      streak: player.streak || 0,
      maxStreak: player.maxStreak || 0,
      styleCoins: player.styleCoins || 0,
      currentSeason: player.currentSeason || {},
      pastSeasons: player.pastSeasons || [],
      recentMatches,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API /player]', err);
    res.status(500).json({ error: 'Error al obtener jugador' });
  }
});

// ══════════════════════════════════════════
// GET /api/voice/waiting
// Estado en tiempo real de los canales de espera
// ══════════════════════════════════════════
app.get('/api/voice/waiting', async (req, res) => {
  try {
    const cacheKey = 'voice_waiting';
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    if (!_clientRef) {
      return res.status(503).json({ error: 'Bot no está listo' });
    }

    const waitingChannelIds = [
      '1548203236131868712', // Esperando 1
      '1548203237545615424', // Esperando 2
      '1548203240334823505', // Esperando 3
      '1548203242616520714', // Esperando 4
      '1548203244935843860', // Esperando 5
      '1548203246701514792', // Esperando 6
      '1548203250715725889', // Esperando 7
      '1548203253186039858', // Esperando 8
      '1548203255446769724', // Esperando 9
      '1548203256776237137'  // Esperando 10
    ];

    const channelsData = [];
    let totalWaiting = 0;

    for (const channelId of waitingChannelIds) {
      const channel = _clientRef.channels.cache.get(channelId);
      if (!channel) continue;

      const members = [];
      channel.members.forEach(member => {
        const isDeaf = member.voice.deaf || member.voice.selfDeaf;
        const isMute = member.voice.mute || member.voice.selfMute;
        
        members.push({
          id: member.user.id,
          username: member.user.globalName || member.user.username,
          avatar: buildAvatarUrl(member.user.id, member.user.avatar),
          isDeaf,
          isMute
        });
        totalWaiting++;
      });

      channelsData.push({
        id: channel.id,
        name: channel.name,
        members
      });
    }

    const data = {
      totalWaiting,
      channels: channelsData,
      timestamp: new Date().toISOString()
    };

    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[API /voice/waiting]', err);
    res.status(500).json({ error: 'Error al obtener estado de voz' });
  }
});
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ══════════════════════════════════════════
// INIT: Función de arranque llamada desde index.js
// ══════════════════════════════════════════
function startApiServer({ client, matches, settings, config, port = 7000 } = {}) {
  _clientRef = client;
  _matchesRef = matches;
  _settingsRef = settings;
  _startedAt = Date.now();
  
  // Configurar Discord OAuth si se proporciona config
  if (config) {
    configureDiscordOAuth(config);
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ [API] Servidor REST en tiempo real corriendo en http://0.0.0.0:${port}`);
    console.log(`   → Endpoints: /api/health, /api/stats, /api/ranking, /api/matches/active, /api/matches/recent`);
    console.log(`   → Auth: /auth/discord, /auth/user, /auth/logout`);
  });

  server.on('error', (err) => {
    console.error(`[API] Error al iniciar servidor:`, err.message);
  });

  return server;
}

module.exports = { startApiServer };
