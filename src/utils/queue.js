// src/utils/queue.js
// Centraliza lógica de timeout de filas y su cierre por inactividad.

module.exports = function createQueueUtils({
  queues,
  ActiveQueue,
  Queue,
  client,
  QUEUE_TIMEOUT_MINUTES,
  COLORS,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ComponentType,
  settings,
  movePlayerToOriginalVoiceChannel,
  sendLog,
  QUEUE_EMOJIS,
}) {
  function resolveEmojiTextLocal(token) {
    try {
      if (!token) return '';
      if (typeof token === 'object') {
        const id = token.id;
        const cached = id ? client.emojis?.cache?.get(id) : null;
        const name = cached?.name || token.name || 'emoji';
        const animated = (cached?.animated ?? token.animated) ? true : false;
        return `<${animated ? 'a:' : ':'}${name}:${id}>`;
      }
      if (typeof token === 'string') {
        if (/^\d+$/.test(token)) {
          const cached = client.emojis?.cache?.get(token);
          const name = cached?.name || 'emoji';
          const animated = cached?.animated ? true : false;
          return `<${animated ? 'a:' : ':'}${name}:${token}>`;
        }
        return token;
      }
      return '';
    } catch (_) {
      return '';
    }
  }
  function resetQueueTimeout(channelId) {
    const q = queues.get(channelId);
    if (!q) return;
    if (q.timeout) clearTimeout(q.timeout);
    const timeoutMinutes = (typeof QUEUE_TIMEOUT_MINUTES === 'number' && QUEUE_TIMEOUT_MINUTES > 0) ? QUEUE_TIMEOUT_MINUTES : 10;
    q.timeout = setTimeout(() => {
      handleQueueTimeout(channelId);
    }, timeoutMinutes * 60 * 1000);
  }

  function setHardTimeout(channelId) {
    // DESHABILITADO: No imponer límite duro de tiempo, solo timeout por inactividad.
    // El usuario prefiere que las filas duren indefinidamente mientras se usen.
    return;
  }

  // Tolerar ambas firmas históricas: (channelId) y (guild, queue)
  async function handleQueueTimeout(arg1, arg2) {
    let channelId = null;
    let preQueue = null;
    let preGuild = null;
    try {
        if (typeof arg1 === 'string') {
          channelId = arg1;
        } else {
          preGuild = arg1 || null;
          preQueue = arg2 || null;
          channelId = preQueue?.channelId || null;
        }

        const queue = preQueue || (channelId ? queues.get(channelId) : null);
        if (!queue) return; // ya cerrada o inexistente

        const guild = preGuild || client.guilds.cache.get(queue.guildId) || await client.guilds.fetch(queue.guildId).catch(() => null);

        // Notificar cierre por inactividad
        if (guild && queue?.channelId) {
          sendLog(guild, new EmbedBuilder()
              .setTitle('⏱️ Fila cerrada por inactividad')
              .setDescription(`La fila en <#${queue.channelId}> se cerró por inactividad.`)
              .setColor(COLORS.WARNING)
              .setTimestamp(), [], 'queues');
        }
    
        // Liberar jugadores y restaurar canales de voz previos en paralelo
    const players = [...queue.team1, ...queue.team2];
    const movePromises = players.map(id => {
      const prev = queue.prevVoice instanceof Map ? queue.prevVoice.get(id) : (queue.prevVoice || {})[id];
      return movePlayerToOriginalVoiceChannel(guild, id, prev);
    });
    await Promise.allSettled(movePromises);
    players.forEach(id => settings.busyPlayers.delete(id));

    const closedIcon = resolveEmojiTextLocal((QUEUE_EMOJIS && QUEUE_EMOJIS.queueClosed) || '❌');
    const closedEmbed = new EmbedBuilder().setTitle(`${closedIcon} Fila Cerrada`).setDescription('Esta fila ha sido cerrada por inactividad.').setColor(COLORS.ERROR);

    // Buscar el mensaje original para deshabilitar componentes
    let msg = null;
    try {
      if (queue.channelId && queue.messageId) {
        const ch = await client.channels.fetch(queue.channelId).catch(() => null);
        if (ch && typeof ch.messages?.fetch === 'function') {
          msg = await ch.messages.fetch(queue.messageId).catch(() => null);
        }
      }
    } catch {}

    const disabledComponents = (msg?.components || []).map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(c => {
            const comp = c.type === ComponentType.Button ? ButtonBuilder.from(c) : StringSelectMenuBuilder.from(c);
            newRow.addComponents(comp.setDisabled(true));
        });
        return newRow;
    });

    if (msg && typeof msg.edit === 'function') {
      await msg.edit({ embeds: [closedEmbed], components: disabledComponents }).catch(() => {});
    }
  } catch (err) {
    console.error('[Queue Timeout] Error al cerrar fila por inactividad:', err);
  } finally {
    // Asegurar limpieza de recursos y DB incluso si ocurren errores
    const q = preQueue || (channelId ? queues.get(channelId) : null);
    if (q) {
        if (q.team1 && q.team2) {
            [...q.team1, ...q.team2].forEach(id => settings.busyPlayers.delete(id));
        }
        await ActiveQueue.findByIdAndDelete(q.channelId).catch(() => {});
        queues.delete(q.channelId);
        if (q.timeout) clearTimeout(q.timeout);
        if (q.hardTimeout) clearTimeout(q.hardTimeout);
    }
  }
  }

  async function handleQueueHardTimeout(arg1, arg2) {
    let channelId = null;
    let preQueue = null;
    let preGuild = null;
    try {
        if (typeof arg1 === 'string') {
          channelId = arg1;
        } else {
          preGuild = arg1 || null;
          preQueue = arg2 || null;
          channelId = preQueue?.channelId || null;
        }

        const queue = preQueue || (channelId ? queues.get(channelId) : null);
        if (!queue) return; // ya cerrada o inexistente

        const guild = preGuild || client.guilds.cache.get(queue.guildId) || await client.guilds.fetch(queue.guildId).catch(() => null);

        // Notificar cierre por límite duro
        if (guild && queue?.channelId) {
          sendLog(guild, new EmbedBuilder()
              .setTitle('⏲️ Fila cerrada por falta de inicio')
              .setDescription(`La fila en <#${queue.channelId}> se cerró tras **${QUEUE_TIMEOUT_MINUTES} minutos** sin iniciar.`)
              .setColor(COLORS.WARNING)
              .setTimestamp(), [], 'queues');
        }
    
        // Liberar jugadores y restaurar canales de voz previos en paralelo
        const players = [...queue.team1, ...queue.team2];
        const movePromises = players.map(id => {
          const prev = queue.prevVoice instanceof Map ? queue.prevVoice.get(id) : (queue.prevVoice || {})[id];
          return movePlayerToOriginalVoiceChannel(guild, id, prev);
        });
        await Promise.allSettled(movePromises);
        players.forEach(id => settings.busyPlayers.delete(id));
    
        const closedIcon = resolveEmojiTextLocal((QUEUE_EMOJIS && QUEUE_EMOJIS.queueClosed) || '❌');
        const closedEmbed = new EmbedBuilder().setTitle(`${closedIcon} Fila Cerrada`).setDescription('Esta fila ha sido cerrada por no iniciar dentro del tiempo límite.').setColor(COLORS.ERROR);
    
        // Buscar el mensaje original para deshabilitar componentes
        let msg = null;
        try {
          if (queue.channelId && queue.messageId) {
            const ch = await client.channels.fetch(queue.channelId).catch(() => null);
            if (ch && typeof ch.messages?.fetch === 'function') {
              msg = await ch.messages.fetch(queue.messageId).catch(() => null);
            }
          }
        } catch {}

        const disabledComponents = (msg?.components || []).map(row => {
            const newRow = new ActionRowBuilder();
            row.components.forEach(c => {
                const comp = c.type === ComponentType.Button ? ButtonBuilder.from(c) : StringSelectMenuBuilder.from(c);
                newRow.addComponents(comp.setDisabled(true));
            });
            return newRow;
        });
    
        if (msg && typeof msg.edit === 'function') {
          await msg.edit({ embeds: [closedEmbed], components: disabledComponents }).catch(() => {});
        }
    } catch (err) {
        console.error('[Queue Hard Timeout] Error al cerrar fila por falta de inicio:', err);
    } finally {
        // Asegurar limpieza de recursos y DB incluso si ocurren errores
        const q = preQueue || (channelId ? queues.get(channelId) : null);
        if (q) {
            if (q.team1 && q.team2) {
                [...q.team1, ...q.team2].forEach(id => settings.busyPlayers.delete(id));
            }
            await ActiveQueue.findByIdAndDelete(q.channelId).catch(() => {});
            queues.delete(q.channelId);
            if (q.timeout) clearTimeout(q.timeout);
            if (q.hardTimeout) clearTimeout(q.hardTimeout);
        }
    }
  }

  async function getOrRestoreQueue(channelId) {
    let queue = queues.get(channelId);
    if (!queue && ActiveQueue && Queue) {
        try {
            const queueDoc = await ActiveQueue.findById(channelId).lean();
            if (queueDoc) {
                const mockMessage = {
                  guild: { id: queueDoc.guildId },
                  channel: { parentId: queueDoc.filaCategoryId }
                };
                const mockCreatorUser = {
                  username: queueDoc.creatorUsername,
                  displayAvatarURL: () => queueDoc.creatorAvatarURL
                };
                queue = new Queue(queueDoc.mode, queueDoc.creatorId, mockCreatorUser, mockMessage, queueDoc.customName);
                Object.assign(queue, {
                  ...queueDoc,
                  prevVoice: queueDoc.prevVoice || {},
                  kicked: new Set(queueDoc.kicked || [])
                });
                if (!queue.wager) queue.wager = { amount: 0, proposerId: null, accepted: new Set() };
                const docWager = queueDoc.wager || {};
                queue.wager.amount = docWager.amount || 0;
                queue.wager.accepted = new Set(Array.isArray(docWager.accepted) ? docWager.accepted : []);
                
                queue.channelId = queueDoc.channelId || queueDoc._id;
                
                [...(queue.team1 || []), ...(queue.team2 || [])].forEach(id => settings.busyPlayers.add(id));
                
                queues.set(channelId, queue);
                
                resetQueueTimeout(channelId);
                setHardTimeout(channelId);
            }
        } catch (err) {
            console.error(`[Queue Recovery Utils] Error recuperando fila ${channelId}:`, err);
        }
    }
    return queue;
  }

  return {
    resetQueueTimeout,
    handleQueueTimeout,
    setHardTimeout,
    handleQueueHardTimeout,
    getOrRestoreQueue
  };
};
