/**
 * src/utils/performanceOptimizer.js
 * 
 * Módulo centralizado para optimizaciones de rendimiento:
 * - Batch operations
 * - Caché de members
 * - Parallelizar queries
 */

const PQueue = require('p-queue').default;

/**
 * Caché de miembros del servidor
 * Estructura: Map<guildId:userId> -> member
 */
const memberCache = new Map();
const MEMBER_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const memberCacheTimestamps = new Map();

function createPerformanceOptimizer() {
  
  /**
   * OPTIMIZACIÓN 1: BATCH FETCH DE MEMBERS
   * 
   * Obtiene múltiples miembros en una sola llamada
   * En lugar de 10 fetches individuales → 1 fetch batch
   */
  async function getMembers(guild, userIds) {
    if (!guild || !Array.isArray(userIds) || userIds.length === 0) {
      return new Map();
    }

    const result = new Map();
    const toFetch = [];
    const now = Date.now();

    // 1. Intentar obtener del caché primero
    for (const userId of userIds) {
      const cacheKey = `${guild.id}:${userId}`;
      const cached = memberCache.get(cacheKey);
      const timestamp = memberCacheTimestamps.get(cacheKey) || 0;

      if (cached && (now - timestamp) < MEMBER_CACHE_TTL) {
        result.set(userId, cached);
      } else {
        // Intentar caché de Discord
        const dcCached = guild.members.cache.get(userId);
        if (dcCached) {
          memberCache.set(cacheKey, dcCached);
          memberCacheTimestamps.set(cacheKey, now);
          result.set(userId, dcCached);
        } else {
          toFetch.push(userId);
        }
      }
    }

    // 2. Fetch batch de los que no están en caché
    if (toFetch.length > 0) {
      try {
        const fetched = await guild.members.fetch({ user: toFetch });
        fetched.forEach((member, userId) => {
          const cacheKey = `${guild.id}:${userId}`;
          memberCache.set(cacheKey, member);
          memberCacheTimestamps.set(cacheKey, now);
          result.set(userId, member);
        });
      } catch (error) {
        console.warn('[PerformanceOptimizer] Error fetching members batch:', error.message);
      }
    }

    return result;
  }

  /**
   * OPTIMIZACIÓN 2: BATCH ROLE OPERATIONS
   * 
   * Agrupa operaciones de roles para ejecutarlas en paralelo
   * En lugar de: for await (add role) → Promise.all(add roles)
   */
  async function addRolesBatch(members, roleId) {
    const operations = Array.from(members.values())
      .map(member => 
        member.roles.add(roleId).catch(e => ({
          error: true,
          memberId: member.id,
          reason: e.message
        }))
      );

    return Promise.allSettled(operations);
  }

  /**
   * OPTIMIZACIÓN 3: BATCH VOICE CHANNEL MOVES
   * 
   * Mueve múltiples jugadores a canales de voz en paralelo
   * Con control de concurrencia para evitar rate limits
   */
  async function movePlayersToBatch(members, voiceChannel, maxConcurrent = 10) {
    const queue = new PQueue({ concurrency: maxConcurrent });
    const results = { success: [], failed: [] };

    for (const [userId, member] of members) {
      queue.add(async () => {
        try {
          if (!member.voice) {
            results.failed.push({ userId, reason: 'No voice state' });
            return;
          }

          if (member.voice.channelId === voiceChannel.id) {
            results.success.push(userId);
            return;
          }

          await member.voice.setChannel(voiceChannel);
          results.success.push(userId);
        } catch (error) {
          results.failed.push({ userId, reason: error.message });
        }
      });
    }

    await queue.onIdle();
    return results;
  }

  /**
   * OPTIMIZACIÓN 4: PARALLELIZAR QUERIES INDEPENDIENTES
   * 
   * Ejecuta múltiples queries en paralelo
   * await Query1 + await Query2 → Promise.all([Query1, Query2])
   */
  async function parallelQueries(queries) {
    return Promise.all(queries);
  }

  /**
   * OPTIMIZACIÓN 5: BATCH DATABASE UPDATES
   * 
   * Agrupa updates para ejecutarlos en una sola operación
   */
  async function batchUpdatePlayers(Player, updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
      return { acknowledged: false };
    }

    const bulkOps = updates.map(({ userId, update }) => ({
      updateOne: {
        filter: { _id: userId },
        update: { $set: update }
      }
    }));

    return Player.bulkWrite(bulkOps, { ordered: false });
  }

  /**
   * OPTIMIZACIÓN 6: LEAN QUERIES
   * 
   * Obtener solo datos JSON sin overhead de Mongoose
   */
  function optimizeQuery(query) {
    return query.lean();
  }

  /**
   * OPTIMIZACIÓN 7: SELECT ONLY NEEDED FIELDS
   * 
   * Solo traer campos necesarios
   */
  function selectFields(query, fields) {
    return query.select(fields.join(' '));
  }

  /**
   * OPTIMIZACIÓN 8: CLEAR MEMBER CACHE
   * 
   * Limpiar caché después de cambios
   */
  function clearMemberCache(guildId, userId = null) {
    if (userId) {
      const key = `${guildId}:${userId}`;
      memberCache.delete(key);
      memberCacheTimestamps.delete(key);
    } else {
      // Limpiar todo el servidor
      const keys = Array.from(memberCache.keys()).filter(k => k.startsWith(guildId));
      keys.forEach(k => {
        memberCache.delete(k);
        memberCacheTimestamps.delete(k);
      });
    }
  }

  /**
   * OPTIMIZACIÓN 9: GET MEMBER CACHE STATS
   */
  function getCacheStats() {
    return {
      totalCached: memberCache.size,
      maxSize: 10000
    };
  }

  return {
    // Member operations
    getMembers,
    addRolesBatch,
    movePlayersToBatch,
    clearMemberCache,
    getCacheStats,
    
    // Query operations
    parallelQueries,
    optimizeQuery,
    selectFields,
    
    // Database operations
    batchUpdatePlayers,
    
    // Utilities
    PQueue
  };
}

module.exports = createPerformanceOptimizer;
