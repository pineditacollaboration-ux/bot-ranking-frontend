// src/events/messageCreate.js
// Cooldown global por usuario para todos los comandos (anti-spam)
const globalCommandCooldowns = new Map(); // Map<userId, lastUsedTimestamp>

module.exports = async function onMessageCreate(message, ctx) {
  const {
    Player,
    COLORS,
    matches,
    ALLOWED_VOICE_CATEGORIES,
    WAITING_ROOM_VOICE_CHANNEL_ID,
    blacklistedUsers,
    BOT_OWNER_ID,
    hasPermission,
    ActiveMatch,
    updateMatchManagementMessage,
    getMatchDeps,
    config,
    QUEUE_CATEGORIES,
    creatingQueue,
    ALLOWED_MODES,
    ALLOWED_ROLES,
    MANAGE_ROLE,
    PermissionsBitField,
    settings,
    queues,
    Queue,
    QUEUE_TIMEOUT_MINUTES,
    handleQueueTimeout,
    handleQueueHardTimeout,
    CLOSE_APPLY_ROLE_IDS,
    sendLog,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EMBED_DEFAULTS,
    ActiveQueue,
    ensurePlayerRecord,
    ROLE_2V2,
    ROLE_1V1,
    client,
    imageGenerationQueue,
    buildPlayerCard,
    SHOP_ITEMS,
    ROULETTE_PRIZES,
    ROULETTE_PROBABILITIES,
    deliverPrize,
    rankingUtils,
    nicknameUpdateQueue,
    updateNicknamesEfficiently,
    updateAffectedNicknames,
    parseDuration,
    Excluded,
    excludedFromNickUpdate,
    excludedFromVoiceMove,
    excludedFromQueueRestriction,
    removeTemporaryRole,
    Setting,
    generateSeasonSummaryEmbed,
    MatchHistory,
    cacheInvalidator,
    performanceOptimizer,
    Blacklist,
    tryUpdateNicknameForMember,
    cleanupAllOrphanedMatches,
    loadActiveMatches,
    startingMatch,
    commands,
    updateServerStats,
    ActiveTempVoice,

    invitationService,
    checkTikTokLive,
    Clip,
    VipKey,
    StreamerChannel,
    updateChampionRoles,
    CHAMPION_ROLES,
  } = ctx;

  const EMOJIS = config.emojis || {};

  try {
    if (message.author.bot) return;


    if (!message.guild) {
      const content = message.content?.trim();

      // Permitir comando !clip en MD
      const prefix = config.prefix || '!';
      if (content && content.startsWith(prefix)) {
        const args = content.slice(prefix.length).trim().split(/\s+/);
        const cmd = args.shift().toLowerCase();
        console.log('[DEBUG] DM Command received:', cmd);
        if (cmd === 'clip' || cmd === 'postclip') {
          console.log('[DEBUG] Clip command detected, calling clipCommand');
          // Asegurarnos de que Clip esté definido, si no lo tomamos de ctx (que ya debería tenerlo) o lo requerimos directamente si todo falla
          const ClipModel = ctx.Clip || require('../../models').Clip;
          return commands.clipCommand(message, args, { Clip: ClipModel, COLORS, Player, sendLog, client });
        }
      }

      if (!content || !invitationService) return;
      const match = content.match(/^INV\s+([A-F0-9]{8})$/i);
      if (!match) return;

      const code = match[1].toUpperCase();
      let result;
      try {
        result = await invitationService.useInvitationCode(message.author.id, code);
      } catch (_) {
        result = null;
      }

      if (!result || !result.success) {
        const error = result && result.error;
        let text = `${EMOJIS.error || '❌'} No se pudo procesar tu código de invitación.`;
        if (error === 'Código inválido') text = `${EMOJIS.error || '❌'} Código de invitación inválido.`;
        else if (error === 'Código expirado') text = `${EMOJIS.clock || '⏰'} Este código de invitación ha expirado.`;
        else if (error === 'Ya usaste este código') text = `${EMOJIS.warning || '⚠️'} Ya habías usado este código de invitación.`;
        await message.channel.send(text).catch(() => { });
        return;
      }

      let base = `${EMOJIS.success || '✅'} Tu invitación fue registrada correctamente.`;
      if (result.rewardGiven) {
        base += ' ¡Se han entregado 5000 puntos al jugador que te invitó!';
      }
      await message.channel.send(base).catch(() => { });
      return;
    }

    if (!message.channel) return;

    // ==== GUARD: Canal de Partidas (canal padre de hilos) ====
    // Solo el usuario autorizado puede escribir mensajes directamente en este canal.
    // Cualquier otro mensaje (de jugadores, staff, etc.) se borra de forma silenciosa e inmediata.
    const MATCH_PARENT_CHANNEL_ID = (config && (config.matchThreadsParentChannelId || config.matchThreadChannelId)) || '1494433823285575711';
    const MATCH_CHANNEL_ALLOWED_USER = '1391505274556387338';
    if (
      message.channel.id === MATCH_PARENT_CHANNEL_ID &&
      message.author.id !== MATCH_CHANNEL_ALLOWED_USER &&
      !message.author.bot
    ) {
      if (message.deletable) await message.delete().catch(() => {});
      return;
    }

    // Restricción canal VIP Claim (1489717516170428538)
    // Solo permite los comandos !reclamarvip y !reclamartienda. Todo lo demás se borra, excepto para el staff.
    if (message.channel.id === '1489717516170428538') {
      const _isStaff = hasPermission(message.member) || (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID);

      const _prefix = config.prefix || '!';
      const _content = message.content.trim();
      const _isReclamarVip = _content.startsWith(_prefix) && _content.slice(_prefix.length).trim().toLowerCase().startsWith('reclamarvip');
      const _isReclamarTienda = _content.startsWith(_prefix) && _content.slice(_prefix.length).trim().toLowerCase().startsWith('reclamartienda');

      if (!_isReclamarVip && !_isReclamarTienda) {
        if (!_isStaff && message.deletable) await message.delete().catch(() => { });
        if (!_isStaff) return;
      } else {
        // Procesar reclamarvip
        if (_isReclamarVip) {
          const _tokens = _content.slice(_prefix.length).trim().split(/\s+/);
          _tokens.shift();
          return commands.reclamarVipCommand(message, _tokens, { Player, COLORS, EMBED_DEFAULTS, sendLog, VipKey, tryUpdateNicknameForMember, EMOJIS: EMOJIS });
        }

        // Procesar reclamartienda
        if (_isReclamarTienda) {
          return commands.reclamartiendaCommand(message, { VipKey, COLORS, Player, EMOJIS: EMOJIS });
        }
      }
    }

    // Restricción canal Enviar Live (1489717436961001725)
    // Solo permite el comando !enviarlive. Todo lo demás se borra.
    if (message.channel.id === '1489717436961001725') {
      const _isStaff = hasPermission(message.member) || (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID);
      const _prefix = config.prefix || '!';
      const _content = message.content.trim();
      const _isEnviarLive = _content.startsWith(_prefix) && _content.slice(_prefix.length).trim().toLowerCase() === 'enviarlive';

      if (!_isEnviarLive && !_isStaff) {
        if (message.deletable) await message.delete().catch(() => { });
        const warn = await message.channel.send(`${EMOJIS.warning || '⚠️'} <@${message.author.id}>, en este canal solo se permite el comando \`!enviarlive\`.`).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => { }), 5000);
        return;
      }
    }

    const prefix = config.prefix || '!';
    const isCommandMsg = message.content.startsWith(prefix);

    const blEntry = blacklistedUsers.get(message.author.id);
    if (blEntry && !(Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID)) {
      const exp = blEntry.expiresAt ? new Date(blEntry.expiresAt).getTime() : null;
      if (exp && Date.now() > exp) {
        blacklistedUsers.delete(message.author.id);
      } else {
        if (isCommandMsg) {
          const warn = await message.channel.send(`${EMOJIS.error || '❌'} <@${message.author.id}> estás en la blacklist y no puedes usar comandos del bot.`).catch(() => null);
          if (warn) setTimeout(() => warn.delete().catch(() => { }), 5000);
          if (message.deletable) await message.delete().catch(() => { });
        }
        return;
      }
    }

    // ====== Modo mantenimiento: bloquear acciones del bot para todos excepto IDs permitidos ======
    const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;

    // ====== Restricción por antigüedad de cuenta (mínimo 48 horas) ======
    const MIN_ACCOUNT_AGE_MS = 48 * 60 * 60 * 1000;
    if (Date.now() - message.author.createdTimestamp < MIN_ACCOUNT_AGE_MS && !isOwner) {
      if (isCommandMsg) {
        const warn = await message.channel.send(`${EMOJIS.error || '❌'} <@${message.author.id}> Tu cuenta de Discord es demasiado reciente (menos de 48 horas de creada). No puedes interactuar con el bot.`).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => { }), 6000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
      }
    }

    if (settings.maintenanceEnabled && !isOwner) {
      if (isCommandMsg) {
        const warn = await message.channel.send(`${EMOJIS.maintenance || '🛠️'} El bot está en mantenimiento. Inténtalo más tarde.`).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => { }), 5000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
      } else {
        // Bloquear sistema de sugerencias durante mantenimiento (si aplica)
        const SUGGESTION_CHANNEL_ID = (config && config.suggestionChannelId) || '1437286939115130942';
        if (message.channel.id === SUGGESTION_CHANNEL_ID) {
          const warn = await message.channel.send(`${EMOJIS.maintenance || '🛠️'} El bot está en mantenimiento. Las sugerencias están temporalmente deshabilitadas.`).catch(() => null);
          if (warn) setTimeout(() => warn.delete().catch(() => { }), 5000);
          await message.delete().catch(() => { });
          return;
        }
      }
    }

    // Detección de ID/Pass en canal de partida
    const matchObj = [...matches.values()].find(m => m.textChannelId === message.channel.id);
    if (matchObj && !message.author.bot) {
      const isCreator = message.author.id === matchObj.creatorId;
      const hasCloseRole = Array.isArray(CLOSE_APPLY_ROLE_IDS) && message.member?.roles?.cache?.some(r => CLOSE_APPLY_ROLE_IDS.includes(r.id));
      // Permitir registrar ID/contraseña solo al creador o a roles autorizados
      if (!isCreator && !hasCloseRole) return;

      const content = message.content.trim();
      const isNumeric = /^\d+$/.test(content);
      if (!isNumeric || matchObj.idAndPasswordSet) return;

      const matchKey = [...matches.keys()].find(k => matches.get(k) === matchObj);
      if (!matchObj.idProvided) {
        if (content.length >= 4 && content.length <= 12) {
          matchObj.idProvided = content;
          await message.delete().catch(() => { });
          if (matchKey) {
            await ActiveMatch.findByIdAndUpdate(matchKey, { $set: { idProvided: content } });
          }
          // No enviar embed intermedio; solo guardar ID y esperar contraseña
        }
      } else if (matchObj.idProvided && !matchObj.passProvided) {
        if (content === matchObj.idProvided) return;
        matchObj.passProvided = content;
        matchObj.idAndPasswordSet = true;
        await message.delete().catch(() => { });
        if (matchKey) {
          await ActiveMatch.findByIdAndUpdate(matchKey, { $set: { passProvided: content, idAndPasswordSet: true } });
        }
        await updateMatchManagementMessage(message.guild, matchObj, getMatchDeps());
        const allPlayers = [...new Set([...(matchObj.team1 || []), ...(matchObj.team2 || [])])];
        const mentionLine = allPlayers.map(id => `<@${id}>`).join(' ');
        const finalInfoEmbed = new EmbedBuilder()
          .setAuthor({ name: `Registrado por ${message.member?.displayName || message.author.tag}`, iconURL: message.author.displayAvatarURL() })
          .setTitle(`${EMOJIS.lock || '🔐'} Partida #${matchObj.matchNumber} | Datos de Sala Listos`)
          .setColor(EMBED_DEFAULTS?.color || COLORS.PRIMARY)
          .addFields(
            { name: `${EMOJIS.id || '🔑'} ID de la sala`, value: `\`${matchObj.idProvided}\``, inline: true },
            { name: `${EMOJIS.password || '🔒'} Contraseña`, value: `\`${matchObj.passProvided}\``, inline: true }
          )
          .setDescription(`Usa estos datos para ingresar a la sala.\nRegistrado por: <@${message.author.id}>`)
          .setImage(EMBED_DEFAULTS.image || EMBED_DEFAULTS.thumbnail)
          .setFooter(EMBED_DEFAULTS.footer)
          .setTimestamp();
        const articleEmoji = message.guild?.emojis?.cache.find(e => e.name.toLowerCase().includes('article'))
          || client?.emojis?.cache.find(e => e.name.toLowerCase().includes('article'))
          || '📋';
        const copyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`copy_room_id:${matchObj.idProvided}`)
            .setLabel('Copiar ID')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(articleEmoji.id || articleEmoji)
        );
        const _chan = message.channel || await client.channels.fetch(message.channelId).catch(() => null);
        if (_chan && typeof _chan.send === 'function') {
          await _chan.send({ content: mentionLine, embeds: [finalInfoEmbed], components: [copyRow], allowedMentions: { users: allPlayers } }).catch(() => { });
        }
      }
    }

    // Sistema de sugerencias: interceptar mensajes en canal designado
    const SUGGESTION_CHANNEL_ID = (config && config.suggestionChannelId) || '1437286939115130942';
    if (message.channel.id === SUGGESTION_CHANNEL_ID && !message.content.startsWith((config.prefix || '!'))) {
      const content = message.content?.trim();
      if (!content) {
        await message.delete().catch(() => { });
        return;
      }

      if (await ctx.suggestionsUtils?.hasPending(message.author.id)) {
        const warn = await message.channel.send({ content: `${EMOJIS.warning || '⚠️'} Ya enviaste una sugerencia. Debes esperar que el staff tome una acción.` }).catch(() => null);
        setTimeout(() => {
          warn?.delete().catch(() => { });
          message.delete().catch(() => { });
        }, 5000);
        return;
      }

      await message.delete().catch(() => { });

      const guildIconURL = message.guild.iconURL({ dynamic: true });
      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`${EMOJIS.text || '📬'} Nueva Sugerencia`)
        .setAuthor({ name: `De ${message.member?.displayName || message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setThumbnail(guildIconURL)
        .setDescription(content)
        .addFields({ name: 'Votos', value: `${EMOJIS.success || '✅'} Sí: 0 | ${EMOJIS.error || '❌'} No: 0` }, { name: 'Estado', value: 'Pendiente' })
        .setFooter(EMBED_DEFAULTS.footer)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sug_yes_${message.author.id}`).setLabel('Votar Sí').setStyle(ButtonStyle.Success).setEmoji(EMOJIS.success || '✅'),
        new ButtonBuilder().setCustomId(`sug_no_${message.author.id}`).setLabel('Votar No').setStyle(ButtonStyle.Danger).setEmoji(EMOJIS.error || '❌')
      );

      const sent = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
      if (!sent) return;

      await ctx.suggestionsUtils?.create({ guildId: message.guild.id, channelId: message.channel.id, userId: message.author.id, content, messageId: sent.id });

      const collector = sent.createMessageComponentCollector({ time: 7 * 24 * 60 * 60 * 1000 });
      collector.on('collect', async (i) => {
        if (!i.customId.startsWith('sug_')) return;
        const parts = i.customId.split('_');
        const type = parts[1]; // yes|no
        if (!['yes', 'no'].includes(type)) return;
        // Bloquear voto del autor de la sugerencia
        const sug = await ctx.suggestionsUtils?.getByMessage(sent.id);
        if (sug && i.user.id === sug.userId) {
          return i.reply({ content: '🙅 No puedes votar tu propia sugerencia.', ephemeral: true }).catch(() => { });
        }
        // Evitar múltiples votos del mismo usuario
        const already = await ctx.suggestionsUtils?.hasUserVoted(sent.id, i.user.id);
        if (already) {
          return i.reply({ content: '🗳️ Ya has votado en esta sugerencia.', ephemeral: true }).catch(() => { });
        }
        await i.deferUpdate().catch(() => { });
        const updated = await ctx.suggestionsUtils?.recordVote(sent.id, i.user.id, type);
        if (updated) {
          const newEmbed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`${EMOJIS.text || '📬'} Nueva Sugerencia`)
            .setAuthor({ name: `De ${message.member?.displayName || message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setThumbnail(guildIconURL)
            .setDescription(content)
            .addFields({ name: 'Votos', value: `${EMOJIS.success || '✅'} Sí: ${updated.votes.yes} | ${EMOJIS.error || '❌'} No: ${updated.votes.no}` }, { name: 'Estado', value: 'Pendiente' })
            .setFooter(EMBED_DEFAULTS.footer)
            .setTimestamp();
          await sent.edit({ embeds: [newEmbed] }).catch(() => { });
        }
      });

      collector.on('end', () => {
        try {
          const disabledRow = ActionRowBuilder.from(row);
          disabledRow.components.forEach(b => b.setDisabled(true));
          sent.edit({ components: [disabledRow] }).catch(() => { });
        } catch (_) { }
      });

      return;
    }

    // Restricción específica para canal de ruleta (solo !ruleta o !girar permitidos)
    const RULETA_CHANNEL_ID = '1548203042955071568';
    if (message.channel.id === RULETA_CHANNEL_ID) {
      const isStaff = hasPermission(message.member);
      const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
      // Si no es staff, verificar si es un comando de ruleta
      if (!isStaff && !isOwner) {
        const content = message.content.toLowerCase();
        const isRuletaCommand = content.startsWith('!ruleta') || content.startsWith('!girar') || content.startsWith('!spin');
        if (!isRuletaCommand) {
          if (message.deletable) await message.delete().catch(() => { });
          return;
        }
      }
    }

    // Restricción específica para canal de tienda (solo !tienda permitido)
    const TIENDA_CHANNEL_ID = '1548203045505081356';
    if (message.channel.id === TIENDA_CHANNEL_ID) {
      const isStaff = hasPermission(message.member);
      const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
      // Si no es staff, verificar si es un comando de tienda
      if (!isStaff && !isOwner) {
        const content = message.content.toLowerCase();
        const isTiendaCommand = content.startsWith('!tienda') || content.startsWith('!shop');
        if (!isTiendaCommand) {
          if (message.deletable) await message.delete().catch(() => { });
          return;
        }
      }
    }

    // Restricción específica para canal de comandos (solo comandos permitidos)
    const COMMANDS_CHANNEL_ID = '1548203101448572958';
    if (message.channel.id === COMMANDS_CHANNEL_ID) {
      const isStaff = hasPermission(message.member);
      const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
      // Si no es staff, verificar si es un comando
      if (!isStaff && !isOwner) {
        const isCommand = message.content.startsWith(config.prefix || '!');
        if (!isCommand) {
          if (message.deletable) await message.delete().catch(() => { });
          return;
        }
      }
    }

    // Restricción específica para canal de blacklist (solo comandos de blacklist permitidos)
    const BLACKLIST_CHANNEL_ID = '1548203188002226196';
    if (message.channel.id === BLACKLIST_CHANNEL_ID) {
      const isStaff = hasPermission(message.member);
      const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
      // Si no es staff, verificar si es un comando de blacklist
      if (!isStaff && !isOwner) {
        const content = message.content.toLowerCase();
        const isBlacklistCommand = content.startsWith('!blacklist') || content.startsWith('!unblacklist') || content.startsWith('!addblacklist') || content.startsWith('!removeblacklist');
        if (!isBlacklistCommand) {
          if (message.deletable) await message.delete().catch(() => { });
          return;
        }
      }
    }

    // ====== CANALES INDEPENDIENTES DE FILA (apostar-puntos + fila-desafio 1/2/3) ======
    // Chat normal PERMITIDO. Solo se bloquean otros comandos del bot (que no sean !fila).
    // Cada canal es completamente independiente: una fila en uno NO afecta a los demás.
    const QUEUE_DESAFIO_CHANNELS = ['1548203229270253608', '1548203231799287911', '1548203233774673940'];
    const WAITING_CHANNELS = [
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
    const ALL_QUEUE_CHANNELS = [...QUEUE_DESAFIO_CHANNELS, ...WAITING_CHANNELS, '1548203227948777542'];

    if (ALL_QUEUE_CHANNELS.includes(message.channel.id)) {
      const isStaff = hasPermission(message.member);
      const isOwnerCheck = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
      if (!isStaff && !isOwnerCheck) {
        const contentLower = message.content.trim().toLowerCase();
        const pfx = (config.prefix || '!').toLowerCase();
        // Detectar comandos de fila explícitamente
        const isFilaCommand = contentLower === pfx + 'fila' || 
                              contentLower.startsWith(pfx + 'fila ') || 
                              contentLower === pfx + 'queue' || 
                              contentLower.startsWith(pfx + 'queue ') ||
                              contentLower === pfx + 'filavv2' || 
                              contentLower.startsWith(pfx + 'filavv2 ');
        
        // Si es comando de fila, dejar pasar completamente
        if (isFilaCommand) {
          // No hacer nada, dejar que el comando se procese normalmente
        } else if (contentLower.startsWith(pfx)) {
          // Es otro comando del bot → bloquear silenciosamente (borrar)
          if (message.deletable) await message.delete().catch(() => {});
          return;
        }
        // Chat normal → dejar pasar sin tocar
      }
    }

    if (!message.content.startsWith(config.prefix || '!')) return;
    const args = message.content.slice((config.prefix || '!').length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // Rate limit global por usuario (aplica a todos los comandos)
    try {
      const GLOBAL_COOLDOWN_MS = (ctx.config && Number(ctx.config.globalCommandCooldownMs)) ? Number(ctx.config.globalCommandCooldownMs) : 5000; // 5s por defecto
      const userId = message.author.id;
      const isStaff = hasPermission(message.member) || (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(userId) : userId === BOT_OWNER_ID);
      if (!isStaff && GLOBAL_COOLDOWN_MS > 0) {
        const now = Date.now();
        const lastUsed = globalCommandCooldowns.get(userId) || 0;
        if (now - lastUsed < GLOBAL_COOLDOWN_MS) {
          const remaining = Math.ceil((GLOBAL_COOLDOWN_MS - (now - lastUsed)) / 1000);
          if (message.deletable) await message.delete().catch(() => { });
          try {
            await message.author.send(`⏳ Estás en cooldown global de comandos. Vuelve a intentarlo en ${remaining}s.`).catch(() => { });
          } catch (_) { }
          return;
        }
        globalCommandCooldowns.set(userId, now);
      }
    } catch (_) { }

    // Restricción: comandos de ruleta solo en el canal específico
    if (cmd === 'ruleta' || cmd === 'girar' || cmd === 'spin') {
      const RULETA_CHANNEL_ID = '1548203042955071568';
      const isStaff = hasPermission(message.member) || isOwner;
      if (!isStaff && message.channel.id !== RULETA_CHANNEL_ID) {
        const warn = await message.channel.send(`${EMOJIS.warning || '⚠️'} <@${message.author.id}> el comando \`!${cmd}\` solo se puede usar en <#${RULETA_CHANNEL_ID}>.`);
        setTimeout(() => {
          warn.delete().catch(() => { });
        }, 5000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
      }
    }

    // Restricción: comandos de tienda solo en el canal específico
    if (cmd === 'tienda' || cmd === 'shop') {
      const TIENDA_CHANNEL_ID = '1548203045505081356';
      const isStaff = hasPermission(message.member) || isOwner;
      if (!isStaff && message.channel.id !== TIENDA_CHANNEL_ID) {
        const warn = await message.channel.send(`${EMOJIS.warning || '⚠️'} <@${message.author.id}> el comando \`!${cmd}\` solo se puede usar en <#${TIENDA_CHANNEL_ID}>.`);
        setTimeout(() => {
          warn.delete().catch(() => { });
        }, 5000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
      }
    }

    const allowedCommandChannelId = config.allowedCommandChannelId || '1401035609417715775';
    if (cmd === 'info' || cmd === 'checkban' || cmd === 'ban') {
      if (!isOwner && message.channel.id !== allowedCommandChannelId) {
        const warn = await message.channel.send(`${EMOJIS.warning || '⚠️'} <@${message.author.id}> el comando \`!${cmd}\` solo se puede usar en el canal <#${allowedCommandChannelId}>.`);
        setTimeout(() => {
          warn.delete().catch(() => { });
        }, 5000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
      }
    }

    const whitelistedCommands = ['fila', 'p', 'profile', 'terminos', 'panelstreamer', 'cerrarfilastreamer', 'reclamarvip', 'reclamartienda', 'enviarlive', 'blacklist', 'unblacklist', 'blacklistall', 'blacklistinfo'];
    const isWhitelisted = whitelistedCommands.includes(cmd);

    if (cmd === 'menureqcargos') {
      return commands.menureqcargos(message, args, { COLORS, EMBED_DEFAULTS, config });
    }

    if (!isWhitelisted) {

      const isStaff = hasPermission(message.member) || isOwner;
      const allowedQueueCategoryIds = Object.keys(QUEUE_CATEGORIES || {});
      const isInQueueCategory = allowedQueueCategoryIds.length > 0 ? allowedQueueCategoryIds.includes(message.channel.parentId) : false;
      const STREAMER_CATEGORY_ID = '1473558364289241253';
      const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;
      const BLACKLIST_CHANNEL_ID = '1548203188002226196';
      const isBlacklistChannel = message.channel.id === BLACKLIST_CHANNEL_ID;
      const RULETA_CHANNEL_ID = '1548203042955071568';
      const isRuletaChannel = message.channel.id === RULETA_CHANNEL_ID;
      const TIENDA_CHANNEL_ID = '1548203045505081356';
      const isTiendaChannel = message.channel.id === TIENDA_CHANNEL_ID;
      const QUEUE_DESAFIO_CHANNELS = ['1548203229270253608', '1548203231799287911', '1548203233774673940'];
      const WAITING_CHANNELS = [
        '1548203236131868712', '1548203237545615424', '1548203240334823505',
        '1548203242616520714', '1548203244935843860', '1548203246701514792',
        '1548203250715725889', '1548203253186039858', '1548203255446769724',
        '1548203256776237137'
      ];
      const ALL_QUEUE_CHANNELS = [...QUEUE_DESAFIO_CHANNELS, ...WAITING_CHANNELS, '1548203227948777542'];
      const isQueueChannel = ALL_QUEUE_CHANNELS.includes(message.channel.id);

      if (!isStaff && message.channel.id !== allowedCommandChannelId && !isInQueueCategory && !isInStreamerCategory && !isBlacklistChannel && !isRuletaChannel && !isTiendaChannel && !isQueueChannel) {
        const warn = await message.channel.send(`${EMOJIS.warning || '⚠️'} <@${message.author.id}> los comandos solo se pueden usar en el canal <#${allowedCommandChannelId}>.`);
        setTimeout(() => {
          warn.delete().catch(() => { });
        }, 5000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
      }
    }

    if (cmd === 'horas') {
      return commands.voiceTimeCommand(message, args, { Player, COLORS, matches, ALLOWED_VOICE_CATEGORIES, WAITING_ROOM_VOICE_CHANNEL_ID, sendLog, excludedFromQueueRestriction, excludedFromVoiceMove, excludedFromNickUpdate });
    }

    if (cmd === 'darbeneficiosbooster') {
      return commands.darBeneficiosBooster(message, args, { 
        hasPermission, ensurePlayerRecord, Player, COLORS, EMBED_DEFAULTS, 
        sendLog, config, invalidateGlobalRankCache: rankingUtils.invalidateGlobalRankCache, 
        invalidateSeasonRankCache: rankingUtils.invalidateSeasonRankCache, 
        updateAffectedNicknames 
      });
    }

    if (cmd === 'voztiempo' || (cmd === 'voz' && args[0] === 'tiempo')) {
      const subArgs = cmd === 'voz' ? args.slice(1) : args;
      return commands.voiceTempCommand(message, subArgs, { config, COLORS, sendLog, ActiveTempVoice });
    }

    if (cmd === 'statsvoz') {
      return commands.statsVozCommand(message, args, { settings, Setting, COLORS, BOT_OWNER_ID });
    }

    if (cmd === 'topvoice') {
      return commands.topVoice(message, args, { Player, COLORS, EMBED_DEFAULTS });
    }

    if (cmd === 'terminos') {
      return commands.terminosCommand(message, args, { COLORS, EMBED_DEFAULTS, sendLog, config, hasPermission });
    }

    if (cmd === 'keys') {
      return commands.keysCommand(message, args, { sendLog });
    }

    if (cmd === 'clip' || cmd === 'postclip') {
      const reply = await message.reply(`${EMOJIS.error || '❌'} Este comando solo funciona por mensaje privado (DM) al bot. Envíame el clip por privado.`).catch(() => { });
      if (reply) setTimeout(() => reply.delete().catch(() => { }), 5000);
      if (message.deletable) await message.delete().catch(() => { });
      return;
    }

    if (cmd === 'updatechamps') {
      return commands.updateChamps(message, args, { hasPermission, updateChampionRoles, CHAMPION_ROLES });
    }

    if (cmd === 'info') {
      return commands.infoCommand(message, args, { config, COLORS, EMBED_DEFAULTS });
    }

    if (cmd === 'checkban' || cmd === 'ban') {
      return commands.checkBanCommand(message, args, { config, COLORS, EMBED_DEFAULTS });
    }

    if (cmd === 'setupserver') {
      return commands.setupserver(message, args, { Setting, COLORS, BOT_OWNER_ID, hasPermission, EmbedBuilder, PermissionsBitField });
    }

    if (cmd === 'crearservidor' || cmd === 'crear-servidor' || cmd === 'crearserver' || cmd === 'inicializar') {
      return commands.crearservidor(message, args, { Setting, COLORS, BOT_OWNER_ID, config });
    }

    // if (cmd === 'organizarservidor' || cmd === 'organizar-servidor' || cmd === 'orgservidor' || cmd === 'reorganizar') {
    //   return commands.organizarservidor(message, args, { Setting, COLORS, BOT_OWNER_ID, hasPermission, EmbedBuilder, PermissionsBitField, config });
    // }

    if (cmd === 'borrarservidor' || cmd === 'borrar-servidor' || cmd === 'borrarserver' || cmd === 'wipeserver') {
      return commands.borrarservidor(message, args, { COLORS, BOT_OWNER_ID });
    }

    if (cmd === 'partidas' || cmd === 'matches') {
      return commands.partidasCommand(message, { matches, COLORS, Player });
    }

    if (cmd === 'fila') {
      return commands.filaCommand(message, args, {
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
        excludedFromQueueRestriction
        , TEST_QUEUE_CHANNEL_ID: ctx.config?.testQueueChannelId || null,
        TEST_ALLOWED_ROLES: Array.isArray(ctx.config?.testAllowedRoles) ? ctx.config.testAllowedRoles : [],
        QUEUE_EMOJIS: ctx.QUEUE_EMOJIS || {},
        checkTikTokLive,
        StreamerChannel: ctx.StreamerChannel
      });
    }

    if (cmd === 'filavv2') {
      return commands.filaCommand(message, ['filavv2', ...args], {
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
        excludedFromQueueRestriction
        , TEST_QUEUE_CHANNEL_ID: ctx.config?.testQueueChannelId || null,
        TEST_ALLOWED_ROLES: Array.isArray(ctx.config?.testAllowedRoles) ? ctx.config.testAllowedRoles : [],
        QUEUE_EMOJIS: ctx.QUEUE_EMOJIS || {},
        checkTikTokLive,
        StreamerChannel: ctx.StreamerChannel
      });
    }

    if (cmd === 'filacreador') {
      return commands.filaCreadorCommand(message, args, {
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
        ALLOWED_MODES
      });
    }

    if (cmd === 'p' || cmd === 'profile') {
      return commands.profileCommand(message, { client, imageGenerationQueue, buildPlayerCard, hasPermission, config });
    }

    if (cmd === 'prime') {
      return commands.primeCommand(message, args, { client, Player, ensurePlayerRecord, COLORS, EMBED_DEFAULTS });
    }

    if (cmd === 'nombre') {
      return commands.nombreCommand(message, args, { Player, updateAffectedNicknames, EmbedBuilder, COLORS, tryUpdateNicknameForMember, EMOJIS });
    }

    if (cmd === 'tienda' || cmd === 'shop') {
      // Verificar si es comando de toggle (on/off)
      if (args[0] && ['on', 'off', 'enable', 'disable'].includes(args[0].toLowerCase())) {
        return commands.setShopEnabled(message, args, { Setting, settings, COLORS, EmbedBuilder, sendLog, BOT_OWNER_ID });
      }
      // Comando normal de tienda
      return commands.tiendaCommand(message, { ensurePlayerRecord, Player, SHOP_ITEMS, COLORS, sendLog, SHOP_CHANNEL_ID: config.shopChannelId || '1420147222821081159', settings, VipKey, EMOJIS });
    }

    if (cmd === 'reclamartienda') {
      return commands.reclamartiendaCommand(message, { VipKey, COLORS, Player, EMOJIS });
    }

    if (cmd === 'ruleta' || cmd === 'spin' || cmd === 'girar') {
      return commands.ruletaCommand(message, {
        Player,
        ROULETTE_PRIZES,
        ROULETTE_PROBABILITIES,
        COLORS,
        deliverPrize,
        ROULETTE_CHANNEL_ID: config.rouletteChannelId || '1400888438491840615',
        sendLog,
        config
      });
    }

    if (cmd === 'addspins' || cmd === 'addgiros') {
      return commands.addSpins(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config, BOT_OWNER_ID });
    }
    if (cmd === 'removespins' || cmd === 'removegiros') {
      return commands.removeSpins(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config, BOT_OWNER_ID });
    }
    if (cmd === 'setspins' || cmd === 'setgiros') {
      return commands.setSpins(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config, BOT_OWNER_ID });
    }

    if (cmd === 'rank') {
      return commands.rankCommand(message, { renderRanking: rankingUtils.renderRanking, refreshCache: rankingUtils.refreshCache });
    }

    if (cmd === 'global') {
      return commands.globalCommand(message, args, { client, Player, HeadToHead: ctx.HeadToHead || require('../../models').HeadToHead, EmbedBuilder, COLORS, config, EMBED_DEFAULTS: ctx.EMBED_DEFAULTS });
    }

    if (cmd === 'matchhistory' || cmd === 'historial') {
      const target = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) || message.author;
      const context = {
        ...message,
        isInteraction: false,
        reply: (options) => message.channel.send(options)
      };
      await commands.handleMatchHistoryCommand(context, target, { MatchHistory, EmbedBuilder, COLORS, ActionRowBuilder, ButtonBuilder, ButtonStyle, Player, config });
      return;
    }

    if (cmd === 'grafica' || cmd === 'statsgraph' || cmd === 'stats') {
      return commands.statsGraph(message, args, { Player, MatchHistory, ensurePlayerRecord, COLORS, config });
    }

    if (cmd === 'addpuntos') {
      return commands.addPuntos(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, EMBED_DEFAULTS, computeSeasonRanking: rankingUtils.computeSeasonRanking, updateAffectedNicknames, invalidateGlobalRankCache: rankingUtils.invalidateGlobalRankCache, invalidateSeasonRankCache: rankingUtils.invalidateSeasonRankCache, sendLog, cacheInvalidator, performanceOptimizer, config, BOT_OWNER_ID });
    }
    if (cmd === 'removepuntos') {
      return commands.removePuntos(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, EMBED_DEFAULTS, computeSeasonRanking: rankingUtils.computeSeasonRanking, updateAffectedNicknames, invalidateGlobalRankCache: rankingUtils.invalidateGlobalRankCache, invalidateSeasonRankCache: rankingUtils.invalidateSeasonRankCache, sendLog, cacheInvalidator, performanceOptimizer, config, BOT_OWNER_ID });
    }

    if (cmd === 'puntoseveryone') {
      return commands.puntosEveryoneCommand(message, args, { 
        Player, COLORS, EMBED_DEFAULTS, sendLog, config,
        invalidateGlobalRankCache: rankingUtils.invalidateGlobalRankCache,
        invalidateSeasonRankCache: rankingUtils.invalidateSeasonRankCache
      });
    }

    if (cmd === 'addx2time') {
      return commands.addX2Time(message, args, { hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, parseDuration });
    }
    if (cmd === 'addproteccion') {
      return commands.addProteccion(message, args, { hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, parseDuration });
    }
    if (cmd === 'evento') {
      return commands.eventoCommand(message, args, { hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, settings, Setting, config });
    }
    if (cmd === 'eventos') {
      return commands.eventosCommand(message, args, { Setting, Player, COLORS, EMBED_DEFAULTS });
    }
    if (cmd === 'addcartera') {
      return commands.addCartera(message, args, { hasPermission, client, ensurePlayerRecord, COLORS, parseDuration, sendLog, removeTemporaryRole, config, BOT_OWNER_ID });
    }
    if (cmd === 'resetcartera') {
      return commands.resetCarteraCommand(message, args, { hasPermission, ensurePlayerRecord, sendLog, EmbedBuilder, COLORS, config, BOT_OWNER_ID });
    }

    if (cmd === 'coins' || cmd === 'saldo' || cmd === 'balance') {
      return commands.coinsCommand(message, { ensurePlayerRecord, COLORS });
    }
    if (cmd === 'giros' || cmd === 'spins') {
      return commands.girosCommand(message, args, { ensurePlayerRecord, COLORS });
    }

    if (cmd === 'addcoins') {
      return commands.addCoins(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config, BOT_OWNER_ID });
    }
    if (cmd === 'removecoins') {
      return commands.removeCoins(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config, BOT_OWNER_ID });
    }

    if (cmd === 'addwin') {
      return commands.addWin(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles: ctx.updateChampionRoles, championRoles: ctx.CHAMPION_ROLES, config, BOT_OWNER_ID });
    }
    if (cmd === 'removewin') {
      return commands.removeWin(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles: ctx.updateChampionRoles, championRoles: ctx.CHAMPION_ROLES, config, BOT_OWNER_ID });
    }
    if (cmd === 'addderrotas') {
      return commands.addLoss(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles: ctx.updateChampionRoles, championRoles: ctx.CHAMPION_ROLES, config, BOT_OWNER_ID });
    }
    if (cmd === 'removederrotas') {
      return commands.removeLoss(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, updateAffectedNicknames, EMBED_DEFAULTS, updateChampionRoles: ctx.updateChampionRoles, championRoles: ctx.CHAMPION_ROLES, config, BOT_OWNER_ID });
    }

    if (cmd === 'addmvp') {
      return commands.addMvp(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, EMBED_DEFAULTS, updateChampionRoles: ctx.updateChampionRoles, championRoles: ctx.CHAMPION_ROLES, config, BOT_OWNER_ID });
    }
    if (cmd === 'removemvp') {
      return commands.removeMvp(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, EMBED_DEFAULTS, updateChampionRoles: ctx.updateChampionRoles, championRoles: ctx.CHAMPION_ROLES, config, BOT_OWNER_ID });
    }

    if (cmd === 'addadvertencia') {
      return commands.addAdvertencia(message, args, { hasPermission, ensurePlayerRecord, COLORS, EMBED_DEFAULTS, parseDuration, sendLog, config, BOT_OWNER_ID });
    }
    if (cmd === 'removeadvertencia') {
      return commands.removeAdvertencia(message, args, { hasPermission, client, ensurePlayerRecord, COLORS, EMBED_DEFAULTS, sendLog, config, BOT_OWNER_ID });
    }

    if (cmd === 'addcreacion') {
      return commands.addCreacion(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config });
    }
    if (cmd === 'removecreacion') {
      return commands.removeCreacion(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config });
    }
    if (cmd === 'addracha') {
      return commands.addRacha(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config });
    }
    if (cmd === 'removeracha') {
      return commands.removeRacha(message, args, { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog, config });
    }

    if (cmd === 'resetstats') {
      return commands.resetStats(message, args, { hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, tryUpdateNicknameForMember, config, BOT_OWNER_ID });
    }
    if (cmd === 'resetallstats') {
      return commands.resetAllStats(message, args, { hasPermission, Player, MatchHistory, COLORS, sendLog, tryUpdateNicknameForMember, config, BOT_OWNER_ID });
    }

    if (cmd === 'exemptnick') {
      return commands.exemptNick(message, args, { hasPermission, client, excludedFromNickUpdate, Excluded, ensurePlayerRecord, COLORS, sendLog });
    }
    if (cmd === 'unexemptnick') {
      return commands.unexemptNick(message, args, { hasPermission, client, excludedFromNickUpdate, Excluded, ensurePlayerRecord, COLORS, sendLog });
    }
    if (cmd === 'exemptlist') {
      return commands.exemptList(message, args, { Excluded, COLORS, hasPermission });
    }

    if (cmd === 'exemptmove') {
      return commands.exemptMove(message, args, { hasPermission, client, excludedFromVoiceMove, Excluded, ensurePlayerRecord, COLORS, sendLog });
    }
    if (cmd === 'unexemptmove') {
      return commands.unexemptMove(message, args, { hasPermission, client, excludedFromVoiceMove, Excluded, ensurePlayerRecord, COLORS, sendLog });
    }
    if (cmd === 'exemptmovelist') {
      return commands.exemptMoveList(message, args, { Excluded, COLORS, hasPermission });
    }

    if (cmd === 'addrol') {
      return commands.addRol(message, args, { hasPermission, client, ensurePlayerRecord, COLORS, parseDuration, sendLog, BOT_OWNER_ID, removeTemporaryRole });
    }
    if (cmd === 'removerol') {
      return commands.removeRol(message, args, { hasPermission, client, COLORS, sendLog, BOT_OWNER_ID, ensurePlayerRecord });
    }
    if (cmd === 'addrolall') {
      return commands.addRolAll(message, args, { hasPermission, COLORS, sendLog, BOT_OWNER_ID });
    }
    if (cmd === 'removerolall') {
      return commands.removeRolAll(message, args, { hasPermission, COLORS, sendLog, BOT_OWNER_ID });
    }

    if (cmd === 'addpermiso') {
      return commands.addpermisoRol(message, args, { hasPermission, sendLog, COLORS });
    }

    if (cmd === 'addrolcall') {
      return commands.addrolcall(message, args, { sendLog, client });
    }

    if (cmd === 'sethistorychannel') {
      return commands.setHistoryChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setannouncements') {
      return commands.setAnnouncementsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setdailysummarychannel' || cmd === 'canalderankdiario') {
      return commands.setDailySummaryChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setdailycoinschannel' || cmd === 'canalderankcoins') {
      return commands.setDailyCoinsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setchampionsdailychannel' || cmd === 'canalpanelcampeones') {
      return commands.setChampionsDailyChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'settiktokchannel') {
      return commands.setTikTokChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogchannel') {
      return commands.setLogChannel(message, args, { hasPermission, Setting, settings, EMBED_DEFAULTS, COLORS, sendLog });
    }

    if (cmd === 'setemoji') {
      return commands.setEmojiCommand(message, args, { hasPermission, config, COLORS, sendLog });
    }

    if (cmd === 'emojipanel') {
      return commands.emojiPanelCommand(message, args, { hasPermission, config, COLORS });
    }

    if (cmd === 'darpermiso') {
      return commands.darPermisoCommand(message, args, { hasPermission, Player, COLORS, EMOJIS });
    }

    if (cmd === 'darrol') {
      return commands.darRolCommand(message, args, { Player, COLORS, EMOJIS, sendLog });
    }

    if (cmd === 'emojiid') {
      const emoji = args[0];
      if (!emoji) return message.reply(`${EMOJIS.error || '❌'} Debes poner un emoji después del comando. Ejemplo: \`!emojiid :smile:\``);
      return message.reply(`El ID del emoji es: \`${emoji}\``);
    }

    // Setters específicos por categoría
    if (cmd === 'setlogpoints' || cmd === 'setlogpuntos' || cmd === 'setlogpointschannel') {
      return commands.setLogPointsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogcoins' || cmd === 'setlogcoinschannel') {
      return commands.setLogCoinsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogwarnings' || cmd === 'setlogadv' || cmd === 'setlogwarningschannel') {
      return commands.setLogWarningsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogmatches' || cmd === 'setlogmatcheschannel') {
      return commands.setLogMatchesChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogqueues' || cmd === 'setlogqueueschannel') {
      return commands.setLogQueuesChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogautorole' || cmd === 'setlogautorolechannel') {
      return commands.setLogAutoroleChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogerrors' || cmd === 'setlogerrorschannel') {
      return commands.setLogErrorsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogstats' || cmd === 'setlogstatschannel') {
      return commands.setLogStatsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogshop' || cmd === 'setlogtienda' || cmd === 'setlogshopchannel') {
      return commands.setLogShopChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogroulette' || cmd === 'setlogruleta' || cmd === 'setlogroulettechannel') {
      return commands.setLogRouletteChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogs10k' || cmd === 'setlog10k' || cmd === 'setlogpenalty10kchannel') {
      return commands.setLogPenalty10kChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'postreglamento') {
      return commands.postReglamentoCommand(message, args, { hasPermission, client, COLORS, EMBED_DEFAULTS, config });
    }
    if (cmd === 'setlogspins' || cmd === 'setloggiros' || cmd === 'setlogspinschannel') {
      return commands.setLogSpinsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogreset' || cmd === 'setlogresetchannel') {
      return commands.setLogResetChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogvips' || cmd === 'setlogvipschannel') {
      return commands.setLogVipsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogexclusivo' || cmd === 'setlogexclusivochannel') {
      return commands.setLogExclusivoChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }


    if (cmd === 'setlogrolescall') {
      return commands.setLogRolesCallChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }

    if (cmd === 'setrankcallchannel') {
      return commands.setRankCallChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog, config });
    }

    if (cmd === 'setlogvoztiempo' || cmd === 'logvoztiempo' || cmd === 'setlogvoz' || cmd === 'setlogvoicetempchannel') {
      return commands.setLogVoiceTempChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }

    if (cmd === 'setlogterminos' || cmd === 'setlogterminoschannel') {
      return commands.setLogTerminosChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }

    if (cmd === 'setlogbets' || cmd === 'setlogapuestas' || cmd === 'logespectadores' || cmd === 'setlogespectadores' || cmd === 'setlogbetschannel') {
      return commands.setLogBetsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }

    if (cmd === 'setdailyrewardchannel' || cmd === 'canalderecompensas') {
      return commands.setDailyRewardChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }

    if (cmd === 'help') {
      return commands.helpCommand(message, args, { hasPermission, client, COLORS, EMBED_DEFAULTS });
    }
    if (cmd === 'help-old') {
      return commands.helpOldCommand(message, args, { COLORS, EMBED_DEFAULTS, hasPermission });
    }

    if (cmd === 'blacklist') {
      return commands.blacklistAdd(message, args, { hasPermission, Blacklist, blacklistedUsers, COLORS, sendLog, parseDuration });
    }
    if (cmd === 'unblacklist') {
      return commands.blacklistRemove(message, args, { hasPermission, Blacklist, blacklistedUsers, COLORS, sendLog });
    }
    if (cmd === 'blacklistinfo') {
      return commands.blacklistInfo(message, args, { hasPermission, blacklistedUsers, COLORS });
    }
    if (cmd === 'blacklistall') {
      return commands.blacklistAll(message, args, { hasPermission, blacklistedUsers, COLORS });
    }

    if (cmd === 'fixmatches') {
      return commands.fixMatches(message, args, { hasPermission, cleanupAllOrphanedMatches, loadActiveMatches, matches });
    }
    if (cmd === 'relogmatch' || cmd === 'relogmatches') {
      return commands.relogMatches(message, args, { hasPermission, MatchHistory, EmbedBuilder, COLORS, sendLog, settings });
    }
    if (cmd === 'syncnicks') {
      return commands.syncNicks(message, args, { hasPermission, nicknameUpdateQueue, updateNicknamesEfficiently });
    }

    if (cmd === 'startseason') {
      return commands.startSeason(message, args, { hasPermission, Player, Setting, settings, COLORS, EMBED_DEFAULTS, sendLog, generateSeasonSummaryEmbed, config });
    }
    if (cmd === 'rundaily' || cmd === 'enviardiario' || cmd === 'enviarresumendiario') {
      return commands.runDailyNow(message, args, { hasPermission, rankingUtils, settings, COLORS, EMBED_DEFAULTS, client, config, BOT_OWNER_ID });
    }
    if (cmd === 'previewdaily' || cmd === 'testdaily') {
      return commands.previewDaily(message, args, { hasPermission, COLORS, EMBED_DEFAULTS, config, BOT_OWNER_ID });
    }
    if (cmd === 'previewseasonembed' || cmd === 'testseasonembed') {
      return commands.previewSeasonEmbed(message, args, { hasPermission, Player, settings, COLORS, EMBED_DEFAULTS, config });
    }
    if (cmd === 'endseason') {
      return commands.endSeason(message, args, { hasPermission, Player, Setting, settings, COLORS });
    }
    if (cmd === 'season' || cmd === 'seasonstatus' || cmd === 'temporada') {
      return commands.seasonStatus(message, args, { settings, COLORS, EMBED_DEFAULTS });
    }
    if (cmd === 'setseasonsummarychannel') {
      return commands.setSeasonSummaryChannel(message, args, { hasPermission, Setting, settings, COLORS });
    }

    if (cmd === 'panel') {
      return commands.panel(message, args, { hasPermission, queues, matches, client, COLORS, EMBED_DEFAULTS });
    }
    if (cmd === 'panelcampeones' || cmd === 'campeones' || cmd === 'champions') {
      return commands.championsPanel(message, args, { client, config, COLORS, EMBED_DEFAULTS });
    }
    if (cmd === 'sendembed') {
      return commands.sendEmbed(message, args, { BOT_OWNER_ID, client, COLORS, EMBED_DEFAULTS });
    }
    if (cmd === 'paneltiktok') {
      return commands.postTikTokPanel(message, args, { COLORS, EMBED_DEFAULTS });
    }

    if (cmd === 'freelikes') {
      return commands.freelikes(message, args, { BOT_OWNER_ID, COLORS, EMBED_DEFAULTS, sendLog });
    }

    if (cmd === 'tiktok') {
      return commands.tiktokCommand(message, args, { COLORS, EMBED_DEFAULTS, hasPermission });
    }

    if (cmd === 'limpiarfilas' || cmd === 'forceclean') {
      return commands.cleanQueues(message, args, { hasPermission, queues, creatingQueue, startingMatch, ActiveQueue, sendLog, COLORS, EmbedBuilder, config, settings });
    }

    // Activar/desactivar modo mantenimiento (solo IDs específicos)
    if (cmd === 'mantenimiento' || cmd === 'maintenance') {
      return commands.setMaintenance(message, args, { Setting, settings, COLORS, EmbedBuilder, sendLog, client, setMaintenancePresence: ctx.setMaintenancePresence, BOT_OWNER_ID });
    }

    if (cmd === 'daily' || cmd === 'diario') {
      return commands.dailyCommand(message, args, { getDailyRankingFromDB: rankingUtils.getDailyRankingFromDB, EmbedBuilder, COLORS, EMBED_DEFAULTS });
    }

    if (cmd === 'dailycoins' || cmd === 'rankcoins' || cmd === 'coinsrank' || cmd === 'monedasdiarias') {
      return commands.dailyCoinsCommand(message, args, { getStyleCoinsRankingFromDB: rankingUtils.getStyleCoinsRankingFromDB, EmbedBuilder, COLORS, EMBED_DEFAULTS });
    }

    if (cmd === 'autorolpanel') {
      return commands.postAutorolePanel(message, args, { client, COLORS, EMBED_DEFAULTS, config });
    }
    if (cmd === 'rolpcymovil') {
      return commands.postPcMovilPanel(message, args, { client, COLORS, EMBED_DEFAULTS });
    }
    if (cmd === 'panelstreamer') {
      return commands.panelstreamer(message, args, { COLORS, BOT_OWNER_ID, config });
    }
    if (cmd === 'pasoapaso') {
      return commands.pasoapaso(message, args, { COLORS });
    }

    if (cmd === 'diagnoselogs' || cmd === 'probarlogs') {
      return commands.diagnoseLogs(message, args, { hasPermission, settings, sendLog, EmbedBuilder, COLORS, client, PermissionsBitField });
    }

    // Comandos de sugerencias (solo dos IDs permitidos)
    if (cmd === 'aceptarsugerencia' || cmd === 'as') {
      return commands.acceptSuggestion(message, args, { suggestionsUtils: ctx.suggestionsUtils, COLORS, EMBED_DEFAULTS, client, BOT_OWNER_ID });
    }
    if (cmd === 'rechazarsugerencia' || cmd === 'rs') {
      return commands.rejectSuggestion(message, args, { suggestionsUtils: ctx.suggestionsUtils, COLORS, EMBED_DEFAULTS, client, BOT_OWNER_ID });
    }
    if (cmd === 'eliminarsugerencia' || cmd === 'es') {
      return commands.deleteSuggestion(message, args, { suggestionsUtils: ctx.suggestionsUtils, client, BOT_OWNER_ID });
    }

    if (cmd === 'setantiraid') {
      return commands.setAntiRaid(message, args, { hasPermission, Setting, settings, COLORS, sendLog, BOT_OWNER_ID });
    }

    if (cmd === 'setlograid' || cmd === 'setlograidchannel') {
      return commands.setLogRaidChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }

    if (cmd === 'logterminos') {
      return commands.setLogTerminosChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }

    if (cmd === 'exclusivo') {
      return commands.exclusivo(message, args, { excludedFromNickUpdate, excludedFromVoiceMove, excludedFromQueueRestriction, Excluded, COLORS, sendLog });
    }

    if (cmd === 'unexclusivo') {
      return commands.unexclusivo(message, args, { excludedFromNickUpdate, excludedFromVoiceMove, excludedFromQueueRestriction, Excluded, COLORS, sendLog });
    }

    if (cmd === 'exclusivolist') {
      return commands.exclusivolist(message, args, { excludedFromQueueRestriction, COLORS });
    }

    // --- VIP SYSTEM COMMANDS ---
    if (cmd === 'vipsangriento') {
      return commands.vipSangrientoCommand(message, args, { sendLog });
    }
    if (cmd === 'vipabsoluto') {
      return commands.vipAbsolutoCommand(message, args, { sendLog });
    }
    if (cmd === 'vipfantasma') {
      return commands.vipFantasmaCommand(message, args, { sendLog });
    }
    if (cmd === 'vipsenhor') {
      return commands.vipSenhorCommand(message, args, { sendLog });
    }
    if (cmd === 'vippresenca') {
      return commands.vipPresencaCommand(message, args, { sendLog });
    }
    if (cmd === 'vipcaos') {
      return commands.vipCaosCommand(message, args, { sendLog });
    }
    if (cmd === 'vipceus') {
      return commands.vipCeusCommand(message, args, { sendLog });
    }
    if (cmd === 'reclamarvip') {
      return commands.reclamarVipCommand(message, args, { Player, COLORS, EMBED_DEFAULTS, sendLog, VipKey, tryUpdateNicknameForMember });
    }
    if (cmd === 'logsvips') {
      // Soporte para configurar el canal de logs usando el mismo comando
      if (args.length > 0 && (message.mentions.channels.size > 0 || /^\d+$/.test(args[0]))) {
        return commands.setLogVipsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
      }
      return commands.logsVipsCommand(message, args, { Player, COLORS, EMBED_DEFAULTS, config });
    }
    if (cmd === 'setlogvips') {
      return commands.setLogVipsChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'setlogexclusivo') {
      return commands.setLogExclusivoChannel(message, args, { hasPermission, Setting, settings, COLORS, sendLog });
    }
    if (cmd === 'borrarkeys') {
      return commands.borrarKeysCommand(message, args, { Player, COLORS, EMBED_DEFAULTS, sendLog });
    }

    if (cmd === 'enviarlive') {
      return commands.enviarlive(message, { EMOJIS, hasPermission, BOT_OWNER_ID });
    }
  } catch (err) {
    console.error('Error en messageCreate:', err);
    try {
      if (sendLog) {
        const errEmbed = new EmbedBuilder()
          .setTitle(`${EMOJIS.warning || '⚠️'} Error Crítico en messageCreate`)
          .setDescription(`Se produjo un error procesando un mensaje.\n**Error:** ${err.message}\n**Stack:**\n\`\`\`js\n${err.stack?.slice(0, 1000)}\n\`\`\``)
          .setColor(COLORS.ERROR || 0xFF0000)
          .setTimestamp();
        await sendLog(message?.guild, errEmbed, [], 'errors');
      }
      if (message && !message.author.bot) {
        await message.reply({ content: `${EMOJIS.error || '❌'} Ocurrió un error interno al procesar tu comando. El staff ha sido notificado.` }).catch(() => { });
      }
    } catch (logErr) {
      console.error('Error intentando loguear el error original:', logErr);
    }
  }
};
