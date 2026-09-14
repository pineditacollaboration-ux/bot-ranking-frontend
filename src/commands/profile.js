const { EmbedBuilder } = require('discord.js');

module.exports = async function profileCommand(message, ctx) {
  const { client, imageGenerationQueue, buildPlayerCard, hasPermission, config } = ctx;

  // Restricción de canal para !p
  const isStaff = hasPermission(message.member);
  const allowedCommandChannelId = config.allowedCommandChannelId || '1401035609417715775';
  const STREAMER_CATEGORY_ID = '1473558364289241253';
  const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

  const EMOJIS = config.emojis || {};
  if (!isStaff && message.channel.id !== allowedCommandChannelId && !isInStreamerCategory) {
    // [DM DESACTIVADO] Aviso de canal correcto para !p
    // try {
    //   await message.author.send(`${EMOJIS.warning || '⚠️'} El comando \`!p\` solo se puede usar en el canal <#${allowedCommandChannelId}>.`);
    // } catch (e) {
    //   console.warn(`No se pudo enviar DM a ${message.author.tag} sobre el canal de comandos.`);
    // }
    if (message.deletable) await message.delete().catch(() => { });
    return;
  }

  const args = (message.content.split(/\s+/).slice(1) || []);

  // Encontrar usuario objetivo: mención, ID o autor
  let target = message.mentions.users.first()
    || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null)
    || message.author;

  // Encolar generación de tarjeta para evitar bloqueos
  console.log(`[Profile Cmd] User ${message.author.tag} requested profile for ${target.tag}`);
  let pendingMsg;
  
  // Reintentar enviar mensaje inicial hasta 3 veces con timeout
  const sendInitialMessageWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const msg = await Promise.race([
          message.channel.send({ content: `${EMOJIS.loading || '⚙️'} Generando tu tarjeta de perfil, <@${message.author.id}>...` }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 10000)) // 10s timeout
        ]);
        console.log(`[Profile Cmd] Pending message sent, adding to queue...`);
        return msg;
      } catch (err) {
        console.warn(`[Profile Cmd] Send attempt ${i + 1} failed:`, err.message);
        if (i === retries - 1) {
          // Último intento fallido - esperar y retornar null
          console.error('[Profile Cmd] Failed to send initial message after', retries, 'attempts');
          return null;
        }
        // Esperar un poco antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  };
  
  pendingMsg = await sendInitialMessageWithRetry();
  
  if (!pendingMsg) {
    console.warn('[Profile Cmd] Skipping profile generation - cannot reach Discord API');
    return;
  }

  imageGenerationQueue.add(async () => {
    try {
      // Timeout de seguridad de 20 segundos para liberar la cola si algo se cuelga
      const generateTask = async () => {
        const result = await buildPlayerCard(target, message.guild);
        return result;
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('Timeout generador de perfil (90s)'));
        }, 90000) // Aumentado a 90 segundos
      );

      const result = await Promise.race([generateTask(), timeoutPromise]);

      const files = result.files || [];
      const components = result.components || [];
      const embeds = result.embeds || [];
      try {
        if (message.author.id !== target.id && Array.isArray(components)) {
          const patched = components.map((row) => {
            try {
              const comps = row.components.map((c) => (
                c.customId === `perfil_reset_${target.id}` ? c.setDisabled(true) : c
              ));
              return new (row.constructor)().addComponents(...comps);
            } catch (_) {
              return row;
            }
          });
          await pendingMsg.edit({ content: '', files, embeds, components: patched });
          return;
        }
      } catch (_) { }
      await pendingMsg.edit({ content: '', files, embeds, components });
    } catch (e) {
      // Log del error para debugging
      console.error('[Profile Cmd] ERROR:', e);
      await pendingMsg.edit({ content: '❌ Ocurrió un error generando tu tarjeta.' }).catch(() => { });
    }
  });
};
