const { EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config.json');

async function startSeason(message, args, { hasPermission, Player, Setting, settings, COLORS, EMBED_DEFAULTS, sendLog, generateSeasonSummaryEmbed, config }) {
  try {
    console.log(`[startSeason] invoked by ${message.author?.id} in ${message.guild?.id || 'DM'} args=${Array.isArray(args) ? args.join(' ') : args}`);
    const botOwners = (config && config.botOwnerId) || [];
    const isBotOwner = Array.isArray(botOwners) ? botOwners.includes(message.author.id) : String(message.author.id) === String(botOwners);
    if (!isBotOwner) return message.reply('🚫 Solo el propietario del bot puede usar este comando.').catch(() => {});

    const seasonName = args.join(' ');
    if (!seasonName) return message.reply('⚠️ Uso: `!startseason <Nombre de la Temporada>`').catch(() => {});

    // Mostrar mensaje de carga porque puede tardar
    let progressMsg = await message.reply('⏳ Iniciando nueva temporada, por favor espera...').catch(() => null);

    // Archivar temporada anterior y generar resumen si existe
    let prevSeasonName = null;
    if (settings.currentSeason) {
      const endedSeasonName = settings.currentSeason;
      prevSeasonName = endedSeasonName;
      const playersToArchive = await Player.find({
        $or: [
          { 'currentSeason.points': { $gt: 0 } },
          { 'currentSeason.wins': { $gt: 0 } },
          { 'currentSeason.losses': { $gt: 0 } },
          { 'currentSeason.mvps': { $gt: 0 } }
        ]
      }).lean();

      // Guardar en batches para no sobrecargar MongoDB
      for (const player of playersToArchive) {
        const seasonData = player.currentSeason || {};
        await Player.updateOne(
          { _id: player._id },
          { $push: { pastSeasons: { name: endedSeasonName, ...seasonData } } }
        ).catch(err => console.error("Error archiving player:", err));
      }

      if (settings.seasonSummaryChannelId && typeof generateSeasonSummaryEmbed === 'function') {
        try {
          const summaryEmbed = await generateSeasonSummaryEmbed(message.guild, endedSeasonName);
          const summaryChannel = await message.guild.channels.fetch(settings.seasonSummaryChannelId).catch(() => null);
          if (summaryChannel) {
            await summaryChannel.send({ embeds: [summaryEmbed] }).catch(e => console.error("Error enviando resumen de temporada:", e));
          }
        } catch(err) {
          console.error("Error generating season summary embed:", err);
        }
      }
    }

    // Resetear la temporada actual para todos
    await Player.updateMany({}, { $set: { currentSeason: { points: 0, wins: 0, losses: 0, mvps: 0, streak: 0, maxStreak: 0, creations: 0 } } });

    // NUEVO: también resetear estadísticas globales para que no quede nada global
    await Player.updateMany({}, { $set: { points: 0, wins: 0, losses: 0, mvps: 0 } });

    // NUEVO: resetear coins y giros de ruleta al iniciar temporada
    await Player.updateMany({}, { $set: { styleCoins: 0, spins: 0 } });

    // Limpiar ranking conocido para todos (nuevo comienzo de temporada)
    await Player.updateMany({}, { $set: { lastKnownRank: null } });

    // Quitar etiquetas de RANK en los apodos del servidor en segundo plano para no bloquear
    (async () => {
      try {
        const allMembers = message.guild.members.cache.size > 0 ? message.guild.members.cache : await message.guild.members.fetch();
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let processed = 0;
        for (const member of allMembers.values()) {
          if (!member || member.user.bot) continue;
          const nick = member.nickname;
          if (!nick) continue;
          const newNick = nick.replace(/^RANK\s*\d+\s*\|\s*/i, '').trim();
          if (newNick !== nick && member.manageable) {
            await member.setNickname(newNick).catch(() => {});
            processed += 1;
            if (processed % 10 === 0) await delay(200);
          }
        }
      } catch (e) {
        console.warn('Error al limpiar etiquetas RANK en apodos durante startseason:', e);
      }
    })();

    // Actualizar settings y persistir
    settings.currentSeason = seasonName;
    await Setting.findByIdAndUpdate('currentSeason', { value: seasonName }, { upsert: true });

    // Invalida la memoria cache del ranking si existe el objeto global 
    try {
        const rankingUtilsReq = require('../utils/ranking');
        // Hack: invalidamos usando las funciones si estuvieran exportadas
        // (La inyección de dependencias las pasa por deps, pero como estamos 
        // globalmente en proceso reseteando Player.updateMany, el expire por db basta)
    } catch(err){}

    const emojis = (config && config.seasonEmojis) || {};
    const resolveEmoji = (raw, def) => {
      if (!raw) return def;
      const s = String(raw).trim();
      if (/^<a?:\w+:\d+>$/.test(s)) return s;
      const name = s.replace(/:/g, '');
      const em = message.guild?.emojis?.cache?.find(e => e.name === name);
      return em ? em.toString() : s || def;
    };
    const E_FIRST = resolveEmoji(emojis.firstPlace, '🥇');
    const E_SECOND = resolveEmoji(emojis.secondPlace, '🥈');
    const E_THIRD = resolveEmoji(emojis.thirdPlace, '🥉');
    const E_MVP = resolveEmoji(emojis.mvp, '⭐');
    const E_WINS = resolveEmoji(emojis.wins, '✅');
    const E_LOSSES = resolveEmoji(emojis.losses, '❌');
    const E_PRIZE = resolveEmoji(emojis.prize, '🎁');

    const embed = new EmbedBuilder()
      .setTitle(`🎉 ¡Nueva Temporada Iniciada: ${seasonName}! 🎉`)
      .setDescription('¡Todas las estadísticas de temporada han sido reiniciadas! Es hora de competir y llegar a la cima del ranking de esta temporada.\n\n¡Mucha suerte a todos los jugadores!')
      .setColor(COLORS.GOLD)
      .setImage(EMBED_DEFAULTS.thumbnail)
      .setTimestamp();

    if (prevSeasonName) {
      const playersWithSeasonStats = (await Player.find({ 'pastSeasons.name': prevSeasonName }).lean())
        .map(data => {
          const s = data.pastSeasons?.find(x => x.name === prevSeasonName);
          return s ? { id: data._id, points: s.points || 0, wins: s.wins || 0, losses: s.losses || 0, mvps: s.mvps || 0 } : null;
        })
        .filter(Boolean);

      if (playersWithSeasonStats.length > 0) {
        const byPoints = [...playersWithSeasonStats].sort((a, b) => b.points - a.points).slice(0, 3);
        const bestMvp = [...playersWithSeasonStats].sort((a, b) => b.mvps - a.mvps)[0];
        const mostWins = [...playersWithSeasonStats].sort((a, b) => b.wins - a.wins)[0];
        const mostLosses = [...playersWithSeasonStats].sort((a, b) => b.losses - a.losses)[0];

        const topPointsText = byPoints
          .map((p, i) => {
            const prize = i === 0
              ? `${E_PRIZE} Premio: 200 dólares`
              : i === 1
                ? `${E_PRIZE} Premio: Teclado y diademas Redragon`
                : i === 2
                  ? `${E_PRIZE} Premio: Mouse Logitech`
                  : '';
            const medal = i === 0 ? E_FIRST : i === 1 ? E_SECOND : i === 2 ? E_THIRD : '';
            return `${medal} **${i + 1}.** <@${p.id}> - ${p.points}${prize ? ` — ${prize}` : ''}`;
          })
          .join('\n') || 'N/A';

        embed.addFields(
          { name: `Top 3 Puntos (${prevSeasonName})`, value: topPointsText, inline: false },
          { name: `${E_MVP} Mejor MVP`, value: bestMvp ? `<@${bestMvp.id}> - ${bestMvp.mvps} — ${E_PRIZE} Premio: Rol especial y regalo sorpresa` : 'N/A', inline: true },
          { name: `${E_WINS} Más Victorias`, value: mostWins ? `<@${mostWins.id}> - ${mostWins.wins} — ${E_PRIZE} Premio: Rol especial y regalo sorpresa` : 'N/A', inline: true },
          { name: `${E_LOSSES} Más Derrotas`, value: mostLosses ? `<@${mostLosses.id}> - ${mostLosses.losses} — ${E_PRIZE} Premio: Rol especial y regalo sorpresa` : 'N/A', inline: true }
        );
      }
    }

    if (typeof sendLog === 'function') {
        sendLog(message.guild, new EmbedBuilder().setTitle('🎉 Temporada Iniciada').setDescription(`**Staff:** <@${message.author.id}>\n**Nombre:** ${seasonName}`).setColor(COLORS.SUCCESS), [], 'settings');
    }

    if (settings.announcementsChannel) {
      const announcementsChannel = await message.guild.channels.fetch(settings.announcementsChannel).catch(() => null);
      if (announcementsChannel) {
        await announcementsChannel.send({ embeds: [embed] }).catch(e => console.error('Error enviando anuncio de temporada:', e));
        if (progressMsg) {
            await progressMsg.edit(`✅ Temporada iniciada y anuncio enviado en ${announcementsChannel}.`).catch(() => {});
        } else {
            await message.reply(`✅ Temporada iniciada y anuncio enviado en ${announcementsChannel}.`).catch(() => {});
        }
        return; // No enviar nada más
      }
    }

    if (progressMsg) {
        await progressMsg.edit(`✅ Temporada iniciada correctamente.`).catch(() => {});
    } else {
        await message.reply(`✅ Temporada iniciada correctamente.`).catch(() => {});
    }
  } catch (err) {
    console.error('[startSeason] error:', err);
    try {
      await message.reply(`❌ Error iniciando temporada: ${err && err.message ? err.message : String(err)}`).catch(() => {});
    } catch (_) { }
  }
}

async function endSeason(message, args, { hasPermission, Player, Setting, settings, COLORS, config: ctxConfig }) {
  const _config = ctxConfig || config;
  const AUTHORIZED_ROLES = [
    ...(_config?.manageRole || []),
    ...(_config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send('🚫 Solo el staff puede usar este comando.');

  if (!settings.currentSeason) {
    return message.channel.send('⚠️ No hay ninguna temporada activa para finalizar.');
  }

  const endedSeasonName = settings.currentSeason;

  // Archivar la temporada actual
  const playersToArchive = await Player.find({ 'currentSeason.wins': { $gt: 0 } }).lean();
  const archivePromises = playersToArchive.map(player => {
    const seasonData = player.currentSeason || {};
    return Player.updateOne(
      { _id: player._id },
      {
        $push: { pastSeasons: { name: endedSeasonName, ...seasonData } },
        $set: { currentSeason: { points: 0, wins: 0, losses: 0, mvps: 0 } }
      }
    );
  });
  await Promise.all(archivePromises);

  await Setting.findByIdAndUpdate('currentSeason', { value: null }, { upsert: true });
  settings.currentSeason = null;

  const embed = new EmbedBuilder()
    .setTitle(`🏁 ¡La Temporada "${endedSeasonName}" ha Finalizado! 🏁`)
    .setDescription('La temporada ha concluido. Las estadísticas han sido archivadas. ¡Esperen noticias sobre la próxima temporada!')
    .setColor(COLORS.PRIMARY);

  return message.channel.send({ embeds: [embed] });
}

async function setSeasonSummaryChannel(message, args, { hasPermission, Setting, settings, COLORS, config: ctxConfig }) {
  const _config = ctxConfig || config;
  const AUTHORIZED_ROLES = [
    ...(_config?.manageRole || []),
    ...(_config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return message.channel.send('Uso: `!setseasonsummarychannel #canal` o `!setseasonsummarychannel <ID del canal>`.');
  }

  await Setting.findByIdAndUpdate('seasonSummaryChannelId', { value: channel.id }, { upsert: true });
  settings.seasonSummaryChannelId = channel.id;

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✅ Canal de Resumen de Temporada Configurado')
    .setDescription(`Los resúmenes de final de temporada se enviarán ahora en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] });
}

async function previewSeasonEmbed(message, args, { hasPermission, Player, settings, COLORS, EMBED_DEFAULTS, config }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const targetEndedSeason = args[0] || settings.currentSeason || '';
  const nextSeasonName = args.slice(1).join(' ') || (targetEndedSeason || 'Temporada');

  const emojis = (config && config.seasonEmojis) || {};
  const resolveEmoji = (raw, def) => {
    if (!raw) return def;
    const s = String(raw).trim();
    if (/^<a?:\w+:\d+>$/.test(s)) return s;
    const name = s.replace(/:/g, '');
    const em = message.guild?.emojis?.cache?.find(e => e.name === name);
    return em ? em.toString() : s || def;
  };
  const E_FIRST = resolveEmoji(emojis.firstPlace, '🥇');
  const E_SECOND = resolveEmoji(emojis.secondPlace, '🥈');
  const E_THIRD = resolveEmoji(emojis.thirdPlace, '🥉');
  const E_MVP = resolveEmoji(emojis.mvp, '⭐');
  const E_WINS = resolveEmoji(emojis.wins, '✅');
  const E_LOSSES = resolveEmoji(emojis.losses, '❌');
  const E_PRIZE = resolveEmoji(emojis.prize, '🎁');

  const embed = new EmbedBuilder()
    .setTitle(`🎉 ¡Nueva Temporada Iniciada: ${nextSeasonName}! 🎉`)
    .setDescription('¡Todas las estadísticas de temporada han sido reiniciadas! Es hora de competir y llegar a la cima del ranking de esta temporada.\n\n¡Mucha suerte a todos los jugadores!')
    .setColor(COLORS.GOLD)
    .setImage(EMBED_DEFAULTS.thumbnail)
    .setTimestamp();

  if (targetEndedSeason) {
    const playersWithSeasonStats = (await Player.find({ 'pastSeasons.name': targetEndedSeason }).lean())
      .map(data => {
        const s = data.pastSeasons?.find(x => x.name === targetEndedSeason);
        return s ? { id: data._id, points: s.points || 0, wins: s.wins || 0, losses: s.losses || 0, mvps: s.mvps || 0 } : null;
      })
      .filter(Boolean);

    if (playersWithSeasonStats.length > 0) {
      const byPoints = [...playersWithSeasonStats].sort((a, b) => b.points - a.points).slice(0, 3);
      const bestMvp = [...playersWithSeasonStats].sort((a, b) => b.mvps - a.mvps)[0];
      const mostWins = [...playersWithSeasonStats].sort((a, b) => b.wins - a.wins)[0];
      const mostLosses = [...playersWithSeasonStats].sort((a, b) => b.losses - a.losses)[0];

      const topPointsText = byPoints
        .map((p, i) => {
          const prize = i === 0
            ? `${E_PRIZE} Premio: 200 dólares`
            : i === 1
              ? `${E_PRIZE} Premio: Teclado y diademas Redragon`
              : i === 2
                ? `${E_PRIZE} Premio: Mouse Logitech`
                : '';
          const medal = i === 0 ? E_FIRST : i === 1 ? E_SECOND : i === 2 ? E_THIRD : '';
          return `${medal} **${i + 1}.** <@${p.id}> - ${p.points}${prize ? ` — ${prize}` : ''}`;
        })
        .join('\n') || 'N/A';

      embed.addFields(
        { name: `Top 3 Puntos (${targetEndedSeason})`, value: topPointsText, inline: false },
        { name: `${E_MVP} Mejor MVP`, value: bestMvp ? `<@${bestMvp.id}> - ${bestMvp.mvps} — ${E_PRIZE} Premio: Rol especial y regalo sorpresa` : 'N/A', inline: true },
        { name: `${E_WINS} Más Victorias`, value: mostWins ? `<@${mostWins.id}> - ${mostWins.wins} — ${E_PRIZE} Premio: Rol especial y regalo sorpresa` : 'N/A', inline: true },
        { name: `${E_LOSSES} Más Derrotas`, value: mostLosses ? `<@${mostLosses.id}> - ${mostLosses.losses} — ${E_PRIZE} Premio: Rol especial y regalo sorpresa` : 'N/A', inline: true }
      );
    }
  }

  return message.channel.send({ embeds: [embed] });
}

async function seasonStatus(message, args, { settings, COLORS, EMBED_DEFAULTS }) {
  const name = settings.currentSeason;
  const embed = new EmbedBuilder()
    .setColor(name ? COLORS.SUCCESS : COLORS.WARNING)
    .setTitle(name ? `🟢 Temporada Activa` : `🟡 Sin Temporada Activa`)
    .setDescription(name ? `Nombre: **${name}**` : 'Usa `!startseason <Nombre>` (staff) para iniciar una temporada.')
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();
  return message.channel.send({ embeds: [embed] });
}

module.exports = { startSeason, endSeason, setSeasonSummaryChannel, previewSeasonEmbed, seasonStatus };
