const creatingQueueGuards = new Map();

module.exports = async function filaCommand(message, args, deps) {
  const {
    creatingQueue,
    ALLOWED_MODES,
    ALLOWED_ROLES,
    MANAGE_ROLE,
    BOT_OWNER_ID,
    PermissionsBitField,
    settings,
    config,
    queues,
    matches,
    Queue,
    QUEUE_TIMEOUT_MINUTES,
    handleQueueTimeout,
    handleQueueHardTimeout,
    sendLog,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    COLORS,
    EMBED_DEFAULTS,
    ActiveQueue,
    ActiveMatch,
    ensurePlayerRecord,
    ALLOWED_VOICE_CATEGORIES,
    WAITING_ROOM_VOICE_CHANNEL_ID,
    ROLE_2V2,
    ROLE_1V1,
    TEST_QUEUE_CHANNEL_ID,
    TEST_ALLOWED_ROLES,
    checkTikTokLive,
    getTikTokLiveStatus,
    ensureStreamerChannel,
    excludedFromQueueRestriction
  } = deps;

  const channelId = message.channel?.id;
  if (!channelId) return;

  const EMOJIS = config.emojis || {};
  const STREAMER_CATEGORY_ID = '1497041126987792536'; // Categoría INFLUENCERS

  function clearQueueLock(chId) {
    creatingQueue.delete(chId);
    const t = creatingQueueGuards.get(chId);
    if (t) { clearTimeout(t); creatingQueueGuards.delete(chId); }
  }

  try {
    // Detectar spam del comando !fila y aplicar timeout/aislamiento 5 minutos
    const userId = message.author.id;
    if (creatingQueue.has(channelId)) {
      return message.channel.send(`${EMOJIS.loading || '⚙️'} Ya se está creando una fila en este canal. Por favor, espera un momento.`).catch(() => { });
    }
    creatingQueue.add(channelId);
    const SAFETY_CLEAR_MS = 15 * 1000;
    const prevGuard = creatingQueueGuards.get(channelId);
    if (prevGuard) clearTimeout(prevGuard);
    creatingQueueGuards.set(channelId, setTimeout(() => {
      creatingQueue.delete(channelId);
      creatingQueueGuards.delete(channelId);
    }, SAFETY_CLEAR_MS));

    const modeArg = args[0] ? args[0].toLowerCase() : null;
    const mode = modeArg && ALLOWED_MODES.includes(modeArg) ? modeArg : null;
    const customNameRaw = args.slice(1).join(' ');
    let customName = (modeArg === 'filavv2' && (!customNameRaw || !customNameRaw.trim())) ? 'Modo Vivido 6v6' : customNameRaw;

    if (channelId === '1548203229270253608' && (!customName || !customName.trim())) {
      customName = 'FILA DESAFIO #1';
    } else if (channelId === '1548203231799287911' && (!customName || !customName.trim())) {
      customName = 'FILA DESAFIO #2';
    } else if (channelId === '1548203233774673940' && (!customName || !customName.trim())) {
      customName = 'FILA DESAFIO #3';
    }
    const prefix = (config && config.prefix) || '!';
    if (!mode) {
      const usageE = new EmbedBuilder()
        .setTitle('Uso Incorrecto del Comando')
        .setDescription('Debes especificar un modo de juego válido.')
        .addFields({ name: 'Ejemplo de uso', value: '`!fila 2v2 Nombre de la Fila`' }, { name: 'Modos Disponibles', value: '`1v1`, `2v2`, `3v3`, `4v4`, `5v5`' })
        .setColor(COLORS.WARNING)
        .setFooter(EMBED_DEFAULTS.footer);
      clearQueueLock(channelId);
      return message.channel.send({ embeds: [usageE] });
    }

    // Canal de pruebas: las reglas especiales solo aplican dentro del canal de pruebas,
    // no bloqueamos la creación en canales normales.

    const member = await message.guild.members.fetch(message.author.id).catch(() => message.member);

    // Validar permisos
    const hasGeneralAllowed = member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
    const hasManageRole = member.roles.cache.some(r => MANAGE_ROLE.includes(r.id));
    const isAdminPerm = member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;

    const hasModeRole = (
      (mode === '2v2' && Array.isArray(ROLE_2V2) && ROLE_2V2.some(r => member.roles.cache.has(r))) ||
      (mode === '1v1' && Array.isArray(ROLE_1V1) && ROLE_1V1.some(r => member.roles.cache.has(r))) ||
      ((mode === '3v3' || mode === '4v4') && member.roles.cache.has('1489762472675115189'))

    );

    // Requisito de roles PC/Móvil para usuarios no exentos
    {
      const PC_ROLE_ID = (config && config.pcRoleId) ? config.pcRoleId : '000000000000000000';
      const MOBILE_ROLE_ID = (config && config.mobileRoleId) ? config.mobileRoleId : '000000000000000001';
      const hasPcOrMobileRole = member.roles.cache.has(PC_ROLE_ID) || member.roles.cache.has(MOBILE_ROLE_ID);
      const isExcluded = excludedFromQueueRestriction && excludedFromQueueRestriction.has(message.author.id);
      const isExempt = isOwner || hasManageRole || isAdminPerm || isExcluded;
      if (!isExempt && !hasPcOrMobileRole) {
        const noRoleEmbed = new EmbedBuilder()
          .setTitle(`${EMOJIS.forbidden || '🚫'} Falta de Rol Requerido`)
          .setDescription(`Necesitas tener el rol de **PC** o **Móvil** para crear filas.\nPide tu rol en <#1548247541810733117>.`)
          .setColor(COLORS.ERROR)
          .setFooter(EMBED_DEFAULTS.footer);
        clearQueueLock(channelId);
        return message.channel.send({ embeds: [noRoleEmbed] });
      }
    }

    const isAllowed = isOwner || hasGeneralAllowed || hasManageRole || isAdminPerm || hasModeRole;

    if (!isAllowed) {
      const displayRoles = (arr) => (Array.isArray(arr) && arr.length ? arr.map(id => `<@&${id}>`).join(' ') : '—');
      const ROLE_3V4_SHARED = '1489762472675115189';

      const noPermsE = new EmbedBuilder()
        .setTitle(`${EMOJIS.forbidden || '🚫'} Acceso Denegado`)
        .setDescription('No tienes los roles necesarios para crear una fila competitiva.')
        .addFields(
          { name: '1v1', value: displayRoles(ROLE_1V1), inline: true },
          { name: '2v2', value: displayRoles(ROLE_2V2), inline: true },
          { name: '3v3', value: `<@&${ROLE_3V4_SHARED}>`, inline: true },
          { name: '4v4', value: `<@&${ROLE_3V4_SHARED}>`, inline: true },
          { name: 'Obtén tu rol', value: 'Solicítalo en <#1548247541810733117>.' }
        )
        .setColor(COLORS.ERROR)
        .setFooter(EMBED_DEFAULTS.footer);
      clearQueueLock(channelId);
      return message.channel.send({ embeds: [noPermsE] });
    }

    // Evitar colisiones: solo una fila por servidor, excepto en el canal de PRUEBAS, CANALES DE STREAMER y CANALES INDEPENDIENTES
    const isTestChannel = TEST_QUEUE_CHANNEL_ID && channelId === TEST_QUEUE_CHANNEL_ID;
    const isStreamerChannel = message.channel.parentId === STREAMER_CATEGORY_ID;

    // Canales completamente independientes: cada uno tiene su propia fila sin afectar a los demás
    const INDEPENDENT_CHANNELS = [
      '1548203227948777542', // apostar-puntos
      '1548203229270253608', // fila-desafio #1
      '1548203231799287911', // fila-desafio #2
      '1548203233774673940'  // fila-desafio #3
    ];
    const DESAFIO_CHANNELS = [
      '1548203229270253608', // #1
      '1548203231799287911', // #2
      '1548203233774673940'  // #3
    ];
    const isDesafioChannel = DESAFIO_CHANNELS.includes(channelId);
    const isIndependentChannel = INDEPENDENT_CHANNELS.includes(channelId);

    if (!isTestChannel && !isStreamerChannel && !isIndependentChannel) {
      let existingQueueInServer = null;
      for (const q of queues.values()) {
        // Si la fila existente está en un canal de streamer, pruebas o independiente, no cuenta como colisión para la fila principal
        if (
          q.filaCategoryId === STREAMER_CATEGORY_ID ||
          (TEST_QUEUE_CHANNEL_ID && q.channelId === TEST_QUEUE_CHANNEL_ID) ||
          INDEPENDENT_CHANNELS.includes(q.channelId)
        ) {
          continue;
        }
        if (q.guildId === message.guild.id) {
          existingQueueInServer = q;
          break;
        }
      }
      if (existingQueueInServer) {
        clearQueueLock(channelId);
        return message.channel.send(`${EMOJIS.warning || '⚠️'} Ya existe una fila activa en este servidor en el canal <#${existingQueueInServer.channelId}>. Solo se permite una fila a la vez.`);
      }
    }

    if (isTestChannel && queues.has(channelId)) {
      clearQueueLock(channelId);
      return message.channel.send(`${EMOJIS.warning || '⚠️'} Ya existe una fila activa en este canal de PRUEBAS.`);
    }

    // Canales independientes: solo verificar colisión dentro del mismo canal
    if (isIndependentChannel && queues.has(channelId)) {
      clearQueueLock(channelId);
      const channelNames = {
        '1548203227948777542': 'APOSTAR PUNTOS',
        '1548203229270253608': 'FILA DESAFIO #1',
        '1548203231799287911': 'FILA DESAFIO #2',
        '1548203233774673940': 'FILA DESAFIO #3'
      };
      const msg = channelNames[channelId] || (isStreamerChannel ? 'STREAMER' : 'DESAFIO');
      return message.channel.send(`${EMOJIS.warning || '⚠️'} Ya existe una fila activa en este canal de ${msg}.`);
    }

    if (isStreamerChannel && queues.has(channelId)) {
      clearQueueLock(channelId);
      return message.channel.send(`${EMOJIS.warning || '⚠️'} Ya existe una fila activa en este canal de STREAMER.`);
    }

    // Verificar categoría correcta (permitir bypass si es el canal de pruebas, streamer, o cualquier canal independiente)
    const allowedQueueCategoryId = '1489717338981798050'; // FILA PARTIDAS
    const isBettingQueueChannel = channelId === '1548203227948777542';
    if (!isTestChannel && !isStreamerChannel && !isIndependentChannel) {
      if (!message.channel.parentId || message.channel.parentId !== allowedQueueCategoryId) {
        const errE = new EmbedBuilder()
          .setTitle(`${EMOJIS.forbidden || '🚫'} Canal Incorrecto`)
          .setDescription('Este comando solo puede ser usado en los canales de fila permitidos.')
          .addFields({
            name: 'Canales Permitidos',
            value: [
              '<#1548203229270253608> (Fila Desafío #1)',
              '<#1548203231799287911> (Fila Desafío #2)',
              '<#1548203233774673940> (Fila Desafío #3)',
              '<#1548203227948777542> (Canal de Apostar Puntos)'
            ].join('\n')
          })
          .setColor(COLORS.ERROR)
          .setFooter(EMBED_DEFAULTS.footer);
        clearQueueLock(channelId);
        return message.channel.send({ embeds: [errE] });
      }
    }

    // Validación de roles específicos de PRUEBAS solo si estamos en el canal de pruebas
    // Nota: usamos una comprobación local para evitar errores si no existe isTestChannel en alguna variante.
    {
      const inTestChan = TEST_QUEUE_CHANNEL_ID && channelId === TEST_QUEUE_CHANNEL_ID;
      if (inTestChan && TEST_ALLOWED_ROLES && Array.isArray(TEST_ALLOWED_ROLES) && TEST_ALLOWED_ROLES.length > 0) {
        const isTestRole = message.member.roles.cache.some(r => TEST_ALLOWED_ROLES.includes(r.id));
        const isAdmin = (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID) ||
          message.member.roles.cache.some(r => MANAGE_ROLE.includes(r.id)) ||
          message.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isTestRole && !isAdmin) {
          const displayRoles = TEST_ALLOWED_ROLES.map(id => `<@&${id}>`).join(' ');
          const noTestE = new EmbedBuilder()
            .setTitle(`${EMOJIS.forbidden || '🚫'} Acceso de Pruebas`)
            .setDescription('Para crear filas de PRUEBA debes tener uno de los roles permitidos.')
            .addFields({ name: 'Roles permitidos', value: displayRoles || '—' })
            .setColor(COLORS.ERROR)
            .setFooter(EMBED_DEFAULTS.footer);
          clearQueueLock(channelId);
          return message.channel.send({ embeds: [noTestE] });
        }
      }
    }

    // Verificar que el usuario está en un canal de voz permitido o en la sala de espera específica
    {
      const voiceChan = message.member.voice?.channel || null;
      const inAllowedCategory = voiceChan ? (ALLOWED_VOICE_CATEGORIES.includes(voiceChan.parentId) || ALLOWED_VOICE_CATEGORIES.includes(voiceChan.id)) : false;
      const inWaitingRoom = voiceChan && WAITING_ROOM_VOICE_CHANNEL_ID ? voiceChan.id === WAITING_ROOM_VOICE_CHANNEL_ID : false;
      const isExcluded = excludedFromQueueRestriction && excludedFromQueueRestriction.has(message.author.id);

      if ((ALLOWED_VOICE_CATEGORIES.length > 0 || WAITING_ROOM_VOICE_CHANNEL_ID) && !isExcluded && !isStreamerChannel) {
        if (!voiceChan || (!inAllowedCategory && !inWaitingRoom)) {
          const targetCat = '1489717339518664825';
          // User requested explicit order for these channels
          const explicitOrderIds = [
            '1548203236131868712', // Esperando 1
            '1548203237545615424', // Esperando 2
            '1548203240334823505', // Esperando 3
            '1548203242616520714', // Esperando 4
            '1548203244935843860', // Esperando 5
            '1548203246701514792', // Esperando 6
            '1548203250715725889', // Esperando 7
            '1548203253186039858', // Esperando 8
            '1548203255446769724', // Esperando 9
            '1548203256776237137'  // Esperando 10
          ];
          const channelsList = explicitOrderIds.map(id => `<#${id}>`).join('\n') + '\n...etc';

          const errE = new EmbedBuilder()
            .setTitle(`${EMOJIS.voice_required || '🎙️'} Conexión de Voz Requerida`)
            .setDescription('Para crear una fila, **necesitas estar conectado a un canal de voz válido**.')
            .addFields({
              name: '¿Dónde conectarme?',
              value: 'Puedes unirte a cualquier canal de la categoría **ESPERA**.'
            }, {
              name: 'Canales Recomendados',
              value: channelsList
            })
            .setColor(COLORS.ERROR)
            .setFooter(EMBED_DEFAULTS.footer);
          clearQueueLock(channelId);
          return message.channel.send({ embeds: [errE] });
        }
      }
    }

    // Validación extra si es 2v2 y requiere rol específico
    if (mode === '2v2' && ROLE_2V2 && ROLE_2V2.length > 0) {
      const has2v2Role = ROLE_2V2.some(r => member.roles.cache.has(r));
      const isAdmin = (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID) ||
        MANAGE_ROLE.some(r => member.roles.cache.has(r)) ||
        member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (!has2v2Role && !isAdmin) {
        clearQueueLock(channelId);
        const roles2v2 = (Array.isArray(ROLE_2V2) && ROLE_2V2.length) ? ROLE_2V2.map(id => `<@&${id}>`).join(' ') : '—';
        const help2v2 = new EmbedBuilder()
          .setTitle(`${EMOJIS.forbidden || '🚫'} Rol requerido para 2v2`)
          .setDescription('Para crear una fila 2v2 necesitas el rol autorizado o ser admin.')
          .addFields(
            { name: 'Rol 2v2', value: roles2v2 },
            { name: 'Obtén tu rol', value: 'Pídelo en <#1548247541810733117>.' }
          )
          .setColor(COLORS.ERROR)
          .setFooter(EMBED_DEFAULTS.footer);
        return message.channel.send({ embeds: [help2v2] }).catch(() => { });
      }
    }

    // Validación extra si es 1v1 y requiere rol específico
    if (mode === '1v1' && ROLE_1V1 && ROLE_1V1.length > 0) {
      const has1v1Role = ROLE_1V1.some(r => member.roles.cache.has(r));
      const isAdmin = (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID) ||
        MANAGE_ROLE.some(r => member.roles.cache.has(r)) ||
        member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (!has1v1Role && !isAdmin) {
        clearQueueLock(channelId);
        const roles1v1 = (Array.isArray(ROLE_1V1) && ROLE_1V1.length) ? ROLE_1V1.map(id => `<@&${id}>`).join(' ') : '—';
        const help1v1 = new EmbedBuilder()
          .setTitle(`${EMOJIS.forbidden || '🚫'} Rol requerido para 1v1`)
          .setDescription('Para crear una fila 1v1 necesitas el rol autorizado o ser admin.')
          .addFields(
            { name: 'Rol 1v1', value: roles1v1 },
            { name: 'Obtén tu rol', value: 'Pídelo en <#1548247541810733117>.' }
          )
          .setColor(COLORS.ERROR)
          .setFooter(EMBED_DEFAULTS.footer);
        return message.channel.send({ embeds: [help1v1] }).catch(() => { });
      }
    }

    if (mode === '3v3' || mode === '4v4' || mode === '5v5' || mode === 'filavv2') {
      const ROLE_3V4_SHARED = '1489762472675115189';

      const hasSharedRole = member.roles.cache.has(ROLE_3V4_SHARED);
      const hasGeneralAllowed3v4 = member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
      const isAdmin = (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID) ||
        MANAGE_ROLE.some(r => member.roles.cache.has(r)) ||
        member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (!hasSharedRole && !hasGeneralAllowed3v4 && !isAdmin) {
        clearQueueLock(channelId);
        const displayRoles = (arr) => (Array.isArray(arr) && arr.length ? arr.map(id => `<@&${id}>`).join(' ') : '—');
        const help = new EmbedBuilder()
          .setTitle(`${EMOJIS.forbidden || '🚫'} Rol requerido para ${mode.toUpperCase()}`)
          .setDescription(`Para crear una fila ${mode.toUpperCase()} necesitas alguno de los roles autorizados o ser admin.`)
          .addFields(
            { name: `Rol Royal`, value: `<@&${ROLE_3V4_SHARED}>`, inline: false },
            { name: 'Otros roles permitidos', value: displayRoles(ALLOWED_ROLES), inline: false },
            { name: 'Obtén tu rol', value: `Pídelo en <#1548247541810733117>.` }
          )
          .setColor(COLORS.ERROR)
          .setFooter(EMBED_DEFAULTS.footer);
        return message.channel.send({ embeds: [help] }).catch(() => { });
      }
    }

    // Verificar si el creador ya está en otra fila o partida.
    for (const [otherChannelId, existingQueue] of queues.entries()) {
      if (existingQueue.hasUser(message.author.id)) {
        clearQueueLock(channelId);
        await message.channel.send(`⚠️ <@${message.author.id}> Ya estás participando en una fila activa en <#${otherChannelId}>. No puedes crear una nueva hasta que salgas o termine la partida.`).catch(() => {});
        return;
      }
    }
    // Verificar si el creador está en una partida activa.
    for (const match of matches.values()) {
      const allMatchPlayers = [...(match.team1 || []), ...(match.team2 || [])];
      if (allMatchPlayers.includes(message.author.id)) {
        clearQueueLock(channelId);
        await message.channel.send(`⚠️ <@${message.author.id}> Ya estás en una partida activa (#${match.matchNumber}) en <#${match.textChannelId}>. No puedes crear una fila hasta que termine.`).catch(() => {});
        return;
      }
    }

    // Verificar si el creador está en una partida activa (DB check para persistencia tras reinicio)
    if (ActiveMatch) {
      const activeMatchDB = await ActiveMatch.findOne({
        $or: [{ team1: message.author.id }, { team2: message.author.id }],
        closed: false
      });
      if (activeMatchDB) {
        clearQueueLock(channelId);
        await message.channel.send(`⚠️ <@${message.author.id}> Ya estás en una partida activa (#${activeMatchDB.matchNumber}) en <#${activeMatchDB.textChannelId}>. No puedes crear una fila hasta que termine.`).catch(() => {});
        return;
      }
    }

    // Crear instancia de fila (constructor: mode, creatorId, creatorUser, message, customName)
    const queue = new Queue(mode, message.author.id, message.author, message, customName);

    // --- NUEVO: Detectar si es un canal de streamer para personalizar el embed ---
    if (message.channel.parentId === STREAMER_CATEGORY_ID) {
      if (deps.StreamerChannel) {
        const streamDoc = await deps.StreamerChannel.findById(channelId).catch(() => null);
        if (streamDoc) {
          queue.streamerName = streamDoc.ownerUsername;
        } else {
          // Fallback al nombre del creador si no hay doc pero está en la categoría
          queue.streamerName = message.author.username;
        }
      } else {
        queue.streamerName = message.author.username;
      }
    }

    queues.set(channelId, queue);
    queue.messageId = null; // This was previously set after queue creation, now moved here.
    let sent = null;

    try {
      const prev = message.member?.voice?.channelId || null;
      queue.prevVoice[message.author.id] = prev;
      settings.busyPlayers.add(message.author.id);

      // Verificar si el creador está en live en TikTok y crear canal personalizado
      if (typeof checkTikTokLive === 'function') {
        checkTikTokLive(message.author.id, message.guild, settings).catch(e => console.error('Error checking creator TikTok live:', e));
      }

      // Si está en directo, crear canal personalizado de streamer
      if (typeof getTikTokLiveStatus === 'function' && typeof ensureStreamerChannel === 'function') {
        const player = await (async () => {
          try {
            const { Player } = require('../models');
            return await Player.findById(message.author.id);
          } catch (_) { return null; }
        })();

        if (player && player.tiktokUsername) {
          const liveStatus = await getTikTokLiveStatus(player.tiktokUsername).catch(() => ({ isLive: false }));
          if (liveStatus.isLive) {
            await ensureStreamerChannel(message.guild, message.author.id).catch(e =>
              console.error('Error creating streamer channel on queue creation:', e)
            );
          }
        }
      }
    } catch (e) {
      // Silencioso como el original
    }

    // Iniciar timeout (Solo inactividad)
    const timeoutMinutes = (typeof QUEUE_TIMEOUT_MINUTES === 'number' && QUEUE_TIMEOUT_MINUTES > 0) ? QUEUE_TIMEOUT_MINUTES : 10;
    queue.timeout = setTimeout(() => {
      handleQueueTimeout(channelId);
    }, timeoutMinutes * 60 * 1000);

    // Límite duro ELIMINADO: La fila solo se cerrará por inactividad
    try {
      queue.createdAt = Date.now();
    } catch (_) { }
    // queue.hardTimeout eliminado para permitir filas de larga duración siempre que haya actividad


    // Log de creación de fila
    await sendLog(message.guild, new EmbedBuilder()
      .setTitle(`${EMOJIS.battle || '⚔️'} Fila Creada`)
      .setDescription(`Fila de **${mode.toUpperCase()}** creada por <@${message.author.id}> en ${message.channel}.`)
      .setColor(COLORS.PRIMARY)
      .setTimestamp(), [], 'queues');

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
      if (s.length > 8) return false; // evita palabras como 'RayoA'
      if (/[A-Za-z0-9]/.test(s)) return false; // contiene letras/números => no es emoji unicode
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

    const joinBtn1 = new ButtonBuilder().setCustomId(`fila:${channelId}:join:1`).setLabel('Unirse Equipo 1').setStyle(ButtonStyle.Secondary);
    const joinBtn2 = new ButtonBuilder().setCustomId(`fila:${channelId}:join:2`).setLabel('Unirse Equipo 2').setStyle(ButtonStyle.Secondary);
    const leaveBtn = new ButtonBuilder().setCustomId(`fila:${channelId}:leave`).setLabel('Salir de la Fila').setStyle(ButtonStyle.Secondary);
    let ej1 = getResolvedEmoji((deps.QUEUE_EMOJIS && deps.QUEUE_EMOJIS.team1Button) || EMOJIS.blue_circle || '🔵');
    let ej2 = getResolvedEmoji((deps.QUEUE_EMOJIS && deps.QUEUE_EMOJIS.team2Button) || EMOJIS.red_circle || '🔴');
    let elv = getResolvedEmoji((deps.QUEUE_EMOJIS && deps.QUEUE_EMOJIS.leaveButton) || EMOJIS.cross_mark || '✖️');
    if (typeof ej1 === 'object' && ej1.id && !message.guild.emojis?.cache?.get(ej1.id)) ej1 = EMOJIS.blue_circle || '🔵';
    if (typeof ej2 === 'object' && ej2.id && !message.guild.emojis?.cache?.get(ej2.id)) ej2 = EMOJIS.red_circle || '🔴';
    if (typeof elv === 'object' && elv.id && !message.guild.emojis?.cache?.get(elv.id)) elv = EMOJIS.cross_mark || '✖️';
    if (ej1) joinBtn1.setEmoji(ej1);
    if (ej2) joinBtn2.setEmoji(ej2);
    if (elv) leaveBtn.setEmoji(elv);
    const joinRow = new ActionRowBuilder().addComponents(joinBtn1, joinBtn2, leaveBtn);

    // Verificar si es el canal de apostar puntos
    const showWagerButtons = channelId === '1548203227948777542';

    let wagerRow = null;
    if (showWagerButtons) {
      const wagerBtn = new ButtonBuilder()
        .setCustomId(`fila:${channelId}:wager:accept`)
        .setLabel('Aceptar Apuesta')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
        .setEmoji('1527575250068443146');

      const cancelWagerBtn = new ButtonBuilder()
        .setCustomId(`fila:${channelId}:wager:cancel`)
        .setLabel('Cancelar Apuesta')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(EMOJIS.trash || '🗑️')
        .setDisabled(true);

      wagerRow = new ActionRowBuilder().addComponents(wagerBtn, cancelWagerBtn);
    }

    const menuStartEmoji = getResolvedEmoji((deps.QUEUE_EMOJIS && deps.QUEUE_EMOJIS.menuStart) || EMOJIS.start || '🚀');
    const menuWagerEmoji = getResolvedEmoji((deps.QUEUE_EMOJIS && deps.QUEUE_EMOJIS.menuWager) || EMOJIS.money || '💰');
    const menuKickEmoji = getResolvedEmoji((deps.QUEUE_EMOJIS && deps.QUEUE_EMOJIS.menuKick) || EMOJIS.kick || '👢');
    const menuCloseEmoji = getResolvedEmoji((deps.QUEUE_EMOJIS && deps.QUEUE_EMOJIS.menuClose) || EMOJIS.stop || '🛑');

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
    const isBettingChannel = message.channel.id === '1548203227948777542';
    if (isBettingChannel) {
      const optWager = { label: 'Proponer Apuesta', description: 'Propone una apuesta de puntos para la partida', value: 'propose_wager' };
      if (menuWagerEmoji) optWager.emoji = getOptionEmoji(menuWagerEmoji);
      options.push(optWager);
    }
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

    const LOADING_TEXT = `${EMOJIS.loading || '⚙️'} Creando y configurando la fila...`;
    const loadingEmbed = new EmbedBuilder().setDescription(LOADING_TEXT);
    sent = await message.channel.send({ embeds: [loadingEmbed] });

    if (sent) {
      queue.messageId = sent.id;

      const components = [joinRow, wagerRow, menuRow].filter(c => c !== null);
      const joinRowNoEmoji = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fila:${channelId}:join:1`).setLabel('Unirse Equipo 1').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fila:${channelId}:join:2`).setLabel('Unirse Equipo 2').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fila:${channelId}:leave`).setLabel('Salir de la Fila').setStyle(ButtonStyle.Secondary)
      );
      let wagerRowNoEmoji = null;
      if (showWagerButtons) {
        wagerRowNoEmoji = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fila:${channelId}:wager:accept`).setLabel('Aceptar Apuesta').setStyle(ButtonStyle.Primary).setDisabled(true).setEmoji('1527575250068443146')
        );
      }
      const menuOptionsNoEmoji = [
        { label: 'Iniciar partida', description: 'Inicia la partida cuando hay suficientes jugadores', value: 'start' }
      ];
      if (isBettingChannel) {
        menuOptionsNoEmoji.push({ label: 'Proponer Apuesta', description: 'Propone una apuesta de puntos para la partida', value: 'propose_wager' });
      }
      menuOptionsNoEmoji.push(
        { label: 'Expulsar jugador', description: 'Seleccionar jugador a expulsar', value: 'kick' },
        { label: 'Cerrar fila', description: 'Cerrar y eliminar la fila', value: 'close' }
      );
      const menuRowNoEmoji = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`fila:${channelId}:menu`).setPlaceholder('Opciones de Creador').addOptions(menuOptionsNoEmoji)
      );
      const componentsNoEmoji = [joinRowNoEmoji, wagerRowNoEmoji, menuRowNoEmoji].filter(c => c !== null);
      let initialEmbed = null;
      try {
        initialEmbed = await queue.buildLightEmbed();
      } catch (_) { }
      const fallbackEmbed = new EmbedBuilder()
        .setTitle((queue.customName && queue.customName.trim().length > 0) ? `${queue.mode.toUpperCase()} | Fila: ${queue.customName.trim()}` : `${queue.mode.toUpperCase()} | Fila creada`)
        .setDescription('La fila está lista. Usa los botones para unirte o gestionar.')
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
              wager: { amount: queue.wager.amount, accepted: Array.from(queue.wager.accepted || []) }
            };
            queues.set(channelId, queue);
            await ActiveQueue.updateOne({ _id: queue.channelId }, { $set: queueDataForDB }, { upsert: true }).catch(() => { });
          } else {
            let noEmojiMsg = null;
            try {
              noEmojiMsg = await message.channel.send({ embeds: [initialEmbed || fallbackEmbed], components: componentsNoEmoji });
            } catch (_) { }
            if (noEmojiMsg) {
              queue.messageId = noEmojiMsg.id;
              await sent.delete().catch(() => { });
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
                wager: { amount: queue.wager.amount, accepted: Array.from(queue.wager.accepted || []) }
              };
              queues.set(channelId, queue);
              await ActiveQueue.updateOne({ _id: queue.channelId }, { $set: queueDataForDB }, { upsert: true }).catch(() => { });
            } else {
              const errorEmbed = new EmbedBuilder()
                .setTitle('Error creando la fila')
                .setDescription(`${EMOJIS.warning || '⚠️'} Ocurrió un error al crear la fila. Intenta nuevamente.`)
                .setColor(COLORS.ERROR)
                .setFooter(EMBED_DEFAULTS.footer);
              await sent.edit({ embeds: [errorEmbed], components: [] }).catch(() => { });
              clearQueueLock(channelId);
              return;
            }
          }
        } catch (_) { }
      } else {
        // Si editó pero el embed sigue mostrando el texto de carga, fuerza resend
        try {
          const currentDesc = edited.embeds?.[0]?.description || edited.embeds?.[0]?.data?.description || '';
          if (typeof currentDesc === 'string' && currentDesc.includes('Creando y configurando')) {
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
                wager: { amount: queue.wager.amount, accepted: Array.from(queue.wager.accepted || []) }
              };
              queues.set(channelId, queue);
              await ActiveQueue.updateOne({ _id: queue.channelId }, { $set: queueDataForDB }, { upsert: true }).catch(() => { });
            }
          } else {
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
              wager: { amount: queue.wager.amount, accepted: Array.from(queue.wager.accepted || []) }
            };
            queues.set(channelId, queue);
            await ActiveQueue.updateOne({ _id: queue.channelId }, { $set: queueDataForDB }, { upsert: true }).catch(() => { });
          }
        } catch (_) { }
      }


      try {
        const finalEmbed = await queue.buildEmbed().catch(() => null);
        if (finalEmbed) {
          let msg = null;
          try {
            msg = await message.channel.messages.fetch(queue.messageId).catch(() => null);
          } catch (_) { }
          if (msg) {
            let lastErr = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await msg.edit({ embeds: [finalEmbed] });
                lastErr = null;
                break;
              } catch (e) {
                lastErr = e;
                const m = String(e?.message || '').toLowerCase();
                const retryable = m.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || m.includes('socket hang up') || m.includes('connect timeout');
                if (!retryable) break;
                const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
                await new Promise(r => setTimeout(r, delay));
              }
            }
          }
        } else {
          try {
            const msg = await message.channel.messages.fetch(queue.messageId).catch(() => null);
            if (msg) await msg.edit({ embeds: [await queue.buildLightEmbed()] }).catch(() => { });
          } catch (_) { }
        }
      } catch (_) { }

      try {
        let checkMsg = null;
        try {
          checkMsg = await message.channel.messages.fetch(queue.messageId).catch(() => null);
        } catch (_) { }
        if (checkMsg) {
          const desc = checkMsg.embeds?.[0]?.description || checkMsg.embeds?.[0]?.data?.description || '';
          if (typeof desc === 'string' && desc.includes('Creando y configurando')) {
            let replaced = false;
            const finalPayload = { embeds: [initialEmbed || fallbackEmbed], components };
            for (let attempt = 0; attempt < 2 && !replaced; attempt++) {
              try {
                await checkMsg.edit({ embeds: finalPayload.embeds });
                replaced = true;
              } catch (e) {
                const m = String(e?.message || '').toLowerCase();
                const retryable = m.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || m.includes('socket hang up') || m.includes('connect timeout');
                if (!retryable) break;
                const delay = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
                await new Promise(r => setTimeout(r, delay));
              }
            }
            if (!replaced) {
              let newMsg = null;
              for (let attempt = 0; attempt < 2 && !newMsg; attempt++) {
                try {
                  newMsg = await message.channel.send({ embeds: [initialEmbed || fallbackEmbed], components });
                } catch (e) {
                  const m = String(e?.message || '').toLowerCase();
                  const retryable = m.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || m.includes('socket hang up') || m.includes('connect timeout');
                  if (!retryable) break;
                  const delay = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
                  await new Promise(r => setTimeout(r, delay));
                }
              }
              if (!newMsg) {
                try {
                  newMsg = await message.channel.send({ embeds: [initialEmbed || fallbackEmbed], components: componentsNoEmoji });
                } catch (_) { }
              }
              if (newMsg) {
                queue.messageId = newMsg.id;
                await checkMsg.delete().catch(() => { });
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
                  wager: { amount: queue.wager.amount, accepted: Array.from(queue.wager.accepted || []) }
                };
                queues.set(channelId, queue);
                await ActiveQueue.updateOne({ _id: queue.channelId }, { $set: queueDataForDB }, { upsert: true }).catch(() => { });
              }
            }
          }
        }
      } catch (_) { }

      try {
        const WATCHDOG_DELAY_MS = 15000;
        setTimeout(async () => {
          let msg = null;
          try {
            msg = await message.channel.messages.fetch(queue.messageId).catch(() => null);
          } catch (_) { }
          if (!msg) return;
          const desc = msg.embeds?.[0]?.description || msg.embeds?.[0]?.data?.description || '';
          if (typeof desc === 'string' && desc.includes('Creando y configurando')) {
            let replaced = false;
            const finalPayload = { embeds: [initialEmbed || fallbackEmbed], components };
            for (let attempt = 0; attempt < 2 && !replaced; attempt++) {
              try {
                await msg.edit({ embeds: finalPayload.embeds });
                replaced = true;
              } catch (e) {
                const m = String(e?.message || '').toLowerCase();
                const retryable = m.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || m.includes('socket hang up') || m.includes('connect timeout');
                if (!retryable) break;
                const delay = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
                await new Promise(r => setTimeout(r, delay));
              }
            }
            if (!replaced) {
              let newMsg = null;
              for (let attempt = 0; attempt < 2 && !newMsg; attempt++) {
                try {
                  newMsg = await message.channel.send({ embeds: [initialEmbed || fallbackEmbed], components });
                } catch (e) {
                  const m = String(e?.message || '').toLowerCase();
                  const retryable = m.includes('timeout') || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'EAI_AGAIN' || m.includes('socket hang up') || m.includes('connect timeout');
                  if (!retryable) break;
                  const delay = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
                  await new Promise(r => setTimeout(r, delay));
                }
              }
              if (!newMsg) {
                try {
                  newMsg = await message.channel.send({ embeds: [initialEmbed || fallbackEmbed], components: componentsNoEmoji });
                } catch (_) { }
              }
              if (newMsg) {
                queue.messageId = newMsg.id;
                await msg.delete().catch(() => { });
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
                  wager: { amount: queue.wager.amount, accepted: Array.from(queue.wager.accepted || []) }
                };
                queues.set(channelId, queue);
                await ActiveQueue.updateOne({ _id: queue.channelId }, { $set: queueDataForDB }, { upsert: true }).catch(() => { });
              }
            }
          }
        }, WATCHDOG_DELAY_MS);
      } catch (_) { }

      clearQueueLock(channelId);
    }

    return;
  } catch (errFila) {
    clearQueueLock(channelId);
    console.error('Error creando fila:', errFila);
    try {
      if (sent) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('Error creando la fila')
          .setDescription(`${EMOJIS.warning || '⚠️'} Ocurrió un error al crear la fila. Intenta nuevamente.`)
          .setColor(COLORS.ERROR)
          .setFooter(EMBED_DEFAULTS.footer);
        await sent.edit({ embeds: [errorEmbed], components: [] }).catch(() => { });
      }
      queues.delete(channelId);
      } catch (_) { }
    return message.channel.send(`${EMOJIS.warning || '⚠️'} Ocurrió un error al crear la fila. Revisa la consola del bot.`).catch(() => {});
  }
};
