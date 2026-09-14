// Generación de tarjeta de perfil usando Canvas (HTML/CSS logic migrated)
// const { generateProfileCard } = require('./profile-satori-generator'); // Moved inside for hot-reload

module.exports = function createProfileUtils({
  Player,
  MatchHistory,
  ensurePlayerRecord,
  rankingUtils,
  client,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  settings,
  ROLE_PUNTOS_X2,
  ROLE_PROTECCION,
  imageGenerationManager, // NUEVO: Image generation manager con worker threads
  config, // PASAR CONFIG PARA EMOJIS GLOBALES
}) {
  const { EmbedBuilder } = require('discord.js');

  async function buildPlayerCard(targetUser, guild) {
    // HOT-RELOAD: Clear cache to apply changes immediately
    try { delete require.cache[require.resolve('./profile-canvas-generator')]; } catch (e) { }
    // Clean up others just in case but we won't use them
    try { delete require.cache[require.resolve('./profile-html-generator')]; } catch (e) { }
    try { delete require.cache[require.resolve('./profile-satori-generator')]; } catch (e) { }

    const fs = require('fs');
    const path = require('path');

    // ONLY CANVAS GENERATOR as requested
    let generateProfileCard = null;
    try {
      const mod = require('./profile-canvas-generator');
      generateProfileCard = mod.generateProfileCard;
    } catch (e) {
      console.error('[Profile Utils] Critical: Failed to load profile-canvas-generator:', e);
      // We will throw later if null, triggering text fallback which is better than silence
    }

    // OPTIMIZATION: Parallelize all queries at once using Promise.all
    const [playerRecord, recentHistory, memberData] = await Promise.all([
      // 1. Obtener datos del jugador
      ensurePlayerRecord(targetUser.id),

      // 2. Obtener historial reciente si MatchHistory está disponible
      (async () => {
        if (!MatchHistory) return [];
        try {
          return await MatchHistory.find({ $or: [{ team1: targetUser.id }, { team2: targetUser.id }] })
            .lean()
            .select('team1 team2 date matchNumber mode winner')
            .sort({ date: -1, matchNumber: -1 })
            .limit(5);
        } catch (e) {
          console.warn('Error fetching match history for profile:', e);
          return [];
        }
      })(),

      // 3. Obtener datos del miembro en paralelo
      (async () => {
        try {
          return guild.members.cache.get(targetUser.id) || await guild.members.fetch(targetUser.id).catch(() => null);
        } catch (e) {
          return null;
        }
      })()
    ]);

    const seasonRecord = playerRecord.currentSeason || { points: 0, wins: 0, losses: 0, mvps: 0, streak: 0, creations: 0 };
    const matchesPlayed = (seasonRecord.wins || 0) + (seasonRecord.losses || 0);
    const winrate = matchesPlayed > 0 ? ((seasonRecord.wins / matchesPlayed) * 100).toFixed(1) : "0.0";

    // Calcular rango en tiempo real (REAL-TIME RANKING)
    let pos = 'N/A';
    if (playerRecord.currentSeason && playerRecord.currentSeason.points > 0) {
      try {
        const p = playerRecord.currentSeason;
        const count = await Player.countDocuments({
          $or: [
            { 'currentSeason.points': { $gt: p.points } },
            { 'currentSeason.points': p.points, 'currentSeason.wins': { $gt: p.wins } },
            { 'currentSeason.points': p.points, 'currentSeason.wins': p.wins, 'currentSeason.mvps': { $gt: p.mvps } }
          ]
        });
        pos = count + 1;
      } catch (e) {
        console.error('Error calculating real-time rank:', e);
      }
    }

    // 2. Calcular texto de progreso
    let pointsToNextText = 'Mejor Ranked Del Momento';

    // 3. Calcular perks
    let hasX2 = false;
    let hasShield = false;
    try {
      const member = memberData;
      if (member) {
        if (ROLE_PUNTOS_X2) hasX2 = member.roles.cache.has(ROLE_PUNTOS_X2);
        if (ROLE_PROTECCION) hasShield = member.roles.cache.has(ROLE_PROTECCION);
      }
      const temps = playerRecord.temporaryRoles || [];
      if (ROLE_PUNTOS_X2 && temps.some(t => t.roleId === ROLE_PUNTOS_X2 && (t.expiresAt || 0) > Date.now())) hasX2 = true;
      if (ROLE_PROTECCION && temps.some(t => t.roleId === ROLE_PROTECCION && (t.expiresAt || 0) > Date.now())) hasShield = true;
      if (typeof playerRecord.x2_until === 'number' && playerRecord.x2_until > Date.now()) hasX2 = true;
      if (typeof playerRecord.puntosX2_matches === 'number' && playerRecord.puntosX2_matches > 0) hasX2 = true;
      if (typeof playerRecord.proteccion_until === 'number' && playerRecord.proteccion_until > Date.now()) hasShield = true;
      if (typeof playerRecord.proteccion_matches === 'number' && playerRecord.proteccion_matches > 0) hasShield = true;
    } catch (_) { }

    // 4. Preparar tema
    const theme = playerRecord.profileTheme || {};
    const themeData = {
      containerColor: theme.containerColor,
      textColor: theme.textColor,
      // ... otros
    };

    try {
      if (!generateProfileCard) {
        throw new Error('Canvas profile generator not loaded');
      }
      const path = require('path');

      const isValidImageUrl = (url) => {
        if (url.includes('google.com/search')) return false;
        if (url.includes('google.com') && url.includes('&q=')) return false;
        return true;
      };

      const resolvePath = (p) => {
        if (!p) return null;
        if (p.startsWith('http')) {
          // Validate HTTP URLs
          if (!isValidImageUrl(p)) {
            console.warn('[buildPlayerCard] Invalid image URL blocked:', p);
            return null;
          }
          return p;
        }
        // Normalize path separators for Windows
        const normalizedPath = p.replace(/\//g, path.sep);
        if (path.isAbsolute(normalizedPath)) {
          // Check if absolute path exists
          const fs = require('fs');
          if (fs.existsSync(normalizedPath)) {
            return normalizedPath;
          } else {
            console.warn('[buildPlayerCard] Absolute path does not exist:', normalizedPath);
            return null;
          }
        }
        // Relative path - join with rootDir instead of cwd
        const rootDir = path.resolve(__dirname, '../../');
        const fullPath = path.join(rootDir, normalizedPath);
        const fs = require('fs');
        if (fs.existsSync(fullPath)) {
          return fullPath;
        } else {
          // Fallback: check relative to cwd just in case
          const cwdPath = path.join(process.cwd(), normalizedPath);
          if (fs.existsSync(cwdPath)) return cwdPath;

          console.warn('[buildPlayerCard] Relative path does not exist:', fullPath);
          return null;
        }
      };

      const rootDir = path.resolve(__dirname, '../../');
      const defaultBgPath = path.join(rootDir, 'profile_bg_v2.png');
      const finalBgUrl = playerRecord.profileBackgroundUrl ? resolvePath(playerRecord.profileBackgroundUrl) : defaultBgPath;

      const cardData = {
        username: playerRecord.customName || targetUser.username,
        avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 512 }),
        hasCustomAvatar: !!targetUser.avatar,
        rank: typeof pos === 'number' ? `#${pos}` : 'N/A',
        pointsToNext: pointsToNextText,
        points: seasonRecord.points,
        wins: seasonRecord.wins,
        losses: seasonRecord.losses,
        mvps: seasonRecord.mvps,
        matches: matchesPlayed,
        streak: seasonRecord.streak,
        winrate: `${winrate}%`,
        creations: seasonRecord.creations,
        hasX2,
        hasShield,
        bannerUrl: resolvePath(playerRecord.profileBannerUrl),
        backgroundUrl: finalBgUrl || defaultBgPath,
        theme: themeData,
        coins: playerRecord.styleCoins || 0,
        spins: playerRecord.spins || 0
      };

      // Strict Mode: Only Canvas
      const buffer = await generateProfileCard(cardData);

      if (!buffer) {
        throw new Error('Canvas generator returned no data');
      }



      const EMOJIS = config?.emojis || {};
      const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`perfil_season_${targetUser.id}`).setLabel('Stats').setEmoji("📊").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`perfil_history_${targetUser.id}`).setLabel('Historial').setEmoji("📜").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`perfil_wallet_${targetUser.id}`).setLabel('Cartera').setEmoji("💼").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`perfil_store_${targetUser.id}`).setLabel('Cartera Tienda').setEmoji("🛒").setStyle(ButtonStyle.Success)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`perfil_reset_${targetUser.id}`).setLabel('Reset').setEmoji("♻️").setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setColor(theme.containerColor || 0x2B2D31)
        .setTitle(`Perfil de ${playerRecord.customName || targetUser.username}`)
        .setImage('attachment://profile.png');

      if (recentHistory.length > 0) {
        const historyText = recentHistory.map(m => {
          const isWinner = (m.winner === 'team1' && m.team1.includes(targetUser.id)) || (m.winner === 'team2' && m.team2.includes(targetUser.id));
          const resultEmoji = isWinner ? (EMOJIS.success || '✅') : (EMOJIS.error || '❌');
          const resultText = isWinner ? 'Victoria' : 'Derrota';
          const date = new Date(m.date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
          return `\`#${m.matchNumber}\` • ${resultEmoji} **${resultText}** (${m.mode}) • ${date}`;
        }).join('\n');
        embed.setDescription(`**Últimas 5 Partidas:**\n${historyText}`);
      } else {
        embed.setDescription('No hay partidas recientes registradas.');
      }

      return { files: [attachment], components: [row1, row2], embeds: [embed] };

    } catch (error) {
      console.error('Error generando perfil:', error);
      throw error;
    }
  }

  return { buildPlayerCard };
};
