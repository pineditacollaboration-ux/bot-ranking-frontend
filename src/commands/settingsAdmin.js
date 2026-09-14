const { EmbedBuilder, ChannelType } = require('discord.js');

async function setHistoryChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send(`Uso: \`!sethistorychannel #canal\` o \`!sethistorychannel <ID del canal>\` (debe ser un canal de texto o anuncios).`).catch(() => {});
  }

  await Setting.findByIdAndUpdate('historyChannel', { value: channel.id }, { upsert: true });
  settings.historyChannel = channel.id;

  const logEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.maintenance || '⚙️'} Canal de Historial Configurado`)
    .setDescription(`**Administrador:** <@${message.author.id}>\nEl canal de historial de partidas se ha establecido en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.success || '✅'} Canal de Historial Configurado`)
    .setDescription(`El historial de todas las partidas finalizadas se enviará ahora en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

async function setAnnouncementsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send(`Uso: \`!setannouncements #canal\` o \`!setannouncements <ID del canal>\` (debe ser un canal de texto o anuncios).`).catch(() => {});
  }

  await Setting.findByIdAndUpdate('announcementsChannel', { value: channel.id }, { upsert: true });
  settings.announcementsChannel = channel.id;

  const logEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.maintenance || '⚙️'} Canal de Anuncios Configurado`)
    .setDescription(`**Administrador:** <@${message.author.id}>\nEl canal de anuncios se ha establecido en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.success || '✅'} Canal de Anuncios Configurado`)
    .setDescription(`Las notificaciones de inicio y fin de partida se enviarán ahora en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

async function setLogChannel(message, args, { hasPermission, Setting, settings, EMBED_DEFAULTS, COLORS, sendLog, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send(`Uso: \`!setlogchannel #canal\` o \`!setlogchannel <ID del canal>\` (debe ser un canal de texto o anuncios).`);
  }

  await Setting.findByIdAndUpdate('logChannelId', { value: channel.id }, { upsert: true });
  settings.logChannelId = channel.id;
  EMBED_DEFAULTS.logChannelId = channel.id;

  // Enviar log al canal configurado
  try {
    const { EmbedBuilder } = require('discord.js');
    const logEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.maintenance || '⚙️'} Canal de Logs Configurado`)
      .setDescription(`**Administrador:** <@${message.author.id}>\nEl canal de logs se ha establecido en ${channel}.`)
      .setColor(COLORS.PRIMARY)
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'settings');
  } catch (e) { console.warn('[Logs] No se pudo enviar log de cambio de canal de logs:', e); }

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.success || '✅'} Canal de Logs Configurado`)
    .setDescription(`Todos los logs de acciones administrativas se enviarán ahora en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] });
}

async function setEmojiCommand(message, args, { hasPermission, config, COLORS, sendLog }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);
  
  if (args.length < 2) {
    return message.channel.send(`Uso: \`!setemoji <nombre> <emoji>\`\nEjemplo: \`!setemoji success <a:check:123456789>\``);
  }

  const emojiName = args[0].toLowerCase();
  const emojiValue = args[1];

  if (!config.emojis) config.emojis = {};
  
  if (config.emojis[emojiName] === undefined) {
    const validNames = Object.keys(config.emojis).join(', ');
    return message.channel.send(`${EMOJIS.error || '❌'} Nombre de emoji inválido. Nombres válidos: \`${validNames}\``);
  }

  const oldEmoji = config.emojis[emojiName];
  config.emojis[emojiName] = emojiValue;

  // Guardar en config.json
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(process.cwd(), 'config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Error saving config.json:', e);
    return message.channel.send(`${EMOJIS.error || '❌'} Error al guardar la configuración en el archivo.`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJIS.success || '✅'} Emoji Actualizado`)
    .setDescription(`Se ha actualizado el emoji **${emojiName}**.\n**Antes:** ${oldEmoji}\n**Ahora:** ${emojiValue}`)
    .setColor(COLORS.SUCCESS)
    .setTimestamp();
  
  return message.channel.send({ embeds: [embed] });
}

async function emojiPanelCommand(message, args, { hasPermission, config, COLORS }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);

  if (!config.emojis) return message.channel.send(`${EMOJIS.error || '❌'} No hay emojis configurados.`);

  const description = Object.entries(config.emojis)
    .map(([name, value]) => `• **${name}:** ${value} (\`${value}\`)`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJIS.maintenance || '🎨'} Panel de Emojis del Bot`)
    .setDescription(`Usa \`!setemoji <nombre> <emoji>\` para cambiar cualquiera de estos.\n\n${description}`)
    .setColor(COLORS.PRIMARY)
    .setFooter({ text: 'Configuración Global de Emojis' })
    .setTimestamp();

  return message.channel.send({ embeds: [embed] });
}

