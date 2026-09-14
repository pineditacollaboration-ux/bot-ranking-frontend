// src/events/ready.js
const { startRankCallLoop } = require('../utils/rankCall');

module.exports = async function onReady(client, ctx) {
  const {
    loadActiveQueues,
    loadActiveMatches,
    reconcileMatchNotifications,
    nicknameUpdateQueue,
    updateNicknamesEfficiently,
    registerSchedulers,
    checkTikTokLive,
    Player,
    ActiveTempVoice,
    removeTemporaryRole,
    rankingUtils,
    settings,
    mainGuildId,
    timezone,
    setBotNickname,
    startStatusTicker,
    setMaintenancePresence,
    ActivityType,
    cleanupExpiredRolesFromJSON,
    COLORS,
    EMBED_DEFAULTS,
    matches,
    ALLOWED_VOICE_CATEGORIES,
    WAITING_ROOM_VOICE_CHANNEL_ID,
    updateServerStats,
    Setting,

  } = ctx;

  // Resolver guild principal PRIMERO (necesario antes del guard para startRankCallLoop)
  const guild = client.guilds.cache.get(mainGuildId) || client.guilds.cache.first();

  // Iniciar loop automático de Ranking de Call (cada 30 min)
  // Va ANTES del guard _handled para que se reinicie en cada reconexión de Discord
  if (guild) {
    try {
      startRankCallLoop({
        guild,
        client,
        Player,
        Setting,
        EMBED_DEFAULTS,
      });
    } catch (e) {
      console.error('[Ready] Error al iniciar rankCallLoop:', e);
    }
  }

  // Evitar múltiples ejecuciones del resto del setup si el evento se dispara más de una vez
  if (onReady._handled) return;
  onReady._handled = true;

  console.log(`✅ Bot listo como ${client.user.tag}`);

  if (!guild) {
    console.error('[Ready] No se pudo encontrar ningún servidor al que el bot pertenezca.');
  }

  // Establecer apodo del bot y ticker de presencia lo antes posible en TODOS los servidores
  client.guilds.cache.forEach(g => {
    setBotNickname(client, g.id, '⚡ ROYAL RANKED');
  });

  // Actualizar estadísticas del servidor al inicio
  (async () => {
    if (guild && updateServerStats) {
      console.log(`[Stats Init] Actualizando estadísticas para el servidor ${guild.name} (${guild.id})...`);
      await updateServerStats(guild, ctx).catch(e => console.error('[Stats Init] Error updating server stats on boot:', e));
    }
  })();

  // Actualizar estadísticas cada 30 segundos
  if (guild && updateServerStats) {
    setInterval(async () => {
      await updateServerStats(guild, ctx).catch(e => console.error('[Stats Interval] Error updating server stats:', e));
    }, 30000);
  }


  const statuses = [
    { name: '👤 Creado Por Pineda FT Lian', type: ActivityType.Playing },
    { name: '⚡ ROYAL RANKED', type: ActivityType.Watching },
    { 
      name: () => {
        const count = client.guilds.cache.reduce((acc, guild) => {
          return acc + guild.voiceStates.cache.filter(vs => vs.channelId && (!vs.member || !vs.member.user.bot)).size;
        }, 0);
        return `🎙️ ${count} En Voz`;
      }, 
      type: ActivityType.Watching 
    }
  ];
  startStatusTicker(client, statuses, 10000);

  // Si el modo mantenimiento está activo al iniciar, reflejarlo en la presencia
  if (settings && settings.maintenanceEnabled) {
    setMaintenancePresence(client, true);
  }

  // Inicialización: cargar colas y partidas activas
  await Promise.all([
    loadActiveQueues(),
    loadActiveMatches(),
  ]);

  // Recovery: Notificaciones de historial pendientes "si o si"
  if (guild && typeof reconcileMatchNotifications === 'function') {
    reconcileMatchNotifications(guild).catch(e => console.error('[Recovery] Error in reconcileMatchNotifications:', e));
  }

  // Registrar tareas programadas (cron)
  registerSchedulers({
    client,
    Player,
    removeTemporaryRole,
    rankingUtils,
    nicknameUpdateQueue,
    updateNicknamesEfficiently,
    mainGuildId,
    timezone,
    updateChampionRoles: ctx.updateChampionRoles,
    championRoles: ctx.CHAMPION_ROLES,
    settings,
    COLORS,
    EMBED_DEFAULTS,
    checkTikTokLive,
    sendLog: ctx.sendLog,
    Setting,
  });


  // Ejecutar reconciliación inicial de TikTok al arrancar para cerrar canales inmediatamente
  // (esto evita esperar hasta el próximo tick del cron si el bot fue reiniciado)
  (async () => {
    try {
      if (typeof checkTikTokLive !== 'function') return;
      const players = await Player.find({ tiktokUsername: { $exists: true, $ne: null } }).lean();
      if (!players || players.length === 0) return;
      const guildId = mainGuildId || (client.guilds.cache.first()?.id);
      const guild = guildId ? (client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null)) : null;
      if (!guild) return;

      const BATCH_SIZE = 10; // concurrent checks
      console.log(`[TikTok Init] Reconciliando ${players.length} jugadores con TikTok al iniciar (pool=${BATCH_SIZE})...`);
      for (let i = 0; i < players.length; i += BATCH_SIZE) {
        const batch = players.slice(i, i + BATCH_SIZE);
        try {
          await Promise.allSettled(
            batch.map(p => checkTikTokLive(p._id, guild, settings, true).catch(e => console.error('[TikTok Init] Error checking live:', e)))
          );
        } catch (err) {
          console.error('[TikTok Init] Error en batch de reconciliación:', err);
        }
        // pequeña pausa entre batches para evitar picos
        if (i + BATCH_SIZE < players.length) await new Promise(r => setTimeout(r, 250));
      }
      console.log('[TikTok Init] Reconciliación completa.');
    } catch (err) {
      console.error('[TikTok Init] Error durante la reconciliación inicial:', err);
    }
  })();

  // Al iniciar, preparar limpieza de roles/advertencias expiradas que se hayan quedado en la DB
  const rolesToRemoveFromData = {}; // { userId: [roleId1, roleId2] }
  const allPlayersWithTempRoles = await Player.find({
    $or: [
      { 'activeWarnings.0': { $exists: true } },
      { 'temporaryRoles.0': { $exists: true } },
    ],
  }).lean();

  for (const data of allPlayersWithTempRoles) {
    const userId = data._id;
    const allTempRoles = [
      ...(Array.isArray(data.activeWarnings) ? data.activeWarnings : []),
      ...(Array.isArray(data.temporaryRoles) ? data.temporaryRoles : []),
    ];

    for (const tempRole of allTempRoles) {
      const expiresAtMs = (tempRole.expiresAt instanceof Date) ? tempRole.expiresAt.getTime() : Number(tempRole.expiresAt || 0);
      const remaining = expiresAtMs - Date.now();

      const removeRoleLogic = async () => {
        try {
          await removeTemporaryRole(userId, tempRole.roleId);
        } catch (err) {
          console.error(`Error en removeTemporaryRole para ${userId} rol ${tempRole.roleId}:`, err);
        }
      };

      const markForCleanup = () => {
        if (!rolesToRemoveFromData[userId]) rolesToRemoveFromData[userId] = [];
        rolesToRemoveFromData[userId].push(tempRole.roleId);
      };

      const MAX_TIMEOUT = 0x7fffffff; // 2147483647 ms
      if (remaining > 0 && remaining <= MAX_TIMEOUT) {
        setTimeout(removeRoleLogic, remaining);
      } else if (remaining > MAX_TIMEOUT) {
        // Se omite el console.warn para evitar spam en consola. Se limpiará vía cron de forma segura.
      } else {
        console.log(`[Init Roles] Rol ${tempRole.roleId} para ${userId} ya expiró mientras el bot estuvo offline. Removiendo ahora.`);
        removeRoleLogic();
        markForCleanup();
        console.log(
          `Rol ${tempRole.roleId} para ${userId} expiró mientras el bot estaba offline. Marcado para limpieza.`
        );
      }
    }
  }

  setTimeout(() => cleanupExpiredRolesFromJSON(rolesToRemoveFromData), 60 * 1000);

  if (ActiveTempVoice) {
    const now = Date.now();
    const voiceDocs = await ActiveTempVoice.find({}).lean();
    if (Array.isArray(voiceDocs) && voiceDocs.length > 0) {
      const guildCache = new Map();
      const MAX_TIMEOUT_MS = 2147000000;
      for (const doc of voiceDocs) {
        const guildId = doc.guildId || mainGuildId;
        if (!guildId) {
          await ActiveTempVoice.deleteOne({ _id: doc._id }).catch(() => { });
          continue;
        }
        let guild = guildCache.get(guildId);
        if (!guild) {
          guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
          if (!guild) {
            await ActiveTempVoice.deleteOne({ _id: doc._id }).catch(() => { });
            continue;
          }
          guildCache.set(guildId, guild);
        }
        const expiresAtMs = doc.expiresAt instanceof Date ? doc.expiresAt.getTime() : new Date(doc.expiresAt).getTime();
        const remaining = expiresAtMs - now;
        const deleteAndCleanup = async () => {
          const channel = await guild.channels.fetch(doc._id).catch(() => null);
          if (channel) {
            await channel.delete('Canal de voz temporal expirado.').catch(() => { });
          }
          await ActiveTempVoice.deleteOne({ _id: doc._id }).catch(() => { });
        };
        const scheduleVoiceDeletion = (ms) => {
          if (ms <= 0) {
            deleteAndCleanup().catch(() => { });
            return;
          }
          const chunk = Math.min(ms, MAX_TIMEOUT_MS);
          setTimeout(() => {
            if (ms <= chunk) {
              deleteAndCleanup().catch(() => { });
            } else {
              scheduleVoiceDeletion(ms - chunk);
            }
          }, chunk);
        };
        if (!Number.isFinite(remaining)) {
          await deleteAndCleanup().catch(() => { });
        } else if (remaining <= 0) {
          await deleteAndCleanup().catch(() => { });
        } else {
          scheduleVoiceDeletion(remaining);
        }
      }
    }
  }

  // --- SINCRONIZACIÓN DE SESIONES DE VOZ (Resiliencia ante reinicios) ---
  try {
    const guild = client.guilds.cache.get(mainGuildId);
    if (guild) {
      const currentVoiceUsers = new Set();
      // Iterar sobre estados de voz para identificar usuarios activos
      guild.voiceStates.cache.forEach(vs => {
        if (vs.member && !vs.member.user.bot && vs.channelId) {
          const channel = guild.channels.cache.get(vs.channelId);
          if (isMatchOrWaitingVoiceChannel(channel || vs.channelId, matches, ALLOWED_VOICE_CATEGORIES, WAITING_ROOM_VOICE_CHANNEL_ID)) {
            currentVoiceUsers.add(vs.member.id);
          }
        }
      });

      console.log(`[VoiceSync] Encontrados ${currentVoiceUsers.size} usuarios en canales de voz válidos.`);

      // Cerrar sesiones huérfanas
      const openSessions = await Player.find({ 'voiceTime.currentSession': { $ne: null } });
      let closedCount = 0;
      const now = Date.now();
      
      for (const p of openSessions) {
        if (!currentVoiceUsers.has(p._id)) {
          const sessionStart = new Date(p.voiceTime.currentSession).getTime();
          if (sessionStart < now) {
            const duration = Math.floor((now - sessionStart) / 1000);
            p.voiceTime.totalSeconds = (p.voiceTime.totalSeconds || 0) + duration;
            p.voiceTime.currentSession = null;
            p.voiceTime.lastUpdated = new Date();
            sanitizeTemporaryRoles(p);
            await p.save();
            closedCount++;
          }
        }
      }
      if (closedCount > 0) console.log(`[VoiceSync] Cerradas ${closedCount} sesiones huérfanas.`);

      // Iniciar sesiones faltantes
      let openedCount = 0;
      for (const userId of currentVoiceUsers) {
        const p = await Player.findById(userId);
        if (p) {
          if (!p.voiceTime) p.voiceTime = { totalSeconds: 0, lastUpdated: null, currentSession: null };
          if (!p.voiceTime.currentSession) {
            p.voiceTime.currentSession = new Date();
            p.voiceTime.lastUpdated = new Date();
            sanitizeTemporaryRoles(p);
            await p.save();
            openedCount++;
          }
        }
      }
      if (openedCount > 0) console.log(`[VoiceSync] Iniciadas ${openedCount} sesiones recuperadas.`);
    }
  } catch (err) {
    console.error('Error en sincronización de voz al inicio:', err);
  }
};

