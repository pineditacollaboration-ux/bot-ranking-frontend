// Modulariza interacciones de la fila (queue)

module.exports = {
  handleQueueKickSelect: async function (interaction, deps) {
    const { queues, hasPermission, MANAGE_ROLE, client, ActiveQueue, settings, resetQueueTimeout, movePlayerToOriginalVoiceChannel, ActionRowBuilder, QUEUE_EMOJIS, getOrRestoreQueue, excludedFromVoiceMove } = deps;
    const channelId = interaction.customId.split(':')[1];
    const queue = await getOrRestoreQueue(channelId);

    const EMOJIS = (deps.config && deps.config.emojis) || {};
    if (!queue) return interaction.followUp({ content: `${EMOJIS.error || '❌'} La fila ya no existe.`, ephemeral: true }).catch(() => { });
    const isAdmin = hasPermission(interaction.member);
    const isManageRole = MANAGE_ROLE.some(roleId => interaction.member.roles.cache.has(roleId));
    if (interaction.user.id !== queue.creatorId && !isAdmin && !isManageRole) {
      return interaction.editReply({ content: `${EMOJIS.error || '❌'} No tienes permisos para expulsar.` }).catch(() => { });
    }

    const selectedId = interaction.values[0];
    await interaction.deferUpdate().catch(() => { });
    resetQueueTimeout(channelId);

    if (selectedId === queue.creatorId) {
      // Si el creador es expulsado, la fila se cierra.
      queues.delete(queue.channelId);
      clearTimeout(queue.timeout);
      if (queue.hardTimeout) clearTimeout(queue.hardTimeout);
      try {
        const channel = await client.channels.fetch(queue.channelId).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(queue.messageId).catch(() => null);
          const icon = (() => {
            try {
              const token = (QUEUE_EMOJIS && QUEUE_EMOJIS.queueClosed) || EMOJIS.error || '❌';
              if (!token) return EMOJIS.error || '❌';
              if (typeof token === 'object') {
                const id = token.id;
                const cached = id ? client.emojis?.cache?.get(id) : null;
                const name = cached?.name || token.name || 'emoji';
                const animated = (cached?.animated ?? token.animated) ? true : false;
                return `<${animated ? 'a:' : ':'}${name}:${id}>`;
              }
              if (typeof token === 'string' && /^\d+$/.test(token)) {
                const cached = client.emojis?.cache?.get(token);
                const name = cached?.name || 'emoji';
                const animated = cached?.animated ? true : false;
                return `<${animated ? 'a:' : ':'}${name}:${token}>`;
              }
              return token;
            } catch (_) { return EMOJIS.error || '❌'; }
          })();
          if (msg) await msg.edit({ content: `> ${icon} **Fila cerrada:** El creador <@${queue.creatorId}> fue expulsado.`, embeds: [], components: [] }).catch(() => { });
        }
      } catch (e) { console.warn("Error editando mensaje de cierre de fila (kick creator):", e.message); }
      await ActiveQueue.findByIdAndDelete(channelId);
      [...queue.team1, ...queue.team2].forEach(id => settings.busyPlayers.delete(id));
      await interaction.followUp({ content: `${EMOJIS.success || '✅'} El creador fue expulsado y la fila se cerró.`, ephemeral: true });
      return;
    }

    // Lógica para expulsar a un jugador normal.
    settings.busyPlayers.delete(selectedId);
    await ActiveQueue.findByIdAndUpdate(channelId, {
      $pull: { team1: selectedId, team2: selectedId },
      $push: { kicked: selectedId }
    });
    queue.kicked.add(selectedId);
    queue.removeUser(selectedId);

    // Confirmación efímera inmediata para reducir latencia percibida
    await interaction.followUp({ content: `${EMOJIS.success || '✅'} Jugador <@${selectedId}> expulsado de la fila. No podrá volver a unirse.`, ephemeral: true }).catch(() => { });

    try {
      const ch = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (ch) {
        const msg = await ch.messages.fetch(queue.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [await queue.buildLightEmbed()] }).catch(e => console.warn("No se pudo editar el mensaje de fila (kick):", e.message));
      }
    } catch (e) { }

    const prevChannelId = queue.prevVoice[selectedId];
    await movePlayerToOriginalVoiceChannel(interaction.guild, selectedId, prevChannelId, null, excludedFromVoiceMove);

    return; // ya se envió la confirmación efímera
  },

  handleWagerModalSubmit: async function (interaction, deps) {
    const { queues, ActiveQueue, ActionRowBuilder, ButtonBuilder, ComponentType, EmbedBuilder, COLORS, sendLog, ensurePlayerRecord, getOrRestoreQueue, ButtonStyle } = deps;
    const { MessageFlags } = require('discord.js');
    const EMOJIS = (deps.config && deps.config.emojis) || {};
    const channelId = interaction.customId.split(':')[2];
    const queue = await getOrRestoreQueue(channelId);
    // Acknowledge lo antes posible para evitar Unknown interaction
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
    if (!queue) {
      interaction.editReply({ content: `${EMOJIS.warning || '⚠️'} Esta fila ha expirado o sus datos se han perdido.` }).catch(() => { });
      return;
    }

    const amountStr = interaction.fields.getTextInputValue('wager_amount_input');
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount <= 0) {
      return interaction.editReply({ content: `${EMOJIS.warning || '⚠️'} Debes ingresar un número de puntos válido y mayor a cero.` }).catch(() => { });
    }

    // Permitir apuestas > 50k solo si la fila fue creada con !filacreador
    if (amount > 50000 && !queue.isCreatorQueue) {
      return interaction.editReply({ content: `${EMOJIS.warning || '⚠️'} El límite máximo de apuesta por fila es de **50,000 puntos**.` }).catch(() => { });
    }

    // Validar que TODOS los jugadores actuales en la fila tengan suficientes puntos
    const allPlayers = [...(queue.team1 || []), ...(queue.team2 || [])];
    if (allPlayers.length === 0) {
      return interaction.editReply({ content: `${EMOJIS.warning || '⚠️'} No hay jugadores en la fila. Primero llenen los equipos antes de proponer una apuesta.` }).catch(() => { });
    }

    try {
      const playerDocs = await Promise.all(allPlayers.map(id => ensurePlayerRecord(id)));
      const insuficientes = [];
      for (let i = 0; i < allPlayers.length; i++) {
        const doc = playerDocs[i];
        const seasonPoints = doc?.currentSeason?.points || 0;
        if (seasonPoints < amount) {
          insuficientes.push(allPlayers[i]);
        }
      }

      if (insuficientes.length > 0) {
        // No establecer la apuesta ni habilitar el botón de aceptación
        const faltantes = insuficientes.map(id => `<@${id}>`).join(', ');
        return interaction.editReply({
          content: `${EMOJIS.error || '❌'} No se puede proponer una apuesta de **${amount} puntos**. Los siguientes jugadores no tienen suficientes puntos:
${faltantes}`
        }).catch(() => { });
      }
    } catch (e) {
      console.warn('[Wager] Error validando puntos de los jugadores:', e?.message || e);
      return interaction.editReply({ content: `${EMOJIS.warning || '⚠️'} Ocurrió un error al validar los puntos de los jugadores. Intenta de nuevo más tarde.` }).catch(() => { });
    }

    // Todos tienen suficientes puntos: establecer la apuesta y habilitar aceptación
    queue.wager.amount = amount;
    queue.wager.proposerId = interaction.user.id;
    queue.wager.accepted.clear();
    queue.wager.accepted.add(interaction.user.id);

    await ActiveQueue.findByIdAndUpdate(channelId, {
      'wager.amount': amount,
      'wager.accepted': Array.from(queue.wager.accepted)
    });

    // Evitar dependencia de interaction.guild, que puede ser undefined en algunos contextos
    const qChannelId = queue.channelId || interaction.channelId;
    const queueChannel = await interaction.client.channels.fetch(qChannelId).catch(() => null);
    if (queueChannel) {
      const queueMsg = await queueChannel.messages.fetch(queue.messageId).catch((err) => {
        console.warn(`[Wager] No se pudo encontrar el mensaje ${queue.messageId} en el canal ${qChannelId}:`, err.message);
        return null;
      });
      if (queueMsg) {
        const newComponents = queueMsg.components.map(row => {
          const newRow = new ActionRowBuilder();
          let hasAcceptBtn = false;
          let hasCancelBtn = false;

          row.components.forEach(comp => {
            if (comp.type === ComponentType.Button) {
              const button = ButtonBuilder.from(comp);
              // Habilitar botón de aceptar
              if (comp.customId && comp.customId.includes(':wager:accept')) {
                button.setDisabled(false);
                hasAcceptBtn = true;
              }
              // Mostrar y habilitar botón de cancelar para el creador
              if (comp.customId && comp.customId.includes(':wager:cancel')) {
                button.setDisabled(false);
                hasCancelBtn = true;
              }
              newRow.addComponents(button);
            } else {
              newRow.addComponents(comp);
            }
          });

          // Inyectar botón de cancelar si existe el de aceptar pero no el de cancelar
          if (hasAcceptBtn && !hasCancelBtn) {
            const cancelBtn = new ButtonBuilder()
              .setCustomId(`fila:${queue.channelId}:wager:cancel`)
              .setLabel('Cancelar Apuesta')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(EMOJIS.trash || '🗑️')
              .setDisabled(false);
            newRow.addComponents(cancelBtn);
          }
          return newRow;
        });
        await queueMsg.edit({ embeds: [await queue.buildLightEmbed()], components: newComponents });
      }
    }

    return interaction.editReply({ content: `${EMOJIS.success || '✅'} Has propuesto una apuesta de **${amount} puntos**. Todos los jugadores tienen saldo suficiente (temporada actual); ahora pueden aceptarla.` }).catch(() => { });

    // Log de propuesta de apuesta
    try {
      const participants = [...queue.team1, ...queue.team2].map(id => `<@${id}>`).join(', ') || 'Sin jugadores';
      const wagerEmbed = new EmbedBuilder()
        .setTitle('<a:MONEDA:1490919358707536002> Apuesta Propuesta')
        .setDescription(`**Proponente:** <@${interaction.user.id}>\n**Cantidad:** ${amount} puntos\n**Modo:** ${queue.mode.toUpperCase()}\n**Jugadores en fila:** ${participants}`)
        .setColor(COLORS.PRIMARY)
        .setTimestamp();
      sendLog(interaction.guild, wagerEmbed, [], 'queues');
    } catch (e) { console.warn('[Logs] No se pudo enviar log de propuesta de apuesta:', e); }
  },

  // Nuevo: Unirse a equipo mediante botón
  handleQueueJoinButton: async function (interaction, deps) {
    const { queues, settings, EmbedBuilder, COLORS, EMBED_DEFAULTS, ALLOWED_VOICE_CATEGORIES, WAITING_ROOM_VOICE_CHANNEL_ID, BOT_OWNER_ID, blacklistedUsers, ChannelType, sendLog, config, PermissionsBitField, checkTikTokLive, getTikTokLiveStatus, ensureStreamerChannel, Player, ActiveMatch, ActiveQueue, getOrRestoreQueue, excludedFromQueueRestriction } = deps;
    const EMOJIS = (deps.config && deps.config.emojis) || {};
    const parts = interaction.customId.split(':');
    const channelId = parts[1];
    const queue = await getOrRestoreQueue(channelId, deps);
    if (!queue) {
      await interaction.update({ content: `${EMOJIS.error || '❌'} La fila ya no existe.`, components: [] }).catch(() => { });
      return;
    }

    await interaction.deferUpdate().catch(() => { });

    // 1. Check rápido en memoria (busyPlayers)
    if (settings.busyPlayers.has(interaction.user.id)) {
      const inAnyQueue = Array.from(queues.values()).some(q => {
        if (q && typeof q.hasUser === 'function' && q.hasUser(interaction.user.id)) {
          // Verificar si el canal de la fila aún existe en el servidor
          const ch = interaction.guild.channels.cache.get(q.channelId);
          if (!ch) {
            // El canal no existe, por lo tanto es una fila "zombie".
            // No la consideramos válida para bloquear al usuario.
            return false;
          }
          return true;
        }
        return false;
      });

      if (inAnyQueue) {
        return interaction.followUp({ content: `${EMOJIS.error || '❌'} Ya estás en otra fila.`, ephemeral: true }).catch(() => { });
      }
    }

    // 2. Check obligatorio en DB para partidas activas (persistencia tras reinicio)
    const inActiveMatch = await ActiveMatch.findOne({
      $or: [{ team1: interaction.user.id }, { team2: interaction.user.id }],
      closed: false
    }).select('_id');

    if (inActiveMatch) {
      settings.busyPlayers.add(interaction.user.id); // Sincronizar cache
      return interaction.followUp({ content: `${EMOJIS.error || '❌'} Ya estás en una partida activa.`, ephemeral: true }).catch(() => { });
    }

    // 3. Si pasó ambos checks y sigue en busyPlayers, es un estado stale -> limpiar
    if (settings.busyPlayers.has(interaction.user.id)) {
      settings.busyPlayers.delete(interaction.user.id);
    }

    const team = parseInt(parts[3], 10);
    const member = interaction.member;

    // Requisito de roles PC/Móvil para unirse (con exenciones existentes)
    {
      const PC_ROLE_ID = (config && config.pcRoleId) ? config.pcRoleId : '1467729987837755495';
      const MOBILE_ROLE_ID = (config && config.mobileRoleId) ? config.mobileRoleId : '1467729587839439103';
      const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(interaction.user.id) : interaction.user.id === BOT_OWNER_ID;
      const isAdminPerm = member.permissions.has(PermissionsBitField.Flags.Administrator);
      const isExcluded = excludedFromQueueRestriction && excludedFromQueueRestriction.has(interaction.user.id);
      const isExempt = isOwner || isAdminPerm || isExcluded;

      if (!isExempt) {
        // Reglas específicas para canales SOLO PC / SOLO MÓVIL
        if (queue.channelId === '1468732266116157611') {
          if (!member.roles.cache.has(PC_ROLE_ID)) {
            return interaction.followUp({ content: `${EMOJIS.forbidden || '🚫'} Esta fila es **SOLO PARA PC**. Necesitas el rol de PC para unirte.`, ephemeral: true }).catch(() => { });
          }
        } else if (queue.channelId === '1468731929963528306') {
          if (!member.roles.cache.has(MOBILE_ROLE_ID)) {
            return interaction.followUp({ content: `${EMOJIS.forbidden || '🚫'} Esta fila es **SOLO PARA MÓVIL**. Necesitas el rol de Móvil para unirte.`, ephemeral: true }).catch(() => { });
          }
        } else {
          // Regla general para otras filas
          const hasPcOrMobileRole = member.roles.cache.has(PC_ROLE_ID) || member.roles.cache.has(MOBILE_ROLE_ID);
          if (!hasPcOrMobileRole) {
            const needRoleEmbed = new EmbedBuilder()
              .setTitle(`${EMOJIS.forbidden || '🚫'} Falta de Rol Requerido`)
              .setDescription(`Necesitas tener el rol de **PC** o **Móvil** para unirte o crear filas.\nPídelo en <#1431802010256150660>.`)
              .setColor(COLORS.ERROR)
              .setFooter(EMBED_DEFAULTS.footer);
            return interaction.followUp({ embeds: [needRoleEmbed], ephemeral: true }).catch(() => { });
          }
        }
      }
    }

    if (!member.voice?.channel) {
      const noVoiceEmbed = new EmbedBuilder()
        .setDescription(`${EMOJIS.warning || '⚠️'} Debes estar conectado a un canal de voz permitido para unirte a un equipo.`)
        .setColor(COLORS.WARNING)
        .setFooter(EMBED_DEFAULTS.footer);
      return interaction.followUp({ embeds: [noVoiceEmbed], ephemeral: true }).catch(() => { });
    }

    if (config && config.testQueueChannelId && queue.channelId === config.testQueueChannelId) {
      const allowed = Array.isArray(config.testAllowedRoles) ? config.testAllowedRoles : [];
      const hasTestRole = allowed.length ? member.roles.cache.some(r => allowed.includes(r.id)) : false;
      const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(interaction.user.id) : interaction.user.id === BOT_OWNER_ID);
      if (!hasTestRole && !isAdmin) {
        const rolesDisplay = allowed.map(id => `<@&${id}>`).join(' ') || '—';
        return interaction.followUp({ content: `${EMOJIS.forbidden || '🚫'} Este canal de PRUEBAS solo puede ser usado por: ${rolesDisplay}.`, ephemeral: true }).catch(() => { });
      }
    }

    const QUEUE_DESAFIO_CHANNELS = ['1548203229270253608', '1548203231799287911', '1548203233774673940'];
    const WAITING_CHANNELS = [
      '1548203236131868712', '1548203237545615424', '1548203240334823505',
      '1548203242616520714', '1548203244935843860', '1548203246701514792',
      '1548203250715725889', '1548203253186039858', '1548203255446769724',
      '1548203256776237137'
    ];
    const ALL_QUEUE_CHANNELS = [...QUEUE_DESAFIO_CHANNELS, ...WAITING_CHANNELS, '1548203227948777542'];
    const isQueueChannel = ALL_QUEUE_CHANNELS.includes(queue.channelId);

    if (ALLOWED_VOICE_CATEGORIES.length > 0 && !ALLOWED_VOICE_CATEGORIES.includes(member.voice.channel?.parentId) && !isQueueChannel) {
      const noCategoryEmbed = new EmbedBuilder()
        .setDescription(`${EMOJIS.error || '❌'} Solo puedes unirte a filas desde canales de voz en categorías permitidas.`)
        .setColor(COLORS.ERROR)
        .setFooter(EMBED_DEFAULTS.footer);
      return interaction.followUp({ embeds: [noCategoryEmbed], ephemeral: true }).catch(() => { });
    }

    if (queue.hasUser(interaction.user.id)) {
      return interaction.followUp({ content: `${EMOJIS.warning || '⚠️'} Ya estás en un equipo. Debes salir primero para cambiarte.`, ephemeral: true }).catch(() => { });
    }
    if (queue.kicked.has(interaction.user.id)) {
      return interaction.followUp({ content: `${EMOJIS.error || '❌'} Has sido expulsado de esta fila y no puedes volver a unirte.`, ephemeral: true }).catch(() => { });
    }

    if (blacklistedUsers.has(interaction.user.id) && !(Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(interaction.user.id) : interaction.user.id === BOT_OWNER_ID)) {
      return interaction.followUp({ content: `${EMOJIS.error || '❌'} Estás en la lista negra y no puedes unirte a las filas.`, ephemeral: true }).catch(() => { });
    }

    if (queue.isFullTeam(team)) {
      return interaction.followUp({ content: `${EMOJIS.error || '❌'} El Equipo ${team === 1 ? 'Rojo' : 'Negro'} ya está completo.`, ephemeral: true }).catch(() => { });
    }
    if (queue.locked && interaction.user.id !== queue.creatorId) {
      return interaction.followUp({ content: `${EMOJIS.lock || '🔒'} La fila está bloqueada por el creador y no admite nuevos jugadores.`, ephemeral: true }).catch(() => { });
    }

    // Verificar puntos si la fila tiene apuesta activa
    if (queue.wager && queue.wager.amount > 0 && Player) {
      try {
        const playerDoc = await Player.findById(interaction.user.id).lean().catch(() => null);
        const seasonPoints = playerDoc?.currentSeason?.points || 0;
        if (seasonPoints < queue.wager.amount) {
          return interaction.followUp({
            content: `${EMOJIS.error || '❌'} No puedes unirte: esta fila tiene una apuesta de **${queue.wager.amount} puntos** y tú solo tienes **${seasonPoints} puntos** en la temporada actual.`,
            ephemeral: true
          }).catch(() => { });
        }
      } catch (_) { /* Si falla, dejar pasar para no bloquear al usuario innecesariamente */ }
    }

    try {
      const prev = member.voice.channelId || null;
      queue.prevVoice = queue.prevVoice || {};
      queue.prevVoice[interaction.user.id] = prev;
      settings.busyPlayers.add(interaction.user.id);
    } catch (e) { }

    queue.addToTeam(team, interaction.user.id);

    // PERSISTENCIA: Actualizar DB para recuperar estado si hay reinicio
    ActiveQueue.findByIdAndUpdate(channelId, {
      $set: {
        team1: queue.team1,
        team2: queue.team2,
        [`prevVoice.${interaction.user.id}`]: queue.prevVoice[interaction.user.id]
      }
    }).catch(e => console.error(`[Queue Join] Error guardando estado en DB para ${channelId}:`, e));

    // Confirmación efímera inmediata para reducir latencia percibida
    const teamName = team === 1 ? 'Rojo' : 'Negro';
    await interaction.followUp({ content: `${EMOJIS.success || '✅'} Te uniste al Equipo ${teamName}.`, ephemeral: true }).catch(() => { });

    // Luego se actualiza el embed de la fila
    const queueMsg = await interaction.channel.messages.fetch(queue.messageId).catch(() => null);
    if (queueMsg) {
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await queueMsg.edit({ embeds: [await queue.buildLightEmbed()] });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = String(e?.message || '').toLowerCase();
          const retryable = msg.includes('connect timeout') || msg.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || msg.includes('socket hang up');
          if (!retryable) break;
          const delay = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      if (lastErr) console.warn("No se pudo editar el mensaje de fila (join):", lastErr.message);
    }

    // Enviar log de unión a la fila
    try {
      const logEmbed = new EmbedBuilder()
        .setTitle('👥 Jugador se unió a la fila')
        .setDescription(`**Jugador:** <@${interaction.user.id}>\n**Equipo:** ${teamName}\n**Modo:** ${queue.mode.toUpperCase()}`)
        .setColor(COLORS.PRIMARY)
        .setTimestamp();
      sendLog(interaction.guild, logEmbed, [], 'queues');
    } catch (e) {
      console.warn('[Logs] No se pudo enviar log de unión a la fila:', e);
    }

    // Verificar si el usuario está en vivo en TikTok (async, no bloqueante)
    if (typeof checkTikTokLive === 'function') {
      checkTikTokLive(interaction.user.id, interaction.guild, settings).catch(e => console.error('Error en checkTikTokLive:', e));
    }
    // Si el usuario se unió y está en directo, crear canal personalizado
    if (typeof getTikTokLiveStatus === 'function' && typeof ensureStreamerChannel === 'function') {
      try {
        const player = await Player.findById(interaction.user.id).catch(() => null);
        if (player && player.tiktokUsername) {
          const liveStatus = await getTikTokLiveStatus(player.tiktokUsername).catch(() => ({ isLive: false }));
          if (liveStatus.isLive) {
            await ensureStreamerChannel(interaction.guild, interaction.user.id).catch(err =>
              console.error('Error creando canal de streamer tras join:', err)
            );
          }
        }
      } catch (_) { /* silencioso */ }
    }

    return;
  },

  // Nuevo: Aceptar apuesta mediante botón
  handleQueueWagerAccept: async function (interaction, deps) {
    const { queues, ensurePlayerRecord, EmbedBuilder, COLORS, sendLog, getOrRestoreQueue, ActionRowBuilder, ActiveQueue } = deps;
    const EMOJIS = (deps.config && deps.config.emojis) || {};
    const parts = interaction.customId.split(':');
    const channelId = parts[1];
    const queue = await getOrRestoreQueue(channelId, deps);
    // Acknowledge actualización del botón antes de cualquier respuesta efímera
    await interaction.deferUpdate().catch(() => { });
    if (!queue) {
      interaction.followUp({ content: `${EMOJIS.warning || '⚠️'} La fila ya no existe.`, ephemeral: true }).catch(() => { });
      return;
    }

    if (queue.wager.amount === 0) {
      return interaction.followUp({ content: `${EMOJIS.warning || '⚠️'} No hay ninguna apuesta activa para aceptar.`, ephemeral: true }).catch(() => { });
    }
    if (!queue.hasUser(interaction.user.id)) {
      return interaction.followUp({ content: `${EMOJIS.warning || '⚠️'} Debes estar en la fila para aceptar la apuesta.`, ephemeral: true }).catch(() => { });
    }


    const player = await ensurePlayerRecord(interaction.user.id);
    const seasonPoints = player?.currentSeason?.points || 0;
    if (seasonPoints < queue.wager.amount) {
      return interaction.followUp({ content: `${EMOJIS.error || '❌'} No tienes suficientes puntos para aceptar esta apuesta. Necesitas ${queue.wager.amount} y tienes ${seasonPoints}.`, ephemeral: true }).catch(() => { });
    }

    queue.wager.accepted.add(interaction.user.id);

    // Persistencia en DB
    await ActiveQueue.findByIdAndUpdate(channelId, {
      'wager.accepted': Array.from(queue.wager.accepted)
    }).catch(e => console.error(`[Wager Accept] Error guardando en DB para ${channelId}:`, e));

    // Confirmación efímera inmediata
    await interaction.followUp({ content: `${EMOJIS.success || '✅'} Has aceptado la apuesta.`, ephemeral: true }).catch(() => { });

    // Log de aceptación de apuesta
    try {
      const acceptEmbed = new EmbedBuilder()
        .setTitle(`<a:MONEDA:1490919358707536002> Apuesta Aceptada`)
        .setDescription(`**Jugador:** <@${interaction.user.id}>\n**Cantidad:** ${queue.wager.amount} puntos\n**Modo:** ${queue.mode.toUpperCase()}`)
        .setColor(COLORS.SUCCESS)
        .setTimestamp();
      sendLog(interaction.guild, acceptEmbed, [], 'queues');
    } catch (e) { console.warn('[Logs] No se pudo enviar log de aceptación de apuesta:', e); }

    try {
      const qChannelId = queue.channelId || interaction.channelId;
      const ch = await interaction.client.channels.fetch(qChannelId).catch(() => null);
      if (ch && ch.messages && typeof ch.messages.fetch === 'function') {
        const msg = await ch.messages.fetch(queue.messageId).catch(() => null);
        if (msg) {
          // Re-build components from the latest message to avoid losing other button states
          const newComponents = msg.components ? msg.components.map(row => {
            const newRow = ActionRowBuilder.from(row);
            return newRow;
          }) : [];
          await msg.edit({ embeds: [await queue.buildLightEmbed()], components: newComponents }).catch(e => console.warn("No se pudo editar el mensaje de fila (wager accept):", e.message));
        }
      }
    } catch (e) {
      console.error("Error actualizando embed de apuesta:", e);
    }

    return; // ya se envió la confirmación efímera
  },

  handleQueueWagerCancel: async function (interaction, deps) {
    const { queues, ActiveQueue, ActionRowBuilder, ButtonBuilder, ComponentType, sendLog, EmbedBuilder, COLORS, getOrRestoreQueue } = deps;
    const EMOJIS = (deps.config && deps.config.emojis) || {};
    const parts = interaction.customId.split(':');
    const channelId = parts[1];
    const queue = await getOrRestoreQueue(channelId, deps);

    if (!queue) {
      return interaction.followUp({ content: `${EMOJIS.warning || '⚠️'} La fila ya no existe.`, ephemeral: true }).catch(() => { });
    }

    if (interaction.user.id !== queue.creatorId) {
      return interaction.followUp({ content: `${EMOJIS.error || '❌'} Solo el creador de la fila puede cancelar la apuesta.`, ephemeral: true }).catch(() => { });
    }

    if (queue.wager.amount === 0) {
      return interaction.followUp({ content: `${EMOJIS.warning || '⚠️'} No hay ninguna apuesta activa para cancelar.`, ephemeral: true }).catch(() => { });
    }

    // Acknowledge
    await interaction.deferUpdate().catch(() => { });

    // Guardar valor anterior para el log
    const oldAmount = queue.wager.amount;

    // Resetear apuesta
    queue.wager.amount = 0;
    queue.wager.proposerId = null;
    queue.wager.accepted.clear();

    await ActiveQueue.findByIdAndUpdate(channelId, {
      'wager.amount': 0,
      'wager.accepted': []
    });

    // Actualizar botones (deshabilitar aceptar y cancelar)
    const queueChannel = await interaction.client.channels.fetch(queue.channelId).catch(() => null);
    if (queueChannel) {
      const queueMsg = await queueChannel.messages.fetch(queue.messageId).catch(() => null);
      if (queueMsg) {
        const newComponents = queueMsg.components.map(row => {
          const newRow = new ActionRowBuilder();
          row.components.forEach(comp => {
            if (comp.type === ComponentType.Button) {
              const button = ButtonBuilder.from(comp);
              if (comp.customId && (comp.customId.includes(':wager:accept') || comp.customId.includes(':wager:cancel'))) {
                button.setDisabled(true);
              }
              newRow.addComponents(button);
            } else {
              newRow.addComponents(comp);
            }
          });
          return newRow;
        });
        await queueMsg.edit({ embeds: [await queue.buildLightEmbed()], components: newComponents });
      }
    }

    await interaction.followUp({ content: `${EMOJIS.success || '✅'} La apuesta ha sido cancelada.`, ephemeral: true }).catch(() => { });

    // Log de cancelación
    try {
      const cancelEmbed = new EmbedBuilder()
        .setTitle(`<a:MONEDA:1490919358707536002> Apuesta Cancelada`)
        .setDescription(`**Cancelada por:** <@${interaction.user.id}>\n**Monto cancelado:** ${oldAmount} puntos\n**Modo:** ${queue.mode.toUpperCase()}`)
        .setColor(COLORS.WARNING)
        .setTimestamp();
      sendLog(interaction.guild, cancelEmbed, [], 'queues');
    } catch (e) { console.warn('[Logs] No se pudo enviar log de cancelación de apuesta:', e); }
  },

  // Nuevo: Salir de la fila mediante botón
  handleQueueLeaveButton: async function (interaction, deps) {
    const { queues, ActiveQueue, settings, client, movePlayerToOriginalVoiceChannel, sendLog, EmbedBuilder, COLORS, safeReplyEphemeral, getOrRestoreQueue, excludedFromVoiceMove } = deps;
    const EMOJIS = (deps.config && deps.config.emojis) || {};
    const parts = interaction.customId.split(':');
    const channelId = parts[1];
    const queue = await getOrRestoreQueue(channelId);
    if (!queue) {
      interaction.followUp({ content: `${EMOJIS.warning || '⚠️'} Esta fila ha expirado o sus datos se han perdido.`, ephemeral: true }).catch(() => { });
      return;
    }

    // Acknowledge rápido para evitar "Interacción fallida" si las operaciones tardan
    await interaction.deferUpdate().catch(() => { });

    if (interaction.user.id === queue.creatorId) {
      queues.delete(queue.channelId);
      [...queue.team1, ...queue.team2].forEach(id => settings.busyPlayers.delete(id));
      await ActiveQueue.findByIdAndDelete(channelId).catch(e => console.error(`[Fila Leave] Error eliminando fila ${channelId} de la DB:`, e));

      clearTimeout(queue.timeout);
      if (queue.hardTimeout) clearTimeout(queue.hardTimeout);
      try {
        const channel = await client.channels.fetch(queue.channelId).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(queue.messageId).catch(() => null);
          if (msg) await msg.edit({ content: `> **Fila cerrada:** El creador <@${queue.creatorId}> abandonó la sala.`, embeds: [], components: [] }).catch(() => { });
        }
      } catch (e) { console.warn("Error editando mensaje de cierre de fila (leave creator):", e.message); }
      return safeReplyEphemeral(interaction, `${EMOJIS.success || '✅'} Saliste de la fila y, como eras el creador, esta se cerró.`);
    }

    const prevChannelId = queue.prevVoice[interaction.user.id];
    await movePlayerToOriginalVoiceChannel(interaction.guild, interaction.user.id, prevChannelId, null, excludedFromVoiceMove);
    queue.removeUser(interaction.user.id);
    settings.busyPlayers.delete(interaction.user.id);

    await ActiveQueue.findByIdAndUpdate(channelId, {
      $pull: { team1: interaction.user.id, team2: interaction.user.id, 'wager.accepted': interaction.user.id },
      $unset: { [`prevVoice.${interaction.user.id}`]: "" }
    });

    const guild = client.guilds.cache.get(queue.guildId);
    if (guild) {
      sendLog(guild, new EmbedBuilder().setTitle('🚶 Jugador salió de la fila').setDescription(`<@${interaction.user.id}> salió de la fila de ${queue.mode.toUpperCase()}.`).setColor(COLORS.WARNING).setTimestamp(), [], 'queues');
    }

    try {
      const ch = await client.channels.fetch(queue.channelId).catch(() => null);
      if (ch) {
        const msg = await ch.messages.fetch(queue.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [await queue.buildLightEmbed()] }).catch(e => console.warn("No se pudo editar el mensaje de fila (leave):", e.message));
      }
    } catch (e) {
      console.warn("Error editando mensaje de fila (leave):", e.message);
    }

    // Feedback al usuario para evitar "Interacción fallida" y confirmar salida
    await safeReplyEphemeral(interaction, `${EMOJIS.success || '✅'} Saliste de la fila.`).catch(() => { });
  }
};