async function darPermisoCommand(message, args, { hasPermission, Player, COLORS, EMOJIS }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');

  const emojis = EMOJIS || { success: '✅', error: '❌', info: 'ℹ️' };

  if (args.length < 2) {
    return message.channel.send(`${emojis.info} Uso: \`!darpermiso <@usuario> <@rol>\`\nLe da al usuario permiso ILIMITADO para otorgar ese rol a quien quiera.`);
  }

  const target = message.mentions.users.first() || await message.client.users.fetch(args[0]).catch(() => null);
  const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);

  if (!target || !role) {
    return message.channel.send(`${emojis.error} Debes mencionar al usuario y al rol.`);
  }

  try {
    let player = await Player.findOne({ _id: target.id });
    if (!player) player = new Player({ _id: target.id });
    
    if (!player.customDonationRights) player.customDonationRights = new Map();
    
    // Usamos -1 para indicar que es ilimitado
    player.customDonationRights.set(role.id, -1);
    
    await player.save();

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.success} Permiso Ilimitado Otorgado`)
      .setDescription(`Ahora <@${target.id}> puede dar el rol <@&${role.id}> a **cualquier usuario** usando \`!darrol\`.`)
      .addFields({ name: 'Tipo de Permiso:', value: `**Ilimitado** (Sin límite de cargos)` })
      .setColor(COLORS.SUCCESS)
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[DarPermiso] Error:', error);
    return message.channel.send(`${emojis.error} Error al otorgar el permiso.`);
  }
}