/**
 * Sanitiza temporaryRoles de un documento Player antes de save().
 * Elimina entradas cuyo expiresAt sea nulo, inválido o en nanosegundos.
 */
function sanitizeTemporaryRoles(player) {
  if (!Array.isArray(player.temporaryRoles) || player.temporaryRoles.length === 0) return;
  const MAX_MS = 8640000000000000;
  const NS_THRESHOLD = 1e15;
  player.temporaryRoles = player.temporaryRoles.filter(role => {
    if (!role || !role.expiresAt) return false;
    let val = role.expiresAt;
    if (val instanceof Date) return !isNaN(val.getTime());
    let ms = Number(val);
    if (!isFinite(ms)) return false;
    if (ms >= NS_THRESHOLD) ms = Math.round(ms / 1e6);
    if (ms > MAX_MS || ms <= 0) return false;
    role.expiresAt = new Date(ms);
    return true;
  });
  player.markModified('temporaryRoles');
}

/**
 * Verifica si un canal de voz es de partida o espera (Helper local)
 */
function isMatchOrWaitingVoiceChannel(channelOrId, matches, ALLOWED_VOICE_CATEGORIES = [], WAITING_ROOM_VOICE_CHANNEL_ID = null) {
  // Ahora cuenta tiempo en cualquier canal de voz del servidor
  return true;
}

