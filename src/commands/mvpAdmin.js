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

async function addMvp(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, EMBED_DEFAULTS, updateChampionRoles, championRoles, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  if (targetIds.length === 0) {
    const usageEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.warning || '⚠️'} Uso Incorrecto`)
      .setDescription("Formato: `!addmvp @usuario1 @usuario2 ... <cantidad>`")
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] });
  }

  // Obtener la cantidad del último argumento numérico
  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);
  const inc = (!isNaN(amount) && amount > 0) ? amount : 1;

  const affectedUserIds = targetIds;
  const results = [];

  try {
    // PARALLELIZATION: Fetch all players at once
    const initialPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id mvps currentSeason')
    );
    await Promise.all(initialPlayersPromises);
    await Promise.all(affectedUserIds.map(userId => ensurePlayerRecord(userId)));

    // BATCH OPERATION: Update all players in one query
    const bulkOps = affectedUserIds.map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { mvps: inc, 'currentSeason.mvps': inc } }
      }
    }));
    await Player.bulkWrite(bulkOps, { ordered: false });

    // PARALLELIZATION: Fetch updated players at once
    const updatedPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id mvps currentSeason')
    );
    const updatedPlayers = await Promise.all(updatedPlayersPromises);

    // Generate logs in parallel
    const logPromises = affectedUserIds.map((userId, idx) => {
      const updatedPlayer = updatedPlayers[idx];
      results.push({
        userId,
        mvps: updatedPlayer.mvps,
        seasonMvps: updatedPlayer.currentSeason?.mvps || 0
      });

      const logEmbed = new EmbedBuilder()
        .setTitle(`${EMOJIS.crown || '⭐'} MVP Añadido Manualmente`)
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** +${inc}\n**MVPs Nuevos:** ${updatedPlayer.mvps}`)
        .setColor(COLORS.SUCCESS)
        .setTimestamp();
      return sendLog(message.guild, logEmbed, [], 'stats');
    });
    
    await Promise.all(logPromises);

    // Embed de respuesta con todos los usuarios afectados
    const usersList = results.map(r => `<@${r.userId}> - **${r.seasonMvps}** MVPs`).join('\n');
    const successEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.crown || '⭐'} MVPs Añadidos`)
      .setDescription(`Se han registrado **${inc} MVP(s)** para ${results.length} usuario(s):\n\n${usersList}`)
      .setColor(COLORS.SUCCESS)
      .setFooter(EMBED_DEFAULTS.footer)
      .setTimestamp();
    await message.channel.send({ embeds: [successEmbed] });
    try { if (typeof updateChampionRoles === 'function') await updateChampionRoles(championRoles); } catch (_) { }
  } catch (error) {
    console.error('[AddMvp] Error:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Ocurrió un error al añadir MVPs.`);
  }
}

async function removeMvp(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, EMBED_DEFAULTS, updateChampionRoles, championRoles, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  if (targetIds.length === 0) {
    const usageEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.warning || '⚠️'} Uso Incorrecto`)
      .setDescription("Formato: `!removemvp @usuario1 @usuario2 ... <cantidad>`")
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] });
  }

  // Obtener la cantidad del último argumento numérico
  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);
  const dec = (!isNaN(amount) && amount > 0) ? amount : 1;

  const affectedUserIds = targetIds;
  const results = [];

  try {
    // PARALLELIZATION: Fetch all players at once
    const initialPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id mvps currentSeason')
    );
    await Promise.all(initialPlayersPromises);
    await Promise.all(affectedUserIds.map(userId => ensurePlayerRecord(userId)));

    // BATCH OPERATION: Update all players in one query
    const bulkOps = affectedUserIds.map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { mvps: -dec, 'currentSeason.mvps': -dec } }
      }
    }));
    await Player.bulkWrite(bulkOps, { ordered: false });

    // PARALLELIZATION: Fetch updated players at once
    const updatedPlayersPromises = affectedUserIds.map(userId => 
      Player.findById(userId).lean().select('_id mvps currentSeason')
    );
    const updatedPlayers = await Promise.all(updatedPlayersPromises);

    // Generate logs in parallel
    const logPromises = affectedUserIds.map((userId, idx) => {
      const updatedPlayer = updatedPlayers[idx];
      results.push({
        userId,
        mvps: updatedPlayer.mvps,
        seasonMvps: updatedPlayer.currentSeason?.mvps || 0
      });

      const logEmbed = new EmbedBuilder()
        .setTitle(`${EMOJIS.error || '❌'} MVP Removido Manualmente`)
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** -${dec}\n**MVPs Nuevos:** ${updatedPlayer.mvps}`)
        .setColor(COLORS.ERROR)
        .setTimestamp();
      return sendLog(message.guild, logEmbed, [], 'stats');
    });
    
    await Promise.all(logPromises);

    // Embed de respuesta con todos los usuarios afectados
    const usersList = results.map(r => `<@${r.userId}> - **${r.seasonMvps}** MVPs`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.down || '📉'} MVPs Removidos`)
      .setDescription(`Se han removido **${dec} MVP(s)** de ${results.length} usuario(s):\n\n${usersList}`)
      .setColor(COLORS.ERROR)
      .setFooter(EMBED_DEFAULTS.footer)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    try { if (typeof updateChampionRoles === 'function') await updateChampionRoles(championRoles); } catch (_) { }
  } catch (error) {
    console.error('[RemoveMvp] Error:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Ocurrió un error al remover MVPs.`);
  }
}

module.exports = { addMvp, removeMvp };
