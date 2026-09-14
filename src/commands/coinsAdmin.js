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

async function addCoins(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, COLORS, sendLog, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.ban || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  // Obtener cantidad del último argumento
  const amount = parseInt(args[args.length - 1], 10);

  if (targetIds.length === 0 || !Number.isInteger(amount) || amount <= 0) {
    return message.channel.send(`Uso: \`!addcoins @usuario1 @usuario2 ... <cantidad>\``);
  }

  const affectedUserIds = targetIds;

  try {
    // PARALLELIZATION: Ensure player record and fetch in parallel
    await Promise.all(affectedUserIds.map(userId => ensurePlayerRecord(userId)));

    // BATCH OPERATION: Update players
    const bulkOps = affectedUserIds.map(userId => ({
      updateOne: {
        filter: { _id: userId },
        update: { $inc: { styleCoins: amount } }
      }
    }));
    await ctx.Player.bulkWrite(bulkOps, { ordered: false });

    // Fetch updated players
    const updatedPlayers = await ctx.Player.find({ _id: { $in: affectedUserIds } }).select('_id styleCoins').lean();

    const logEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.money || '🪙'} Monedas Añadidas Manualmente`)
      .setDescription(`**Staff:** <@${message.author.id}>\n**Cantidad:** +${amount} ${EMOJIS.money || '🪙'}\n**Jugadores:**\n${updatedPlayers.map(p => `<@${p._id}> (${p.styleCoins || 0} ${EMOJIS.money || '🪙'})`).join('\n')}`)
      .setColor(COLORS.SUCCESS);
    await sendLog(message.guild, logEmbed, [], 'coins');

    return message.channel.send(`${EMOJIS.success || '✅'} Se añadieron **${amount}** ${EMOJIS.money || '🪙'} a ${affectedUserIds.length} jugador(es).`).catch(() => { });
  } catch (error) {
    console.error('[AddCoins] Error:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Ocurrió un error al añadir monedas.`);
  }
}

async function removeCoins(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, COLORS, sendLog, performanceOptimizer, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.ban || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  // Obtener cantidad del último argumento
  const amount = parseInt(args[args.length - 1], 10);

  if (targetIds.length === 0 || !Number.isInteger(amount) || amount <= 0) {
    return message.channel.send(`Uso: \`!removecoins @usuario1 @usuario2 ... <cantidad>\``);
  }

  const affectedUserIds = targetIds;

  try {
    // PARALLELIZATION: Ensure player record and fetch in parallel
    await Promise.all(affectedUserIds.map(userId => ensurePlayerRecord(userId)));

    // Need to fetch first to ensure we don't go below 0? 
    // MongoDB $inc with negative value works, but to clamp at 0 requires pipeline update or separate read.
    // Simple approach: fetch, calc, update. Or use update pipeline (requires MongoDB 4.2+).
    // Let's stick to fetch-update for safety if version unknown, or just accept negative (usually not desired).
    // But `removeCoins` should probably clamp at 0.
    // The previous implementation did fetch-calc-update.

    const players = await ctx.Player.find({ _id: { $in: affectedUserIds } }).select('_id styleCoins').lean();

    const bulkOps = players.map(player => {
      const currentCoins = player.styleCoins || 0;
      const newCoins = Math.max(0, currentCoins - amount);
      return {
        updateOne: {
          filter: { _id: player._id },
          update: { $set: { styleCoins: newCoins } }
        }
      };
    });

    if (bulkOps.length > 0) {
      await ctx.Player.bulkWrite(bulkOps, { ordered: false });
    }

    // Fetch updated players for log
    const updatedPlayers = await ctx.Player.find({ _id: { $in: affectedUserIds } }).select('_id styleCoins').lean();

    const logEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.money || '🪙'} Monedas Removidas Manualmente`)
      .setDescription(`**Staff:** <@${message.author.id}>\n**Cantidad:** -${amount} ${EMOJIS.money || '🪙'}\n**Jugadores:**\n${updatedPlayers.map(p => `<@${p._id}> (${p.styleCoins || 0} ${EMOJIS.money || '🪙'})`).join('\n')}`)
      .setColor(COLORS.ERROR);
    await sendLog(message.guild, logEmbed, [], 'coins');

    return message.channel.send(`${EMOJIS.success || '✅'} Se removieron **${amount}** ${EMOJIS.money || '🪙'} de ${affectedUserIds.length} jugador(es).`).catch(() => { });
  } catch (error) {
    console.error('[RemoveCoins] Error:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Ocurrió un error al remover monedas.`);
  }
}

module.exports = { addCoins, removeCoins };
