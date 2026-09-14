// src/events/guildMemberAdd.js
module.exports = async function onGuildMemberAdd(member, ctx) {
  const { ensurePlayerRecord, Setting, sendLog, EmbedBuilder, COLORS } = ctx;

  try {
    // -------------------------------------------------------------------------
    // ANTI-RAID: Cuentas nuevas
    // -------------------------------------------------------------------------
    if (Setting && sendLog && EmbedBuilder && COLORS) {
      try {
        const antiRaidSetting = await Setting.findById('antiRaidNewAccounts').lean();
        if (antiRaidSetting?.value) {
          const now = Date.now();
          const createdAt = member.user.createdTimestamp;
          const diffMs = now - createdAt;
          const diffDays = diffMs / (1000 * 60 * 60 * 24);

          if (diffDays < 30) {
            await member.ban({ reason: 'Sistema Anti-Raid: Cuenta creada hace menos de 30 días.' });

            const logEmbed = new EmbedBuilder()
              .setTitle('🛡️ Anti-Raid Activado')
              .setDescription([
                `**Usuario Baneado:** <@${member.id}> (${member.user.tag})`,
                `**Antigüedad:** ${diffDays.toFixed(1)} días`,
                `**Razón:** Cuenta nueva (< 30 días)`,
                `**ID:** ${member.id}`
              ].join('\n'))
              .setColor(COLORS.ERROR)
              .setTimestamp();

            await sendLog(member.guild, logEmbed, [], 'raid');
            return;
          }
        }
      } catch (antiRaidError) {
        console.error(`Error en Anti-Raid check para ${member?.user?.tag}:`, antiRaidError);
      }
    }
    // -------------------------------------------------------------------------

    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!member || member.user.bot) return;

    // ── FIX: Recuperar el registro existente SIN modificar puntos ni stats ──
    // $setOnInsert garantiza que si el documento YA EXISTE, no se toca nada.
    // Si es nuevo (primer ingreso), se crea con los valores por defecto del schema.
    const player = await ensurePlayerRecord(member.id);

    if (player) {
      const existingSeasonPts = player.currentSeason?.points || 0;
      const isReturningPlayer = (existingSeasonPts > 0 || player.wins > 0);

      if (isReturningPlayer) {
        // Jugador que vuelve al servidor — NO modificar sus puntos
        console.log(`[GuildMemberAdd] Jugador ${member.user.tag} (${member.id}) RE-ENTRÓ al servidor.`
          + ` Pts temporada: ${existingSeasonPts} | Victorias: ${player.wins}`);

        // Loguear el re-ingreso en el canal de logs si está disponible
        if (sendLog && EmbedBuilder && COLORS) {
          try {
            const logEmbed = new EmbedBuilder()
              .setTitle('🔄 Jugador Re-ingresó al Servidor')
              .setDescription([
                `**Usuario:** <@${member.id}> (${member.user.tag})`,
                `**Puntos de temporada:** ${existingSeasonPts.toLocaleString()}`,
                `**Victorias:** ${player.wins || 0} | **Derrotas:** ${player.losses || 0}`,
                `**Sus datos han sido CONSERVADOS correctamente.**`
              ].join('\n'))
              .setColor(COLORS.SUCCESS || 0x00ff00)
              .setTimestamp();
            await sendLog(member.guild, logEmbed, [], 'general').catch(() => {});
          } catch (_) {}
        }
      } else {
        console.log(`[GuildMemberAdd] Nuevo jugador ${member.user.tag} (${member.id}) - registro creado con stats en 0.`);
      }
    }

    // [DM DESACTIVADO] Bienvenida + instrucciones de código de invitación
    // try {
    //   const dm = await member.createDM().catch(() => null);
    //   if (dm) {
    //     await dm.send('👋 Bienvenido a ROYAL RANKED.\n\nSi entraste al servidor usando el link de invitación de un amigo, responde a este mensaje escribiendo `INV CODIGO` (por ejemplo: `INV ABCD1234`) para que se registre tu invitación y se acrediten los puntos.').catch(() => {});
    //   }
    // } catch (_) {}
  } catch (error) {
    console.error(`Error en onGuildMemberAdd para ${member?.user?.tag || member?.id}:`, error);
  }
};
