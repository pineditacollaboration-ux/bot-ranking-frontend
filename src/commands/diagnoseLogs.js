// src/commands/diagnoseLogs.js
/**
 * Diagnóstico de categorías de logs.
 * Envía un mensaje de prueba a cada categoría configurada y reporta permisos/estado.
 */
module.exports = async function diagnoseLogs(message, args, deps) {
  const { hasPermission, settings, sendLog, EmbedBuilder, COLORS, client, PermissionsBitField } = deps;

  if (!hasPermission(message.member)) {
    return message.channel.send('🚫 Solo el staff puede usar este comando.');
  }

  const categories = [
    { key: null, label: 'default', id: settings.logChannelId },
    { key: 'errors', label: 'errors', id: settings.logChannelErrorsId },
    { key: 'queues', label: 'queues', id: settings.logChannelQueuesId },
    { key: 'matches', label: 'matches', id: settings.logChannelMatchesId },
    { key: 'autorole', label: 'autorole', id: settings.logChannelAutoroleId },
    { key: 'warnings', label: 'warnings', id: settings.logChannelWarningsId },
    { key: 'points', label: 'points', id: settings.logChannelPointsId },
    { key: 'coins', label: 'coins', id: settings.logChannelCoinsId },
    { key: 'stats', label: 'stats', id: settings.logChannelStatsId },
    { key: 'shop', label: 'shop', id: settings.logChannelShopId },
    { key: 'roulette', label: 'roulette', id: settings.logChannelRouletteId },
    { key: 'vips', label: 'vips', id: settings.logChannelVipsId },
    { key: 'exclusivo', label: 'exclusivo', id: settings.logChannelExclusivoId },
    { key: 'raid', label: 'raid', id: settings.logChannelRaidId },
    { key: 'terminos', label: 'terminos', id: settings.logChannelTerminosId },
    { key: 'bets', label: 'bets', id: settings.logChannelBetsId },
    { key: 'spins', label: 'spins', id: settings.logChannelSpinsId },
    { key: 'reset', label: 'reset', id: settings.logChannelResetId },
    { key: 'voiceTemp', label: 'voiceTemp', id: settings.logChannelVoiceTempId },
    { key: 'penalty10k', label: 'penalty10k', id: settings.logChannelPenalty10kId },
    { key: 'admin', label: 'admin', id: settings.logChannelId },
    { key: 'settings', label: 'settings', id: settings.logChannelId },
  ];

  const statusLines = [];
  const categoriesToCheck = categories.slice(0, 15); // Limitar para no saturar si hay muchos, o procesar todos

  for (const cat of categories) {
    const id = cat.id;
    if (!id) {
      statusLines.push(`• ${cat.label}: ❌ sin canal configurado`);
      continue;
    }
    
    try {
      const channel = await message.guild.channels.fetch(id).catch(() => null);
      if (!channel) {
        statusLines.push(`• ${cat.label}: ❌ canal inexistente (${id})`);
        continue;
      }

      const me = message.guild.members.me || (await message.guild.members.fetch(client.user.id).catch(() => null));
      const perms = channel.permissionsFor(me);
      
      const hasSend = perms && perms.has(PermissionsBitField.Flags.SendMessages);
      const hasEmbed = perms && perms.has(PermissionsBitField.Flags.EmbedLinks);
      const isText = typeof channel.isTextBased === 'function' && channel.isTextBased();

      if (!isText) {
        statusLines.push(`• ${cat.label}: ❌ no es canal de texto <#${id}>`);
        continue;
      }

      let permStatus = '';
      if (!hasSend) permStatus += '🚫 Sin enviar mensajes';
      if (!hasEmbed) permStatus += (permStatus ? ', ' : '') + '🚫 Sin links embebidos';

      if (permStatus) {
        statusLines.push(`• ${cat.label}: ❌ Error de Permisos: ${permStatus} en <#${id}>`);
        continue;
      }

      // Enviar log de prueba y VERIFICAR
      const testEmbed = new EmbedBuilder()
        .setTitle('🧪 Diagnóstico de Logs')
        .setDescription(`Categoría: **${cat.label}**\nID Canal: \`${id}\`\nSolicitado por: <@${message.author.id}>`)
        .setColor(COLORS.PRIMARY)
        .setTimestamp();

      const result = await sendLog(message.guild, testEmbed, [], cat.key);
      
      if (result) {
        statusLines.push(`• ${cat.label}: ✅ Funcional en <#${id}>`);
      } else {
        statusLines.push(`• ${cat.label}: ⚠️ Falló envío a <#${id}> (ver consola para error)`);
      }
    } catch (err) {
      statusLines.push(`• ${cat.label}: ❌ Error Crítico: ${err.message}`);
    }
  }

  const summary = new EmbedBuilder()
    .setTitle('🧪 Resumen de Diagnóstico de Logs')
    .setDescription(statusLines.join('\n').substring(0, 4000))
    .setColor(COLORS.SUCCESS)
    .setTimestamp();

  return message.channel.send({ embeds: [summary] });
};

