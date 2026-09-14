const { EmbedBuilder } = require('discord.js');
const { Player } = require('../../models');
const { getTikTokLiveStatus, checkTikTokLive } = require('../utils/tiktok');

function extractUserIds(message, args) {
  const ids = new Set();
  message.mentions.users.forEach(user => ids.add(user.id));
  args.forEach(arg => {
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17) ids.add(clean);
  });
  return Array.from(ids);
}

module.exports = async function tiktokCommand(message, args, ctx) {
  const { COLORS, EMBED_DEFAULTS, hasPermission } = ctx;
  const subCommand = args[0] ? args[0].toLowerCase() : null;

  if (subCommand === 'unlink') {
    // Si es admin, puede desvincular a otros
    let targetIds = extractUserIds(message, args);
    if (targetIds.length === 0) targetIds.push(message.author.id);

    const tryingToUnlinkOthers = targetIds.some(id => id !== message.author.id);
    if (tryingToUnlinkOthers && !hasPermission(message.member)) {
      return message.reply('❌ No tienes permisos para desvincular la cuenta de otros.');
    }
    
    const results = [];
    for (const id of targetIds) {
        const doc = await Player.findOneAndUpdate(
          { _id: id },
          { $set: { tiktokUsername: null } },
          { new: true }
        );
        if (doc) {
             results.push(`✅ <@${id}>: Cuenta desvinculada.`);
        } else {
             results.push(`⚠️ <@${id}>: No se encontró registro.`);
        }
    }
    return message.reply(results.join('\n'));
  }

  if (subCommand === 'list') {
    if (!hasPermission(message.member)) {
        return message.reply('❌ No tienes permisos para ver la lista.');
    }

    const players = await Player.find({ tiktokUsername: { $ne: null, $exists: true } });
    if (!players || players.length === 0) {
        return message.reply('⚠️ No hay usuarios vinculados con TikTok.');
    }

    const embed = new EmbedBuilder()
        .setTitle('📱 Usuarios Vinculados a TikTok')
        .setColor(COLORS.PRIMARY)
        .setFooter(EMBED_DEFAULTS.footer);

    const lines = players.map(p => {
        const last = p.lastStreamAnnouncement ? `<t:${Math.floor(p.lastStreamAnnouncement / 1000)}:R>` : 'Nunca';
        return `• <@${p._id}> → **${p.tiktokUsername}** | Último aviso: ${last}`;
    });

    // Manejo básico de paginación (si excede 4096 chars o límites de campo)
    // Aquí usamos descripción simple, cortando si es muy largo
    const description = lines.join('\n');
    if (description.length > 4000) {
        embed.setDescription(description.substring(0, 4000) + '... (lista truncada)');
    } else {
        embed.setDescription(description);
    }

    return message.channel.send({ embeds: [embed] });
  }

  if (subCommand === 'check') {
    if (!hasPermission(message.member)) {
        return message.reply('❌ No tienes permisos para usar este comando.');
    }
    let targetIds = extractUserIds(message, args);
    if (targetIds.length === 0) targetIds.push(message.author.id);
    
    const statusMsg = await message.reply(`🔄 Verificando estado de TikTok para ${targetIds.length} usuario(s)...`);
    
    for (const id of targetIds) {
        const player = await Player.findById(id);
        if (!player || !player.tiktokUsername) {
            await message.channel.send(`⚠️ <@${id}> no tiene una cuenta de TikTok vinculada.`);
            continue;
        }
    
        const status = await getTikTokLiveStatus(player.tiktokUsername);
        const lastAnnounced = player.lastStreamAnnouncement ? `<t:${Math.floor(player.lastStreamAnnouncement / 1000)}:R>` : 'Nunca';
        
        const embed = new EmbedBuilder()
            .setTitle(`Estado de TikTok: ${player.tiktokUsername}`)
            .addFields(
                { name: 'Vinculado a', value: `<@${id}>`, inline: true },
                { name: 'Estado', value: status.isLive ? '🔴 **EN VIVO**' : '⚫ Offline', inline: true },
                { name: 'Room ID', value: status.roomId ? `\`${status.roomId}\`` : 'N/A', inline: true },
                { name: 'Último Aviso', value: lastAnnounced, inline: true },
                { name: 'Error', value: status.error ? `\`${status.error}\`` : 'Ninguno', inline: true }
            )
            .setColor(status.isLive ? '#ff0050' : '#808080')
            .setTimestamp();
            
        await message.channel.send({ embeds: [embed] });
    }
    
    await statusMsg.delete().catch(() => {});
    return;
  }

  if (subCommand === 'test') {
    if (!hasPermission(message.member)) {
        return message.reply('❌ No tienes permisos para usar este comando.');
    }
    let targetIds = extractUserIds(message, args);
    if (targetIds.length === 0) targetIds.push(message.author.id);
    
    message.reply(`🔄 Probando notificación para ${targetIds.length} usuario(s)... (Forzando envío sin cooldown)`);
    
    for (const id of targetIds) {
        // checkTikTokLive(userId, guild, settings, force)
        await checkTikTokLive(id, message.guild, ctx.settings || {}, true);
    }
    return;
  }

  // Verificar si el primer argumento es una mención
  let targetUser = message.mentions.users.first();
  let tiktokUsername = args[0];

  if (targetUser) {
    // Si hay mención, el usuario de TikTok debería ser el segundo argumento
    if (!hasPermission(message.member)) {
      return message.reply('❌ No tienes permisos para vincular la cuenta de otros.');
    }
    tiktokUsername = args[1];
  } else {
    // Si no hay mención, es para uno mismo
    targetUser = message.author;
  }

  if (!tiktokUsername) {
    return message.reply('⚠️ Uso: `!tiktok <usuario_tiktok>` o `!tiktok @usuario <usuario_tiktok>`');
  }

  // Limpiar @ si lo ponen
  const cleanUsername = tiktokUsername.replace(/^@/, '');

  const doc = await Player.findOneAndUpdate(
    { _id: targetUser.id },
    { $set: { tiktokUsername: cleanUsername } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const embed = new EmbedBuilder()
    .setTitle('✅ TikTok Vinculado')
    .setDescription(`La cuenta de Discord de **${doc?.customName || targetUser.username}** ha sido vinculada con el usuario de TikTok: **${cleanUsername}**.\n\nCuando entre a una fila y esté en directo, el bot lo anunciará automáticamente (máximo una vez cada 4 horas).`)
    .setColor(COLORS.SUCCESS)
    .setFooter(EMBED_DEFAULTS.footer);

  return message.channel.send({ embeds: [embed] });
};
