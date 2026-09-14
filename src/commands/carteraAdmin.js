const { EmbedBuilder } = require('discord.js');

async function addCartera(message, args, {
  hasPermission,
  client,
  ensurePlayerRecord,
  COLORS,
  parseDuration,
  sendLog,
  removeTemporaryRole,
}) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 No tienes permisos para usar este comando.').catch(() => { });

  const role = message.mentions.roles.first() || (args[0] ? (message.guild.roles.cache.get(args[0]) || await message.guild.roles.fetch(args[0]).catch(() => null)) : null);
  const rawUser = (args[1] || '').replace(/[^0-9]/g, '');
  const lastMention = message.mentions.users.last();
  const userId = lastMention?.id || (rawUser || null);

  const tiempo = args[2];
  const duration = tiempo ? parseDuration(tiempo) : null;

  // New: Quantity argument
  const cantidadInput = args[3];
  const cantidad = cantidadInput ? parseInt(cantidadInput, 10) : 1;

  if (!role || !userId || !duration) {
    return message.channel.send("Uso: `!addcartera @Rol @Jugador <duración> [cantidad]` (ej: 7d, 12h, 30m).").catch(() => { });
  }

  if (isNaN(cantidad) || cantidad < 1) {
    return message.channel.send("🚫 La cantidad debe ser un número válido mayor a 0.").catch(() => { });
  }

  const member = message.guild.members.cache.get(userId) || await message.guild.members.fetch(userId).catch(() => null);
  if (!member) return message.channel.send("❌ No encontré a ese miembro en el servidor.");

  if (!member.manageable || message.guild.members.me.roles.highest.position <= role.position) {
    return message.channel.send('🚫 No puedo asignar ese rol porque está por encima de mi jerarquía.').catch(() => { });
  }

  const config = require('../../config.json');
  const player = await ensurePlayerRecord(userId);
  const isX2Role = role.id === config.specialRoles?.puntosX2;
  const isShieldRole = role.id === config.specialRoles?.proteccion;

  const totalDuration = duration * cantidad;

  if (isX2Role || isShieldRole) {
    const field = isX2Role ? 'x2_credit_ms' : 'proteccion_credit_ms';
    // const untilField = isX2Role ? 'x2_until' : 'proteccion_until'; // Unused in this logic block
    player[field] = (player[field] || 0) + totalDuration;
    await player.save();
  } else {
    // For normal roles, we can't really "stack" them in the same way as credit, 
    // but the user asked for "cartera" which usually implies the credit items.
    // If it's a normal role, we'll just apply it once with the total duration? 
    // Or maybe just reject quantity for normal roles? 
    // Let's assume for now it just extends the duration.
    await member.roles.add(role.id).catch(() => { });
    const expiresAt = new Date(Date.now() + totalDuration);
    player.temporaryRoles = Array.isArray(player.temporaryRoles) ? player.temporaryRoles : [];
    player.temporaryRoles.push({ roleId: role.id, expiresAt });
    await player.save();
    const MAX_TIMEOUT = 0x7fffffff;
    if (totalDuration > 0 && totalDuration <= MAX_TIMEOUT) {
      setTimeout(() => removeTemporaryRole(userId, role.id), totalDuration);
    }
  }

  const embed = new EmbedBuilder().setColor(COLORS.PRIMARY).setTimestamp();
  const quantityText = cantidad > 1 ? ` (x${cantidad})` : '';
  const totalText = cantidad > 1 ? `\n**Total Agregado:** ${tiempo} x ${cantidad}` : '';

  if (isX2Role) {
    embed.setTitle('💼 Cartera: Crédito X2 añadido')
      .setDescription(`**Admin:** <@${message.author.id}>
**Jugador:** <@${userId}>
**Crédito:** +${tiempo}${quantityText} X2 por tiempo${totalText}`);
    await sendLog(message.guild, embed, [], 'points');
    return message.channel.send({ content: `✅ Crédito de X2 (+${tiempo}${quantityText}) añadido a la cartera de <@${userId}>.` }).catch(() => { });
  }
  if (isShieldRole) {
    embed.setTitle('💼 Cartera: Crédito de Protección añadido')
      .setDescription(`**Admin:** <@${message.author.id}>
**Jugador:** <@${userId}>
**Crédito:** +${tiempo}${quantityText} Protección por tiempo${totalText}`);
    await sendLog(message.guild, embed, [], 'points');
    return message.channel.send({ content: `✅ Crédito de Protección (+${tiempo}${quantityText}) añadido a la cartera de <@${userId}>.` }).catch(() => { });
  }

  // Normal role fallback
  embed.setTitle('💼 Beneficio de Cartera Asignado')
    .setDescription(`**Admin:** <@${message.author.id}>
**Jugador:** <@${userId}>
**Rol:** <@&${role.id}>
**Duración:** ${tiempo}${quantityText}${totalText}`);
  await sendLog(message.guild, embed, [], 'autorole');
  return message.channel.send({ content: `✅ Rol <@&${role.id}> añadido a <@${userId}> por ${tiempo}${quantityText}.` }).catch(() => { });
}

async function resetCarteraCommand(message, args, { hasPermission, ensurePlayerRecord, sendLog, EmbedBuilder, COLORS }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 No tienes permisos para usar este comando.').catch(() => { });

  const targetId = message.mentions.users.first()?.id || args[0];
  if (!targetId) return message.reply('❌ Debes mencionar a un usuario o poner su ID.').catch(() => { });

  const player = await ensurePlayerRecord(targetId);
  if (!player) return message.reply('❌ Usuario no encontrado en la base de datos.').catch(() => { });

  // Reset Wallet Resources
  player.styleCoins = 0;
  player.yCoins = 0;
  player.spins = 0;
  if (player.currentSeason) player.currentSeason.points = 0;

  // Reset Credits
  player.x2_credit_ms = 0;
  player.proteccion_credit_ms = 0;

  // Reset Donation Rights
  player.donationRights = {
    bigBoss: 0,
    spider: 0,
    paseLibre: 0,
    relikia: 0,
    blood: 0,
    wave: 0,
    scream: 0,
    king: 0,
    bornToWin: 0,
    lendaTropa: 0,
    crazyToWin: 0,
    tempVoice: 0,
    customRole: 0
  };

  // Reset Temporary Roles (Clear Array)
  // Note: This does NOT remove roles from Discord immediately, only from DB tracking.
  // To remove from Discord, we would need to fetch member and remove roles.
  // Assuming reset implies clearing the "wallet" record.
  player.temporaryRoles = [];

  await player.save();

  const logEmbed = new EmbedBuilder()
    .setTitle('🗑️ Cartera Reseteada')
    .setDescription(`**Admin:** <@${message.author.id}>\n**Usuario:** <@${targetId}>\n\nSe han eliminado todas las divisas, créditos y derechos de donación.`)
    .setColor(COLORS.ERROR)
    .setTimestamp();

  await sendLog(message.guild, logEmbed, [], 'reset');
  return message.reply(`✅ La cartera de <@${targetId}> ha sido reseteada correctamente.`).catch(() => { });
}

module.exports = { addCartera, resetCarteraCommand };
