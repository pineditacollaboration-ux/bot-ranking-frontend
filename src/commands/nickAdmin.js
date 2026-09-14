const { EmbedBuilder } = require('discord.js');
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

async function exemptNick(message, args, ctx) {
  const { hasPermission, client, excludedFromNickUpdate, Excluded, ensurePlayerRecord, COLORS, sendLog } = ctx;
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send("🚫 Solo el staff puede usar este comando.");

  const userIds = extractUserIds(message, args);
  if (userIds.length === 0) return message.channel.send("Uso: `!exemptnick @usuario1 @usuario2 ...` o `!exemptnick ID1 ID2 ...`");

  const added = [];
  for (const userId of userIds) {
    if (!excludedFromNickUpdate.has(userId)) {
      excludedFromNickUpdate.add(userId);
      added.push(userId);
    }
  }

  if (added.length === 0) {
    return message.channel.send("⚠️ Todos los usuarios mencionados ya estaban exentos.");
  }

  await Excluded.findByIdAndUpdate('main', { excluded: Array.from(excludedFromNickUpdate) }, { upsert: true });

  const mentionsStr = added.map(id => `<@${id}>`).join(', ');

  const logEmbed = new EmbedBuilder()
    .setTitle('🚫 Exención de Nickname Añadida')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugadores:** ${mentionsStr}\nAhora están exentos de cambios automáticos de nickname.`)
    .setColor(COLORS.WARNING)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  return message.channel.send(`✅ Usuarios ahora exentos de cambios automáticos de nickname: ${mentionsStr}`);
}

async function unexemptNick(message, args, ctx) {
  const { hasPermission, client, excludedFromNickUpdate, Excluded, ensurePlayerRecord, COLORS, sendLog } = ctx;
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send("🚫 Solo el staff puede usar este comando.");

  const userIds = extractUserIds(message, args);
  if (userIds.length === 0) return message.channel.send("Uso: `!unexemptnick @usuario1 @usuario2 ...` o `!unexemptnick ID1 ID2 ...`");

  const removed = [];
  for (const userId of userIds) {
    if (excludedFromNickUpdate.has(userId)) {
      excludedFromNickUpdate.delete(userId);
      removed.push(userId);

      // Actualizar registro del jugador
      const player = await ensurePlayerRecord(userId);
      if (player) {
        player.noAutoNick = false;
        await player.save();
      }
    }
  }

  if (removed.length === 0) {
    return message.channel.send("⚠️ Ninguno de los usuarios mencionados estaba exento.");
  }

  await Excluded.findByIdAndUpdate('main', { excluded: Array.from(excludedFromNickUpdate) }, { upsert: true });

  const mentionsStr = removed.map(id => `<@${id}>`).join(', ');

  const logEmbed = new EmbedBuilder()
    .setTitle('✅ Exención de Nickname Removida')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugadores:** ${mentionsStr}\nYa no están exentos de cambios automáticos de nickname.`)
    .setColor(COLORS.SUCCESS)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'settings');

  return message.channel.send(`✅ Usuarios removidos de exención (nickname): ${mentionsStr}`).catch(() => { });
}

// Nuevo: listar usuarios exentos, restringido a dos IDs concretos
async function exemptList(message, args, ctx) {
  const { Excluded, COLORS, hasPermission } = ctx;
  // Permitir a cualquier staff usar este comando
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
  const ids = Array.isArray(excludedDoc?.excluded) ? excludedDoc.excluded : [];

  if (ids.length === 0) {
    return message.channel.send('✅ No hay usuarios exentos de cambio de nick.');
  }

  const description = ids.map(id => `• <@${id}>`).join('\n');
  const embed = new EmbedBuilder()
    .setTitle('🚫 Usuarios Exentos de Cambio de Nickname')
    .setDescription(description)
    .setColor(COLORS.WARNING)
    .setTimestamp();

  return message.channel.send({ embeds: [embed] });
}

module.exports = { exemptNick, unexemptNick, exemptList };
