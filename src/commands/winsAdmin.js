const { EmbedBuilder } = require('discord.js');

function extractUserIds(message, args) {
  const ids = new Set();
  message.mentions.users.forEach(user => ids.add(user.id));
  args.forEach(arg => {
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17) ids.add(clean);
  });
  return Array.from(ids);
}

async function addWin(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles, championRoles, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  // Obtener la cantidad del último argumento numérico
  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);

  if (targetIds.length === 0 || isNaN(amount) || amount <= 0) {
    const usageEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.warning || '⚠️'} Uso Incorrecto`)
      .setDescription("Formato: `!addwin @usuario1 @usuario2 ... <cantidad>`")
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] });
  }

  const affectedUserIds = targetIds;
  const results = [];

  try {
    const initialPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id wins currentSeason')
    );
    await Promise.all(initialPlayersPromises);
    await Promise.all(affectedUserIds.map(userId => ensurePlayerRecord(userId)));

    const bulkOps = affectedUserIds.map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { wins: amount, 'currentSeason.wins': amount } }
      }
    }));
    await Player.bulkWrite(bulkOps, { ordered: false });

    const updatedPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id wins currentSeason')
    );
    const updatedPlayers = await Promise.all(updatedPlayersPromises);

    const logPromises = affectedUserIds.map((userId, idx) => {
      const updatedPlayer = updatedPlayers[idx];
      results.push({
        userId,
        wins: updatedPlayer.wins,
        seasonWins: updatedPlayer.currentSeason?.wins || 0
      });

      const logEmbed = new EmbedBuilder()
        .setTitle(`${EMOJIS.success || '✅'} Victoria Añadida Manualmente`)
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** +${amount}\n**Victorias Nuevas:** ${updatedPlayer.wins}`)
        .setColor(COLORS.SUCCESS)
        .setTimestamp();
      return sendLog(message.guild, logEmbed, [], 'stats');
    });
    
    Promise.allSettled(logPromises).catch(() => {});

    // Embed de respuesta con todos los usuarios afectados
    const usersList = results.map(r => `<@${r.userId}> - **${r.seasonWins}** wins`).join('\n');
    const successEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.success || '✅'} Victorias Añadidas`)
      .setDescription(`Se han registrado **${amount} wins** para ${results.length} usuario(s):\n\n${usersList}`)
      .setColor(COLORS.SUCCESS)
      .setFooter(EMBED_DEFAULTS.footer)
      .setTimestamp();
    await message.channel.send({ embeds: [successEmbed] });
    if (typeof updateAffectedNicknames === 'function') {
      Promise.resolve(updateAffectedNicknames(message.guild, affectedUserIds)).catch(() => {});
    }
    try { 
      if (typeof updateChampionRoles === 'function') {
        Promise.resolve(updateChampionRoles(championRoles)).catch(() => {});
      }
    } catch (_) { }
  } catch (error) {
    console.error('[AddWin] Error:', error);
    return message.channel.send('❌ Ocurrió un error al añadir victorias.');
  }
}

async function removeWin(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles, championRoles, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  // Obtener la cantidad del último argumento numérico
  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);

  if (targetIds.length === 0 || isNaN(amount) || amount <= 0) {
    const usageEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.warning || '⚠️'} Uso Incorrecto`)
      .setDescription("Formato: `!removewin @usuario1 @usuario2 ... <cantidad>`")
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] });
  }

  const affectedUserIds = targetIds;
  const results = [];

  try {
    const initialPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id wins currentSeason')
    );
    await Promise.all(initialPlayersPromises);
    await Promise.all(affectedUserIds.map(userId => ensurePlayerRecord(userId)));

    const bulkOps = affectedUserIds.map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { wins: -amount, 'currentSeason.wins': -amount } }
      }
    }));
    await Player.bulkWrite(bulkOps, { ordered: false });

    const updatedPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id wins currentSeason')
    );
    const updatedPlayers = await Promise.all(updatedPlayersPromises);

    const logPromises = affectedUserIds.map((userId, idx) => {
      const updatedPlayer = updatedPlayers[idx];
      results.push({
        userId,
        wins: updatedPlayer.wins,
        seasonWins: updatedPlayer.currentSeason?.wins || 0
      });

      const logEmbed = new EmbedBuilder()
        .setTitle(`${EMOJIS.error || '❌'} Victoria Removida Manualmente`)
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** -${amount}\n**Victorias Nuevas:** ${updatedPlayer.wins}`)
        .setColor(COLORS.ERROR)
        .setTimestamp();
      return sendLog(message.guild, logEmbed, [], 'stats');
    });
    
    Promise.allSettled(logPromises).catch(() => {});

    // Embed de respuesta con todos los usuarios afectados
    const usersList = results.map(r => `<@${r.userId}> - **${r.seasonWins}** wins`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.down || '📉'} Victorias Removidas`)
      .setDescription(`Se han removido **${amount} wins** de ${results.length} usuario(s):\n\n${usersList}`)
      .setColor(COLORS.ERROR)
      .setFooter(EMBED_DEFAULTS.footer)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    if (typeof updateAffectedNicknames === 'function') {
      Promise.resolve(updateAffectedNicknames(message.guild, affectedUserIds)).catch(() => {});
    }
    try { 
      if (typeof updateChampionRoles === 'function') {
        Promise.resolve(updateChampionRoles(championRoles)).catch(() => {});
      }
    } catch (_) { }
  } catch (error) {
    console.error('[RemoveWin] Error:', error);
    return message.channel.send('❌ Ocurrió un error al remover victorias.');
  }
}

module.exports = { addWin, removeWin };
