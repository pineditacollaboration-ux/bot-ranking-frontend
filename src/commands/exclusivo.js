const { EmbedBuilder } = require('discord.js');

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

// Roles autorizados para gestionar exclusividad
const AUTHORIZED_ROLES = [
  '1484375566382792742',
  '1489717134878707713',
  '1489743084274323487',
  '1489717079098654720',
  '1489755784484229222',
  '1489729736925249717'
];

async function exclusivo(message, args, ctx) {
  const { excludedFromNickUpdate, excludedFromVoiceMove, excludedFromQueueRestriction, Excluded, COLORS, sendLog } = ctx;

  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send("🚫 Solo el staff autorizado puede usar este comando.");

  const userIds = extractUserIds(message, args);
  if (userIds.length === 0) return message.channel.send("Uso: `!exclusivo @usuario ...`");

  const added = [];
  for (const userId of userIds) {
    let changed = false;
    if (!excludedFromNickUpdate.has(userId)) { excludedFromNickUpdate.add(userId); changed = true; }
    if (!excludedFromVoiceMove.has(userId)) { excludedFromVoiceMove.add(userId); changed = true; }
    // Ensure the set exists before checking (it should, but safety first)
    if (excludedFromQueueRestriction && !excludedFromQueueRestriction.has(userId)) { excludedFromQueueRestriction.add(userId); changed = true; }

    if (changed) added.push(userId);
  }

  if (added.length === 0) {
    return message.channel.send("⚠️ Todos los usuarios mencionados ya tenían privilegios exclusivos.");
  }

  // Update DB
  await Excluded.findByIdAndUpdate('main', {
    excluded: Array.from(excludedFromNickUpdate),
    excludedFromVoiceMove: Array.from(excludedFromVoiceMove),
    excludedFromQueueRestriction: excludedFromQueueRestriction ? Array.from(excludedFromQueueRestriction) : []
  }, { upsert: true });

  const mentionsStr = added.map(id => `<@${id}>`).join(', ');
  const logEmbed = new EmbedBuilder()
    .setTitle('🌟 Exclusividad Añadida')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugadores:** ${mentionsStr}\nAhora tienen inmunidad a:\n- Cambios de nombre\n- Movimientos de voz automáticos\n- Restricciones de fila (sala de espera)`)
    .setColor(COLORS.GOLD || '#FFD700')
    .setTimestamp();

  sendLog(message.guild, logEmbed, [], 'exclusivo');
  return message.channel.send(`✅ Usuarios ahora son **EXCLUSIVOS**: ${mentionsStr}`);
}

async function unexclusivo(message, args, ctx) {
  const { excludedFromNickUpdate, excludedFromVoiceMove, excludedFromQueueRestriction, Excluded, COLORS, sendLog } = ctx;

  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send("🚫 Solo el staff autorizado puede usar este comando.");

  const userIds = extractUserIds(message, args);
  if (userIds.length === 0) return message.channel.send("Uso: `!unexclusivo @usuario ...`");

  const removed = [];
  for (const userId of userIds) {
    let changed = false;
    if (excludedFromNickUpdate.has(userId)) { excludedFromNickUpdate.delete(userId); changed = true; }
    if (excludedFromVoiceMove.has(userId)) { excludedFromVoiceMove.delete(userId); changed = true; }
    if (excludedFromQueueRestriction && excludedFromQueueRestriction.has(userId)) { excludedFromQueueRestriction.delete(userId); changed = true; }

    if (changed) removed.push(userId);
  }

  if (removed.length === 0) {
    return message.channel.send("⚠️ Ninguno de los usuarios tenía privilegios exclusivos.");
  }

  await Excluded.findByIdAndUpdate('main', {
    excluded: Array.from(excludedFromNickUpdate),
    excludedFromVoiceMove: Array.from(excludedFromVoiceMove),
    excludedFromQueueRestriction: excludedFromQueueRestriction ? Array.from(excludedFromQueueRestriction) : []
  }, { upsert: true });

  const mentionsStr = removed.map(id => `<@${id}>`).join(', ');
  const logEmbed = new EmbedBuilder()
    .setTitle('🗑️ Exclusividad Removida')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugadores:** ${mentionsStr}\nYa no tienen inmunidad especial.`)
    .setColor(COLORS.ERROR)
    .setTimestamp();

  sendLog(message.guild, logEmbed, [], 'exclusivo');
  return message.channel.send(`✅ Exclusividad removida para: ${mentionsStr}`);
}

async function exclusivolist(message, args, ctx) {
  const { excludedFromQueueRestriction, COLORS } = ctx;

  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send("🚫 Solo el staff autorizado puede usar este comando.");

  // Usamos excludedFromQueueRestriction como fuente de verdad para "exclusivos"
  // ya que !exclusivo añade a los 3 sets, y este es el más específico.
  const exclusiveIds = excludedFromQueueRestriction ? Array.from(excludedFromQueueRestriction) : [];

  if (exclusiveIds.length === 0) {
    return message.channel.send("ℹ️ No hay usuarios en la lista de exclusivos.");
  }

  const mentionsList = exclusiveIds.map(id => `<@${id}>`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🌟 Lista de Usuarios Exclusivos')
    .setDescription(`Usuarios con inmunidad a:\n- Cambios de nombre\n- Movimientos de voz\n- Restricciones de fila\n\n${mentionsList}`)
    .setColor(COLORS.GOLD || '#FFD700')
    .setFooter({ text: `Total: ${exclusiveIds.length}` })
    .setTimestamp();

  return message.channel.send({ embeds: [embed] });
}

module.exports = { exclusivo, unexclusivo, exclusivolist };
