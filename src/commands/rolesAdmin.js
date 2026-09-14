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

/**
 * Añade un rol (opcionalmente temporal) a uno o varios usuarios.
 */
async function addRol(message, args, {
  hasPermission,
  client,
  ensurePlayerRecord,
  COLORS,
  parseDuration,
  sendLog,
  BOT_OWNER_ID,
  removeTemporaryRole,
}) {
  const configObj = require('../../config.json');
  const AUTHORIZED_ROLE_IDS = [
    ...(configObj?.manageRole || []),
    ...(configObj?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];

  const isBotOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
  const hasAuthorizedRole = AUTHORIZED_ROLE_IDS.some(roleId => message.member.roles?.cache?.has(roleId));

  if (!isBotOwner && !hasAuthorizedRole) {
    return message.channel.send('🚫 Solo los dueños del bot y usuarios autorizados pueden usar este comando.').catch(() => { });
  }

  const role = message.mentions.roles.first();
  let targetIds = extractUserIds(message, args);

  // Filtrar el ID del rol objetivo para evitar intentar asignárselo a sí mismo (como usuario)
  if (role) {
    targetIds = targetIds.filter(id => id !== role.id);
  }

  if (!role || targetIds.length === 0) {
    return message.channel.send("Uso: `!addrol @Rol @Jugador1 @Jugador2 ... [duración]` (ej: 7d, 12h, 30m). La duración es opcional.");
  }

  // Filtrar menciones para encontrar duración
  // Remove role mention and user mentions/IDs from args to find duration
  const mentionRegex = /^<@&?\!?\d+>$/;
  const remainingArgs = args.filter(arg => {
    // Is it a role mention?
    if (mentionRegex.test(arg)) return false;
    // Is it a user ID (roughly)?
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17 && targetIds.includes(clean)) return false;
    // Is it a user mention?
    if (arg.startsWith('<@') && arg.endsWith('>')) return false;
    return true;
  });

  const tiempo = remainingArgs[0]; // Asumimos que si hay algo más, es la duración
  const duration = tiempo ? parseDuration(tiempo) : null;

  if (tiempo && (!duration || duration < 1000)) {
    return message.channel.send("🚫 La duración proporcionada no es válida. Debe ser al menos de 1 segundo (ej: 1s, 5m, 2h, 3d).").catch(() => { });
  }

  // Validar jerarquía del staff
  const isGuildOwner = message.author.id === message.guild.ownerId;
  if (!isBotOwner && !isGuildOwner && message.member.roles.highest.position <= role.position) {
    return message.channel.send("🚫 No puedes asignar un rol que es igual o superior a tu rol más alto.");
  }

  // Validar jerarquía del bot
  if (message.guild.members.me.roles.highest.position <= role.position) {
    return message.channel.send("🚫 No puedo asignar ese rol porque está por encima de mi jerarquía.").catch(() => { });
  }

  const affectedUserIds = targetIds;
  const results = [];
  const errors = [];

  for (const userId of affectedUserIds) {
    const member = message.guild.members.cache.get(userId) || await message.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      errors.push(`<@${userId}> (No encontrado)`);
      continue;
    }

    if (member.roles.cache.has(role.id)) {
      errors.push(`<@${userId}> (Ya tiene el rol)`);
      continue;
    }

    let failed = false;
    await member.roles.add(role).catch((e) => {
      console.error("Error al asignar rol:", e);
      errors.push(`<@${userId}> (Error desconocido)`);
      failed = true;
    });

    if (failed) continue;

    // Rol temporal
    if (duration) {
      const player = await ensurePlayerRecord(userId);
      const expiresAt = new Date(Date.now() + duration);
      if (!player.temporaryRoles) player.temporaryRoles = [];
      player.temporaryRoles.push({ roleId: role.id, expiresAt });
      await player.save();

      const MAX_TIMEOUT = 0x7fffffff;
      if (duration > 0 && duration <= MAX_TIMEOUT) {
        setTimeout(() => removeTemporaryRole(userId, role.id), duration);
      } else {
        console.warn(`[RolesAdmin] Duración ${duration}ms excede setTimeout máximo para ${userId}.`);
      }
    }
    results.push(`<@${userId}>`);
  }

  const durationString = tiempo ? `por ${tiempo}` : 'permanentemente';
  
  if (results.length > 0 || errors.length > 0) {
    const embedResponse = new EmbedBuilder()
      .setTimestamp();

    if (results.length > 0) {
      embedResponse.setTitle('✅ Rol Añadido')
        .setColor(COLORS?.PRIMARY || '#00FF00')
        .setDescription(`**Por:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Duración:** ${durationString}\n**Usuario(s):**\n${results.join(', ').substring(0, 2000)}`);

      // Log
      const logEmbed = new EmbedBuilder()
        .setTitle('🎭 Rol Añadido')
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Duración:** ${tiempo ? tiempo : 'Permanente'}\n**Usuarios:**\n${results.join('\n').substring(0, 2000)}`)
        .setColor(COLORS?.PRIMARY || '#00FF00')
        .setTimestamp();
      await sendLog(message.guild, logEmbed, [], 'autorole');
    } else {
      embedResponse.setTitle('⚠️ Acción Fallida')
        .setColor('#FF0000')
        .setDescription(`**Por:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\nNo se pudo añadir el rol a los usuarios especificados.`);
    }

    if (errors.length > 0) {
      embedResponse.addFields({ name: '⚠️ Errores / Fallidos', value: errors.join(', ').substring(0, 1024) });
    }

    return message.channel.send({ embeds: [embedResponse] }).catch(() => { });
  }

  return message.channel.send("❌ No se pudo realizar ninguna acción.").catch(() => { });
}

/**
 * Remueve un rol de uno o varios usuarios.
 */
async function removeRol(message, args, {
  hasPermission,
  client,
  ensurePlayerRecord,
  COLORS,
  sendLog,
  BOT_OWNER_ID,
}) {
  const configObj = require('../../config.json');
  const AUTHORIZED_ROLE_IDS = [
    ...(configObj?.manageRole || []),
    ...(configObj?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];

  const isBotOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
  const hasAuthorizedRole = AUTHORIZED_ROLE_IDS.some(roleId => message.member.roles?.cache?.has(roleId));

  if (!isBotOwner && !hasAuthorizedRole) {
    return message.channel.send('🚫 Solo los dueños del bot y usuarios autorizados pueden usar este comando.').catch(() => { });
  }

  const role = message.mentions.roles.first();
  let targetIds = extractUserIds(message, args);

  // Filtrar el ID del rol objetivo
  if (role) {
    targetIds = targetIds.filter(id => id !== role.id);
  }

  if (!role || targetIds.length === 0) {
    return message.channel.send("Uso: `!removerol @Rol @Jugador1 @Jugador2 ...`");
  }

  // Validar jerarquía del staff
  const isGuildOwner = message.author.id === message.guild.ownerId;
  if (!isBotOwner && !isGuildOwner && message.member.roles.highest.position <= role.position) {
    return message.channel.send("🚫 No puedes remover un rol que es igual o superior a tu rol más alto.");
  }

  // Validar jerarquía del bot
  if (message.guild.members.me.roles.highest.position <= role.position) {
    return message.channel.send("🚫 No puedo remover ese rol porque está por encima de mi jerarquía.").catch(() => { });
  }

  const affectedUserIds = targetIds;
  const results = [];
  const errors = [];

  for (const userId of affectedUserIds) {
    const member = message.guild.members.cache.get(userId) || await message.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      errors.push(`<@${userId}> (No encontrado)`);
      continue;
    }

    if (!member.roles.cache.has(role.id)) {
      errors.push(`<@${userId}> (No tiene el rol)`);
      continue;
    }

    let failed = false;
    await member.roles.remove(role).catch((e) => {
      console.error("Error al remover rol:", e);
      errors.push(`<@${userId}> (Error desconocido)`);
      failed = true;
    });

    if (failed) continue;

    // Limpiar de roles temporales si existe
    const player = await ensurePlayerRecord(userId);
    if (player.temporaryRoles) {
      const initialLen = player.temporaryRoles.length;
      player.temporaryRoles = player.temporaryRoles.filter(r => r.roleId !== role.id);
      if (player.temporaryRoles.length !== initialLen) {
        await player.save();
      }
    }

    results.push(`<@${userId}>`);
  }

  if (results.length > 0 || errors.length > 0) {
    const embedResponse = new EmbedBuilder()
      .setTimestamp();

    if (results.length > 0) {
      embedResponse.setTitle('✅ Rol Removido')
        .setColor(COLORS?.ERROR || '#FF0000')
        .setDescription(`**Por:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Usuario(s):**\n${results.join(', ').substring(0, 2000)}`);

      // Log
      const logEmbed = new EmbedBuilder()
        .setTitle('🗑️ Rol Removido')
        .setDescription(`**Administrador:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Usuarios:**\n${results.join('\n').substring(0, 2000)}`)
        .setColor(COLORS?.ERROR || '#FF0000')
        .setTimestamp();
      await sendLog(message.guild, logEmbed, [], 'autorole');
    } else {
      embedResponse.setTitle('⚠️ Acción Fallida')
        .setColor('#FF0000')
        .setDescription(`**Por:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\nNo se pudo remover el rol de los usuarios especificados.`);
    }

    if (errors.length > 0) {
      embedResponse.addFields({ name: '⚠️ Errores / Fallidos', value: errors.join(', ').substring(0, 1024) });
    }

    return message.channel.send({ embeds: [embedResponse] }).catch(() => { });
  }

  return message.channel.send("❌ No se pudo realizar ninguna acción.").catch(() => { });
}

module.exports = { addRol, removeRol, addRolAll, removeRolAll };

async function addRolAll(message, args, {
  hasPermission,
  COLORS,
  sendLog,
  BOT_OWNER_ID,
}) {
  const isBotOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
  if (!isBotOwner) return message.channel.send('🚫 Solo el dueño del bot puede usar este comando por seguridad.').catch(() => { });

  const role = message.mentions.roles.first() || (args[0] ? (message.guild.roles.cache.get(args[0]) || await message.guild.roles.fetch(args[0]).catch(() => null)) : null);
  if (!role) return message.channel.send('Uso: `!addrolall @Rol`').catch(() => { });

  if (message.guild.members.me.roles.highest.position <= role.position) {
    return message.channel.send('🚫 No puedo asignar ese rol porque está por encima de mi jerarquía.').catch(() => { });
  }

  const loading = await message.channel.send(`⚙️ Asignando <@&${role.id}> a todos los miembros...`);

  const members = message.guild.members.cache.size > 0 ? message.guild.members.cache : await message.guild.members.fetch();
  let processed = 0;
  let assigned = 0;
  let skipped = 0;

  for (const member of members.values()) {
    if (!member || member.user.bot) { skipped++; continue; }
    if (member.roles.cache.has(role.id)) { skipped++; continue; }
    if (!member.manageable) { skipped++; continue; }
    try {
      await member.roles.add(role);
      assigned++;
    } catch (_) {
      skipped++;
    }
    processed++;
    if (processed % 20 === 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const embedResponse = new EmbedBuilder()
    .setTitle('✅ Rol Asignado a Todos')
    .setColor(COLORS?.PRIMARY || '#00FF00')
    .setDescription(`**Por:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Asignados:** ${assigned}\n**Omitidos:** ${skipped}`)
    .setTimestamp();

  await loading.edit({ content: null, embeds: [embedResponse] }).catch(() => { });

  await sendLog(message.guild, new EmbedBuilder()
    .setTitle('🎭 Rol Asignado a Todos')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Asignados:** ${assigned}\n**Omitidos:** ${skipped}`)
    .setColor(COLORS.PRIMARY)
    .setTimestamp(), [], 'autorole');
}