async function darRolCommand(message, args, { Player, COLORS, EMOJIS, sendLog }) {
  const emojis = EMOJIS || { success: '✅', error: '❌', info: 'ℹ️' };

  try {
    const player = await Player.findOne({ _id: message.author.id });
    
    // Si no tiene ningún permiso configurado en su cuenta
    if (!player || !player.customDonationRights || player.customDonationRights.size === 0) {
      return message.reply(`${emojis.error} No tienes permiso para regalar ningún rol. Solicítalo al staff.`);
    }

    const mentionedMembers = message.mentions.members;
    const roleToGive = message.mentions.roles.first();

    if (mentionedMembers.size === 0 || !roleToGive) {
      return message.reply(`${emojis.info} Uso: \`!darrol @usuario1 @usuario2 @rol\`\nDebes mencionar a los amigos y el rol que quieres dar.`);
    }

    const charges = player.customDonationRights.get(roleToGive.id);

    // Si tiene permisos para otros roles pero NO para este específico
    if (charges === undefined || charges === null) {
      return message.reply(`${emojis.error} No tienes permiso para regalar el rol <@&${roleToGive.id}>. Solo puedes regalar los roles que el staff te haya asignado.`);
    }

    if (charges !== -1 && charges < mentionedMembers.size) {
      return message.reply(`${emojis.error} No tienes suficientes cargos de <@&${roleToGive.id}>. Tienes **${charges}** disponibles.`);
    }

    if (roleToGive.position >= message.guild.members.me.roles.highest.position) {
      return message.reply(`${emojis.error} No puedo dar el rol <@&${roleToGive.id}> porque es superior al mío.`);
    }

    const successMembers = [];
    const failMembers = [];

    for (const [id, member] of mentionedMembers) {
      try {
        await member.roles.add(roleToGive.id);
        successMembers.push(`<@${id}>`);
      } catch (e) {
        failMembers.push(`<@${id}>`);
      }
    }

    // Solo descontar si NO es ilimitado (-1)
    if (charges !== -1) {
      player.customDonationRights.set(roleToGive.id, charges - successMembers.length);
      await player.save();
    }

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.success} Entrega Completada`)
      .setDescription(`Has entregado el rol <@&${roleToGive.id}> a:\n${successMembers.join(', ')}`)
      .setColor(COLORS.SUCCESS)
      .setFooter({ text: charges === -1 ? 'Permiso Ilimitado' : `Te quedan ${charges - successMembers.length} cargos.` })
      .setTimestamp();

    if (failMembers.length > 0) {
      embed.addFields({ name: '❌ No se pudo dar a:', value: failMembers.join(', ') });
    }

    if (sendLog && successMembers.length > 0) {
      const logEmbed = new EmbedBuilder()
        .setTitle('👑 Entrega de Roles (Permiso Ilimitado)')
        .setDescription(`**De:** <@${message.author.id}>\n**Para:** ${successMembers.join(', ')}\n**Rol:** <@&${roleToGive.id}>`)
        .setColor(COLORS.INFO || 0x3498db)
        .setTimestamp();
      sendLog(message.guild, logEmbed, 'vips');
    }

    return message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DarRol] Error:', error);
    return message.reply(`${emojis.error} Error al procesar la entrega.`);
  }
}

module.exports = { setHistoryChannel, setAnnouncementsChannel, setLogChannel, setEmojiCommand, emojiPanelCommand, darPermisoCommand, darRolCommand };

// ====== NUEVOS: Setters específicos por categoría de logs ======

async function genericSetLogCategory(message, args, deps, { settingKey, humanName, categoryKey }) {
  const { hasPermission, Setting, settings, COLORS, sendLog } = deps;
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  
  let channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  
  // Si no se encontró por mención o ID, intentar buscar por nombre
  if (!channel && args[0]) {
    const channelName = args[0].replace(/^#+/, '').toLowerCase(); // Remover # si existe
    channel = message.guild.channels.cache.find(ch => ch.name.toLowerCase() === channelName);
  }
  
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send(`Uso: \
\`${message.content.split(' ')[0]} #canal\` o \
\`${message.content.split(' ')[0]} <ID del canal>\` o \
\`${message.content.split(' ')[0]} nombre-del-canal\` (debe ser un canal de texto o anuncios).`).catch(() => {});
  }

  await Setting.findByIdAndUpdate(settingKey, { value: channel.id }, { upsert: true });
  settings[settingKey] = channel.id;

  const logEmbed = new EmbedBuilder()
    .setTitle(`⚙️ Canal de Logs (${humanName}) Configurado`)
    .setDescription(`**Administrador:** <@${message.author.id}>\nEl canal para **${humanName}** se ha establecido en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  // Intentar enviar el log a la categoría específica recién configurada
  sendLog(message.guild, logEmbed, [], categoryKey);

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`✅ Canal de Logs (${humanName}) Configurado`)
    .setDescription(`Los logs de **${humanName}** se enviarán ahora en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

async function setLogPointsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelPointsId', humanName: 'Puntos', categoryKey: 'points' });
}
async function setLogCoinsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelCoinsId', humanName: 'Coins', categoryKey: 'coins' });
}
async function setLogWarningsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelWarningsId', humanName: 'Advertencias', categoryKey: 'warnings' });
}
async function setLogMatchesChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelMatchesId', humanName: 'Partidas', categoryKey: 'matches' });
}
async function setLogQueuesChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelQueuesId', humanName: 'Filas/Queues', categoryKey: 'queues' });
}
async function setLogAutoroleChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelAutoroleId', humanName: 'Autorole', categoryKey: 'autorole' });
}
async function setLogErrorsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelErrorsId', humanName: 'Errores', categoryKey: 'errors' });
}
async function setLogStatsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelStatsId', humanName: 'Estadísticas', categoryKey: 'stats' });
}
async function setLogShopChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelShopId', humanName: 'Tienda', categoryKey: 'shop' });
}
async function setLogRouletteChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelRouletteId', humanName: 'Ruleta', categoryKey: 'roulette' });
}

async function setLogPenalty10kChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelPenalty10kId', humanName: 'Penalización 10k', categoryKey: 'penalty10k' });
}

