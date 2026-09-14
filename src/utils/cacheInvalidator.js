/**
 * src/utils/cacheInvalidator.js
 * 
 * Sistema inteligente de invalidación de caché.
 * En lugar de esperar TTL, invalida caché cuando hay cambios reales en los datos.
 * 
 * Uso:
 * const cacheInvalidator = createCacheInvalidator();
 * 
 * // Cuando ocurre un cambio:
 * cacheInvalidator.onMatchCompleted(guildId, affectedPlayerIds);
 * cacheInvalidator.onPointsChanged(playerId);
 * cacheInvalidator.onCoinsChanged(playerId);
 */

const EventEmitter = require('events');

function createCacheInvalidator() {
  const emitter = new EventEmitter();
  
  // Tracking de cambios para evitar invalidaciones repetidas muy seguidas
  const lastInvalidation = new Map();
  const DEBOUNCE_MS = 1000; // Esperar 1s antes de invalidar de nuevo
  
  /**
   * Verifica si debería invalidar (evita spam)
   * @param {string} key - Clave única del caché
   * @returns {boolean}
   */
  function shouldInvalidate(key) {
    const now = Date.now();
    const lastTime = lastInvalidation.get(key) || 0;
    
    if (now - lastTime < DEBOUNCE_MS) {
      return false; // Rechazar invalidación frecuente
    }
    
    lastInvalidation.set(key, now);
    return true;
  }

  /**
   * Evento: Partida completada
   * Invalida ranking global, ranking de temporada, y estadísticas de jugadores
   * @param {string} guildId
   * @param {string[]} affectedPlayerIds - IDs de jugadores afectados
   */
  function onMatchCompleted(guildId, affectedPlayerIds = []) {
    if (!shouldInvalidate(`match:${guildId}`)) return;
    
    // Invalidar rankings (el caché más crítico)
    emitter.emit('invalidate', {
      type: 'ranking',
      scope: 'global',
      guildId,
      priority: 'high'
    });
    
    emitter.emit('invalidate', {
      type: 'ranking',
      scope: 'season',
      guildId,
      priority: 'high'
    });
    
    // Invalidar estadísticas de jugadores afectados
    if (Array.isArray(affectedPlayerIds) && affectedPlayerIds.length > 0) {
      emitter.emit('invalidate', {
        type: 'playerStats',
        scope: 'individual',
        playerIds: affectedPlayerIds,
        priority: 'high'
      });
    }
    
    // Invalidar caché de tendencias
    emitter.emit('invalidate', {
      type: 'trends',
      scope: 'global',
      guildId,
      priority: 'medium'
    });
    
    console.log(`[CacheInvalidator] Partida completada: Invalidadas rankings y stats de ${affectedPlayerIds.length} jugadores`);
  }

  /**
   * Evento: Puntos del jugador cambiaron
   * @param {string} playerId
   */
  function onPointsChanged(playerId) {
    if (!shouldInvalidate(`points:${playerId}`)) return;
    
    // Invalida ranking global (muy importante)
    emitter.emit('invalidate', {
      type: 'ranking',
      scope: 'global',
      priority: 'high'
    });
    
    // Invalida stats individuales
    emitter.emit('invalidate', {
      type: 'playerStats',
      scope: 'individual',
      playerIds: [playerId],
      priority: 'high'
    });
    
    console.log(`[CacheInvalidator] Puntos actualizados: Player ${playerId}`);
  }

  /**
   * Evento: Monedas del jugador cambiaron
   * @param {string} playerId
   */
  function onCoinsChanged(playerId) {
    if (!shouldInvalidate(`coins:${playerId}`)) return;
    
    // Invalida stats del jugador
    emitter.emit('invalidate', {
      type: 'playerStats',
      scope: 'individual',
      playerIds: [playerId],
      priority: 'medium'
    });
    
    console.log(`[CacheInvalidator] Coins actualizadas: Player ${playerId}`);
  }

  /**
   * Evento: Wins/Losses/MVP del jugador cambiaron
   * @param {string} playerId
   * @param {string} guildId
   */
  function onStatsChanged(playerId, guildId) {
    if (!shouldInvalidate(`stats:${playerId}`)) return;
    
    // Invalida ranking global
    emitter.emit('invalidate', {
      type: 'ranking',
      scope: 'global',
      guildId,
      priority: 'high'
    });
    
    // Invalida stats individuales
    emitter.emit('invalidate', {
      type: 'playerStats',
      scope: 'individual',
      playerIds: [playerId],
      priority: 'high'
    });
    
    console.log(`[CacheInvalidator] Stats actualizadas: Player ${playerId}`);
  }

  /**
   * Evento: Miembro del servidor fue removido
   * @param {string} guildId
   */
  function onMemberRemoved(guildId) {
    if (!shouldInvalidate(`member:${guildId}`)) return;
    
    // Invalida ranking global
    emitter.emit('invalidate', {
      type: 'ranking',
      scope: 'global',
      guildId,
      priority: 'medium'
    });
    
    console.log(`[CacheInvalidator] Miembro removido: Invalidado ranking del servidor`);
  }

  /**
   * Evento: Rol temporal fue removido (Champion, etc)
   * @param {string} guildId
   */
  function onTemporaryRoleRemoved(guildId) {
    if (!shouldInvalidate(`role:${guildId}`)) return;
    
    // Invalida todo (menos importante)
    emitter.emit('invalidate', {
      type: 'all',
      guildId,
      priority: 'low'
    });
    
    console.log(`[CacheInvalidator] Rol temporal removido: Invalidados cachés`);
  }

  /**
   * Evento: Temporada finalizada
   * @param {string} guildId
   */
  function onSeasonEnded(guildId) {
    if (!shouldInvalidate(`season:${guildId}`)) return;
    
    // Invalida TODO (cambio masivo)
    emitter.emit('invalidate', {
      type: 'all',
      guildId,
      priority: 'critical'
    });
    
    console.log(`[CacheInvalidator] Temporada finalizada: Invalidados TODOS los cachés`);
  }

  /**
   * Escuchar invalidaciones
   * @param {Function} callback - (invalidationEvent) => {}
   */
  function onInvalidate(callback) {
    emitter.on('invalidate', callback);
  }

  /**
   * Obtener estadísticas de invalidaciones (para debugging)
   */
  function getStats() {
    return {
      lastInvalidations: Object.fromEntries(lastInvalidation),
      debounceMs: DEBOUNCE_MS,
      totalTrackedKeys: lastInvalidation.size
    };
  }

  return {
    onMatchCompleted,
    onPointsChanged,
    onCoinsChanged,
    onStatsChanged,
    onMemberRemoved,
    onTemporaryRoleRemoved,
    onSeasonEnded,
    onInvalidate,
    getStats,
    // Exponer emitter para control avanzado si es necesario
    emitter
  };
}

module.exports = createCacheInvalidator;
