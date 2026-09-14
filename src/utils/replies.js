// src/utils/replies.js
// Centraliza respuestas ephemerales y temporales para interacciones.

module.exports = function createRepliesUtils({ MessageFlags } = {}) {
  const EPHEMERAL_FLAG = (MessageFlags && MessageFlags.Ephemeral) || (1 << 6);

  async function safeReplyEphemeral(interaction, content) {
    const basePayload = typeof content === 'string' ? { content } : { ...content }; // eslint-disable-line no-irregular-whitespace
    try {
      // Si ya está respondida/deferida, usar followUp directamente
      if (interaction.replied || interaction.deferred) {
        const followPayload = { ...basePayload, flags: EPHEMERAL_FLAG };
        return await interaction.followUp(followPayload).catch(e => {
          // Suppress Unknown Channel errors (common when channel is deleted rapidly)
          if (e.message && (e.message.includes('Unknown Channel') || e.message.includes('Unknown Message'))) {
             return null;
          }
          console.warn(`safeReplyEphemeral (followUp) error: ${e.message}`);
          throw e;
        });
      }
      // Para componentes de mensaje, intentar responder directamente si no está diferida
      if (typeof interaction.isMessageComponent === 'function' && interaction.isMessageComponent()) {
        const replyPayload = { ...basePayload, flags: EPHEMERAL_FLAG };
        try {
          return await interaction.reply(replyPayload);
        } catch (e) {
          // Si falla porque ya fue reconocida (race condition), intentar followUp
          if (e.code === 40060 || (e.message && e.message.includes('already been acknowledged'))) {
             const followPayload = { ...basePayload, flags: EPHEMERAL_FLAG };
             return await interaction.followUp(followPayload).catch(err => {
               if (err.message && (err.message.includes('Unknown Channel') || err.message.includes('Unknown Message'))) return null;
               console.warn(`safeReplyEphemeral (component followUp fallback) error: ${err.message}`);
               throw err;
             });
          }
          console.warn(`safeReplyEphemeral (component reply) error: ${e.message}`);
          throw e;
        }
      }
      // Para comandos/contexto, responder normalmente
      if (typeof interaction.isRepliable === 'function' ? interaction.isRepliable() : true) {
        const replyPayload = { ...basePayload, flags: EPHEMERAL_FLAG };
        return await interaction.reply(replyPayload).catch(e => {
          console.warn(`safeReplyEphemeral (reply) error: ${e.message}`);
          throw e;
        });
      }
      // Fallback si no es repliable
      const followPayload = { ...basePayload, flags: EPHEMERAL_FLAG };
      return await interaction.followUp(followPayload).catch(e => {
        console.warn(`safeReplyEphemeral (final followUp) error: ${e.message}`);
        throw e;
      });
    } catch (e) { // La interacción puede ya no ser válida.
      const msg = e?.message || '';
      console.warn('safeReplyEphemeral error:', msg);
      // Fallback: si la interacción ya no es válida, intentar avisar en el canal
      try {
        if (interaction.channel && interaction.channel.send) {
          const text = typeof content === 'string' ? content : (content?.content || '');
          const warning = await interaction.channel.send({ content: `${interaction.user ? `<@${interaction.user.id}> ` : ''}${text || '⚠️ Ocurrió un error al responder a tu interacción.'}` }).catch(() => null);
          if (warning) setTimeout(() => warning.delete().catch(() => {}), 7000);
        }
      } catch (_) {}
      return null;
    }
  }

  async function tempReply(interaction, replyOptions = {}) {
    const payload = {}; // eslint-disable-line no-irregular-whitespace
    if (replyOptions.content) payload.content = replyOptions.content;
    if (replyOptions.embeds) payload.embeds = replyOptions.embeds;
    if (replyOptions.components) payload.components = replyOptions.components;
    try {
      const isEphemeral = Boolean(replyOptions.ephemeral) || (replyOptions.flags && MessageFlags && replyOptions.flags.includes(MessageFlags.Ephemeral));
      if (isEphemeral) {
        if (interaction.replied || interaction.deferred) {
          const followPayload = { ...payload, flags: EPHEMERAL_FLAG };
          await interaction.followUp(followPayload);
        } else {
          payload.flags = EPHEMERAL_FLAG;
          await interaction.reply(payload).catch(e => console.warn(`tempReply (ephemeral) error: ${e.message}`));
        }
      } else {
        if (interaction.replied || interaction.deferred) {
          const f = await interaction.followUp(payload).catch(() => null);
          if (f) setTimeout(() => f.delete().catch(e => console.warn("No se pudo borrar mensaje de followUp temporal:", e.message)), 5000);
        } else {
          await interaction.reply(payload).catch(e => console.warn(`tempReply (normal) error: ${e.message}`));
          const msg = await interaction.fetchReply().catch(() => null);
          if (msg) setTimeout(() => msg.delete().catch(e => console.warn("No se pudo borrar mensaje temporal:", e.message)), 5000);
        }
      }
    } catch (e) {
      console.warn('tempReply error:', e?.message || e);
    }
  }

  return { safeReplyEphemeral, tempReply };
};