async function setLogVoiceTempChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelVoiceTempId', humanName: 'Canales de Voz Temporales', categoryKey: 'voiceTemp' });
}

async function setLogRaidChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelRaidId', humanName: 'Anti-Raid', categoryKey: 'raid' });
}

async function setLogTerminosChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelTerminosId', humanName: 'Términos', categoryKey: 'terminos' });
}

async function setLogVipsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelVipsId', humanName: 'VIPs', categoryKey: 'vips' });
}

async function setLogBetsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelBetsId', humanName: 'Espectadores', categoryKey: 'bets' });
}

async function setLogSpinsChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelSpinsId', humanName: 'Giros', categoryKey: 'spins' });
}

async function setLogResetChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelResetId', humanName: 'Resets', categoryKey: 'reset' });
}

async function setLogExclusivoChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelExclusivoId', humanName: 'Exclusivo', categoryKey: 'exclusivo' });
}

async function setLogRolesCallChannel(message, args, deps) {
  return genericSetLogCategory(message, args, deps, { settingKey: 'logChannelRolesCallId', humanName: 'Recompensas de Voz', categoryKey: 'rolesCall' });
}

async function setRankCallChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog, config }) {
  const EMOJIS = config?.emojis || {};
  if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send(`Uso: \`!setrankcallchannel #canal\` o \`!setrankcallchannel <ID del canal>\` (debe ser un canal de texto).`).catch(() => {});
  }

  await Setting.findByIdAndUpdate('rankCallChannelId', { value: channel.id }, { upsert: true });
  settings.rankCallChannelId = channel.id;

  const logEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.maintenance || '⚙️'} Canal de Rank Call Configurado`)
    .setDescription(`**Administrador:** <@${message.author.id}>\nEl canal de rank call se ha establecido en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${EMOJIS.success || '✅'} Canal de Rank Call Configurado`)
    .setDescription(`El ranking de tiempo de voz se actualizará cada 30 minutos en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}


module.exports.setLogPointsChannel = setLogPointsChannel;
module.exports.setLogCoinsChannel = setLogCoinsChannel;
module.exports.setLogWarningsChannel = setLogWarningsChannel;
module.exports.setLogMatchesChannel = setLogMatchesChannel;
module.exports.setLogQueuesChannel = setLogQueuesChannel;
module.exports.setLogAutoroleChannel = setLogAutoroleChannel;
module.exports.setLogErrorsChannel = setLogErrorsChannel;
module.exports.setLogStatsChannel = setLogStatsChannel;
module.exports.setLogShopChannel = setLogShopChannel;
module.exports.setLogRouletteChannel = setLogRouletteChannel;
module.exports.setLogPenalty10kChannel = setLogPenalty10kChannel;
module.exports.setLogBetsChannel = setLogBetsChannel;
module.exports.setLogSpinsChannel = setLogSpinsChannel;
module.exports.setLogResetChannel = setLogResetChannel;
module.exports.setLogVoiceTempChannel = setLogVoiceTempChannel;
module.exports.setLogRaidChannel = setLogRaidChannel;
module.exports.setLogTerminosChannel = setLogTerminosChannel;
module.exports.setLogVipsChannel = setLogVipsChannel;
module.exports.setLogExclusivoChannel = setLogExclusivoChannel;
module.exports.setLogRolesCallChannel = setLogRolesCallChannel;
module.exports.setRankCallChannel = setRankCallChannel;


