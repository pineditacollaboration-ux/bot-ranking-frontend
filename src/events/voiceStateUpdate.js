// src/events/voiceStateUpdate.js

const { ChannelType, PermissionsBitField } = require('discord.js');
const { checkVoiceRewards } = require('../utils/rewardUtils');


const penalizedVoiceLeave = new Map();

// Variables para control de rate-limit (memoria volátil)
let lastVoiceStatsUpdate = 0;
let voiceStatsUpdateTimeout = null;
const VOICE_STATS_COOLDOWN = 30 * 1000; // 30 segundos (Discord permite 2 updates cada 10 min)

module.exports = async (oldState, newState, { Player, matches, ALLOWED_VOICE_CATEGORIES, WAITING_ROOM_VOICE_CHANNEL_ID, settings, voicePenaltyPoints, BOT_OWNER_ID, excludedFromQueueRestriction, excludedFromVoiceMove, excludedFromNickUpdate, sendLog, EmbedBuilder, COLORS, updateServerStats }) => {
  try {
    const userId = newState.id;
    
    // Verificar si el usuario entró o salió de un canal de voz relevante
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    
    // Si no hay cambio de canal, ignoramos el evento
    if (oldChannelId === newChannelId) return;

    const guild = newState.guild || oldState.guild || null;

    // Actualizar estadísticas de miembros en call cuando alguien entra/sale de voz
    if (guild && updateServerStats) {
      await updateServerStats(guild, { Setting: require('../models/Setting') }).catch(() => {});
    }

    if (guild && settings && settings.voiceStatsChannelId) {
      const updateStatsChannel = async () => {
        try {
          const channel = await guild.channels.fetch(settings.voiceStatsChannelId).catch(() => null);
          if (channel && channel.type === ChannelType.GuildVoice) {
            // Usar voiceStates para mayor precisión y rapidez
            const voiceCount = guild.voiceStates.cache.filter(vs => vs.channelId && vs.member && !vs.member.user.bot).size;
            const desiredName = `Miembros En Call: ${voiceCount}`;
            if (channel.name !== desiredName) {
              await channel.setName(desiredName).catch((err) => {
                 if (err.code === 50013) console.warn('Faltan permisos para actualizar canal de stats');
                 else if (err.code === 429) console.warn('Rate limit alcanzado en updateStatsChannel');
              });
            }
          }
        } catch (_) { }
      };

      const now = Date.now();
      const timeSinceLast = now - lastVoiceStatsUpdate;

      if (timeSinceLast >= VOICE_STATS_COOLDOWN) {
        // Si ya pasó el cooldown, actualizar inmediatamente
        lastVoiceStatsUpdate = now;
        await updateStatsChannel();
      } else {
        // Si estamos en cooldown, programar actualización si no hay una ya programada
        if (!voiceStatsUpdateTimeout) {
          const delay = VOICE_STATS_COOLDOWN - timeSinceLast + 5000; // +5s margen
          voiceStatsUpdateTimeout = setTimeout(async () => {
            voiceStatsUpdateTimeout = null;
            lastVoiceStatsUpdate = Date.now();
            await updateStatsChannel();
          }, delay);
        }
      }
    }
    
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const wasRelevant =
      oldChannelId &&
      isMatchOrWaitingVoiceChannel(
        oldChannel,
        matches,
        ALLOWED_VOICE_CATEGORIES,
        WAITING_ROOM_VOICE_CHANNEL_ID
      );
    const isRelevant =
      newChannelId &&
      isMatchOrWaitingVoiceChannel(
        newChannel,
        matches,
        ALLOWED_VOICE_CATEGORIES,
        WAITING_ROOM_VOICE_CHANNEL_ID
      );

    // Verificar si el usuario se está moviendo a una categoría permitida
    const newCategoryId = newChannel?.parentId;
    const isMovingToAllowedCategory = 
      newChannelId && // Asegurar que hay un canal de destino
      newCategoryId && 
      Array.isArray(ALLOWED_VOICE_CATEGORIES) && 
      ALLOWED_VOICE_CATEGORIES.includes(newCategoryId);

    // Debug logging para entender el flujo
    if (wasRelevant && !isRelevant) {
      console.log(`[VoiceDebug] User ${userId}: wasRelevant=${wasRelevant}, isRelevant=${isRelevant}`);
      console.log(`[VoiceDebug] User ${userId}: oldChannel=${oldChannelId} (${oldChannel?.parentId}), newChannel=${newChannelId} (${newCategoryId})`);
      console.log(`[VoiceDebug] User ${userId}: isMovingToAllowedCategory=${isMovingToAllowedCategory}`);
    }

    // NO penalizar si se está moviendo a una categoría permitida
    // SÍ penalizar si se desconecta o va a categoría no permitida
    if (wasRelevant && !isRelevant && !isMovingToAllowedCategory && matches && matches.size > 0 && guild) {
      const member = newState.member || oldState.member;
      if (member) {
        const isOwner = Array.isArray(BOT_OWNER_ID)
          ? BOT_OWNER_ID.includes(member.id)
          : member.id === BOT_OWNER_ID;
        const isAdmin = member.permissions?.has(
          PermissionsBitField.Flags.Administrator
        );
        const isExemptByRole = [
          ...(settings?.manageRole || []),
          ...(settings?.staffRoleId || []),
          "1484375565975617595", // Admin (fallback)
          "1484375565975617594", // Moderador (fallback)
        ].some(roleId => member.roles?.cache?.has(roleId));
        const isExclusive =
          excludedFromQueueRestriction &&
          excludedFromQueueRestriction.has(member.id);
        if (isOwner || isAdmin || isExemptByRole || isExclusive) {
          return;
        }
      }
      let activeMatch = null;
      for (const match of matches.values()) {
        if (
          match &&
          !match.closed &&
          match.status === "active" &&
          ((Array.isArray(match.team1) && match.team1.includes(userId)) ||
            (Array.isArray(match.team2) && match.team2.includes(userId)))
        ) {
          activeMatch = match;
          break;
        }
      }
      if (activeMatch && activeMatch.textChannelId) {
        const matchKey =
          activeMatch._id ||
          `${guild.id || "guild"}:${activeMatch.matchNumber || "unknown"}`;
        let penalizedSet = penalizedVoiceLeave.get(matchKey);
        if (!penalizedSet) {
          penalizedSet = new Set();
          penalizedVoiceLeave.set(matchKey, penalizedSet);
        }

        const alreadyPenalizedSet = new Set(
          Array.isArray(activeMatch.voicePenaltyAppliedUserIds)
            ? activeMatch.voicePenaltyAppliedUserIds.map((id) => String(id))
            : []
        );

        if (!penalizedSet.has(userId)) {
          penalizedSet.add(userId);
          const penaltyAmount =
            typeof voicePenaltyPoints === "number" &&
            !Number.isNaN(voicePenaltyPoints) &&
            voicePenaltyPoints > 0
              ? voicePenaltyPoints
              : 10000;
          
          if (!alreadyPenalizedSet.has(String(userId)) && !excludedFromVoiceMove.has(String(userId))) {
            const gracePeriodEnd = activeMatch.gracePeriodEnd ? new Date(activeMatch.gracePeriodEnd) : null;
            const now = new Date();
            if (!gracePeriodEnd || now >= gracePeriodEnd) {
            const playerDoc = await Player.findById(userId).lean();
            const currentPoints = playerDoc?.currentSeason?.points || 0;
            
            if (currentPoints >= penaltyAmount) {
            try {
              await Player.updateOne(
                { _id: userId },
                { $inc: { "currentSeason.points": -penaltyAmount } },
                { upsert: true }
              );
            } catch (e) {
              console.error(
                "Error aplicando penalización por salir de voz:",
                e
              );
            }
            try {
              const textChannel = await guild.channels
                .fetch(activeMatch.textChannelId)
                .catch(() => null);
              if (textChannel && typeof textChannel.send === "function") {
                await textChannel.send({
                  content:
                    `⚠️ <@${userId}> se le descontaron **${penaltyAmount}** puntos por no jugar dentro del Discord (salió de un canal de voz permitido durante la partida).`,
                  allowedMentions: {
                    users: [userId],
                    roles: [],
                    replied_user: false,
                  },
                });
                if (typeof sendLog === 'function') {
                  const logEmbed = new EmbedBuilder()
                    .setTitle('Penalización de 10k aplicada')
                    .setDescription(`Jugador: <@${userId}>\nMotivo: por no jugar dentro del Discord\nPartida: #${activeMatch.matchNumber}`)
                    .setColor(COLORS.WARNING)
                    .setTimestamp();
                  await sendLog(guild, logEmbed, [], 'penalty10k');
                }
              }
            } catch (_) {}
              alreadyPenalizedSet.add(String(userId));
              activeMatch.voicePenaltyAppliedUserIds = Array.from(
                alreadyPenalizedSet
              );
              matches.set(matchKey, activeMatch);
            }
          }
          }
        }
      }
    }

    let playerDoc = await Player.findById(userId);
    if (!playerDoc) return;
    if (!playerDoc.voiceTime) {
      playerDoc.voiceTime = {
        totalSeconds: 0,
        lastUpdated: null,
        currentSession: null,
      };
    }
    
    if (wasRelevant) {
      if (playerDoc.voiceTime.currentSession) {
        const sessionStart = new Date(playerDoc.voiceTime.currentSession).getTime();
        const now = Date.now();
        let sessionDuration = Math.floor((now - sessionStart) / 1000);
        
        // --- SALVAGUARDA ANTI-BUG ---
        // Si la sesión dura más de 24 horas, asumimos que es un error (bot apagado, evento perdido)
        // y la ignoramos para no corromper el ranking con 1000+ horas falsas.
        const MAX_SESSION_SECONDS = 24 * 60 * 60; // 24 horas
        if (sessionDuration > MAX_SESSION_SECONDS) {
            console.log(`[Anti-Bug] Se ignoró una sesión de voz de ${sessionDuration}s (${(sessionDuration/3600).toFixed(1)}h) para el usuario ${userId}`);
            sessionDuration = 0;
        }

        // Actualizar tiempo total si la duración es válida
        if (sessionDuration > 0) {
            playerDoc.voiceTime.totalSeconds += sessionDuration;
        }
        
        playerDoc.voiceTime.lastUpdated = new Date();
        playerDoc.voiceTime.currentSession = null;

        // --- Recompensa por Rol VIP (0.30 coins/hora) ---
        // Solo para usuarios con el rol 1415131212523110493
        const VIP_ROLE_ID = (settings && settings.puntosX2RoleId) || '1489763749878566912';
        const member = oldState.member || newState.member;

        if (member && member.roles.cache.has(VIP_ROLE_ID)) {
          const hours = sessionDuration / 3600;
          const coinsEarned = Math.floor(hours * 0.30);

          if (coinsEarned > 0) {
            playerDoc.styleCoins = (playerDoc.styleCoins || 0) + coinsEarned;
            // console.log(`[VoiceReward] ${member.user.tag} ganó ${coinsEarned} coins por ${hours.toFixed(2)}h.`);
          }
        }
        
        // Guardar cambios
        await playerDoc.save();

        // Verificar recompensas por tiempo en voz
        await checkVoiceRewards(member, playerDoc.voiceTime.totalSeconds, { config: require('../../config.json'), sendLog, COLORS, excludedFromQueueRestriction, excludedFromVoiceMove, excludedFromNickUpdate });
      }

    }
    
    if (isRelevant) {
      playerDoc.voiceTime.currentSession = new Date();
      playerDoc.voiceTime.lastUpdated = new Date();
      
      // Guardar cambios
      await playerDoc.save();
    }
  } catch (error) {
    console.error('Error al procesar cambio de estado de voz:', error);
  }
};

/**
 * Verifica si un canal de voz es de partida o espera
 * @param {string} channelId ID del canal de voz
 * @param {Map} matches Mapa de partidas activas
 * @returns {boolean} true si es canal de partida o espera
 */
function isMatchOrWaitingVoiceChannel(channel, matches, ALLOWED_VOICE_CATEGORIES = [], WAITING_ROOM_VOICE_CHANNEL_ID = null) {
  // Ahora cuenta tiempo en cualquier canal de voz del servidor
  return true;
}
