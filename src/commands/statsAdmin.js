const { EmbedBuilder } = require('discord.js');

/**
 * Agrega creaciones a uno o varios jugadores.
 */
async function addCreacion(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, BOT_OWNER_ID, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`).catch(() => { });

  const mentions = message.mentions.users;
  if (mentions.size === 0) return message.channel.send(`Uso: \`!addcreacion @Jugador1 @Jugador2 ... [cantidad]\``);

  // Intentar obtener cantidad del último argumento
  let amount = parseInt(args[args.length - 1]);
  if (isNaN(amount) || amount < 1) amount = 1;

  const affectedUserIds = Array.from(mentions.keys());
  const results = [];

  for (const userId of affectedUserIds) {
    await ensurePlayerRecord(userId);
    const player = await Player.findById(userId);
    if (!player) continue;

    player.creations = (player.creations || 0) + amount;
    if (!player.currentSeason) player.currentSeason = {};
    player.currentSeason.creations = (player.currentSeason.creations || 0) + amount;

    await player.save();
    results.push({ username: mentions.get(userId).username, id: userId, total: player.currentSeason.creations });
  }

  const usersList = results.map(r => `**${r.username}** (Total Temp: ${r.total})`).join(', ');
  await message.channel.send(`${EMOJIS.success || '✅'} Se agregaron **${amount}** creaciones a: ${usersList}.`).catch(() => { });

  if (sendLog) {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.maintenance || '🛠️'} Creaciones Agregadas`)
      .setDescription(`**Admin:** <@${message.author.id}>\n**Cantidad:** ${amount}\n**Jugadores:**\n${results.map(r => `<@${r.id}>`).join('\n')}`)
      .setColor(COLORS.SUCCESS)
      .setTimestamp();
    await sendLog(message.guild, embed, [], 'stats');
  }
}

/**
 * Remueve creaciones de uno o varios jugadores.
 */
async function removeCreacion(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, BOT_OWNER_ID, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`).catch(() => { });

  const mentions = message.mentions.users;
  if (mentions.size === 0) return message.channel.send(`Uso: \`!removecreacion @Jugador1 @Jugador2 ... [cantidad]\``);

  let amount = parseInt(args[args.length - 1]);
  if (isNaN(amount) || amount < 1) amount = 1;

  const affectedUserIds = Array.from(mentions.keys());
  const results = [];

  for (const userId of affectedUserIds) {
    await ensurePlayerRecord(userId);
    const player = await Player.findById(userId);
    if (!player) continue;

    player.creations = Math.max(0, (player.creations || 0) - amount);
    if (player.currentSeason) {
      player.currentSeason.creations = Math.max(0, (player.currentSeason.creations || 0) - amount);
    }

    await player.save();
    results.push({ username: mentions.get(userId).username, id: userId, total: player.currentSeason?.creations || 0 });
  }

  const usersList = results.map(r => `**${r.username}** (Total Temp: ${r.total})`).join(', ');
  await message.channel.send(`${EMOJIS.success || '✅'} Se removieron **${amount}** creaciones a: ${usersList}.`).catch(() => { });

  if (sendLog) {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.maintenance || '🛠️'} Creaciones Removidas`)
      .setDescription(`**Admin:** <@${message.author.id}>\n**Cantidad:** ${amount}\n**Jugadores:**\n${results.map(r => `<@${r.id}>`).join('\n')}`)
      .setColor(COLORS.WARNING)
      .setTimestamp();
    await sendLog(message.guild, embed, [], 'stats');
  }
}

/**
 * Agrega racha a uno o varios jugadores.
 */
async function addRacha(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`).catch(() => { });

  const mentions = message.mentions.users;
  if (mentions.size === 0) return message.channel.send(`Uso: \`!addracha @Jugador1 @Jugador2 ... [cantidad]\``);

  let amount = parseInt(args[args.length - 1]);
  if (isNaN(amount) || amount < 1) amount = 1;

  const affectedUserIds = Array.from(mentions.keys());
  const results = [];

  for (const userId of affectedUserIds) {
    await ensurePlayerRecord(userId);
    const player = await Player.findById(userId);
    if (!player) continue;

    player.streak = (player.streak || 0) + amount;
    if (player.streak > (player.maxStreak || 0)) player.maxStreak = player.streak;

    if (!player.currentSeason) player.currentSeason = {};
    player.currentSeason.streak = (player.currentSeason.streak || 0) + amount;
    if (player.currentSeason.streak > (player.currentSeason.maxStreak || 0)) {
      player.currentSeason.maxStreak = player.currentSeason.streak;
    }

    await player.save();
    results.push({ username: mentions.get(userId).username, id: userId, streak: player.streak });
  }

  const usersList = results.map(r => `**${r.username}** (Racha: ${r.streak})`).join(', ');
  await message.channel.send(`${EMOJIS.success || '✅'} Se agregó **${amount}** de racha a: ${usersList}.`).catch(() => { });
  if (sendLog) {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.fire || '🔥'} Racha Agregada`)
      .setDescription(`**Admin:** <@${message.author.id}>\n**Cantidad:** ${amount}\n**Jugadores:**\n${results.map(r => `<@${r.id}>`).join('\n')}`)
      .setColor(COLORS.SUCCESS)
      .setTimestamp();
    await sendLog(message.guild, embed, [], 'stats');
  }
}

/**
 * Remueve racha a uno o varios jugadores.
 */
async function removeRacha(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`).catch(() => { });

  const mentions = message.mentions.users;
  if (mentions.size === 0) return message.channel.send(`Uso: \`!removeracha @Jugador1 @Jugador2 ... [cantidad]\``);

  let amount = parseInt(args[args.length - 1]);
  if (isNaN(amount) || amount < 1) amount = 1;

  const affectedUserIds = Array.from(mentions.keys());
  const results = [];

  for (const userId of affectedUserIds) {
    await ensurePlayerRecord(userId);
    const player = await Player.findById(userId);
    if (!player) continue;

    player.streak = Math.max(0, (player.streak || 0) - amount);
    if (player.currentSeason) {
      player.currentSeason.streak = Math.max(0, (player.currentSeason.streak || 0) - amount);
    }

    await player.save();
    results.push({ username: mentions.get(userId).username, id: userId, streak: player.streak });
  }

  const usersList = results.map(r => `**${r.username}** (Racha: ${r.streak})`).join(', ');
  await message.channel.send(`${EMOJIS.success || '✅'} Se removió **${amount}** de racha a: ${usersList}.`).catch(() => { });
  if (sendLog) {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.fire || '🔥'} Racha Removida`)
      .setDescription(`**Admin:** <@${message.author.id}>\n**Cantidad:** ${amount}\n**Jugadores:**\n${results.map(r => `<@${r.id}>`).join('\n')}`)
      .setColor(COLORS.WARNING)
      .setTimestamp();
    await sendLog(message.guild, embed, [], 'stats');
  }
}

async function statsCommand(message, deps) {
  const { client, Player, ensurePlayerRecord, COLORS, config } = deps;
  const EMOJIS = config?.emojis || {};

  // Usuario objetivo
  const args = message.content.split(/\s+/).slice(1);
  let target = message.mentions.users.first()
    || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null)
    || message.author;

  const playerDoc = await ensurePlayerRecord(target.id);
  const seasonStats = playerDoc.currentSeason || {};

  const embed = new EmbedBuilder()
    .setAuthor({ name: `Stats de ${target.username}`, iconURL: target.displayAvatarURL() })
    .setColor(COLORS.PRIMARY)
    .addFields(
      { name: `${EMOJIS.rank || '🏆'} Puntos`, value: `${seasonStats.points || 0}`, inline: true },
      { name: `${EMOJIS.success || '✅'} Victorias`, value: `${seasonStats.wins || 0}`, inline: true },
      { name: `${EMOJIS.error || '❌'} Derrotas`, value: `${seasonStats.losses || 0}`, inline: true },
      { name: `${EMOJIS.fire || '🔥'} Racha Actual`, value: `${seasonStats.streak || 0}`, inline: true },
      { name: `${EMOJIS.bolt || '⚡'} Mejor Racha`, value: `${seasonStats.maxStreak || 0}`, inline: true },
      { name: `${EMOJIS.star || '🌟'} MVPs`, value: `${seasonStats.mvps || 0}`, inline: true }
    )
    .setThumbnail(target.displayAvatarURL())
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
}

module.exports = { addCreacion, removeCreacion, addRacha, removeRacha, statsCommand };
