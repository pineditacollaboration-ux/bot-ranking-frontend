const { EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config.json');

function extractUserIds(message, args) {
  const ids = new Set();

  // From mentions
  message.mentions.users.forEach(user => ids.add(user.id));

  // From args (raw IDs)
  args.forEach(arg => {
    // Remove mention syntax if present in args (e.g. <@123>) to get clean ID
    const clean = arg.replace(/[^0-9]/g, '');
    // Basic ID validation (Snowflakes are usually 17-19 chars)
    if (clean.length >= 17) ids.add(clean);
  });

  return Array.from(ids);
}

async function exemptMove(message, args, ctx) {
  const { hasPermission, excludedFromVoiceMove, Excluded, COLORS, sendLog } = ctx;
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send("🚫 Solo el staff puede usar este comando.");

  const userIds = extractUserIds(message, args);
  if (userIds.length === 0) return message.channel.send("Uso: `!exemptmove @usuario1 @usuario2 ...` o `!exemptmove ID1 ID2 ...`");

  const added = [];
  for (const id of userIds) {
    if (!excludedFromVoiceMove.has(id)) {
      excludedFromVoiceMove.add(id);
      added.push(id);
    }
  }

  if (added.length === 0) {
    return message.channel.send("⚠️ Todos los usuarios mencionados ya estaban exentos.");
  }

  await Excluded.findByIdAndUpdate('main', { excludedFromVoiceMove: Array.from(excludedFromVoiceMove) }, { upsert: true });

  const mentionsStr = added.map(id => `<@${id}>`).join(', ');

  const logEmbed = new EmbedBuilder()
    .setTitle('🚫 Exención de Movimiento de Voz Añadida')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugadores:** ${mentionsStr}\nAhora están exentos de movimientos automáticos a canales de voz de partidas.`)
    .setColor(COLORS.WARNING)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  return message.channel.send(`✅ Usuarios ahora exentos: ${mentionsStr}`);
}

async function unexemptMove(message, args, ctx) {
  const { hasPermission, excludedFromVoiceMove, Excluded, COLORS, sendLog } = ctx;
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send("🚫 Solo el staff puede usar este comando.");

  const userIds = extractUserIds(message, args);
  if (userIds.length === 0) return message.channel.send("Uso: `!unexemptmove @usuario1 @usuario2 ...` o `!unexemptmove ID1 ID2 ...`");

  const removed = [];
  for (const id of userIds) {
    if (excludedFromVoiceMove.has(id)) {
      excludedFromVoiceMove.delete(id);
      removed.push(id);
    }
  }

  if (removed.length === 0) {
    return message.channel.send("⚠️ Ninguno de los usuarios mencionados estaba exento.");
  }

  await Excluded.findByIdAndUpdate('main', { excludedFromVoiceMove: Array.from(excludedFromVoiceMove) }, { upsert: true });

  const mentionsStr = removed.map(id => `<@${id}>`).join(', ');

  const logEmbed = new EmbedBuilder()
    .setTitle('✅ Exención de Movimiento de Voz Removida')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugadores:** ${mentionsStr}\nYa no están exentos de movimientos automáticos a canales de voz de partidas.`)
    .setColor(COLORS.SUCCESS)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  return message.channel.send(`✅ Usuarios removidos de exención: ${mentionsStr}`);
}

async function exemptMoveList(message, args, ctx) {
  const { Excluded, COLORS } = ctx;
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) {
    return message.channel.send('🚫 No tienes permiso para usar este comando.');
  }

  const excludedDoc = await Excluded.findById('main');
  const ids = Array.isArray(excludedDoc?.excludedFromVoiceMove) ? excludedDoc.excludedFromVoiceMove : [];

  if (ids.length === 0) {
    return message.channel.send('✅ No hay usuarios exentos de movimiento automático de voz.');
  }

  const description = ids.map(id => `• <@${id}>`).join('\n');
  const embed = new EmbedBuilder()
    .setTitle('🚫 Usuarios Exentos de Movimiento Automático de Voz')
    .setDescription(description)
    .setColor(COLORS.WARNING)
    .setTimestamp();

  return message.channel.send({ embeds: [embed] });
}

