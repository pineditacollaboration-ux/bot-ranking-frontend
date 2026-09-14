const { AuditLogEvent } = require('discord.js');

module.exports = async function onGuildMemberUpdate(oldMember, newMember, { sendLog, COLORS, EmbedBuilder, client }) {
  try {
    // Detectar cambios de roles
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    if (oldRoles.size === newRoles.size && oldRoles.every(r => newRoles.has(r.id))) {
      return; // No hubo cambios de roles (quizás cambio de nick, avatar, etc.)
    }

    const addedRoles = newRoles.filter(r => !oldRoles.has(r.id));
    const removedRoles = oldRoles.filter(r => !newRoles.has(r.id));

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    // Intentar obtener quién hizo el cambio mediante Audit Logs
    // Nota: Esto puede no ser 100% preciso si hay muchos cambios simultáneos, pero es lo mejor que ofrece la API.
    let executor = null;
    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberRoleUpdate,
      });
      const entry = auditLogs.entries.first();
      
      // Verificar si la entrada del log corresponde a este cambio (target id y reciente)
      if (entry && entry.target.id === newMember.id && (Date.now() - entry.createdTimestamp) < 5000) {
        executor = entry.executor;
      }
    } catch (e) {
      console.warn('[GuildMemberUpdate] No se pudo obtener Audit Logs:', e.message);
    }

    // Si el ejecutor es el propio bot, ignoramos para evitar logs duplicados
    // (ya que los comandos !addrol, !removerol y el sistema automático generan sus propios logs detallados)
    if (executor && executor.id === client.user.id) {
      return;
    }

    // Preparar logs para roles añadidos
    for (const [roleId, role] of addedRoles) {
      /*
      const logEmbed = new EmbedBuilder()
        .setTitle('🎭 Rol Añadido (Manual/Externo)')
        .setDescription(`**Jugador:** <@${newMember.id}>\n**Rol:** <@&${roleId}>\n**Ejecutado por:** ${executor ? `<@${executor.id}>` : 'Desconocido (Posiblemente integración o sin acceso a logs)'}`)
        .setColor(COLORS.PRIMARY)
        .setTimestamp();
      
      await sendLog(newMember.guild, logEmbed, [], 'autorole');
      */
    }

    // Preparar logs para roles removidos
    for (const [roleId, role] of removedRoles) {
      /*
      const logEmbed = new EmbedBuilder()
        .setTitle('🎭 Rol Removido (Manual/Externo)')
        .setDescription(`**Jugador:** <@${newMember.id}>\n**Rol:** <@&${roleId}>\n**Ejecutado por:** ${executor ? `<@${executor.id}>` : 'Desconocido (Posiblemente integración o sin acceso a logs)'}`)
        .setColor(COLORS.WARNING)
        .setTimestamp();
      
      await sendLog(newMember.guild, logEmbed, [], 'autorole');
      */
    }

  } catch (error) {
    console.error('Error en onGuildMemberUpdate:', error);
  }
};
