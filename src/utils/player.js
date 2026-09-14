// src/utils/player.js
// Centraliza utilidades de jugador como ensurePlayerRecord

module.exports = function createPlayerUtils({ Player }) {
  // Caché ligera en memoria para documentos de jugador
  const CACHE_TTL_MS = 2000; // 2s para minimizar riesgo de desactualización
  const playerCache = new Map(); // id -> { doc, ts }

  /**
   * Obtiene el documento de un jugador de la base de datos.
   * Si no existe, lo crea con valores por defecto.
   * @param {string} id - El ID de Discord del jugador.
   * @returns {Promise<import('mongoose').Document>} El documento del jugador.
   */
  async function ensurePlayerRecord(id) {
    const now = Date.now();
    const cached = playerCache.get(id);
    if (cached && (now - cached.ts) < CACHE_TTL_MS) {
      return cached.doc;
    }
    const player = await Player.findByIdAndUpdate(
      id,
      { $setOnInsert: {} },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    playerCache.set(id, { doc: player, ts: now });
    return player;
  }

  /**
   * Obtiene puntos de temporada actual con caché ligera.
   * No crea usuario si no existe; devuelve 0 si falta.
   */
  async function getSeasonPointsCached(id) {
    const now = Date.now();
    const cached = playerCache.get(id);
    if (cached && (now - cached.ts) < CACHE_TTL_MS) {
      return cached.doc?.currentSeason?.points || 0;
    }
    const doc = await Player.findById(id).select('currentSeason.points').lean();
    const points = doc?.currentSeason?.points || 0;
    if (doc) {
      // Guardar una versión mínima en caché para lecturas rápidas
      playerCache.set(id, { doc, ts: now });
    }
    return points;
  }

  /** Invalida entrada en caché para un jugador (por actualizaciones de puntos). */
  function invalidatePlayerCache(id) {
    playerCache.delete(id);
  }

  return { ensurePlayerRecord, getSeasonPointsCached, invalidatePlayerCache };
};