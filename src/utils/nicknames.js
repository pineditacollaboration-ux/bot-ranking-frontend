// src/utils/nicknames.js
// Centraliza la lógica de actualización de apodos y sincronización de rank

module.exports = function createNickUtils({ Player, rankingUtils, RESTJSONErrorCodes, client, excludedFromNickUpdate }) {
  let _pendingUpdateIds = new Set();
  let _debounceHandle = null;
  let _isGlobalSyncRunning = false;
  let _lastGlobalSyncTs = 0;
  let _lastConsoleProgress = '';
  async function tryUpdateNicknameForMember(guild, userId, rankTag, member = null) {
    try {
      // Respetar exentos (!exemptnick)
      if (excludedFromNickUpdate?.has(userId)) return true;

      const playerDoc = await Player.findById(userId).select('noAutoNick wins losses currentSeason customName').lean();
      if (playerDoc?.noAutoNick) return true;

      // Nueva regla: no actualizar nick/rango si no ha jugado ninguna partida
      const hasPlayed = ((playerDoc?.wins || 0) + (playerDoc?.losses || 0)) > 0;
      const hasSeasonPoints = (playerDoc?.currentSeason?.points || 0) > 0;
      if (!hasPlayed && !hasSeasonPoints && !playerDoc.customName) return true;

      member = member || guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      if (!member) return false;

      // Determinación del nombre base: Prioridad a customName
      let base;
      if (playerDoc.customName) {
        base = playerDoc.customName;
      } else {
        const currentNick = member.nickname || member.user.username;
        base = currentNick.replace(/RANK\s*\d+\s*\|\s*/, '').trim();
      }

      const tag = rankTag ? `${rankTag} | ` : '';

      const maxNameLen = 32 - tag.length;
      const trimmedName = base.length > maxNameLen ? base.slice(0, maxNameLen).trim() : base;
      const newNick = `${tag}${trimmedName}`.trim();

      if (member.nickname === newNick) return true;

      if (!member.manageable) {
        return false;
      }
      const shouldRetry = (e) => {
        const msg = String(e?.message || '').toLowerCase();
        return (
          e?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          e?.code === 'ETIMEDOUT' ||
          e?.code === 'ECONNRESET' ||
          e?.code === 'EAI_AGAIN' ||
          e?.status === 429 ||
          msg.includes('timeout') ||
          msg.includes('socket hang up') ||
          msg.includes('connect timeout')
        );
      };
      let attempt = 0;
      while (attempt < 3) {
        try {
          await member.setNickname(newNick);
          return true;
        } catch (e) {
          if (e.code === RESTJSONErrorCodes.MissingPermissions || e.code === RESTJSONErrorCodes.MissingAccess) {
            return false;
          }
          if (!shouldRetry(e) || attempt === 2) {
            console.warn(`No se pudo cambiar el nick de ${userId}: ${e?.message || e}`);
            return false;
          }
          const delay = 700 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
        }
      }
      return false;
    } catch (e) {
      if (e.code !== RESTJSONErrorCodes.MissingPermissions && e.code !== RESTJSONErrorCodes.MissingAccess) {
        console.warn(`No se pudo cambiar el nick de ${userId}: ${e.message}`);
      }
      return false;
    }
  }

  // Soporta dos órdenes de parámetros:
  // (guild, interaction, forceAll) y (guild, forceAll, interaction)
  async function updateNicknamesEfficiently(guild, interactionOrForceAll = null, forceAllOrInteraction = false) {
    let interaction = null;
    let forceAll = false;
    if (typeof interactionOrForceAll === 'boolean') {
      forceAll = interactionOrForceAll;
      interaction = forceAllOrInteraction;
    } else {
      interaction = interactionOrForceAll;
      forceAll = Boolean(forceAllOrInteraction);
    }
    if (_isGlobalSyncRunning) {
      if (interaction && typeof interaction.followUp === 'function') {
        try { await interaction.followUp({ content: '⚙️ Ya hay una sincronización en curso. Esta ejecución fue omitida.' }); } catch (_) {}
      }
      return;
    }
    if (!forceAll && Date.now() - _lastGlobalSyncTs < 5 * 60 * 1000) {
      return;
    }
    const canEdit = interaction && (typeof interaction.editReply === 'function' || (interaction.reply && typeof interaction.reply.edit === 'function'));

    // Fallback seguro para editar el progreso con mocks (reply.edit) o interacciones reales (editReply)
    const safeEdit = async (inter, payload) => {
      try {
        if (!inter) return;
        if (typeof inter.editReply === 'function') {
          return await inter.editReply(payload);
        } else if (inter.reply && typeof inter.reply.edit === 'function') {
          return await inter.reply.edit(payload);
        }
      } catch (e) {
        console.warn('safeEdit error:', e?.message || e);
      }
    };

    // Pequeña utilidad para ceder el event loop y no acaparar la API
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // NUEVO: Reportar progreso también por consola cuando no hay interacción
    const progress = async (text) => {
      try {
        let should = false;
        if (text.includes('Paso 1/3') || text.includes('Paso 2/3') || text.includes('Actualizando apodos (') || text.includes('✅') || text.includes('❌')) should = true;
        const m = text.match(/Paso\s+3\/3:[^\d]*(\d+)\/(\d+)/);
        if (m) {
          const n = parseInt(m[1], 10);
          const t = parseInt(m[2], 10);
          const consoleStep = Math.max(50, Math.min(150, Math.floor(t / 12) || 50));
          if (n % consoleStep === 0 || n === t) should = true;
        }
        if (should && text !== _lastConsoleProgress) {
          console.log(`[Nick Sync] ${text}`);
          _lastConsoleProgress = text;
        }
        if (interaction) {
          await safeEdit(interaction, { content: text, embeds: [], components: [] });
        }
      } catch (_) { }
    };

    try {
      _isGlobalSyncRunning = true;
      _lastConsoleProgress = '';
      // Temporada actual: invalidar y recomputar caché de ranking
      rankingUtils.invalidateSeasonRankCache?.();

      const newRankMap = await rankingUtils.computeSeasonRanking();

      await progress(`⚙️ **Paso 1/3:** Cargando miembros del servidor...`);
      const allMembers = guild.members.cache.size > 0 ? guild.members.cache : await guild.members.fetch();

      await progress(`⚙️ **Paso 2/3:** Comparando ${allMembers.size} miembros con el ranking...`);

      const membersIterable = allMembers.values();
      const humanMemberIds = [...membersIterable]
        .map(m => m instanceof Array ? m[1] : m)
        .filter(m => m && !m.user.bot)
        .map(m => m.id);

      const playersInServer = await Player.find({ _id: { $in: humanMemberIds } })
        .select('lastKnownRank noAutoNick currentSeason customName')
        .lean();
      const playerMap = new Map(playersInServer.map(p => [p._id, p]));

      if (canEdit) await safeEdit(interaction, { content: `⚙️ **Paso 2/3:** Comparando ${humanMemberIds.length} miembros con el ranking...`, embeds: [], components: [] });

      const membersToUpdate = new Map();
      for (const member of allMembers.values()) {
        const player = playerMap.get(member.id);
        const hasPlayed = ((player?.currentSeason?.wins || 0) + (player?.currentSeason?.losses || 0)) > 0;
        if (member.user.bot || !player || player.noAutoNick || (!hasPlayed && !player.customName)) continue;
        // Respetar exentos (!exemptnick)
        if (excludedFromNickUpdate?.has(member.id)) continue;

        const newRank = newRankMap[member.id];

        if (forceAll) {
          const currentNick = member.nickname || member.user.username;
          const match = currentNick.match(/RANK\s*(\d+)/);
          const currentNickRank = match ? parseInt(match[1], 10) : null;
          if (currentNickRank !== (newRank || null)) membersToUpdate.set(member.id, { member, newRank });
        } else {
          if (player.lastKnownRank !== newRank || player.lastKnownRank === null)
            membersToUpdate.set(member.id, { member, newRank });
        }
      }

      // Paso 3/3: Actualización de apodos con progreso incremental
      const isBackgroundCron = !interaction;
      const MAX_BACKGROUND_UPDATES = 250;

      // Para ejecuciones en segundo plano (CRON), limitar cuántos apodos se tocan por ciclo
      if (isBackgroundCron && membersToUpdate.size > MAX_BACKGROUND_UPDATES) {
        const limited = Array.from(membersToUpdate.entries()).slice(0, MAX_BACKGROUND_UPDATES);
        membersToUpdate.clear();
        for (const [id, data] of limited) {
          membersToUpdate.set(id, data);
        }
      }

      let totalToUpdate = membersToUpdate.size;
      await progress(`⚙️ **Paso 3/3:** Actualizando apodos (${totalToUpdate} miembros)...`);

      const bulkOps = [];
      let processed = 0;

      // Configuración de concurrencia: cuántos apodos actualizar en paralelo
      const concurrencyLimit = isBackgroundCron
        ? (totalToUpdate > 200 ? 8 : 12)
        : (totalToUpdate > 500 ? 15 : (totalToUpdate > 200 ? 20 : 30));
      const progressStep = Math.max(50, Math.min(200, Math.floor(totalToUpdate / 8) || 50));
      
      // Convertir a array para procesamiento en lotes
      const updateArray = Array.from(membersToUpdate.entries());
      
      // Procesar en lotes paralelos
      for (let i = 0; i < updateArray.length; i += concurrencyLimit) {
        const batch = updateArray.slice(i, i + concurrencyLimit);
        
        // Procesar este lote en paralelo
        await Promise.all(batch.map(async ([id, { member, newRank }]) => {
          const rankTag = newRank ? `RANK ${newRank}` : '';
          bulkOps.push({ updateOne: { filter: { _id: id }, update: { $set: { lastKnownRank: newRank || null } } } });
          
          try {
            await tryUpdateNicknameForMember(guild, id, rankTag, member);
          } catch (e) {
            // Silenciar errores individuales
          }
        }));
        
        processed += batch.length;
        if (processed % progressStep === 0 || processed === totalToUpdate) {
          await progress(`⚙️ **Paso 3/3:** ${processed}/${totalToUpdate} apodos actualizados...`);
        }
        
        // Solo agregar delay si hay muchos jugadores para evitar rate limits
        if (totalToUpdate > 500 && i + concurrencyLimit < updateArray.length) {
          await delay(50);
        }
      }

      // Ejecutar bulk writes en lotes más pequeños para evitar timeouts
      const BULK_BATCH_SIZE = 100;
      if (bulkOps.length > 0) {
        for (let i = 0; i < bulkOps.length; i += BULK_BATCH_SIZE) {
          const batch = bulkOps.slice(i, i + BULK_BATCH_SIZE);
          let attempt = 0;
          const maxAttempts = 3;
          while (attempt < maxAttempts) {
            try {
              await Player.bulkWrite(batch);
              break;
            } catch (e) {
              attempt++;
              if (attempt === maxAttempts) {
                console.error(`[Nick Sync] Error en bulk write (lote ${i / BULK_BATCH_SIZE + 1}): ${e.message}`);
              } else {
                const delayMs = 1000 * attempt;
                await delay(delayMs);
              }
            }
          }
        }
      }

      await progress(`✅ **Sincronización completada!** Se actualizaron **${totalToUpdate}** apodos afectados.`);
    } catch (e) {
      console.error('Error en updateNicknamesEfficiently:', e);
      await progress(`❌ Ocurrió un error durante la sincronización: ${e.message}`);
    } finally {
      _isGlobalSyncRunning = false;
      _lastGlobalSyncTs = Date.now();
    }
}


async function updateAffectedNicknames(guild, playerIds = []) {
  try {
    for (const id of playerIds || []) _pendingUpdateIds.add(id);
    if (_debounceHandle) clearTimeout(_debounceHandle);
    _debounceHandle = setTimeout(async () => {
      const ids = Array.from(_pendingUpdateIds);
      _pendingUpdateIds.clear();
      _debounceHandle = null;
      if (ids.length === 0) return;

      rankingUtils.invalidateSeasonRankCache?.();
      const newRankMap = await rankingUtils.computeSeasonRanking();

      const bulkOps = [];
      const playersDocs = await Player.find({ _id: { $in: ids } }).select('currentSeason customName').lean();
      const eligibleSet = new Set(playersDocs.filter(p => {
        const played = ((p.currentSeason?.wins || 0) + (p.currentSeason?.losses || 0)) > 0;
        const hasSeasonPoints = (p.currentSeason?.points || 0) > 0;
        return played || hasSeasonPoints || p.customName;
      }).map(p => p._id));

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      let processed = 0;
      const concurrencyLimit = 10; // Procesar 10 jugadores en paralelo

      // Convertir a array para procesamiento en lotes
      const idsArray = Array.from(ids);
      
      for (let i = 0; i < idsArray.length; i += concurrencyLimit) {
        const batch = idsArray.slice(i, i + concurrencyLimit);
        
        // Procesar este lote en paralelo
        await Promise.all(batch.map(async (id) => {
          if (!eligibleSet.has(id) || excludedFromNickUpdate?.has(id)) return;
          
          const newRank = newRankMap[id];
          const rankTag = newRank ? `RANK ${newRank}` : "";
          bulkOps.push({ updateOne: { filter: { _id: id }, update: { $set: { lastKnownRank: newRank || null } } } });
          
          try {
            await tryUpdateNicknameForMember(guild, id, rankTag);
          } catch (e) {
            // Silenciar errores individuales
          }
        }));
        
        processed += batch.length;
      }

      // Ejecutar bulk writes en lotes más pequeños para evitar timeouts
      const BULK_BATCH_SIZE = 100;
      if (bulkOps.length > 0) {
        for (let i = 0; i < bulkOps.length; i += BULK_BATCH_SIZE) {
          const batch = bulkOps.slice(i, i + BULK_BATCH_SIZE);
          let attempt = 0;
          const maxAttempts = 3;
          while (attempt < maxAttempts) {
            try {
              await Player.bulkWrite(batch);
              break;
            } catch (e) {
              attempt++;
              if (attempt === maxAttempts) {
                console.error(`[Nick Update] Error en bulk write (lote ${i / BULK_BATCH_SIZE + 1}): ${e.message}`);
              } else {
                const delayMs = 1000 * attempt;
                await delay(delayMs);
              }
            }
          }
        }
      }
      console.log(`[Nick Update] Se procesaron ${processed} apodos de jugadores que participaron en la partida.`);
    }, 5000);
  } catch (e) {
    console.error('Error en updateAffectedNicknames:', e);
  }
}

return {
  tryUpdateNicknameForMember,
  updateNicknamesEfficiently,
  updateAffectedNicknames,
};
};
