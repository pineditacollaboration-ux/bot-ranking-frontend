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

async function addLoss(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles, championRoles, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  // Obtener la cantidad del último argumento numérico
  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);

  if (targetIds.length === 0 || isNaN(amount) || amount <= 0) {
    const usageEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.warning || '⚠️'} Uso Incorrecto`)
      .setDescription("Formato: `!addderrotas @usuario1 @usuario2 ... <cantidad>`")
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] });
  }

  const results = [];
  const affectedUserIds = [];

  // Procesar cada usuario mencionado
  for (const userId of targetIds) {
    const updatedPlayer = await Player.findByIdAndUpdate(
      userId,
      { $inc: { losses: amount, 'currentSeason.losses': amount } },
      { new: true, upsert: true }
    );

    results.push({
      userId,
      losses: updatedPlayer.losses,
      seasonLosses: updatedPlayer.currentSeason?.losses || 0
    });
    affectedUserIds.push(userId);

    // Log individual para cada usuario
    const logEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.error || '❌'} Derrota Añadida Manualmente`)
      .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** +${amount}\n**Derrotas Nuevas:** ${updatedPlayer.losses}`)
      .setColor(COLORS.ERROR)
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'stats');
  }

  // Embed de respuesta con todos los usuarios afectados
  const usersList = results.map(r => `<@${r.userId}> - **${r.seasonLosses}** derrotas`).join('\n');
  const successEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.error || '❌'} Derrotas Añadidas`)
    .setDescription(`Se han registrado **${amount} derrotas** para ${results.length} usuario(s):\n\n${usersList}`)
    .setColor(COLORS.ERROR)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();
  await message.channel.send({ embeds: [successEmbed] });
  await updateAffectedNicknames(message.guild, affectedUserIds);
  try { if (typeof updateChampionRoles === 'function') await updateChampionRoles(championRoles); } catch (_) { }
}

async function removeLoss(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles, championRoles, config } = ctx;
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  const targetIds = extractUserIds(message, args);
  // Obtener la cantidad del último argumento numérico
  const lastArg = args[args.length - 1];
  const amount = parseInt(lastArg, 10);

  if (targetIds.length === 0 || isNaN(amount) || amount <= 0) {
    return message.channel.send(`Uso: \`!removederrotas @usuario1 @usuario2 ... <cantidad>\``);
  }

  const results = [];
  const affectedUserIds = [];

  // Procesar cada usuario mencionado
  for (const userId of targetIds) {
    const updatedPlayer = await Player.findByIdAndUpdate(
      userId,
      { $inc: { losses: -amount, 'currentSeason.losses': -amount } },
      { new: true, upsert: true }
    );

    results.push({
      userId,
      losses: updatedPlayer.losses,
      seasonLosses: updatedPlayer.currentSeason?.losses || 0
    });
    affectedUserIds.push(userId);

    // Log individual para cada usuario
    const logEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.success || '✅'} Derrota Removida Manualmente`)
      .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${userId}>\n**Cantidad:** -${amount}\n**Derrotas Nuevas:** ${updatedPlayer.losses}`)
      .setColor(COLORS.SUCCESS)
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'stats');
  }

  // Embed de respuesta con todos los usuarios afectados
  const usersList = results.map(r => `<@${r.userId}> - **${r.seasonLosses}** derrotas`).join('\n');
  const embed = new EmbedBuilder()
    .setTitle(`${EMOJIS.success || '✅'} Derrotas Removidas`)
    .setDescription(`Se han removido **${amount} derrotas** de ${results.length} usuario(s):\n\n${usersList}`)
    .setColor(COLORS.SUCCESS)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();
  await message.channel.send({ embeds: [embed] });

  await updateAffectedNicknames(message.guild, affectedUserIds);
  try { if (typeof updateChampionRoles === 'function') await updateChampionRoles(championRoles); } catch (_) { }
}

module.exports = { addLoss, removeLoss };
