const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function extractUserIds(message, args) {
  const ids = new Set();
  message.mentions.users.forEach(user => ids.add(user.id));
  args.forEach(arg => {
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17) ids.add(clean);
  });
  return Array.from(ids);
}

function ensureAllowed(message, BOT_OWNER_ID) {
  const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
  return isOwner;
}

async function disableButtons(sentMessage) {
  try {
    if (!sentMessage || !Array.isArray(sentMessage.components) || sentMessage.components.length === 0) return;
    const disabledRow = ActionRowBuilder.from(sentMessage.components[0]);
    disabledRow.components.forEach(btn => btn.setDisabled(true));
    await sentMessage.edit({ components: [disabledRow] }).catch(() => {});
  } catch (_) {}
}

async function acceptSuggestion(message, args, deps) {
  const { suggestionsUtils, COLORS, EMBED_DEFAULTS, client, BOT_OWNER_ID } = deps;

  if (!ensureAllowed(message, BOT_OWNER_ID)) {
    const warn = await message.reply({ content: '🚫 No tienes permisos para usar este comando.' }).catch(() => null);
    setTimeout(() => {
      warn?.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 5000);
    return;
  }

  const targetIds = extractUserIds(message, args);
  if (targetIds.length === 0) {
    const sent = await message.reply({ content: '❗ Debes mencionar al usuario o pasar su ID: `!aceptarsugerencia @usuario1 @usuario2...`' });
    setTimeout(() => { sent.delete().catch(() => {}); message.delete().catch(() => {}); }, 7000);
    return;
  }

  const results = [];

  for (const targetId of targetIds) {
      const s = await suggestionsUtils.getByUser(targetId);
      if (!s || s.status !== 'pending') {
        results.push(`ℹ️ <@${targetId}>: No tiene sugerencia pendiente.`);
        continue;
      }

      const channel = await message.guild.channels.fetch(s.channelId).catch(() => null);
      const sugMsg = channel ? await channel.messages.fetch(s.messageId).catch(() => null) : null;

      const embed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle('✅ Sugerencia Aceptada')
        .setDescription(s.content)
        .addFields({ name: 'Estado', value: 'Aceptada' }, { name: 'Votos', value: `✅ Sí: ${s.votes?.yes || 0} | ❌ No: ${s.votes?.no || 0}` })
        .setFooter(EMBED_DEFAULTS.footer)
        .setTimestamp();

      if (sugMsg) {
        await sugMsg.edit({ embeds: [embed] }).catch(() => {});
        await disableButtons(sugMsg);
      }

      await suggestionsUtils.setStatusByUser(targetId, 'accepted');
      results.push(`✅ <@${targetId}>: Sugerencia aceptada.`);
  }

  const ack = await message.reply({ content: results.join('\n') }).catch(() => null);
  setTimeout(() => { ack?.delete().catch(() => {}); message.delete().catch(() => {}); }, 10000);
}

async function rejectSuggestion(message, args, deps) {
  const { suggestionsUtils, COLORS, EMBED_DEFAULTS, client, BOT_OWNER_ID } = deps;

  if (!ensureAllowed(message, BOT_OWNER_ID)) {
    const warn = await message.reply({ content: '🚫 No tienes permisos para usar este comando.' }).catch(() => null);
    setTimeout(() => {
      warn?.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 5000);
    return;
  }

  const targetIds = extractUserIds(message, args);
  if (targetIds.length === 0) {
    const sent = await message.reply({ content: '❗ Debes mencionar al usuario o pasar su ID: `!rechazarsugerencia @usuario1 @usuario2...`' });
    setTimeout(() => { sent.delete().catch(() => {}); message.delete().catch(() => {}); }, 7000);
    return;
  }

  const results = [];

  for (const targetId of targetIds) {
      const s = await suggestionsUtils.getByUser(targetId);
      if (!s || s.status !== 'pending') {
        results.push(`ℹ️ <@${targetId}>: No tiene sugerencia pendiente.`);
        continue;
      }

      const channel = await message.guild.channels.fetch(s.channelId).catch(() => null);
      const sugMsg = channel ? await channel.messages.fetch(s.messageId).catch(() => null) : null;

      const embed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle('❌ Sugerencia Rechazada')
        .setDescription(s.content)
        .addFields({ name: 'Estado', value: 'Rechazada' }, { name: 'Votos', value: `✅ Sí: ${s.votes?.yes || 0} | ❌ No: ${s.votes?.no || 0}` })
        .setFooter(EMBED_DEFAULTS.footer)
        .setTimestamp();

      if (sugMsg) {
        await sugMsg.edit({ embeds: [embed] }).catch(() => {});
        await disableButtons(sugMsg);
      }

      await suggestionsUtils.setStatusByUser(targetId, 'rejected');
      results.push(`🛑 <@${targetId}>: Sugerencia rechazada.`);
  }

  const ack = await message.reply({ content: results.join('\n') }).catch(() => null);
  setTimeout(() => { ack?.delete().catch(() => {}); message.delete().catch(() => {}); }, 10000);
}

async function deleteSuggestion(message, args, deps) {
  const { suggestionsUtils, client, BOT_OWNER_ID } = deps;

  if (!ensureAllowed(message, BOT_OWNER_ID)) {
    const warn = await message.reply({ content: '🚫 No tienes permisos para usar este comando.' }).catch(() => null);
    setTimeout(() => { warn?.delete().catch(() => {}); message.delete().catch(() => {}); }, 5000);
    return;
  }

  const targetIds = extractUserIds(message, args);
  if (targetIds.length === 0) {
    const sent = await message.reply({ content: '❗ Debes mencionar al usuario o pasar su ID: `!eliminarsugerencia @usuario1 @usuario2...`' });
    setTimeout(() => { sent.delete().catch(() => {}); message.delete().catch(() => {}); }, 7000);
    return;
  }

  const results = [];

  for (const targetId of targetIds) {
      const s = await suggestionsUtils.getByUser(targetId);
      if (!s) {
        results.push(`ℹ️ <@${targetId}>: No tiene sugerencia registrada.`);
        continue;
      }

      const channel = await message.guild.channels.fetch(s.channelId).catch(() => null);
      const sugMsg = channel ? await channel.messages.fetch(s.messageId).catch(() => null) : null;
      if (sugMsg) await sugMsg.delete().catch(() => {});

      await suggestionsUtils.setStatusByUser(targetId, 'deleted');
      results.push(`🗑️ <@${targetId}>: Sugerencia eliminada.`);
  }

  const ack = await message.reply({ content: results.join('\n') }).catch(() => null);
  setTimeout(() => { ack?.delete().catch(() => {}); message.delete().catch(() => {}); }, 10000);
}

module.exports = { acceptSuggestion, rejectSuggestion, deleteSuggestion };
