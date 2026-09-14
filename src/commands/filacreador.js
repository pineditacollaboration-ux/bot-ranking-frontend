const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

module.exports = async function filaCreadorCommand(message, args, deps) {
  const {
    BOT_OWNER_ID,
    EmbedBuilder,
    COLORS,
    EMBED_DEFAULTS,
    config,
    queues,
    Queue,
    ActiveQueue,
    sendLog,
    settings,
    QUEUE_TIMEOUT_MINUTES,
    handleQueueTimeout,
    ALLOWED_MODES,
    QUEUE_EMOJIS
  } = deps;

  const EMOJIS = config.emojis || {};
  const CREATOR_ROLE_ID = '1489717134878707713';

  // Validar permisos: solo creador del bot o rol específico
  const isOwner = Array.isArray(BOT_OWNER_ID) 
    ? BOT_OWNER_ID.includes(message.author.id) 
    : message.author.id === BOT_OWNER_ID;
  
  const hasCreatorRole = message.member.roles.cache.has(CREATOR_ROLE_ID);
  
  if (!isOwner && !hasCreatorRole) {
    const errorEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.forbidden || '🚫'} Acceso Denegado`)
      .setDescription('Este comando solo puede ser usado por el creador del bot o usuarios con el rol especial.')
      .setColor(COLORS.ERROR)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [errorEmbed] }).catch(() => {});
  }

  // Validar argumentos: modo y apuesta
  const modeArg = args[0] ? args[0].toLowerCase() : null;
  const wagerArg = args[1] ? parseInt(args[1]) : null;
  const customName = args.slice(2).join(' ') || '';

  // Validar modo (1v1 hasta 6v6)
  const validModes = ['1v1', '2v2', '3v3', '4v4', '5v5', '6v6'];
  if (!modeArg || !validModes.includes(modeArg)) {
    const usageEmbed = new EmbedBuilder()
      .setTitle('Uso Incorrecto del Comando')
      .setDescription('Debes especificar un modo de juego válido y una apuesta.')
      .addFields(
        { name: 'Sintaxis', value: '`!filacreador <modo> <apuesta> [nombre opcional]`' },
        { name: 'Modos Disponibles', value: '`1v1`, `2v2`, `3v3`, `4v4`, `5v5`, `6v6`' },
        { name: 'Ejemplo', value: '`!filacreador 2v2 5000 Fila Especial`' }
      )
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] }).catch(() => {});
  }

  // Validar apuesta
  if (!wagerArg || isNaN(wagerArg) || wagerArg <= 0) {
    const errorEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.error || '❌'} Apuesta Inválida`)
      .setDescription('Debes especificar una cantidad de puntos válida para la apuesta.')
      .addFields(
        { name: 'Ejemplo', value: '`!filacreador 2v2 5000`' }
      )
      .setColor(COLORS.ERROR)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [errorEmbed] }).catch(() => {});
  }

  const channelId = message.channel.id;

  // Verificar si ya existe una fila en este canal
  if (queues.has(channelId)) {
    const errorEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.warning || '⚠️'} Fila Existente`)
      .setDescription('Ya existe una fila activa en este canal.')
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [errorEmbed] }).catch(() => {});
  }

  try {
    // Crear instancia de fila
    const queue = new Queue(modeArg, message.author.id, message.author, message, customName);
    
    // Establecer la apuesta y marcar como fila creadora
    queue.wager.amount = wagerArg;
    queue.wager.accepted.clear();
    queue.wager.accepted.add(message.author.id); // Agregar creador como aceptado automáticamente
    queue.isCreatorQueue = true; // Marcar para permitir apuestas > 50k
    
    queues.set(channelId, queue);
    queue.messageId = null;

    // Iniciar timeout
    const timeoutMinutes = (typeof QUEUE_TIMEOUT_MINUTES === 'number' && QUEUE_TIMEOUT_MINUTES > 0) 
      ? QUEUE_TIMEOUT_MINUTES 
      : 10;
    queue.timeout = setTimeout(() => {
      handleQueueTimeout(channelId);
    }, timeoutMinutes * 60 * 1000);

    // Guardar en DB
    const queueDataForDB = {
      _id: queue.channelId,
      channelId: queue.channelId,
      guildId: queue.guildId,
      customName: queue.customName,
      mode: queue.mode,
      teamSize: queue.teamSize,
      creatorId: queue.creatorId,
      creatorUsername: queue.creatorUsername,
      creatorAvatarURL: queue.creatorAvatarURL,
      messageId: queue.messageId,
      filaCategoryId: queue.filaCategoryId,
      createdAt: new Date().toISOString(),
      wager: { amount: queue.wager.amount, accepted: [message.author.id] }, // Incluir creador como aceptado
      isCreatorQueue: true // Marcar en DB
    };

    await ActiveQueue.findByIdAndUpdate(channelId, queueDataForDB, { upsert: true, new: true }).catch(err => {
      console.error(`[FilaCreador] Error guardando fila en DB:`, err);
    });

    // Crear botones interactivos
    const resolveComponentEmoji = (e) => {
      try {
        if (!e) return e;
        if (typeof e === 'object') {
          const id = e.id || null;
          const cached = id ? message.client?.emojis?.cache?.get(id) : null;
          const name = cached?.name || e.name || 'emoji';
          const animated = (cached?.animated ?? e.animated) ? true : false;
          if (id) return { id, name, animated };
          return e;
        }
        if (typeof e === 'string') {
          const m = e.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
          if (m) {
            const id = m[2];
            const cached = message.client?.emojis?.cache?.get(id);
            const name = cached?.name || m[1] || 'emoji';
            const animated = cached?.animated ? true : e.startsWith('<a:');
            return { id, name, animated };
          }
          if (/^\d+$/.test(e)) {
            const cached = message.client?.emojis?.cache?.get(e);
            const name = cached?.name || 'emoji';
            const animated = cached?.animated ? true : false;
            return { id: e, name, animated };
          }
          const found = message.client?.emojis?.cache?.find(em => em?.name === e);
          if (found) return { id: found.id, name: found.name, animated: !!found.animated };
          return e;
        }
        return e;
      } catch (_) {
        return e;
      }
    };

    const isLikelyUnicodeEmoji = (s) => {
      if (typeof s !== 'string') return false;
      if (s.length > 8) return false;
      if (/[A-Za-z0-9]/.test(s)) return false;
      return true;
    };

    const getResolvedEmoji = (e) => {
      const r = resolveComponentEmoji(e);
      if (!r) return null;
      if (typeof r === 'string') {
        return isLikelyUnicodeEmoji(r) ? r : null;
      }
      if (typeof r === 'object' && r.id) return r;
      return null;
    };

    // Botones de unirse
    const joinBtn1 = new ButtonBuilder()
      .setCustomId(`fila:${channelId}:join:1`)
      .setLabel('Unirse Equipo 1')
      .setStyle(ButtonStyle.Secondary);
    const joinBtn2 = new ButtonBuilder()
      .setCustomId(`fila:${channelId}:join:2`)
      .setLabel('Unirse Equipo 2')
      .setStyle(ButtonStyle.Secondary);
    const leaveBtn = new ButtonBuilder()
      .setCustomId(`fila:${channelId}:leave`)
      .setLabel('Salir de la Fila')
      .setStyle(ButtonStyle.Secondary);
    
    let ej1 = getResolvedEmoji((QUEUE_EMOJIS && QUEUE_EMOJIS.team1Button) || EMOJIS.blue_circle || '🔵');
    let ej2 = getResolvedEmoji((QUEUE_EMOJIS && QUEUE_EMOJIS.team2Button) || EMOJIS.red_circle || '🔴');
    let elv = getResolvedEmoji((QUEUE_EMOJIS && QUEUE_EMOJIS.leaveButton) || EMOJIS.cross_mark || '✖️');
    
    if (typeof ej1 === 'object' && ej1.id && !message.guild.emojis?.cache?.get(ej1.id)) ej1 = EMOJIS.blue_circle || '🔵';
    if (typeof ej2 === 'object' && ej2.id && !message.guild.emojis?.cache?.get(ej2.id)) ej2 = EMOJIS.red_circle || '🔴';
    if (typeof elv === 'object' && elv.id && !message.guild.emojis?.cache?.get(elv.id)) elv = EMOJIS.cross_mark || '✖️';
    
    if (ej1) joinBtn1.setEmoji(ej1);
    if (ej2) joinBtn2.setEmoji(ej2);
    if (elv) leaveBtn.setEmoji(elv);
    
    const joinRow = new ActionRowBuilder().addComponents(joinBtn1, joinBtn2, leaveBtn);

    // Botones de apuesta
    const wagerBtn = new ButtonBuilder()
      .setCustomId(`fila:${channelId}:wager:accept`)
      .setLabel('Aceptar Apuesta')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false) // Habilitado porque la apuesta ya está propuesta
      .setEmoji('1527575250068443146');

    const cancelWagerBtn = new ButtonBuilder()
      .setCustomId(`fila:${channelId}:wager:cancel`)
      .setLabel('Cancelar Apuesta')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJIS.trash || '🗑️')
      .setDisabled(false); // Habilitado para permitir cancelar la apuesta

    const wagerRow = new ActionRowBuilder().addComponents(wagerBtn, cancelWagerBtn);

    // Menú de opciones
    const menuStartEmoji = getResolvedEmoji((QUEUE_EMOJIS && QUEUE_EMOJIS.menuStart) || EMOJIS.start || '🚀');
    const menuWagerEmoji = getResolvedEmoji((QUEUE_EMOJIS && QUEUE_EMOJIS.menuWager) || EMOJIS.money || '💰');
    const menuKickEmoji = getResolvedEmoji((QUEUE_EMOJIS && QUEUE_EMOJIS.menuKick) || EMOJIS.kick || '👢');
    const menuCloseEmoji = getResolvedEmoji((QUEUE_EMOJIS && QUEUE_EMOJIS.menuClose) || EMOJIS.stop || '🛑');

    const getOptionEmoji = (r) => {
      if (!r) return null;
      if (typeof r === 'string') return { name: r };
      if (typeof r === 'object' && r.id) return { id: r.id, animated: !!r.animated };
      return null;
    };

    const options = [];
    const optStart = { label: 'Iniciar partida', description: 'Inicia la partida cuando hay suficientes jugadores', value: 'start' };
    if (menuStartEmoji) optStart.emoji = getOptionEmoji(menuStartEmoji);
    options.push(optStart);
    const optWager = { label: 'Proponer Apuesta', description: 'Propone una apuesta de puntos para la partida', value: 'propose_wager' };
    if (menuWagerEmoji) optWager.emoji = getOptionEmoji(menuWagerEmoji);
    options.push(optWager);
    const optKick = { label: 'Expulsar jugador', description: 'Seleccionar jugador a expulsar', value: 'kick' };
    if (menuKickEmoji) optKick.emoji = getOptionEmoji(menuKickEmoji);
    options.push(optKick);
    const optClose = { label: 'Cerrar fila', description: 'Cerrar y eliminar la fila', value: 'close' };
    if (menuCloseEmoji) optClose.emoji = getOptionEmoji(menuCloseEmoji);
    options.push(optClose);

    const menuRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`fila:${channelId}:menu`)
        .setPlaceholder('⚙️ Opciones de Creador')
        .addOptions(options)
    );

    // Enviar mensaje inicial
    const LOADING_TEXT = `${EMOJIS.loading || '⚙️'} Creando y configurando la fila...`;
    const loadingEmbed = new EmbedBuilder().setDescription(LOADING_TEXT).setColor(COLORS.PRIMARY);
    let sent = await message.channel.send({ embeds: [loadingEmbed] });

    if (sent) {
      queue.messageId = sent.id;

      const components = [joinRow, wagerRow, menuRow];
      let initialEmbed = null;
      try {
        initialEmbed = await queue.buildLightEmbed();
      } catch (_) { }
      const fallbackEmbed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle((queue.customName && queue.customName.trim().length > 0) ? `${queue.mode.toUpperCase()} | Fila: ${queue.customName.trim()}` : `${queue.mode.toUpperCase()} | Fila creada`)
        .setDescription('La fila está lista. Usa los botones para unirte o gestionar.')
        .addFields(
          { name: 'Apuesta Inicial', value: `${wagerArg.toLocaleString()} puntos`, inline: true },
          { name: 'Creador', value: `<@${message.author.id}>`, inline: true }
        )
        .setImage(EMBED_DEFAULTS.thumbnail);
      
      const payload = { embeds: [initialEmbed || fallbackEmbed], components };
      let edited = null;
      {
        let attempt = 0;
        let lastErr = null;
        const MAX = 3;
        while (attempt < MAX) {
          try {
            edited = await sent.edit(payload);
            break;
          } catch (e) {
            lastErr = e;
            const msg = String(e?.message || '').toLowerCase();
            const retryable = msg.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || msg.includes('socket hang up') || msg.includes('connect timeout');
            if (!retryable) break;
            const delay = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
            await new Promise(r => setTimeout(r, delay));
            attempt++;
          }
        }
      }
      if (!edited) {
        try {
          let newMsg = null;
          {
            let attempt = 0;
            let lastErr = null;
            const MAX = 3;
            while (attempt < MAX) {
              try {
                newMsg = await message.channel.send(payload);
                break;
              } catch (e) {
                lastErr = e;
                const msg = String(e?.message || '').toLowerCase();
                const retryable = msg.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || msg.includes('socket hang up') || msg.includes('connect timeout');
                if (!retryable) break;
                const delay = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
              }
            }
          }
          if (newMsg) {
            queue.messageId = newMsg.id;
            await sent.delete().catch(() => { });
          }
        } catch (_) { }
      }
    }

    // Log de creación
    await sendLog(message.guild, new EmbedBuilder()
      .setTitle(`${EMOJIS.battle || '⚔️'} Fila Creada (Comando Especial)`)
      .setDescription(`Fila de **${modeArg.toUpperCase()}** creada por <@${message.author.id}> usando !filacreador.`)
      .addFields(
        { name: 'Apuesta', value: `${wagerArg.toLocaleString()} puntos`, inline: true },
        { name: 'Canal', value: `<#${channelId}>`, inline: true }
      )
      .setColor(COLORS.PRIMARY)
      .setTimestamp(), [], 'queues');

  } catch (error) {
    console.error('[FilaCreador] Error creando fila:', error);
    const errorEmbed = new EmbedBuilder()
      .setTitle(`${EMOJIS.error || '❌'} Error`)
      .setDescription('Ocurrió un error al crear la fila. Por favor, intenta nuevamente.')
      .setColor(COLORS.ERROR)
      .setFooter(EMBED_DEFAULTS.footer);
    await message.channel.send({ embeds: [errorEmbed] }).catch(() => {});
    
    // Limpiar en caso de error
    queues.delete(channelId);
    await ActiveQueue.findByIdAndDelete(channelId).catch(() => {});
  }
};