async function voiceTempCommand(message, args, ctx) {
  const { config, COLORS, sendLog, ActiveTempVoice } = ctx;
  const guild = message.guild;

  if (!guild) {
    return;
  }

  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) {
    return message.channel.send('🚫 Solo el staff puede crear canales de voz temporales.');
  }

  const targetUser = message.mentions.users.first();
  if (!targetUser) {
    return message.channel.send('Uso: `!voz tiempo @usuario 60m Nombre_del_canal` o `!voz tiempo @usuario 1d Nombre_del_canal`');
  }

  const categoryId = (config && config.tempVoiceCategoryId) ? String(config.tempVoiceCategoryId) : '1461883678878732379';
  const category = await guild.channels.fetch(categoryId).catch(() => null);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return message.channel.send('❌ No se encontró la categoría configurada para canales de voz temporales.');
  }

  let minutes = 0;
  let timeIndex = -1;
  let timeLabel = '';
  for (let i = 0; i < args.length; i++) {
    const token = String(args[i]).toLowerCase();
    const match = token.match(/^(\d+)([md])?$/);
    if (!match) continue;
    const value = parseInt(match[1], 10);
    if (!value || isNaN(value)) continue;
    const unit = match[2] || 'm';
    if (unit === 'm') {
      if (value < 10) {
        return message.channel.send('El tiempo mínimo en minutos es 10m. Ejemplo: `!voz tiempo @usuario 10m Nombre del canal`');
      }
      if (value > 60) {
        return message.channel.send('El máximo en minutos es 60m. Para más tiempo usa días, por ejemplo `10d`.');
      }
      minutes = value;
      timeLabel = `${value} minutos`;
    } else {
      minutes = value * 1440;
      timeLabel = value === 1 ? '1 día' : `${value} días`;
    }
    timeIndex = i;
    break;
  }

  if (timeIndex === -1) {
    return message.channel.send('Debes indicar el tiempo. Ejemplos: `60m` (minutos) o `10d` (días).');
  }

  const ownerId = targetUser.id;

  const baseNameParts = args.filter((arg, idx) => {
    if (idx === timeIndex) return false;
    if (arg.includes('<@')) return false;
    return true;
  });

  const baseName = baseNameParts.join(' ').trim();
  if (!baseName) {
    return message.channel.send('Debes indicar un nombre para el canal de voz. Ejemplo: `!voz tiempo @usuario 60m Nombre del canal`');
  }
  const channelName = baseName.slice(0, 90);

  const durationMs = minutes * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs);

  const voiceChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: category.id
  }).catch(() => null);

  if (!voiceChannel) {
    return message.channel.send('❌ No se pudo crear el canal de voz temporal.');
  }

  await voiceChannel.permissionOverwrites.edit(guild.roles.everyone, {
    ViewChannel: true,
    Connect: false
  }).catch(() => { });

  await voiceChannel.permissionOverwrites.edit(ownerId, {
    ViewChannel: true,
    Connect: true,
    Speak: true,
    MoveMembers: true,
    MuteMembers: true,
    ManageChannels: true,
    ManageRoles: true
  }).catch(() => { });

  if (ActiveTempVoice) {
    try {
      await ActiveTempVoice.findByIdAndUpdate(voiceChannel.id, {
        _id: voiceChannel.id,
        guildId: guild.id,
        ownerId,
        channelName,
        expiresAt,
      }, { upsert: true });
    } catch (_) { }
  }

  const embed = new EmbedBuilder()
    .setTitle('📢 Canal de Voz Temporal Creado')
    .setDescription(`Se creó el canal de voz ${voiceChannel} para <@${ownerId}> por **${timeLabel}**.`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });

  if (typeof sendLog === 'function') {
    try {
      const logEmbed = new EmbedBuilder()
        .setTitle('📓 Canal de Voz Temporal Creado')
        .setDescription(
          `**Staff:** <@${message.author.id}>\n` +
          `**Dueño del canal:** <@${ownerId}>\n` +
          `**Canal:** ${voiceChannel} \`(${voiceChannel.id})\`\n` +
          `**Tiempo:** ${timeLabel}\n` +
          `**Nombre:** ${channelName}`
        )
        .setColor(COLORS.PRIMARY)
        .setTimestamp();
      await sendLog(guild, logEmbed, [], 'voiceTemp');
    } catch (_) { }
  }

  const MAX_TIMEOUT_MS = 2147000000;
  const deleteAndCleanup = async () => {
    try {
      const ch = await guild.channels.fetch(voiceChannel.id).catch(() => null);
      if (ch) {
        await ch.delete('Canal de voz temporal expirado.').catch(() => { });
      }
    } finally {
      if (ActiveTempVoice) {
        await ActiveTempVoice.deleteOne({ _id: voiceChannel.id }).catch(() => { });
      }
    }
  };
  const scheduleDeletion = (remaining) => {
    if (remaining <= 0) {
      deleteAndCleanup().catch(() => { });
      return;
    }
    const chunk = Math.min(remaining, MAX_TIMEOUT_MS);
    setTimeout(() => {
      if (remaining <= chunk) {
        deleteAndCleanup().catch(() => { });
      } else {
        scheduleDeletion(remaining - chunk);
      }
    }, chunk);
  };

  scheduleDeletion(durationMs);
}

module.exports = { exemptMove, unexemptMove, exemptMoveList, voiceTempCommand };
