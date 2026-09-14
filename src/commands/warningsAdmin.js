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

async function addAdvertencia(message, args, ctx) {
  const { hasPermission, ensurePlayerRecord, COLORS, EMBED_DEFAULTS, parseDuration, sendLog } = ctx;
  if (!hasPermission(message.member)) return message.channel.send("🚫 Solo el staff puede usar este comando.");

  const role = message.mentions.roles.first();
  const targetIds = extractUserIds(message, args);
  
  if (!role || targetIds.length === 0) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Uso Incorrecto")
      .setDescription("Faltan argumentos o son inválidos.")
      .addFields(
        { name: "Uso Correcto", value: "`!addadvertencia @Rol @Jugador1 @Jugador2 ... [tiempo|permanente] <razón>`" },
        { name: "Ejemplo (Temporal)", value: "`!addadvertencia @Advertido @Jugador 7d Comportamiento tóxico`" },
        { name: "Ejemplo (Permanente)", value: "`!addadvertencia @Advertido @Jugador Comportamiento tóxico`" }
      )
      .setColor(COLORS.ERROR || '#FF0000')
      .setFooter(EMBED_DEFAULTS.footer)
      .setTimestamp();
    return message.channel.send({ embeds: [errorEmbed] });
  }

  // Filtrar menciones de roles y usuarios (incluyendo IDs raw) para obtener tiempo y razón
  const mentionRegex = /^<@&?\!?\d+>$/;
  const remainingArgs = args.filter(arg => {
    if (mentionRegex.test(arg)) return false; // Remove mentions
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17 && targetIds.includes(clean)) return false; // Remove raw IDs that are targets
    return true;
  });

  // Detectar si el primer argumento restante es un tiempo
  const potentialTime = remainingArgs[0];
  let tiempo = null;
  let isPermanent = true;
  let reasonStartIndex = 0;

  if (potentialTime) {
      const parsed = parseDuration(potentialTime);
      const explicitPermanent = ['perm', 'perma', 'permanente'].includes(potentialTime.toLowerCase());
      
      if (parsed > 0) {
          tiempo = potentialTime;
          isPermanent = false;
          reasonStartIndex = 1;
      } else if (explicitPermanent) {
          isPermanent = true;
          reasonStartIndex = 1;
      }
  }

  const duration = isPermanent ? null : parseDuration(tiempo);
  const reason = remainingArgs.slice(reasonStartIndex).join(' ');

  if (!reason) {
      return message.channel.send("⚠️ Debes especificar una razón obligatoria para la advertencia.");
  }

  const affectedUserIds = targetIds;
  const results = [];

  for (const userId of affectedUserIds) {
    const player = await ensurePlayerRecord(userId);
    const prevWarnings = player.warnings || 0;
    
    player.warnings = prevWarnings + 1;
    const expiresAt = isPermanent ? null : new Date(Date.now() + duration);
    if (!player.activeWarnings) player.activeWarnings = [];
    player.activeWarnings.push({ 
      roleId: role.id, 
      expiresAt, 
      permanent: isPermanent, 
      reason: reason,
      moderator: message.author.id
    });
    await player.save();

    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.roles.add(role).catch(() => {});
    }

    results.push({ id: userId, warnings: player.warnings });

    if (!isPermanent) {
      const MAX_TIMEOUT = 0x7fffffff; // 2147483647 ms
      if (duration > 0 && duration <= MAX_TIMEOUT) {
        setTimeout(async () => {
          // La limpieza final la gestiona removeTemporaryRole/cron basándose en expiresAt
        }, duration);
      } else {
        console.warn(`[WarningsAdmin] Duración ${duration}ms excede setTimeout máximo para ${userId}.`);
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Advertencias Añadidas")
    .setDescription(isPermanent
      ? `Se asignó el rol <@&${role.id}> de forma **permanente** a ${affectedUserIds.length} jugador(es).`
      : `Se asignó el rol <@&${role.id}> por **${tiempo}** a ${affectedUserIds.length} jugador(es).`)
    .addFields(
      { name: "Razón", value: reason, inline: false },
      { name: "Moderador", value: `<@${message.author.id}>`, inline: true },
      { name: "Jugadores", value: results.map(r => `<@${r.id}> (Total: ${r.warnings})`).join('\n'), inline: false }
    )
    .setColor(COLORS.WARNING)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
  sendLog(message.guild, embed, [], 'warnings');
}

async function removeAdvertencia(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, COLORS, EMBED_DEFAULTS, sendLog } = ctx;
  if (!hasPermission(message.member)) return message.channel.send("🚫 Solo el staff puede usar este comando.");

  const mentions = message.mentions.users;
  if (mentions.size === 0) {
    return message.channel.send("Uso: `!removeadvertencia @Jugador1 @Jugador2 ...`");
  }

  const affectedUserIds = Array.from(mentions.keys());
  const results = [];

  for (const userId of affectedUserIds) {
    const player = await ensurePlayerRecord(userId);
    const activeWarnings = player.activeWarnings || [];
    if (activeWarnings.length === 0) continue;

    const removedRoles = [];
    const member = await message.guild.members.fetch(userId).catch(() => null);
    
    for (const warning of activeWarnings) {
      if (member?.roles.cache.has(warning.roleId)) {
        await member.roles.remove(warning.roleId).catch(e => console.warn(`No se pudo remover el rol de advertencia ${warning.roleId} de ${userId}:`, e.message));
        removedRoles.push(`<@&${warning.roleId}>`);
      }
    }
    
    player.activeWarnings = [];
    await player.save();
    
    results.push({ id: userId, roles: removedRoles });
  }

  if (results.length === 0) {
    return message.channel.send("⚠️ Ninguno de los jugadores mencionados tenía advertencias activas.");
  }

  const embed = new EmbedBuilder()
    .setTitle("✅ Advertencias Removidas")
    .setDescription(`Se han eliminado las advertencias activas de ${results.length} jugador(es).`)
    .addFields(
      { name: "Detalles", value: results.map(r => `<@${r.id}>: ${r.roles.length ? r.roles.join(", ") : "Sin roles activos"}`).join('\n'), inline: false },
      { name: "Moderador", value: `<@${message.author.id}>`, inline: true }
    )
    .setColor(COLORS.SUCCESS)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();
  
  await message.channel.send({ embeds: [embed] });
  sendLog(message.guild, embed, [], 'warnings');
}

module.exports = { addAdvertencia, removeAdvertencia };
