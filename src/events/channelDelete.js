module.exports = async function onChannelDelete(channel, deps) {
  const { queues, settings, ActiveQueue, StreamerChannel } = deps;

  // Verificar si el canal eliminado corresponde a una fila activa
  if (queues.has(channel.id)) {
    const queue = queues.get(channel.id);
    console.log(`[Channel Delete] Detectada eliminación del canal de fila ${channel.id}. Limpiando recursos...`);

    // Limpiar jugadores de busyPlayers
    if (queue.team1 && queue.team2) {
      [...queue.team1, ...queue.team2].forEach(id => settings.busyPlayers.delete(id));
    }

    // Eliminar de la base de datos
    try {
      await ActiveQueue.findByIdAndDelete(channel.id);
    } catch (err) {
      console.error(`[Channel Delete] Error eliminando fila ${channel.id} de DB:`, err);
    }

    // Eliminar de la memoria
    queues.delete(channel.id);

    // Limpiar timeouts si existen
    if (queue.timeout) clearTimeout(queue.timeout);
    if (queue.hardTimeout) clearTimeout(queue.hardTimeout);
  }

  // NUEVO: Verificar si el canal eliminado corresponde a un canal de streamer
  if (StreamerChannel) {
    try {
      const deletedDoc = await StreamerChannel.findByIdAndDelete(channel.id);
      if (deletedDoc) {
        console.log(`[Channel Delete] Registro de StreamerChannel eliminado para el canal ${channel.id} (Dueño: ${deletedDoc.ownerUsername})`);
      }
    } catch (err) {
      console.error(`[Channel Delete] Error eliminando StreamerChannel ${channel.id} de DB:`, err);
    }
  }
};
