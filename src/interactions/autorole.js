const { EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  /**
   * Maneja la selección del menú principal de autorol.
   * - Para rol permanente (spider): evita reasignar si ya lo tiene.
   * - Para roles temporales: si ya lo tiene activo, informa tiempo restante; si no, asigna y agenda remoción.
   * @param {import('discord.js').StringSelectMenuInteraction} interaction
   * @param {{ Player: any, ensurePlayerRecord: Function, safeReplyEphemeral: Function, removeTemporaryRole: Function }} deps
   */
  handleAutoroleSelection: async function (interaction, deps) {
    const { Player, ensurePlayerRecord, safeReplyEphemeral, removeTemporaryRole, sendLog, EmbedBuilder: EBOverride, COLORS } = deps;
    try {
      // Acknowledge de la interacción lo antes posible para evitar 'Unknown interaction'
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
      const value = interaction.values?.[0] || '';
      const [_, mode, roleId] = value.split(':');
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await safeReplyEphemeral(interaction, '❌ No pude obtener tu miembro del servidor.');
        return;
      }

      if (mode === 'spider' || mode === 'royal' || mode === 'pc' || mode === 'movil') {

        const PC_ROLE_ID = '1489717020084932828';
        const MOVIL_ROLE_ID = '1489717018327253174';


        if (member.roles.cache.has(roleId)) {
          const modeLabel = mode === 'pc' ? 'PC' : (mode === 'movil' ? 'Móvil' : (mode === 'royal' ? 'Royal' : 'Spider'));
          await safeReplyEphemeral(interaction, `ℹ️ Ya tienes el rol permanente ${modeLabel}.`);
          return;
        }


        // Exclusividad entre PC y Móvil
        if (mode === 'pc') {
          if (member.roles.cache.has(MOVIL_ROLE_ID)) {
            await member.roles.remove(MOVIL_ROLE_ID).catch(() => { });
          }
        } else if (mode === 'movil') {
          if (member.roles.cache.has(PC_ROLE_ID)) {
            await member.roles.remove(PC_ROLE_ID).catch(() => { });
          }
        }

        await member.roles.add(roleId).catch(e => console.warn('No se pudo asignar rol permanente:', e.message));
        const modeLabel = mode === 'pc' ? 'PC' : (mode === 'movil' ? 'Móvil' : (mode === 'royal' ? 'Royal' : 'Spider'));


        let extraMsg = '';
        if (mode === 'pc' && member.roles.cache.has(MOVIL_ROLE_ID)) extraMsg = ' (El rol de Móvil ha sido removido)';
        if (mode === 'movil' && member.roles.cache.has(PC_ROLE_ID)) extraMsg = ' (El rol de PC ha sido removido)';

        await safeReplyEphemeral(interaction, `✅ Rol permanente ${modeLabel} asignado.${extraMsg}`);
        // Log de asignación permanente
        try {
          const embedBuilder = EBOverride || EmbedBuilder;
          const logEmbed = new embedBuilder()
            .setTitle('🧩 Autorol Permanente Asignado')
            .setDescription(`**Usuario:** <@${interaction.user.id}>
**Rol:** <@&${roleId}>
**Modo:** ${modeLabel} (permanente)`)
            .setColor((COLORS && COLORS.PRIMARY) || 0x5865F2)
            .setTimestamp();
          await sendLog(interaction.guild, logEmbed, [], 'autorole');
        } catch (_) { }
        return;
      }

      const now = Date.now();
      const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

      // Calcular inicio de semana (lunes 00:00)
      const d = new Date();
      const day = d.getDay();
      const diffToMonday = (day === 0 ? -6 : 1 - day);
      d.setDate(d.getDate() + diffToMonday);
      d.setHours(0, 0, 0, 0);
      const currentWeekStart = d.getTime();

      await ensurePlayerRecord(interaction.user.id);
      const playerDoc = await Player.findById(interaction.user.id);
      if (!playerDoc) {
        await safeReplyEphemeral(interaction, '❌ No pude crear/obtener tu registro de jugador.');
        return;
      }

      const usage = playerDoc.autoroleWeeklyUsage || { count: 0, weekStart: 0 };
      if (!usage.weekStart || usage.weekStart < currentWeekStart) {
        usage.weekStart = currentWeekStart;
        usage.count = 0;
      }

      if (usage.count >= 30) {
        await safeReplyEphemeral(interaction, '⛔ Alcanzaste el límite de 30 asignaciones temporales esta semana.');
        return;
      }

      // Si ya tiene el rol temporal activo, informar tiempo restante y salir
      const existingTemp = (playerDoc.temporaryRoles || []).find(r => {
        if (!r || !r.roleId || !r.expiresAt) return false;
        const expiresAtMs = (r.expiresAt instanceof Date) ? r.expiresAt.getTime() : Number(r.expiresAt || 0);
        return (r.roleId === roleId && expiresAtMs > now);
      });
      if (member.roles.cache.has(roleId)) {
        if (existingTemp) {
          const expMs = (existingTemp.expiresAt instanceof Date) ? existingTemp.expiresAt.getTime() : Number(existingTemp.expiresAt || 0);
          const remainingMs = expMs - now;
          const hrs = Math.floor(remainingMs / 3600000);
          const mins = Math.floor((remainingMs % 3600000) / 60000);
          await safeReplyEphemeral(interaction, `ℹ️ Ya tienes este rol (${mode}). Tiempo restante: ${hrs}h ${mins}m.`);
        } else {
          await safeReplyEphemeral(interaction, `ℹ️ Ya tienes este rol (${mode}).`);
        }
        return;
      }

      await member.roles.add(roleId).catch(e => console.warn('No se pudo asignar rol temporal:', e.message));

      const expiresAt = new Date(Date.now() + FIVE_HOURS_MS);
      playerDoc.autoroleWeeklyUsage = usage;
      playerDoc.autoroleWeeklyUsage.count += 1;
      playerDoc.temporaryRoles = Array.isArray(playerDoc.temporaryRoles) ? playerDoc.temporaryRoles : [];
      playerDoc.temporaryRoles.push({ roleId, expiresAt });
      await playerDoc.save();

      const remaining = FIVE_HOURS_MS;
      const MAX_TIMEOUT = 0x7fffffff;
      if (remaining <= MAX_TIMEOUT) {
        setTimeout(() => removeTemporaryRole(interaction.user.id, roleId), remaining);
      }
      await safeReplyEphemeral(interaction, `✅ Rol temporal asignado por 5 horas (${mode}).`);
      // Log de asignación temporal
      try {
        const embedBuilder = EBOverride || EmbedBuilder;
        const logEmbed = new embedBuilder()
          .setTitle('🧩 Autorol Temporal Asignado')
          .setDescription(`**Usuario:** <@${interaction.user.id}>
**Rol:** <@&${roleId}>
**Modo:** ${mode}
**Duración:** 5 horas`)
          .setColor((COLORS && COLORS.PRIMARY) || 0x5865F2)
          .setTimestamp();
        await sendLog(interaction.guild, logEmbed, [], 'autorole');
      } catch (_) { }
      return;
    } catch (e) {
      console.error('Error en autorole select:', e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Ocurrió un error al procesar tu selección.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
      return;
    }
  }
};