async function removeRolAll(message, args, {
  hasPermission,
  COLORS,
  sendLog,
  BOT_OWNER_ID,
}) {
  const isBotOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
  if (!isBotOwner) return message.channel.send('🚫 Solo el dueño del bot puede usar este comando.').catch(() => { });

  const role = message.mentions.roles.first() || (args[0] ? (message.guild.roles.cache.get(args[0]) || await message.guild.roles.fetch(args[0]).catch(() => null)) : null);
  if (!role) return message.channel.send('Uso: `!removerolall @Rol`').catch(() => { });

  if (message.guild.members.me.roles.highest.position <= role.position) {
    return message.channel.send('🚫 No puedo remover ese rol porque está por encima de mi jerarquía.').catch(() => { });
  }

  const loading = await message.channel.send(`⚙️ Removiendo <@&${role.id}> de todos los miembros...`);

  const members = message.guild.members.cache.size > 0 ? message.guild.members.cache : await message.guild.members.fetch();
  let processed = 0;
  let removed = 0;
  let skipped = 0;

  for (const member of members.values()) {
    if (!member || member.user.bot) { skipped++; continue; }
    if (!member.roles.cache.has(role.id)) { skipped++; continue; }
    if (!member.manageable) { skipped++; continue; }
    try {
      await member.roles.remove(role);
      removed++;
    } catch (_) {
      skipped++;
    }
    processed++;
    if (processed % 20 === 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const embedResponse = new EmbedBuilder()
    .setTitle('✅ Rol Removido de Todos')
    .setColor(COLORS?.WARNING || '#FFA500')
    .setDescription(`**Por:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Removidos:** ${removed}\n**Omitidos:** ${skipped}`)
    .setTimestamp();

  await loading.edit({ content: null, embeds: [embedResponse] }).catch(() => { });

  await sendLog(message.guild, new EmbedBuilder()
    .setTitle('🎭 Rol Removido de Todos')
    .setDescription(`**Administrador:** <@${message.author.id}>\n**Rol:** <@&${role.id}>\n**Removidos:** ${removed}\n**Omitidos:** ${skipped}`)
    .setColor(COLORS.WARNING)
    .setTimestamp(), [], 'autorole');
}

