// src/utils/ranking.js
// Sistema de ranking global multi-servidor

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const rankingCache = {
  data: null,
  timestamp: 0,
  guildId: null,
  recomputing: false,
  allPlayers: null, // Array completo sin filtrar para optimización
  previousSnapshot: null, // Snapshot anterior para tracking de tendencias
  snapshotTimestamp: 0, // Timestamp del snapshot anterior
  globalRankMap: null, // Mapa de ranking global
  globalRankMapTimestamp: 0,
  seasonRankMap: null, // Mapa de ranking de temporada
  seasonRankMapTimestamp: 0
};

module.exports = function (deps) {
  const {
    Player,
    settings,
    // EmbedBuilder, // Eliminado para usar el require global y evitar shadowing
    // ActionRowBuilder, // Eliminado para usar el require global
    // ButtonBuilder, // Eliminado para usar el require global
    // ButtonStyle, // Eliminado para usar el require global
    // StringSelectMenuBuilder, // Eliminado para usar el require global
    COLORS,
    EMBED_DEFAULTS,
    config,
    client, // client is also a dependency
    Setting, // Setting is also a dependency
    cacheInvalidator // Nuevo: Sistema de invalidación inteligente
  } = deps;

  async function computeSortedRankingArray(guild) {
    const players = await Player.find({
      $or: [
        { 'currentSeason.points': { $gt: 0 } },
        { 'currentSeason.wins': { $gt: 0 } },
        { 'currentSeason.losses': { $gt: 0 } },
        { 'currentSeason.mvps': { $gt: 0 } },
        { 'currentSeason.creations': { $gt: 0 } }
      ]
    })
      .lean()
      .select('_id customName currentSeason.points currentSeason.wins currentSeason.losses currentSeason.mvps currentSeason.maxStreak currentSeason.creations')
      .sort({ 'currentSeason.points': -1, 'currentSeason.wins': -1, 'currentSeason.mvps': -1, _id: 1 });

    const filtered = guild ? players.filter(p => guild.members.cache.has(p._id)) : players;

    const data = filtered.map(p => ({
      id: p._id,
      customName: p.customName,
      points: p.currentSeason?.points || 0,
      wins: p.currentSeason?.wins || 0,
      losses: p.currentSeason?.losses || 0,
      mvps: p.currentSeason?.mvps || 0,
      streak: p.currentSeason?.streak || 0,
      maxStreak: p.currentSeason?.maxStreak || 0,
      creations: p.currentSeason?.creations || 0,
    }));

    return data.map((p, i) => ({ id: p.id, ...p, rank: i + 1 }));
  }

  async function computeSortedSeasonRankingArray(guild) {
    return computeSortedRankingArray(guild);
  }

  async function computeGlobalRanking() {
    const guildId = config.guildId || "1484375565908705414";
    const now = Date.now();
    // OPTIMIZACIÓN: Aumentar caché de 30s a 5min para reducir consultas a DB
    if (
      rankingCache.globalRankMap &&
      (now - rankingCache.globalRankMapTimestamp) < 300000 &&
      rankingCache.guildId === guildId
    ) {
      return rankingCache.globalRankMap;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.warn(`[computeGlobalRanking] Guild ${guildId} no encontrada en cache`);
      return {};
    }
    const sorted = await computeSortedRankingArray(guild);
    const map = Object.fromEntries(sorted.map(p => [p.id, p.rank]));

    rankingCache.globalRankMap = map;
    rankingCache.globalRankMapTimestamp = now;
    rankingCache.guildId = guildId;
    return map;
  }

  function invalidateGlobalRankCache() {
    rankingCache.globalRankMap = null;
    rankingCache.globalRankMapTimestamp = 0;
    rankingCache.guildId = null;
  }

  async function computeSeasonRanking() {
    const guildId = config.guildId || "1484375565908705414";
    const now = Date.now();
    // OPTIMIZACIÓN: Aumentar caché de 30s a 5min para reducir consultas a DB
    if (
      rankingCache.seasonRankMap &&
      (now - rankingCache.seasonRankMapTimestamp) < 300000 &&
      rankingCache.seasonGuildId === guildId
    ) {
      return rankingCache.seasonRankMap;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.warn(`[computeSeasonRanking] Guild ${guildId} no encontrada en cache`);
      return {};
    }
    const sorted = await computeSortedSeasonRankingArray(guild);
    const map = Object.fromEntries(sorted.map(p => [p.id, p.rank]));

    rankingCache.seasonRankMap = map;
    rankingCache.seasonRankMapTimestamp = now;
    rankingCache.seasonGuildId = guildId;
    return map;
  }

  function invalidateSeasonRankCache() {
    rankingCache.seasonRankMap = null;
    rankingCache.seasonRankMapTimestamp = 0;
    rankingCache.seasonGuildId = null;
    rankingCache.data = null;
    rankingCache.timestamp = 0;
    rankingCache.guildId = null;
  }

  function getSeasonRankCache() {
    return rankingCache.seasonRankMap || null;
  }

  async function getRanking(guild, type) {
    // OPTIMIZACIÓN: Aumentar caché de 5min a 10min
    const CACHE_DURATION = 10 * 60 * 1000;
    const now = Date.now();
    
    // Validar si necesitamos refrescar los datos crudos (allPlayers)
    const expired = !rankingCache.allPlayers || (now - rankingCache.timestamp) > CACHE_DURATION || rankingCache.guildId !== guild.id;
    
    if (expired) {
      if (!rankingCache.recomputing) {
        rankingCache.recomputing = true;
        try {
          const rawPlayers = await computeSortedSeasonRankingArray(guild);
          const processedData = rawPlayers.map(data => {
            const played = (data.wins || 0) + (data.losses || 0);
            return {
              id: data.id,
              customName: data.customName,
              points: data.points || 0,
              wins: data.wins || 0,
              losses: data.losses || 0,
              mvps: data.mvps || 0,
              maxStreak: data.maxStreak || 0,
              creations: data.creations || 0,
              played,
              winrate: played > 0 ? ((data.wins || 0) / played) * 100 : 0,
              kdr: (data.losses > 0) ? (data.wins || 0) / data.losses : (data.wins || 0)
            };
          });
          
          rankingCache.allPlayers = processedData; // Guardamos procesados para reordenamiento rápido
          rankingCache.timestamp = Date.now();
          rankingCache.guildId = guild.id;
          rankingCache.data = null; // Invalidar datos ordenados anteriores
          rankingCache.type = null;
        } catch (err) {
            console.error('[getRanking] Error computing ranking:', err);
        } finally {
          rankingCache.recomputing = false;
        }
      }
    }

    // Determinar el tipo de ordenamiento
    const effectiveType = type || 'points';

    // Si tenemos datos cacheados Y el tipo coincide, devolver cache
    // Nota: expired ya maneja la validez temporal
    if (rankingCache.data && rankingCache.type === effectiveType && !expired) {
        return [...rankingCache.data];
    }

    // Si tenemos datos en memoria (allPlayers), ordenarlos según el tipo solicitado
    if (rankingCache.allPlayers) {
        const sortedData = [...rankingCache.allPlayers]
            .filter(p => (effectiveType === 'winrate' || effectiveType === 'kdr') ? p.played >= 5 : true)
            .sort((a, b) => {
              let diff;
              switch (effectiveType) {
                case "points": diff = b.points - a.points; break;
                case "winrate": diff = b.winrate - a.winrate; break;
                case "kdr": diff = b.kdr - a.kdr; break;
                case "wins": diff = b.wins - a.wins; break;
                case "losses": diff = b.losses - a.losses; break;
                case "mvps": diff = b.mvps - a.mvps; break;
                case "maxStreak": diff = b.maxStreak - a.maxStreak; break;
                case "creations": diff = b.creations - a.creations; break;
                default: diff = 0; break;
              }
              if (diff !== 0) return diff;
              return b.points - a.points;
            });

        rankingCache.data = sortedData;
        rankingCache.type = effectiveType;
        return [...sortedData];
    }

    return [];
  }

  async function renderRanking(page, type, userId, guild) {
    const ranking = await getRanking(guild, type);
    
    // Validación de guild
    if (!guild) {
      console.error("[renderRanking] Error: El objeto 'guild' es undefined. No se puede generar el embed.");
      return { 
        embed: new EmbedBuilder()
          .setTitle('❌ Error')
          .setDescription('No se pudo cargar el ranking porque falta la información del servidor.')
          .setColor(COLORS.PRIMARY), 
        components: [] 
      };
    }

    // Configuración de categorías con emojis mejorados y unidades
    const EMOJIS = config?.emojis || {};
    const categories = [
      { id: "points", label: "Puntos", text: "Puntos", emoji: EMOJIS.rank || "🏆", unit: "puntos" },
      { id: "winrate", label: "Winrate", text: "Winrate", emoji: "📈", unit: "%" },
      { id: "kdr", label: "K/D Ratio", text: "K/D Ratio", emoji: "⚔️", unit: "KDR" },
      { id: "wins", label: "Victorias", text: "Victorias", emoji: EMOJIS.success || "✅", unit: "victorias" },
      { id: "losses", label: "Derrotas", text: "Derrotas", emoji: EMOJIS.error || "❌", unit: "derrotas" },
      { id: "mvps", label: "MVPs", text: "MVPs", emoji: EMOJIS.crown || "🌟", unit: "MVPs" },
      { id: "maxStreak", label: "Racha Máxima", text: "Racha Máxima", emoji: "🔥", unit: "racha" },
      { id: "creations", label: "Creaciones", text: "Creaciones", emoji: EMOJIS.maintenance || "🏗️", unit: "partidas" }
    ];

    if (ranking.length === 0) {
      const e = new EmbedBuilder()
        .setTitle('🏆 Ranking Competitivo')
        .setDescription('📊 **No hay datos disponibles**\n\n¡Sé el primero en marcar la historia y aparecer en el ranking!\n\n🎮 Juega partidas para comenzar tu ascenso.')
        .setColor(COLORS.PRIMARY)
        .setFooter(EMBED_DEFAULTS.footer);
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId(`rank_category_${userId}`)
        .setPlaceholder('📊 Seleccionar categoría de ranking')
        .addOptions(categories.map(c => ({ 
          label: c.label, 
          value: c.id, 
          default: c.id === (type || 'points') 
        })));
      
      const rowNav = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rank_prev_${type}_${page}_${userId}`)
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`rank_next_${type}_${page}_${userId}`)
          .setLabel("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`rank_refresh_${type}_${page}_${userId}`)
          .setLabel("🔄 Actualizar")
          .setStyle(ButtonStyle.Success)
      );
      
      return { embed: e, components: [new ActionRowBuilder().addComponents(categorySelect), rowNav] };
    }

    // Configuración de paginación
    const itemsPerPage = 10;
    // Lógica para "Ir a mi posición"
    if (page === 'self') {
      const userIndex = ranking.findIndex(p => p.id === userId);
      if (userIndex !== -1) {
        page = Math.ceil((userIndex + 1) / itemsPerPage);
      } else {
        page = 1; // Si no está rankeado, ir a la primera página
      }
    }

    const p = Number(page) || 1;
    const maxPage = Math.ceil(ranking.length / itemsPerPage) || 1;
    const safePage = Math.max(1, Math.min(p, maxPage));
    
    // Recalcular p si se ajustó
    const currentPage = safePage;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const slice = ranking.slice(start, end);

    // Encontrar la posición del usuario para resaltar
    const userRankIndex = ranking.findIndex(p => p.id === userId);
    const userPos = userRankIndex + 1;
    const userStats = userRankIndex !== -1 ? ranking[userRankIndex] : null;
    const seasonName = settings?.currentSeason || "Temporada";

    // Títulos mejorados con emojis dinámicos
    const currentCategory = categories.find(c => c.id === type) || categories[0];
    const titles = {
      points: `🏆 ${seasonName} • Ranking de Puntos`,
      winrate: `📈 ${seasonName} • Win Rate (Mín. 5 partidas)`,
      kdr: `⚔️ ${seasonName} • Ratio K/D`,
      wins: `✅ ${seasonName} • Ranking de Victorias`,
      losses: `❌ ${seasonName} • Registro de Derrotas`,
      mvps: `⭐ ${seasonName} • Jugadores Más Valiosos`,
      maxStreak: `🔥 ${seasonName} • Rachas Máximas`,
      creations: `🛠️ ${seasonName} • Partidas Creadas`,
    };

    // Calcular estado del servidor en tiempo real
    let playingCount = 0;
    if (settings.busyPlayers && settings.busyPlayers.size > 0) {
      playingCount = Array.from(settings.busyPlayers).filter(id => {
        const member = guild.members.cache.get(id);
        return member && !member.user.bot;
      }).length;
    }
    const voiceCount = guild.voiceStates.cache.filter(vs => vs.channelId && (!vs.member || !vs.member.user.bot)).size;
    const serverStatus = `🟢 **${playingCount}** Jugando • 🎙️ **${voiceCount}** En Voz`;

    // Generar descripción del ranking con formato mejorado
    // Verificar estado real en el servidor para evitar "fantasmas" (usuarios que salieron pero siguen en caché)
    const verifiedMembers = new Set();
    await Promise.all(slice.map(async (q) => {
      try {
        // fetch con force:false usa caché, pero si está obsoleto contacta la API
        const m = await guild.members.fetch({ user: q.id });
        if (m) verifiedMembers.add(q.id);
      } catch (err) {
        // Ignorar el error, significa que no está en el server
      }
    }));

    const description = slice.map((q, i) => {
      const pos = start + i + 1;
      
      // Emojis de medallas premium para Top 3
      let positionDisplay;
      if (p === 1 && pos === 1) {
        positionDisplay = '🥇';
      } else if (p === 1 && pos === 2) {
        positionDisplay = '🥈';
      } else if (p === 1 && pos === 3) {
        positionDisplay = '🥉';
      } else if (pos <= 9) {
        positionDisplay = `\`${pos}º\``;
      } else {
        positionDisplay = `\`#${pos}\``;
      }

      // Destacar al usuario actual
      const isCurrentUser = q.id === userId;
      const userHighlight = isCurrentUser ? '**' : '';
      const bgHighlight = isCurrentUser ? '`➤ ' : '  ';
      const bgHighlightEnd = isCurrentUser ? '`' : '';

      // Formatear valor según tipo con separadores de miles
      let value;
      let valueIcon = '';
      switch (type) {
        case "points": 
          value = formatNumber(q.points || 0);
          valueIcon = 'pts';
          break;
        case "winrate": 
          const wr = q.winrate.toFixed(1);
          value = `${wr}%`;
          valueIcon = getWinrateEmoji(parseFloat(wr));
          break;
        case "kdr": 
          const kdr = q.kdr.toFixed(2);
          value = kdr;
          valueIcon = getKDREmoji(parseFloat(kdr));
          break;
        case "wins":
          value = formatNumber(q[type] || 0);
          valueIcon = '🎯';
          break;
        case "losses":
          value = formatNumber(q[type] || 0);
          valueIcon = '💀';
          break;
        case "mvps":
          value = formatNumber(q[type] || 0);
          valueIcon = '⭐';
          break;
        case "maxStreak":
          value = formatNumber(q[type] || 0);
          valueIcon = getStreakEmoji(q[type] || 0);
          break;
        case "creations":
          value = formatNumber(q[type] || 0);
          valueIcon = '🎮';
          break;
        default: 
          value = formatNumber(q[type] || 0);
          valueIcon = '';
          break;
      }

      let displayName;
      if (q.customName) {
        displayName = q.customName;
      } else {
        const member = guild.members.cache.get(q.id);
        if (member) {
          const rawName = member.displayName;
          displayName = rawName.replace(/RANK\s*\d+\s*\|\s*/i, '').trim();
        } else {
          const cachedUser = client.users.cache.get(q.id);
          displayName = cachedUser ? cachedUser.username : `User ${q.id.slice(0, 6)}`;
        }
      }
      
      // Añadir tier badge para Top 10
      let tierBadge = '';
      if (currentPage === 1) {
        tierBadge = getTierBadge(pos, type, q);
      }

      // Añadir indicador de racha
      const streakIndicator = (q.streak >= 3) ? ' 🔥' : '';

      // V5.0: Indicadores de Actividad
      let activityIndicator = '';
      if (settings.busyPlayers && settings.busyPlayers.has(q.id)) {
        activityIndicator = ' 🟢'; // Jugando
      } else {
        const member = guild.members.cache.get(q.id);
        if (member && member.voice.channelId) {
          activityIndicator = ' 🎙️'; // En voz
        }
      }

      // V5.0: Badges de Logros (Calculados al vuelo)
      let achievementBadges = '';
      if (q.winrate >= 70 && (q.wins + q.losses) >= 20) achievementBadges += ' 🦅'; // Elite
      if ((q.wins + q.losses) >= 100) achievementBadges += ' 🛡️'; // Veterano
      if (q.kdr >= 4.0 && (q.wins + q.losses) >= 10) achievementBadges += ' 🤖'; // Slayer

      // Mostrar el nombre en texto plano para evitar el problema de <@id> feo
      let displayLabel = `**${displayName.replace(/[*`_~]/g, '')}**`;
      return `**${positionDisplay}** - ${displayLabel}: ${value} ${currentCategory.unit || ''}`;
    }).join("\n") || "⚠️ No hay jugadores en esta página.";

    // Estadísticas del usuario (ya calculadas arriba)
    // const userRankIndex = ranking.findIndex(pl => pl.id === userId);
    // const userPos = userRankIndex !== -1 ? userRankIndex + 1 : 'N/A';
    // const userStats = userRankIndex !== -1 ? ranking[userRankIndex] : null;
    
    // Calcular estadísticas globales
    const globalStats = calculateGlobalStats(ranking, type);
    
    // Generar estadísticas adicionales del usuario con comparativas
    let userStatsField = '';
    if (userStats && userRankIndex !== -1) {
      let statValue, progressBar, comparison = '';
      
      // Jugadores cercanos para comparación
      const playerAbove = userRankIndex > 0 ? ranking[userRankIndex - 1] : null;
      const playerBelow = userRankIndex < ranking.length - 1 ? ranking[userRankIndex + 1] : null;
      
      switch (type) {
        case "points": 
          statValue = `${formatNumber(userStats.points)} pts`;
          const maxPoints = ranking[0]?.points || 1;
          progressBar = createProgressBar(userStats.points, maxPoints, 12);
          
          if (playerAbove) {
            const diff = playerAbove.points - userStats.points;
            comparison = `\n║ 📊 A **${formatNumber(diff)} pts** del jugador superior`;
          }
          break;
        case "winrate": 
          statValue = `${userStats.winrate.toFixed(1)}%`;
          progressBar = createProgressBar(userStats.winrate, 100, 12);
          
          if (playerAbove) {
            const diff = (playerAbove.winrate - userStats.winrate).toFixed(1);
            comparison = `\n║ 📊 A **${diff}%** del jugador superior`;
          }
          break;
        case "kdr": 
          statValue = `${userStats.kdr.toFixed(2)} KDR`;
          const maxKDR = Math.max(3, ranking[0]?.kdr || 3);
          progressBar = createProgressBar(userStats.kdr, maxKDR, 12);
          
          if (playerAbove) {
            const diff = (playerAbove.kdr - userStats.kdr).toFixed(2);
            comparison = `\n║ 📊 A **${diff}** del jugador superior`;
          }
          break;
        default: 
          statValue = formatNumber(userStats[type] || 0);
          const maxValue = ranking[0]?.[type] || 1;
          progressBar = createProgressBar(userStats[type] || 0, maxValue, 12);
          
          if (playerAbove) {
            const diff = (playerAbove[type] || 0) - (userStats[type] || 0);
            comparison = `\n║ 📊 A **${formatNumber(diff)}** del jugador superior`;
          }
          break;
      }
      
      const tier = getRankTier(userPos, ranking.length);
      const percentile = ((ranking.length - userPos + 1) / ranking.length * 100).toFixed(0);
      
      // Calcular progreso hacia el siguiente tier
      let nextTierInfo = '';
      const nextTier = getNextTier(userPos, ranking.length);
      if (nextTier) {
        const playersToClimb = userPos - nextTier.maxPosition;
        nextTierInfo = `\n║ 🎯 **Siguiente:** ${nextTier.emoji} ${nextTier.name} (Sube ${playersToClimb} posiciones)`;
      }
      
      // Diseño minimalista estilo referencia
      userStatsField = `\n\n\u200b\n**Tus Estadísticas**\nPosición: **#${userPos}**\n${currentCategory.label}: **${statValue}**`;
    }

    const userInGuild = guild.members.cache.has(userId);
    let footerText = userInGuild
      ? `Página ${currentPage}/${maxPage} • ${formatNumber(ranking.length)} jugadores activos • ${globalStats}`
      : `Página ${currentPage}/${maxPage} • No estás en el ranking`;
    
    if (page === 'self' && userRankIndex === -1) {
      footerText = `Página ${currentPage}/${maxPage} • No se encontró tu posición en el ranking • ${globalStats}`;
    }

    let top1Avatar = guild.iconURL({ dynamic: true, size: 256 });
    if (ranking.length > 0) {
      const top1Id = ranking[0].id;
      const top1User = client.users.cache.get(top1Id);
      if (top1User) {
        top1Avatar = top1User.displayAvatarURL({ dynamic: true, size: 256 });
      }
    }

    // Crear embed con diseño premium
    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: `Ranking Top — ${currentCategory.text}`, 
        iconURL: guild.iconURL({ dynamic: true }) || undefined 
      })
      .setDescription(`${serverStatus}\n\n${description}` + (userStatsField || ''))
      .setColor(getColorByRank(userPos))
      .setThumbnail(top1Avatar)
      .setImage(EMBED_DEFAULTS.thumbnail)
      .setFooter({ 
        text: rankingCache.recomputing ? `${footerText} • ⏳ Recalculando...` : footerText,
        iconURL: guild.iconURL() || undefined
      })
      .setTimestamp();

    /* SECCIONES ELIMINADAS POR SOLICITUD DE SIMPLIFICACIÓN
    // Agregar podio de honor para página 1
    if (currentPage === 1 && slice.length >= 3) {
      // ... (código comentado)
    }

    // Agregar estadísticas del servidor (solo en página 1 de puntos)
    if (currentPage === 1 && type === 'points' && ranking.length > 0) {
      // ... (código comentado)
    }

    // Agregar distribución de tiers (solo en página 1)
    if (currentPage === 1 && ranking.length > 0) {
      // ... (código comentado)
    }

    // Agregar leyenda de emojis (solo para las categorías con emojis dinámicos)
    if (currentPage === 1 && (type === 'winrate' || type === 'kdr' || type === 'maxStreak')) {
      // ... (código comentado)
    }
    */

    // Menú de selección de categoría con mejor diseño
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId(`rank_category_${userId}`)
      .setPlaceholder('📊 Cambiar categoría del ranking')
      .addOptions(categories.map(c => ({ 
        label: c.label, 
        value: c.id, 
        emoji: c.emoji,
        default: c.id === type 
      })));

    // Botones de navegación simplificados (Atrás - Mi Posición - Siguiente)
    const rowNav = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rank_prev_${type}_${currentPage}_${userId}`)
        .setLabel("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId(`rank_self_${type}_${currentPage}_${userId}`)
        .setLabel("📍 Mi Posición")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rank_next_${type}_${currentPage}_${userId}`)
        .setLabel("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= maxPage)
    );

    return { 
      embed, 
      components: [
        new ActionRowBuilder().addComponents(categorySelect), 
        rowNav
      ] 
    };
  }

  // === FUNCIONES AUXILIARES DE FORMATO ===

  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function createProgressBar(current, max, length = 12) {
    const percentage = Math.min(Math.max(current / max, 0), 1);
    const filled = Math.round(percentage * length);
    const empty = length - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `\`${bar}\` ${(percentage * 100).toFixed(1)}%`;
  }

  function getColorByRank(rank) {
    if (rank === 1) return 0xFFD700; // Oro brillante
    if (rank === 2) return 0xC0C0C0; // Plata
    if (rank === 3) return 0xCD7F32; // Bronce
    if (rank <= 10) return 0x00D9FF; // Diamante (azul brillante)
    if (rank <= 25) return 0x9D00FF; // Platino (púrpura)
    if (rank <= 50) return 0xFF6B9D; // Oro rosa
    return COLORS.GOLD || 0xFFAA00; // Dorado por defecto
  }

  function getPodiumEmoji(rank) {
    if (rank === 1) return '👑';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    if (rank <= 10) return '💎';
    if (rank <= 25) return '💠';
    if (rank <= 50) return '⭐';
    if (rank <= 100) return '🎖️';
    return '🏅';
  }

  function getWinrateEmoji(winrate) {
    if (winrate >= 75) return '🔥';
    if (winrate >= 65) return '✨';
    if (winrate >= 55) return '📈';
    if (winrate >= 45) return '📊';
    if (winrate >= 35) return '📉';
    return '💔';
  }

  function getKDREmoji(kdr) {
    if (kdr >= 3.5) return '🔥';
    if (kdr >= 2.5) return '⚡';
    if (kdr >= 1.8) return '✨';
    if (kdr >= 1.2) return '💪';
    if (kdr >= 0.8) return '📊';
    return '💀';
  }

  function getStreakEmoji(streak) {
    if (streak >= 10) return '🔥';
    if (streak >= 7) return '⚡';
    if (streak >= 5) return '✨';
    if (streak >= 3) return '💫';
    return '⭐';
  }

  function getRankTier(position, totalPlayers) {
    const percentile = (position / totalPlayers) * 100;
    
    if (position === 1) return { name: 'LEYENDA', emoji: '👑', color: 0xFFD700 };
    if (position <= 3) return { name: 'MAESTRO SUPREMO', emoji: '💎', color: 0x00D9FF };
    if (percentile <= 5) return { name: 'MAESTRO', emoji: '💠', color: 0x9D00FF };
    if (percentile <= 10) return { name: 'DIAMANTE', emoji: '💎', color: 0x00D9FF };
    if (percentile <= 20) return { name: 'PLATINO', emoji: '✨', color: 0x9D00FF };
    if (percentile <= 35) return { name: 'ORO', emoji: '⭐', color: 0xFFAA00 };
    if (percentile <= 50) return { name: 'PLATA', emoji: '🎖️', color: 0xC0C0C0 };
    return { name: 'BRONCE', emoji: '🏅', color: 0xCD7F32 };
  }

  function getTierBadge(position, type, stats) {
    if (position > 10) return '';
    
    const tier = getRankTier(position, 100); // Usar 100 como referencia para Top 10
    return ` ${tier.emoji}`;
  }

  function calculateGlobalStats(ranking, type) {
    if (ranking.length === 0) return '';
    
    switch (type) {
      case 'points':
        const avgPoints = Math.round(ranking.reduce((sum, p) => sum + (p.points || 0), 0) / ranking.length);
        return `Promedio: ${formatNumber(avgPoints)} pts`;
      case 'winrate':
        const avgWR = (ranking.reduce((sum, p) => sum + (p.winrate || 0), 0) / ranking.length).toFixed(1);
        return `Promedio: ${avgWR}%`;
      case 'kdr':
        const avgKDR = (ranking.reduce((sum, p) => sum + (p.kdr || 0), 0) / ranking.length).toFixed(2);
        return `Promedio: ${avgKDR}`;
      default:
        return '';
    }
  }

  function getNextTier(currentPosition, totalPlayers) {
    const currentPercentile = (currentPosition / totalPlayers) * 100;
    
    // Definir umbrales de tiers (de menor a mayor)
    const tiers = [
      { name: 'LEYENDA', emoji: '👑', maxPosition: 1, percentile: 0 },
      { name: 'MAESTRO SUPREMO', emoji: '💎', maxPosition: 3, percentile: 0 },
      { name: 'MAESTRO', emoji: '💠', maxPosition: 0, percentile: 5 },
      { name: 'DIAMANTE', emoji: '💎', maxPosition: 0, percentile: 10 },
      { name: 'PLATINO', emoji: '✨', maxPosition: 0, percentile: 20 },
      { name: 'ORO', emoji: '⭐', maxPosition: 0, percentile: 35 },
      { name: 'PLATA', emoji: '🎖️', maxPosition: 0, percentile: 50 },
    ];
    
    // Si ya eres Leyenda, no hay siguiente tier
    if (currentPosition === 1) return null;
    
    // Encontrar el siguiente tier alcanzable
    for (const tier of tiers) {
      if (tier.maxPosition > 0) {
        // Tier basado en posición absoluta
        if (currentPosition > tier.maxPosition) {
          return tier;
        }
      } else if (tier.percentile > 0) {
        // Tier basado en percentil
        if (currentPercentile > tier.percentile) {
          // Calcular la posición máxima para este tier
          const maxPos = Math.ceil((tier.percentile / 100) * totalPlayers);
          return { ...tier, maxPosition: maxPos };
        }
      }
    }
    
    return null;
  }

  function calculateTierDistribution(ranking) {
    if (ranking.length === 0) return null;
    
    const tierCounts = {
      'LEYENDA': 0,
      'MAESTRO SUPREMO': 0,
      'MAESTRO': 0,
      'DIAMANTE': 0,
      'PLATINO': 0,
      'ORO': 0,
      'PLATA': 0,
      'BRONCE': 0
    };
    
    // Contar jugadores por tier
    ranking.forEach((player, index) => {
      const position = index + 1;
      const tier = getRankTier(position, ranking.length);
      if (tierCounts.hasOwnProperty(tier.name)) {
        tierCounts[tier.name]++;
      }
    });
    
    // Generar distribución visual
    const tierEmojis = {
      'LEYENDA': '👑',
      'MAESTRO SUPREMO': '💎',
      'MAESTRO': '💠',
      'DIAMANTE': '💎',
      'PLATINO': '✨',
      'ORO': '⭐',
      'PLATA': '🎖️',
      'BRONCE': '🏅'
    };
    
    // Mostrar solo tiers con jugadores
    const distribution = Object.entries(tierCounts)
      .filter(([_, count]) => count > 0)
      .map(([tierName, count]) => {
        const percentage = ((count / ranking.length) * 100).toFixed(0);
        const emoji = tierEmojis[tierName] || '🏅';
        return `${emoji} **${tierName}:** ${count} (${percentage}%)`;
      })
      .join(' • ');
    
    return distribution || null;
  }

  // --- Ranking diario ---
  function parseTimeZoneOffset(offsetString = '') {
    const match = offsetString.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    return sign * ((hours * 60) + minutes) * 60 * 1000;
  }

  function getStartOfDayInUtc(timeZone) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset'
    });

    const parts = formatter.formatToParts(now);
    const dateParts = {};
    for (const part of parts) {
      if (part.type && part.type !== 'literal') {
        dateParts[part.type] = part.value;
      }
    }

    const year = Number(dateParts.year || 0);
    const month = Number(dateParts.month || 1);
    const day = Number(dateParts.day || 1);
    const offsetMs = parseTimeZoneOffset(dateParts.timeZoneName || 'GMT+00:00');

    return Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;
  }

  async function getDailyRankingFromDB() {
    const tz = settings?.timezone || config?.timezone || 'America/Bogota';
    const startOfToday = getStartOfDayInUtc(tz);
    const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);

    const dailyPlayers = await Player.find({
      'dailyStats.lastPlayed': { $gte: startOfYesterday, $lt: startOfToday }
    })
      .select('dailyStats customName')
      .lean();

    return dailyPlayers
      .map(p => ({
        id: p._id,
        customName: p.customName,
        pointsGained: Number(p.dailyStats?.pointsGained || 0),
        wins: Number(p.dailyStats?.wins || 0),
        played: Number(p.dailyStats?.played || 0)
      }))
      .sort((a, b) => {
        const pointsDiff = b.pointsGained - a.pointsGained;
        if (pointsDiff !== 0) return pointsDiff;
        const winsDiff = b.wins - a.wins;
        if (winsDiff !== 0) return winsDiff;
        return b.played - a.played;
      });
  }

  // --- Ranking por Style Coins ---
  async function getStyleCoinsRankingFromDB(limit = 15) {
    const players = await Player.find({ styleCoins: { $gt: 0 } })
      .select('_id styleCoins customName')
      .sort({ styleCoins: -1, _id: 1 })
      .lean();
    return players.slice(0, limit).map(p => ({ id: p._id, customName: p.customName, styleCoins: p.styleCoins || 0 }));
  }

  async function distributeDailyRewards(guild) {
    const ranking = await getDailyRankingFromDB();
    if (ranking.length === 0) return;

    // Chequeo idempotente por fecha local (Bogotá por defecto)
    const tz = settings?.timezone || 'America/Bogota';
    const nowTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const dateKey = `${nowTz.getFullYear()}-${String(nowTz.getMonth() + 1).padStart(2, '0')}-${String(nowTz.getDate()).padStart(2, '0')}`;
    try {
      const flag = await Setting?.findById('dailyRewardsLastSent').lean();
      if (flag && flag.value === dateKey) {
        console.log(`[Daily Rewards] Ya enviadas para ${dateKey}. Se omite duplicado.`);
        return;
      }
    } catch (_) {}

    const DAILY_REWARD_CHANNEL_ID = settings?.dailyRewardChannelId || config.dailyRewardChannelId || settings?.dailySummaryChannelId || "1420147260368617533";
    const rewardChannel = guild.channels.cache.get(DAILY_REWARD_CHANNEL_ID) || await guild.channels.fetch(DAILY_REWARD_CHANNEL_ID).catch(() => null);
    if (!rewardChannel) {
      console.error(`Error: No se pudo encontrar el canal de recompensas diarias (${DAILY_REWARD_CHANNEL_ID}). Las recompensas (coins) se entregarán de todos modos en silencio.`);
    }

    const rewardAmount = Number(config.dailyRewardAmount || 5);
    const rewardedCount = ranking.length;
    const summaryChannelMention = settings?.dailySummaryChannelId ? ` en <#${settings.dailySummaryChannelId}>` : '';

    const rewardEmbed = new EmbedBuilder()
      .setTitle("🏆 Recompensas del Ranking Diario")
      .setDescription("Las recompensas han sido distribuidas exitosamente a los jugadores más activos del día.")
      .addFields(
        { name: "💰 Recompensa", value: `${rewardAmount} Royal Coins`, inline: true },
        { name: "👥 Jugadores Recompensados", value: `${rewardedCount} jugadores`, inline: true },
        { name: "📊 Ranking", value: summaryChannelMention ? `Ver Top 10${summaryChannelMention}` : "Top 10 disponible", inline: false }
      )
      .setColor(COLORS.ERROR)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setFooter({ text: "ROYAL RANKED • Recompensas Diarias", iconURL: guild.iconURL() })
      .setTimestamp();

    const bulkOps = [];
    for (const playerRank of ranking) {
      bulkOps.push({
        updateOne: {
          filter: { _id: playerRank.id },
          update: { $inc: { styleCoins: rewardAmount } }
        }
      });
    }

    if (rewardChannel) {
      await rewardChannel.send({ embeds: [rewardEmbed] }).catch(e => console.error("Error enviando embed de recompensas diarias:", e));
    }

    // No duplicar en el canal de resumen: las recompensas SOLO van al canal designado

    if (bulkOps.length > 0) await Player.bulkWrite(bulkOps);

    await Player.updateMany(
      { 'dailyStats.lastPlayed': { $gt: 0 } },
      { $set: { 'dailyStats': { played: 0, wins: 0, pointsGained: 0, lastPlayed: 0 } } }
    );

    // Guardar marca de envío
    try {
      await Setting?.findByIdAndUpdate('dailyRewardsLastSent', { value: dateKey }, { upsert: true });
    } catch (_) {}

    console.log("Recompensas diarias distribuidas y estadísticas reseteadas.");
  }

  async function refreshCache(guild) {
    rankingCache.timestamp = 0;
    rankingCache.guildId = null;
    rankingCache.type = 'points';
    await getRanking(guild, 'points');
  }

  /**
   * Configura los listeners de invalidación inteligente de caché
   * Se ejecuta una sola vez al inicializar
   */
  function setupCacheInvalidationListeners() {
    if (!cacheInvalidator) {
      console.warn('[Ranking] cacheInvalidator no disponible, invalidación inteligente deshabilitada');
      return;
    }

    // Listener para invalidaciones de ranking
    cacheInvalidator.onInvalidate((event) => {
      if (event.type === 'ranking' && event.scope === 'global') {
        invalidateGlobalRankCache();
      }
      if (event.type === 'ranking' && event.scope === 'season') {
        invalidateSeasonRankCache();
      }
      if (event.type === 'all') {
        invalidateGlobalRankCache();
        invalidateSeasonRankCache();
        rankingCache.data = null;
        rankingCache.timestamp = 0;
      }
    });

    console.log('[Ranking] Listeners de invalidación inteligente configurados');
  }

  return { 
    computeGlobalRanking, 
    computeSeasonRanking, 
    invalidateGlobalRankCache, 
    invalidateSeasonRankCache, 
    getSeasonRankCache, 
    getRanking, 
    renderRanking, 
    getDailyRankingFromDB, 
    getStyleCoinsRankingFromDB, 
    distributeDailyRewards, 
    refreshCache,
    setupCacheInvalidationListeners,
    // Exportar helpers para profile.js
    getRankTier,
    getNextTier,
    getWinrateEmoji,
    getKDREmoji,
    getStreakEmoji,
    getTierBadge
  };
};