async function setDailySummaryChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  const { ChannelType } = require('discord.js');
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send('Uso: `!canalderankdiario #canal` o `!canalderankdiario <ID del canal>` (debe ser un canal de texto).').catch(() => {});
  }

  await Setting.findByIdAndUpdate('dailySummaryChannelId', { value: channel.id }, { upsert: true });
  settings.dailySummaryChannelId = channel.id;

  const logEmbed = new EmbedBuilder()
    .setTitle('⚙️ Canal de Resumen Diario Configurado')
    .setDescription(`**Administrador:** <@${message.author.id}>
El resumen diario automático a las 5:00 AM (hora Colombia) se enviará en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✅ Canal de Resumen Diario Configurado')
    .setDescription(`A las 5:00 AM (hora Colombia) se publicará el ranking diario en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

module.exports.setDailySummaryChannel = setDailySummaryChannel;

// Configurar canal para ranking diario de Style Coins
async function setDailyCoinsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  const { ChannelType } = require('discord.js');
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send('Uso: `!canalderankcoins #canal` o `!canalderankcoins <ID del canal>` (debe ser un canal de texto).').catch(() => {});
  }

  await Setting.findByIdAndUpdate('dailyCoinsChannelId', { value: channel.id }, { upsert: true });
  settings.dailyCoinsChannelId = channel.id;

  const logEmbed = new EmbedBuilder()
    .setTitle('⚙️ Canal de Ranking de Style Coins Configurado')
    .setDescription(`**Administrador:** <@${message.author.id}>
El ranking diario de Style Coins se enviará en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✅ Canal de Ranking de Style Coins Configurado')
    .setDescription(`A las 5:00 AM (hora Colombia) se publicará el Top de Style Coins en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

module.exports.setDailyCoinsChannel = setDailyCoinsChannel;

// Configurar canal para recompensas diarias (Style Coins por actividad)
async function setDailyRewardChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  const { ChannelType } = require('discord.js');
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send('Uso: `!canalderecompensas #canal` o `!canalderecompensas <ID del canal>` (debe ser un canal de texto).').catch(() => {});
  }

  await Setting.findByIdAndUpdate('dailyRewardChannelId', { value: channel.id }, { upsert: true });
  settings.dailyRewardChannelId = channel.id;

  const { EmbedBuilder } = require('discord.js');
  const logEmbed = new EmbedBuilder()
    .setTitle('⚙️ Canal de Recompensas Diarias Configurado')
    .setDescription(`**Administrador:** <@${message.author.id}>
Las recompensas diarias (Style Coins por actividad) se enviarán en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✅ Canal de Recompensas Diarias Configurado')
    .setDescription(`A las 5:00 AM (hora Colombia) se publicarán las recompensas diarias en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

module.exports.setDailyRewardChannel = setDailyRewardChannel;

// Configurar canal para el Panel de Campeones diario
async function setChampionsDailyChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  const { ChannelType } = require('discord.js');
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send('Uso: `!canalpanelcampeones #canal` o `!canalpanelcampeones <ID del canal>` (debe ser un canal de texto).').catch(() => {});
  }

  await Setting.findByIdAndUpdate('championsDailyChannelId', { value: channel.id }, { upsert: true });
  settings.championsDailyChannelId = channel.id;

  const logEmbed = new EmbedBuilder()
    .setTitle('⚙️ Canal del Panel de Campeones Configurado')
    .setDescription(`**Administrador:** <@${message.author.id}>
El panel de campeones diario se enviará en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✅ Canal del Panel de Campeones Configurado')
    .setDescription(`A las 5:00 AM (hora Colombia) se publicará el panel de campeones en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

module.exports.setChampionsDailyChannel = setChampionsDailyChannel;

// Configurar canal para notificaciones de TikTok
async function setTikTokChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog }) {
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || await message.guild.channels.fetch(args[0]).catch(() => null);
  const { ChannelType } = require('discord.js');
  if (!channel || (typeof channel.isTextBased === 'function' ? !channel.isTextBased() : channel.type !== ChannelType.GuildText)) {
    return message.channel.send('Uso: `!settiktokchannel #canal` o `!settiktokchannel <ID del canal>` (debe ser un canal de texto).').catch(() => {});
  }

  await Setting.findByIdAndUpdate('tiktokChannelId', { value: channel.id }, { upsert: true });
  settings.tiktokChannelId = channel.id;

  const { EmbedBuilder } = require('discord.js');
  const logEmbed = new EmbedBuilder()
    .setTitle('⚙️ Canal de TikTok Configurado')
    .setDescription(`**Administrador:** <@${message.author.id}>
Las notificaciones de TikTok Live se enviarán en ${channel}.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  const successEmbed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✅ Canal de TikTok Configurado')
    .setDescription(`Las notificaciones de TikTok Live se enviarán ahora en ${channel}.`);
  return message.channel.send({ embeds: [successEmbed] }).catch(() => {});
}

module.exports.setTikTokChannel = setTikTokChannel;
