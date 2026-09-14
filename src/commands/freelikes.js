const { EmbedBuilder } = require('discord.js');

// Map para rastrear cooldowns por usuario (prevenir duplicación)
const userCooldowns = new Map();
const COOLDOWN_MS = 3000; // 3 segundos de cooldown

async function freelikes(message, args, { BOT_OWNER_ID, COLORS, EMBED_DEFAULTS, sendLog }) {
  try {
    // Restrict to bot owners (supports array or single value)
    const isOwner = Array.isArray(BOT_OWNER_ID)
      ? BOT_OWNER_ID.includes(message.author.id)
      : message.author.id === BOT_OWNER_ID;

    if (!isOwner) {
      return message.reply({ content: '🚫 Este comando es exclusivo para dueños del bot.' });
    }

    // Sistema de cooldown para prevenir duplicación
    const userId = message.author.id;
    const now = Date.now();
    const lastUsed = userCooldowns.get(userId);

    if (lastUsed && (now - lastUsed) < COOLDOWN_MS) {
      // Silenciosamente ignorar si está en cooldown (evitar spam)
      return;
    }

    // Actualizar timestamp del último uso
    userCooldowns.set(userId, now);

    const uid = (args && args[0]) ? args[0].trim() : null;
    if (!uid || !/^\d{5,}$/.test(uid)) {
      return message.reply({ content: 'Uso: `!freelikes <UID>` — proporciona un UID válido (solo números).' });
    }

    const region = 'NA'; // Región fija según ejemplo
    const apiKey = 'Lianmarco00';
    const url = `https://likes.api.freefireofficial.com/api/${region}/${encodeURIComponent(uid)}?key=${encodeURIComponent(apiKey)}`;

    // Realizar solicitud a la API
    const res = await fetch(url, { method: 'GET' });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }

    // --- Error HTTP o cuerpo no parseable: mostrar el mensaje real de la API ---
    if (!res.ok || !data) {
      const guildIcon = message.guild?.iconURL({ dynamic: true }) || EMBED_DEFAULTS.footer.iconURL;

      // Extraer mensaje de la API: usar `data.message`/`data.error` si existe; si no, leer texto bruto
      let apiMessage = null;
      if (data && typeof data.message === 'string' && data.message.trim()) {
        apiMessage = data.message.trim();
      } else if (data && typeof data.error === 'string' && data.error.trim()) {
        apiMessage = data.error.trim();
      } else if (!data) {
        try {
          const rawText = await res.text();
          apiMessage = rawText?.trim();
        } catch (_) {
          apiMessage = null;
        }
      }

      // Traducción del mensaje real de la API (casos comunes)
      let translated = null;
      if (apiMessage) {
        const lower = apiMessage.toLowerCase();
        // Capturar "Try after ..." para mantener la hora/región
        const retryMatch = apiMessage.match(/Try after\s+([^\n]+)/i);
        const retryText = retryMatch && retryMatch[1] ? retryMatch[1].trim() : null;

        if (lower.includes('already used today')) {
          translated = `UID ${uid} ya recibió likes hoy.${retryText ? ` Intenta después de ${retryText}.` : ''}`;
        } else if (lower.includes('invalid uid')) {
          translated = 'UID inválido. Verifica que el número sea correcto.';
        }
      }

      // Pista opcional según código
      let hint = null;
      if (res.status === 403) {
        hint = 'Posibles causas: clave inválida o región incorrecta para el UID, límite global alcanzado, o bloqueo temporal.';
      } else if (res.status === 429) {
        hint = 'Demasiadas solicitudes (429). Espera un momento y vuelve a intentar.';
      } else if (res.status === 401) {
        hint = 'No autorizado (401). Verifica la key utilizada.';
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setAuthor({ name: '❌ Error de API • NA', iconURL: guildIcon })
        .setTitle('❌ No se pudo procesar la solicitud')
        .setDescription(translated || apiMessage || `HTTP ${res.status} — No se pudo procesar la respuesta.`)
        .setThumbnail(EMBED_DEFAULTS.thumbnail)
        .addFields(
          ...(hint ? [{ name: 'Sugerencia', value: hint, inline: false }] : []),
          { name: 'Código HTTP', value: `\`${String(res.status)}\``, inline: true },
          { name: 'UID', value: `\`${uid}\``, inline: true },
          { name: '📍 Región', value: `\`${region}\``, inline: true },
          ...(apiMessage ? [{ name: 'Mensaje de la API', value: apiMessage, inline: false }] : [])
        )
        .setFooter(EMBED_DEFAULTS.footer)
        .setTimestamp();

      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const status = Number(data.status);

    // Manejo de respuestas
    if (status === 1 && data.response) {
      const r = data.response;
      const guildIcon = message.guild?.iconURL({ dynamic: true }) || EMBED_DEFAULTS.footer.iconURL;
      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setAuthor({ name: '💙 Free Likes • NA', iconURL: guildIcon })
        .setTitle('💙 +100 Likes Aplicados')
        .setDescription([
          `Se añadieron **${r.LikesGivenByAPI}** likes a **${r.PlayerNickname}** (Lv ${r.PlayerLevel}).`,
          `UID: \`${r.UID}\``
        ].join('\n'))
        .setThumbnail(EMBED_DEFAULTS.thumbnail)
        .addFields(
          { name: 'Antes', value: `\`${String(r.LikesbeforeCommand)}\``, inline: true },
          { name: 'Añadidos', value: `\`+${String(r.LikesGivenByAPI)}\``, inline: true },
          { name: 'Ahora', value: `\`${String(r.LikesafterCommand)}\``, inline: true },
          { name: '🔑 Solicitudes restantes', value: `\`${String(r.KeyRemainingRequests)}\``, inline: true },
          { name: '📍 Región', value: '`NA`', inline: true }
        )
        .setFooter(EMBED_DEFAULTS.footer)
        .setTimestamp();

      await message.channel.send({ embeds: [embed] }).catch(() => {});
      try { await sendLog(message.guild, embed); } catch (_) {}
      return;
    }

    if (status === 3) {
      const rawMsg = typeof data.message === 'string' ? data.message : null;
      let msg = rawMsg || 'La solicitud no fue aceptada.';
      if (rawMsg && /already used today/i.test(rawMsg)) {
        msg = 'Este UID ya recibió likes hoy. Por favor espera 24 horas.';
      } else if (rawMsg && /invalid uid/i.test(rawMsg)) {
        msg = 'UID inválido. Verifica que el número sea correcto.';
      }
      const expiresAtUnix = data.expires_at ? Math.floor(new Date(data.expires_at).getTime() / 1000) : null;
      const guildIcon = message.guild?.iconURL({ dynamic: true }) || EMBED_DEFAULTS.footer.iconURL;
      const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setAuthor({ name: '⏳ Cooldown de Likes • NA', iconURL: guildIcon })
        .setTitle('⏳ Espera requerida')
        .setDescription(msg)
        .setThumbnail(EMBED_DEFAULTS.thumbnail)
        .addFields(
          ...(expiresAtUnix ? [{ name: 'Disponible de nuevo', value: `<t:${expiresAtUnix}:R>`, inline: true }] : []),
          { name: 'UID', value: `\`${uid}\``, inline: true },
          { name: '📍 Región', value: '`NA`', inline: true },
          ...(rawMsg ? [{ name: 'Mensaje de la API', value: rawMsg, inline: false }] : [])
        )
        .setFooter(EMBED_DEFAULTS.footer)
        .setTimestamp();

      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    // Caso genérico para otros status
    const guildIcon = message.guild?.iconURL({ dynamic: true }) || EMBED_DEFAULTS.footer.iconURL;
    const apiMsgGeneric = typeof data.message === 'string' ? data.message : (typeof data.error === 'string' ? data.error : null);
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setAuthor({ name: '❌ Error • NA', iconURL: guildIcon })
      .setTitle('❌ No se pudo añadir likes')
      .setDescription('La API devolvió un error.')
      .setThumbnail(EMBED_DEFAULTS.thumbnail)
      .addFields(
        { name: 'UID', value: `\`${uid}\``, inline: true },
        { name: '📍 Región', value: '`NA`', inline: true },
        ...(apiMsgGeneric ? [{ name: 'Mensaje de la API', value: apiMsgGeneric, inline: false }] : [])
      )
      .setFooter(EMBED_DEFAULTS.footer)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('Error en comando !freelikes:', err);
    await message.reply({ content: '❌ Ocurrió un error al procesar la solicitud.' }).catch(() => {});
  }
}

module.exports = freelikes;