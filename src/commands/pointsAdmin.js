const { EmbedBuilder, PermissionsBitField } = require('discord.js');

function extractUserIds(message, args) {
  const ids = new Set();
  message.mentions.users.forEach(user => ids.add(user.id));
  args.forEach(arg => {
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17) ids.add(clean);
  });
  return Array.from(ids);
}

async function addPuntos(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, EMBED_DEFAULTS, computeGlobalRanking, computeSeasonRanking, updateAffectedNicknames, invalidateGlobalRankCache, invalidateSeasonRankCache, sendLog, cacheInvalidator, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  if (targetIds.length === 0) return message.channel.send(`Uso: \`!addpuntos @usuario1 @usuario2 ... <cantidad>\``);

  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);
  if (isNaN(amount)) return message.channel.send(`Uso: \`!addpuntos @usuario1 @usuario2 ... <cantidad>\``);

  const results = [];
  const affectedUserIds = targetIds;

  try {
    const initialPlayersPromises = affectedUserIds.map(userId => ensurePlayerRecord(userId));
    const initialPlayers = await Promise.all(initialPlayersPromises);

    const bulkOps = affectedUserIds.map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { 'currentSeason.points': amount } }
      }
    }));

    await Player.bulkWrite(bulkOps, { ordered: false });

    const updatedPlayersPromises = affectedUserIds.map(userId =>
      Player.findById(userId).lean().select('_id currentSeason')
    );
    const updatedPlayers = await Promise.all(updatedPlayersPromises);

    updatedPlayers.forEach((updatedPlayer, idx) => {
      const userId = affectedUserIds[idx];
      const initialPlayer = initialPlayers[idx];
      const prev = (initialPlayer.currentSeason?.points || 0);

      results.push({
        userId,
        prev,
        current: updatedPlayer.currentSeason?.points || 0
      });

      const logEmbed = new EmbedBuilder()
        .setTitle(`${EMOJIS.plus || '➕'} Puntos Añadidos Manualmente`)
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** ${amount > 0 ? '+' : ''}${amount}\n**Puntos Temporada Anterior:** ${prev}\n**Puntos Temporada Nuevos:** ${updatedPlayer.currentSeason?.points || 0}`)
        .setColor(COLORS.SUCCESS)
        .setTimestamp();
      sendLog(message.guild, logEmbed, [], 'points');
    });
  } catch (error) {
    console.error('[addPuntos] Error during batch update:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Error al actualizar puntos.`);
  }

  invalidateGlobalRankCache();
  if (typeof invalidateSeasonRankCache === 'function') invalidateSeasonRankCache();

  if (cacheInvalidator && affectedUserIds.length > 0) {
    cacheInvalidator.onPointsChanged(affectedUserIds[0]);
  }

  const usersList = results.map(r => {
    return `<@${r.userId}> - **${r.current}** pts`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.up || '🔺'} Puntos Añadidos`)
    .setDescription(`Se han añadido **${amount}** puntos a ${results.length} usuario(s):\n\n${usersList}`)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();
  await message.channel.send({ embeds: [embed] });
  if (typeof updateAffectedNicknames === 'function') {
    Promise.resolve(updateAffectedNicknames(message.guild, affectedUserIds)).catch(() => { });
  }
}

async function removePuntos(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, EMBED_DEFAULTS, computeGlobalRanking, computeSeasonRanking, updateAffectedNicknames, invalidateGlobalRankCache, invalidateSeasonRankCache, sendLog, cacheInvalidator, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  if (targetIds.length === 0) return message.channel.send(`Uso: \`!removepuntos @usuario1 @usuario2 ... <cantidad>\``);

  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);
  if (isNaN(amount) || amount <= 0) return message.channel.send(`Uso: \`!removepuntos @usuario1 @usuario2 ... <cantidad>\``);

  const results = [];
  const affectedUserIds = targetIds;

  try {
    const initialPlayersPromises = affectedUserIds.map(userId => ensurePlayerRecord(userId));
    const initialPlayers = await Promise.all(initialPlayersPromises);

    const bulkOps = affectedUserIds.map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { 'currentSeason.points': -amount } }
      }
    }));

    await Player.bulkWrite(bulkOps, { ordered: false });

    // Recargar datos actualizados (en paralelo)
    const updatedPlayersPromises = affectedUserIds.map(userId =>
      Player.findById(userId).lean().select('_id currentSeason')
    );
    const updatedPlayers = await Promise.all(updatedPlayersPromises);

    updatedPlayers.forEach((updatedPlayer, idx) => {
      const userId = affectedUserIds[idx];
      const initialPlayer = initialPlayers[idx];
      const prev = (initialPlayer.currentSeason?.points || 0);

      results.push({
        userId,
        prev,
        current: updatedPlayer.currentSeason?.points || 0
      });

      const logEmbed = new EmbedBuilder()
        .setTitle(`${EMOJIS.minus || '➖'} Puntos Removidos Manualmente`)
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** -${amount}\n**Puntos Temporada Anterior:** ${prev}\n**Puntos Temporada Nuevos:** ${updatedPlayer.currentSeason?.points || 0}`)
        .setColor(COLORS.ERROR)
        .setTimestamp();
      sendLog(message.guild, logEmbed, [], 'points');
    });
  } catch (error) {
    console.error('[removePuntos] Error during batch update:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Error al actualizar puntos.`);
  }

  invalidateGlobalRankCache();

  if (cacheInvalidator && affectedUserIds.length > 0) {
  }

  const usersList = results.map(r => {
    return `<@${r.userId}> - **${r.current}** pts`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`${EMOJIS.down || '🔻'} Puntos Removidos`)
    .setDescription(`Se han removido **${amount}** puntos de ${results.length} usuario(s):\n\n${usersList}`)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();
  await message.channel.send({ embeds: [embed] });
  if (typeof updateAffectedNicknames === 'function') {
    Promise.resolve(updateAffectedNicknames(message.guild, affectedUserIds)).catch(() => { });
  }
}

module.exports = { addPuntos, removePuntos };
