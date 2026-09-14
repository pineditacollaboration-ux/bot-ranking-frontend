const { schedule } = require('node-cron');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { generateDailyLeaderboard } = require('./leaderboardImage');
const { StreamerChannel } = require('../../models.js');
const { createQuickBackup } = require('./autoBackup');

/**
 * Registra tareas programadas (cron) centralizadas para el bot.
 * - Limpieza de roles temporales y advertencias expiradas (cada 5 minutos)
 * - Distribución de recompensas diarias (5:00 AM)
 * - Sincronización de apodos (cada hora)
 */
function registerSchedulers({
  client,
  Player,
  removeTemporaryRole,
  rankingUtils,
  nicknameUpdateQueue,
  updateNicknamesEfficiently,
  mainGuildId,
  timezone = 'America/Bogota',
  updateChampionRoles,
  championRoles,
  settings,
  COLORS,
  EMBED_DEFAULTS,
  checkTikTokLive, // agregado para el cron de TikTok
  sendLog, // NUEVO: Para pulso del sistema
  Setting, // NUEVO: Para verificación de biografía/pronombres
}) {
  // Respaldo: limpieza de roles temporales y advertencias expiradas
  schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const expiredPlayers = await Player.find({
        $or: [
          { 'activeWarnings.expiresAt': { $lte: now } },
          { 'temporaryRoles.expiresAt': { $lte: now } },
        ],
      });

      if (expiredPlayers.length > 0) {
        console.log(`[CRON Cleanup] Encontrados ${expiredPlayers.length} jugadores con roles/advertencias expiradas. Limpiando...`);
        for (const player of expiredPlayers) {
          const allRoles = [
            ...(Array.isArray(player.activeWarnings) ? player.activeWarnings : []),
            ...(Array.isArray(player.temporaryRoles) ? player.temporaryRoles : []),
          ];
          for (const role of allRoles) {
            if (!role || !role.expiresAt || !role.roleId) continue;
            const expiryDate = (role.expiresAt instanceof Date) ? role.expiresAt : new Date(role.expiresAt);
            if (expiryDate <= now) {
              console.log(`[CRON Cleanup] Rol expirado detectado para ${player._id}: ${role.roleId} (expiró ${expiryDate.toISOString()}).`);
              await removeTemporaryRole(player._id, role.roleId);
            }
          }
        }
      }
    } catch (error) {
      console.error('[CRON Cleanup] Error limpiando roles/advertencias expiradas:', error);
    }
  }, { scheduled: true, timezone });

  // Verificación de miembros con rol de verificación (deshabilitada)
  schedule('*/5 * * * *', async () => {
    console.log('[CRON Verification] Deshabilitado. No se revisan roles de verificación periódicamente.');
  }, { scheduled: true, timezone });

  // Limpieza de Canales de Streamer expirados (cada 5 minutos)
  schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const expiredChannels = await StreamerChannel.find({ expiresAt: { $lte: now } });

      if (expiredChannels.length > 0) {
        console.log(`[CRON Cleanup] Limpiando ${expiredChannels.length} canales de streamer expirados...`);
        const guildId = mainGuildId || (client.guilds.cache.first()?.id);
        const guild = guildId ? (client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null)) : null;

        for (const doc of expiredChannels) {
          try {
            if (guild) {
              const channel = await guild.channels.fetch(doc._id).catch(() => null);
              if (channel) {
                await channel.delete('Canal de streamer expirado (3 horas)').catch(() => { });
                console.log(`[CRON Cleanup] Canal de streamer ${doc._id} eliminado de Discord.`);
              }
            }
            await StreamerChannel.deleteOne({ _id: doc._id }).catch(() => { });
            console.log(`[CRON Cleanup] Registro de canal de streamer ${doc._id} eliminado de DB.`);
          } catch (err) {
            console.error(`[CRON Cleanup] Error al eliminar canal streamer ${doc._id}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('[CRON Cleanup] Error limpiando canales de streamer expirados:', error);
    }
  }, { scheduled: true, timezone });

  // Verificar estado de TikTok en todos los usuarios registrados cada 5 minutos
  // PROTECCIÓN: Si el ciclo anterior aún no terminó, se omite el nuevo ciclo por completo.
  let _tiktokCronActive = false;
  schedule('*/5 * * * *', async () => {
    if (_tiktokCronActive) {
      console.warn('[CRON TikTok] ⚠️  Ciclo anterior aún en progreso. Omitiendo este ciclo para evitar sobrecarga.');
      return;
    }
    _tiktokCronActive = true;
    try {
      const players = await Player.find({ tiktokUsername: { $exists: true, $ne: null } }).lean();
      if (players.length === 0) return;

      const guildId = mainGuildId || (client.guilds.cache.first()?.id);
      const guild = guildId
        ? (client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null))
        : null;
      if (!guild) return;

      console.log(`[CRON TikTok] Iniciando ciclo para ${players.length} jugadores...`);

      if (typeof checkTikTokLive !== 'function') {
        console.warn('[CRON TikTok] checkTikTokLive no está definido, omitiendo.');
        return;
      }

      // Encolar con escalonamiento (stagger) de 200ms entre cada jugador.
      // Esto evita que los 20+ checks lleguen a TikTok en el mismo instante.
      const STAGGER_MS = 200;
      const promises = [];
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const delay = i * STAGGER_MS;
        const promise = new Promise(resolve => setTimeout(resolve, delay))
          .then(() => checkTikTokLive(p._id, guild, settings))
          .catch(e => console.error(`[CRON TikTok] Error checking live for ${p._id}:`, e));
        promises.push(promise);
      }

      // Esperar a que TODOS los checks terminen antes de liberar el lock
      await Promise.allSettled(promises);
      console.log(`[CRON TikTok] Ciclo completado para ${players.length} jugadores.`);
    } catch (err) {
      console.error('[CRON TikTok] Error iterating players:', err);
    } finally {
      _tiktokCronActive = false;
    }
  }, { scheduled: true, timezone });

  // Ranking diario y recompensas a las 5:00 AM
  schedule('0 5 * * *', async () => {
    try {
      const ts = new Date().toLocaleString('es-CO', { timeZone: timezone });
      console.log(`[CRON] Ejecutando tarea: Ranking diario y recompensas... (${ts})`);
      const guildId = mainGuildId || (client.guilds.cache.first()?.id);
      const guild = guildId ? client.guilds.cache.get(guildId) : null;
      if (!guild) {
        console.warn('[CRON Rewards] No se encontró guild para distribuir recompensas diarias.');
        return;
      }
      let fullRanking = [];
      try {
        fullRanking = await rankingUtils.getDailyRankingFromDB();
      } catch (_) { }

      if (rankingUtils && typeof rankingUtils.distributeDailyRewards === 'function') {
        await rankingUtils.distributeDailyRewards(guild);
      } else {
        console.warn('[CRON Rewards] rankingUtils.distributeDailyRewards no disponible.');
      }

      try {
        const summaryChannelId = settings?.dailySummaryChannelId;
        if (summaryChannelId) {
          const summaryChannel = await guild.channels.fetch(summaryChannelId).catch(() => null);
          if (summaryChannel && summaryChannel.isTextBased()) {

            if (fullRanking.length === 0) {
              const embed = new EmbedBuilder()
                .setTitle('📈 Ranking Diario de Actividad')
                .setColor(COLORS?.PRIMARY || 0x5865F2)
                .setFooter(EMBED_DEFAULTS?.footer || { text: guild.name })
                .setTimestamp()
                .setDescription('Aún no hay suficiente actividad del día anterior.');
              await summaryChannel.send({ embeds: [embed] }).catch(() => { });
            } else {
              if (fullRanking && fullRanking.length > 0) {
                const topPoints = fullRanking.slice(0, 10);
                const topWins = [...fullRanking].sort((a, b) => b.wins - a.wins || b.pointsGained - a.pointsGained).slice(0, 10);

                const pointsList = topPoints.map((p, i) => {
                  const displayName = p.customName || `<@${p.id}>`;
                  return `> **${i + 1}.** ${displayName} - **${p.pointsGained}** pts ganados`;
                }).join('\n');

                const winsList = topWins.map((p, i) => {
                  const displayName = p.customName || `<@${p.id}>`;
                  return `> **${i + 1}.** ${displayName} - **${p.wins}** victorias`;
                }).join('\n');

                const pointsEmbed = new EmbedBuilder()
                  .setTitle('📈 Top 10 - Puntos Diarios')
                  .setColor(COLORS?.PRIMARY || 0x5865F2)
                  .setDescription(`Top jugadores con más puntos ganados del día anterior.\n\n${pointsList}`)
                  .setFooter(EMBED_DEFAULTS?.footer || { text: guild.name })
                  .setTimestamp();

                const winsEmbed = new EmbedBuilder()
                  .setTitle('🏆 Top 10 - Victorias Diarias')
                  .setColor(0xFFD700) // Oro
                  .setDescription(`Top jugadores con más victorias del día anterior.\n\n${winsList}`)
                  .setFooter(EMBED_DEFAULTS?.footer || { text: guild.name })
                  .setTimestamp();

                await summaryChannel.send({
                  content: "🏆 **Ranking Diario de Actividad** 🏆\n¡Felicidades a los más activos del día anterior!",
                  embeds: [pointsEmbed, winsEmbed]
                }).catch(e => console.error("Error enviando ranking diario en cron:", e));
              }
            }
          }
        }
      } catch (_) { }











      // Panel de Campeones se envía aparte abajo

      // Panel de Campeones — enviar SOLO al canal específico si está configurado
      try {
        const entries = [
          ['TERROR DE RYL (Top 1)', championRoles?.terrorTop1],
          ['IMPERRADOR (Max MVP)', championRoles?.imperradorMaxMvp],
          ['MELHOR 1X1 (Max Win 1x1)', championRoles?.rei1x1MaxWins],
          ['JOGADOR VALORIZADO (Pocas Derrotas)', championRoles?.jogadorValorizadoFewLosses],
          ['EASY MONEY (Apuestas Ganadas)', championRoles?.iziMoneyMaxWagerWon],
          ['MAX WINNER (Mayor Racha)', championRoles?.maxxWinnerMaxStreak],
        ];

        const champsEmbed = new EmbedBuilder()
          .setTitle('🏆 Panel de Campeones')
          .setColor(COLORS?.PRIMARY || 0x5865F2)
          .setFooter(EMBED_DEFAULTS?.footer || { text: guild.name })
          .setTimestamp();

        for (const [name, roleId] of entries) {
          if (!roleId) {
            champsEmbed.addFields({ name, value: 'Sin configurar', inline: false });
            continue;
          }
          const roleObj = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
          if (!roleObj) {
            champsEmbed.addFields({ name, value: `Rol no encontrado (ID: ${roleId})`, inline: false });
            continue;
          }
          const holders = roleObj.members;
          const values = holders.map(member => `<@${member.id}>`);
          const value = values.length > 0 ? values.join(', ') : 'Vacante';
          champsEmbed.addFields({ name, value, inline: true });
        }

        const championsChannelId = settings?.championsDailyChannelId;
        if (championsChannelId) {
          const championsChannel = await guild.channels.fetch(championsChannelId).catch(() => null);
          if (championsChannel && championsChannel.isTextBased()) {
            await championsChannel.send({ embeds: [champsEmbed] }).catch(() => { });
          } else {
            console.warn('[CRON Champions Panel] Canal de panel de campeones inválido o no es de texto.');
          }
        }
      } catch (champErr) {
        console.warn('[CRON Champions Panel] No se pudo enviar el panel de campeones:', champErr?.message || champErr);
      }

      // Eliminado: no enviar automáticamente Ranking de Style Coins como parte del resumen diario
    } catch (err) {
      console.error('[CRON Rewards] Error distribuyendo recompensas diarias:', err);
    }
  }, { scheduled: true, timezone });

  // Sincronización de apodos cada hora (solo para el servidor principal)
  let nickSyncRunning = false;
  schedule('0 * * * *', async () => {
    // Guard para prevenir ejecuciones superpuestas
    if (nickSyncRunning) {
      console.warn('[CRON Nick Sync] Sincronización anterior aún en progreso, omitiendo esta ejecución.');
      return;
    }

    try {
      nickSyncRunning = true;
      const ts = new Date().toLocaleString('es-CO', { timeZone: timezone });
      console.log(`[CRON] Ejecutando tarea: Sincronización de apodos... (${ts})`);

      // Solo sincronizar el servidor principal
      const guildId = mainGuildId || (client.guilds.cache.first()?.id);
      if (!guildId) {
        console.warn('[CRON Nick Sync] No se encontró guild principal para sincronizar apodos.');
        return;
      }

      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        console.warn('[CRON Nick Sync] No se pudo obtener el guild principal.');
        return;
      }

      await nicknameUpdateQueue
        .add(() => updateNicknamesEfficiently(guild, null, true))
        .catch((err) => {
          console.error(`[CRON Nick Sync] Error al sincronizar apodos para el servidor ${guild?.name}:`, err);
        });
    } catch (err) {
      console.error('[CRON Nick Sync] Error general durante la sincronización de apodos:', err);
    } finally {
      nickSyncRunning = false;
    }
  }, { scheduled: true, timezone });

  // Actualización periódica de roles de campeón cada 5 minutos
  if (typeof updateChampionRoles === 'function' && championRoles) {
    schedule('*/5 * * * *', async () => {
      try {
        await updateChampionRoles(championRoles);
      } catch (_) { }
    }, { scheduled: true, timezone });
  }

  // Actualización del apodo del bot cada hora
  schedule('0 * * * *', async () => {
    try {
      const ts = new Date().toLocaleString('es-CO', { timeZone: timezone });
      console.log(`[CRON] Ejecutando tarea: Actualización de apodo del bot... (${ts})`);

      const guildId = mainGuildId || (client.guilds.cache.first()?.id);
      if (!guildId) {
        console.warn('[CRON Bot Nickname] No se encontró guild para actualizar el apodo del bot.');
        return;
      }

      // Obtener la hora actual en el timezone configurado
      const now = new Date();
      const timeString = now.toLocaleTimeString('es-CO', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const nickname = `⚡ ROYAL RANKED APP ${timeString}`;

      try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return;
        const me = guild.members.me || await guild.members.fetch(client.user.id);
        await me.setNickname(nickname);
        console.log(`[CRON Bot Nickname] Apodo del bot actualizado a "${nickname}" en el servidor ${guild.name}.`);
      } catch (error) {
        console.error('[CRON Bot Nickname] No se pudo actualizar el apodo del bot:', error.message);
      }
    } catch (err) {
      console.error('[CRON Bot Nickname] Error general durante la actualización del apodo:', err);
    }
  }, { scheduled: true, timezone });

  // Heartbeat del Sistema de Logs cada hora (Pulso de Vida)
  schedule('0 * * * *', async () => {
    try {
      const guildId = mainGuildId || (client.guilds.cache.first()?.id);
      const guild = guildId ? (client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null)) : null;
      
      if (guild && typeof sendLog === 'function') {
        const heartbeatEmbed = new EmbedBuilder()
          .setTitle('💓 Pulso del Sistema')
          .setDescription(`El bot sigue en ejecución y el sistema de logs está operativo.\n\n**Servidor:** ${guild.name}\n**Hora:** ${new Date().toLocaleString('es-CO', { timeZone: timezone })}\n**Uptime:** ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`)
          .setColor(COLORS?.SUCCESS || 0x00FF00)
          .setTimestamp();
          
        await sendLog(guild, heartbeatEmbed, [], 'settings');
      }
    } catch (err) {
      console.error('[CRON Heartbeat] Error enviando pulso de sistema:', err);
    }
  }, { scheduled: true, timezone });

  // Backup automático cada 6 horas (players y matchhistories)
  let backupRunning = false;
  schedule('0 */6 * * *', async () => {
    if (backupRunning) {
      console.warn('[CRON Backup] Backup anterior aún en progreso, omitiendo este ciclo.');
      return;
    }
    
    backupRunning = true;
    try {
      const ts = new Date().toLocaleString('es-CO', { timeZone: timezone });
      console.log(`[CRON Backup] Iniciando backup automático... (${ts})`);
      
      await createQuickBackup();
      
      console.log(`[CRON Backup] ✅ Backup completado exitosamente`);
    } catch (err) {
      console.error('[CRON Backup] Error durante backup automático:', err);
    } finally {
      backupRunning = false;
    }
  }, { scheduled: true, timezone });

  // AutoRole para rol 1489744493677641789 eliminado — ese rol lo maneja otro bot.
}

module.exports = { registerSchedulers };
