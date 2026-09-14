module.exports = {
  handleQueueMenuSelection: async function (interaction, deps) {
    const {
      queues,
      hasPermission,
      BOT_OWNER_ID,
      startingMatch,
      getNextMatchNumber,
      ActiveMatch,
      ActiveQueue,
      matches,
      EmbedBuilder,
      COLORS,
      EMBED_DEFAULTS,
      StringSelectMenuBuilder,
      ActionRowBuilder,
      ComponentType,
      ButtonBuilder,
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
      PermissionsBitField,
      ButtonStyle,
      SPECTATOR_ROLE_ID,
      config,
      checkVoiceChannelPermissions,
      ThreadAutoArchiveDuration,
      ChannelType,
      movePlayerToOriginalVoiceChannel,
      movePlayersToMatchChannels,
      movePlayersToWaitingRoom,
      createMatchObject,
      sendLog,
      settings,
      safeReplyEphemeral,
      ensurePlayerRecord,
      computeSeasonRanking,
      getSeasonRankCache,
      QUEUE_EMOJIS,
      excludedFromVoiceMove,
      checkTikTokLive,
      ALLOWED_VOICE_CATEGORIES,
      WAITING_ROOM_VOICE_CHANNEL_ID,
      Player,
      voicePenaltyPoints,
      excludedFromQueueRestriction,
    } = deps;

    const resolveEmojiTextLocal = (token) => {
      try {
        if (!token) return "";
        if (typeof token === "object") {
          const id = token.id;
          const cached = id ? interaction.client.emojis?.cache?.get(id) : null;
          const name = cached?.name || token.name || "emoji";
          const animated = cached?.animated ?? token.animated ? true : false;
          return `<${animated ? "a:" : ":"}${name}:${id}>`;
        }
        if (typeof token === "string") {
          if (/^\d+$/.test(token)) {
            const cached = interaction.client.emojis?.cache?.get(token);
            const name = cached?.name || "emoji";
            const animated = cached?.animated ? true : false;
            return `<${animated ? "a:" : ":"}${name}:${token}>`;
          }
          return token;
        }
        return "";
      } catch (_) {
        return "";
      }
    };

    // Nota: NO hacer defer/update globalmente aquí.
    // Algunas acciones (como mostrar un modal) requieren que la interacción no haya sido respondida/deferrida.
    const parts = interaction.customId.split(":");
    const channelId = parts[1];
    const queue = queues.get(channelId);
    if (!queue)
      return safeReplyEphemeral(
        interaction,
        "⚠️ La fila ya no existe o ha expirado."
      );

    // Roles específicos que pueden manipular el menú de fila (basado en config)
    const QUEUE_MANAGEMENT_ROLES = [
      ...(config.manageRole || []),
      ...(config.staffRoleId || []),
      "1484375565975617595", // Admin (fallback)
      "1484375565975617594", // Moderador (fallback)
    ];

    // Verificar si el usuario tiene alguno de los roles permitidos
    const hasQueueManagementRole = QUEUE_MANAGEMENT_ROLES.some((roleId) =>
      interaction.member?.roles?.cache?.has(roleId)
    );

    if (interaction.user.id !== queue.creatorId && !hasQueueManagementRole) {
      const { MessageFlags } = require('discord.js');
      return interaction
        .reply({
          content:
            "Solo el creador de la fila o usuarios con roles autorizados pueden usar este menú.",
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => { });
    }
    const value = interaction.values[0];

    try {
      if (value === "start") {
        // Deferir inmediatamente para evitar timeout (10062) durante validaciones largas
        await interaction.deferUpdate().catch(() => {});

        if (
          !queue.hasUser(interaction.user.id) &&
          !(Array.isArray(BOT_OWNER_ID)
            ? BOT_OWNER_ID.includes(interaction.user.id)
            : interaction.user.id === BOT_OWNER_ID)
        ) {
          return safeReplyEphemeral(
            interaction,
            "❌ No puedes iniciar la partida porque no estás en la fila."
          );
        }

        if (startingMatch.has(queue.channelId)) {
          return safeReplyEphemeral(
            interaction,
            "⚙️ ¡Ya se está iniciando una partida desde esta fila! Por favor, espera un momento."
          );
        }
        startingMatch.add(queue.channelId);

        const allPlayers = [...queue.team1, ...queue.team2];
        
        // Verificar si algún jugador está en live en TikTok al iniciar
        if (typeof checkTikTokLive === 'function') {
          allPlayers.forEach(playerId => {
            checkTikTokLive(playerId, interaction.guild, settings)
              .catch(e => console.error(`Error checking TikTok live for ${playerId} on match start:`, e));
          });
        }

        // Revalidar puntos de todos los jugadores si hay apuesta activa
        if (queue.wager.amount > 0) {
          try {
            const docs = await Promise.all(
              allPlayers.map((id) => ensurePlayerRecord(id))
            );
            const insuficientes = allPlayers.filter(
              (id, i) =>
                (docs[i]?.currentSeason?.points || 0) < queue.wager.amount
            );
            if (insuficientes.length > 0) {
              startingMatch.delete(queue.channelId);
              return safeReplyEphemeral(
                interaction,
                `❌ No se puede iniciar la partida. La apuesta de **${queue.wager.amount
                } puntos** ya no es válida porque estos jugadores no tienen suficientes puntos: ${insuficientes
                  .map((id) => `<@${id}>`)
                  .join(", ")}\n` +
                `Vuelvan a proponer la apuesta con un monto acorde o ajusten saldos.`
              );
            }
          } catch (e) {
            startingMatch.delete(queue.channelId);
            return safeReplyEphemeral(
              interaction,
              "⚠️ Ocurrió un error al validar los puntos de la apuesta antes de iniciar la partida. Intenta nuevamente."
            );
          }
        }
        if (
          queue.wager.amount > 0 &&
          queue.wager.accepted.size < allPlayers.length
        ) {
          startingMatch.delete(queue.channelId);
          return safeReplyEphemeral(
            interaction,
            `❌ No se puede iniciar la partida. La apuesta de **${queue.wager.amount
            } puntos** no ha sido aceptada por todos los jugadores.\n**Faltan por aceptar:** ${allPlayers
              .filter((id) => !queue.wager.accepted.has(id))
              .map((id) => `<@${id}>`)
              .join(", ")}`
          );
        }

        if (
          queue.team1.length !== queue.teamSize ||
          queue.team2.length !== queue.teamSize
        ) {
          startingMatch.delete(queue.channelId);
          return safeReplyEphemeral(
            interaction,
            "❌ **Inicio cancelado.** Uno o más jugadores abandonaron la fila mientras se iniciaba la partida. La fila se ha reabierto."
          );
        }

        await interaction.deferUpdate().catch(() => { });
        // Aviso breve para el iniciador: iniciar puede tardar más con muchos jugadores
        await interaction
          .followUp({
            content:
              "⏱️ Aviso: si hay muchos jugadores en la fila, iniciar la partida puede tardar un poco. No te preocupes.",
            ephemeral: true,
          })
          .catch(() => { });
        let matchNumber, matchKeyFinal, matchData, textChannel;
        try {
          let attempts = 0;
          const MAX_ATTEMPTS = 5;
          while (attempts < MAX_ATTEMPTS) {
            let tempMatchId = `intent-${interaction.guild.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            try {
              // 1. Registrar intención en memoria para que getNextMatchNumber lo vea
              matches.set(tempMatchId, { guildId: interaction.guild.id, status: 'creating', matchId: tempMatchId });

              // 2. Obtener número de partida determinista
              matchNumber = await getNextMatchNumber(interaction.guild.id, tempMatchId);
              matchKeyFinal = `${interaction.guild.id}:${matchNumber}`;
              
              matchData = {
                _id: matchKeyFinal,
                guildId: interaction.guild.id,
                queueCategoryId: queue.filaCategoryId,
                matchNumber,
                status: "creating",
                queueMessageId: interaction.message.id,
                queueChannelId: interaction.channel.id
              };

              // 3. Intentar guardar en DB
              await new ActiveMatch(matchData).save();

              // 4. Registrar final en memoria y limpiar intención
              if (matches && typeof matches.set === 'function') {
                matches.set(matchKeyFinal, matchData);
              }
              matches.delete(tempMatchId);
              break;
            } catch (e) {
              // Limpiar intención en caso de error/reintento
              matches.delete(tempMatchId);
              if (e.code === 11000) {
                attempts++;
                console.warn(
                  `[Race Condition] Intento de crear partida #${matchNumber} falló (ya existe). Reintentando... (${attempts}/${MAX_ATTEMPTS})`
                );
                continue;
              }
              if (e.message === 'MAX_MATCHES_REACHED') {
                startingMatch.delete(queue.channelId);
                return safeReplyEphemeral(
                  interaction,
                  '❌ **Límite de partidas alcanzado (20/20).**\nNo hay canales disponibles en este momento. Por favor, espera a que finalice alguna partida para iniciar una nueva.'
                );
              }
              throw new Error(
                `Error al reservar el número de partida en la DB: ${e.message}`
              );
            }
          }
          if (attempts >= MAX_ATTEMPTS) {
            throw new Error(
              "No se pudo crear la partida después de varios intentos. Demasiadas solicitudes simultáneas."
            );
          }

          const MATCH_VOICE_CHANNELS = {
            1: ['1548203267266449408', '1548203272450474114'],
            2: ['1548203274086387722', '1548203276703629322'],
            3: ['1548203277928235050', '1548203281019568238'],
            4: ['1548203282869129257', '1548203286451191858'],
            5: ['1548203288132853831', '1548203290699763772'],
            6: ['1548203292226752663', '1548203294701391912'],
            7: ['1548203296211345410', '1548203298572599378'],
            8: ['1548203300124622929', '1548203302825623632'],
            9: ['1548203304817787021', '1548203308416639037'],
            10: ['1548203310182432819', '1548203312715796552'],
            11: ['1548203314422743100', '1548203317027541002'],
            12: ['1548203318512328835', '1548203320798220400'],
            13: ['1548203322899562526', '1548203327102132275'],
            14: ['1548203329891475494', '1548203332319969390'],
            15: ['1548203333951426610', '1548203337512517645'],
            16: ['1489717619048317010', '1489717622604824766'],
            17: ['1489717624379015330', '1489717625243173044'],
            18: ['1489717626086232356', '1489717627122221327'],
            19: ['1489717627780731142', '1489717629206663289'],
            20: ['1489717630356029495', '1489717632222363689']
          };
          // FIX: Asignar canales cíclicamente si el número de partida excede 20
          // Esto permite que la partida #21 use los canales de la #1, etc.
          const voiceIndex = ((matchNumber - 1) % 20) + 1;
          const channelIds = MATCH_VOICE_CHANNELS[voiceIndex];
          if (!channelIds)
            throw new Error(
              `No se encontraron canales de voz configurados para la partida #${matchNumber}.`
            );

          const occupiedVoiceChannelIds = new Set(
            [...matches.values()].flatMap((m) => m.voiceChannelIds || [])
          );
          if (
            occupiedVoiceChannelIds.has(channelIds[0]) ||
            occupiedVoiceChannelIds.has(channelIds[1])
          ) {
            throw new Error(
              `Los canales de voz para la partida #${matchNumber} ya están en uso.`
            );
          }

          const [voice1, voice2] = await Promise.all(
            channelIds.map((id) =>
              interaction.guild.channels.fetch(id).catch(() => null)
            )
          );
          if (!voice1 || !voice2)
            throw new Error(
              `Uno o ambos canales de voz para la partida #${matchNumber} no existen.`
            );

          const botMember = interaction.guild.members.me;
          const v1Perms = checkVoiceChannelPermissions(voice1, botMember);
          const v2Perms = checkVoiceChannelPermissions(voice2, botMember);
          if (!v1Perms.hasPermission || !v2Perms.hasPermission) {
            const missingPerms = [
              ...new Set([...v1Perms.missing, ...v2Perms.missing]),
            ];
            throw new Error(
              `No puedo iniciar la partida. Faltan permisos en los canales de voz designados: **${missingPerms.join(
                ", "
              )}**.`
            );
          }

          // VALIDACIÓN ESTRICTA: Asegurar que los equipos estén completos antes de iniciar
          // Esto previene que se inicie 1v1 con solo 1 jugador si alguien se sale justo antes.
          if (
            queue.team1.length !== queue.teamSize ||
            queue.team2.length !== queue.teamSize
          ) {
            return safeReplyEphemeral(
              interaction,
              `❌ No se puede iniciar: faltan jugadores. Se requieren ${queue.teamSize} por equipo.`
            );
          }

          // SNAPSHOT DE EQUIPOS: Congelar el estado de los equipos para evitar condiciones de carrera
          // si un jugador se sale mientras se crea el hilo/canales.
          const finalTeam1 = [...queue.team1];
          const finalTeam2 = [...queue.team2];

          // Eliminar IDs duplicados usando un Set
          const allStaffRoles = new Set([
            ...(config.staffRoleId || []),
            ...(config.manageRole || []),
            "1484375565975617595", // Admin (fallback)
            "1484375565975617594", // Moderador (fallback)
          ]);
          const staffRoles = [...allStaffRoles]; // Convertir de vuelta a array

          // Primero: FORZAR el bot a CARGAR TODOS los Roles y Miembros del servidor!
          await interaction.guild.roles.fetch().catch(() => {});
          await interaction.guild.members.fetch().catch(() => {});

          // Función para FILTRAR IDs que EXISTEN en el servidor
          const filterValidIds = (permissionsArray) => {
            return permissionsArray.filter((perm) => {
              return (
                interaction.guild.roles.cache.has(perm.id) || 
                interaction.guild.members.cache.has(perm.id)
              );
            });
          };

          const basePermissions = [
            {
              id: interaction.guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: "1489744493677641789", // Este es el rol de solo ver, no el guild ID!
              allow: [PermissionsBitField.Flags.ViewChannel],
              deny: [PermissionsBitField.Flags.Connect],
            },
            // ROL EXCLUSIVO: Acceso total para entrar y hablar
            {
              id: "1489754427220037724",
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
              ],
            },
            // NO añadir SPECTATOR_ROLE_ID de nuevo, es el mismo que el rol exclusivo!
            ...staffRoles.map((roleId) => ({
              id: roleId,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
                PermissionsBitField.Flags.MoveMembers,
              ],
            })),
          ];
          
          // Primero generamos los permisos, luego LOS FILTRAMOS
          let vc1Permissions = [
            ...basePermissions,
            ...finalTeam1.map((id) => ({
              id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
              ],
            })),
            ...finalTeam2.map((id) => ({
              id,
              deny: [PermissionsBitField.Flags.Connect],
            })),
          ];
          let vc2Permissions = [
            ...basePermissions,
            ...finalTeam2.map((id) => ({
              id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
              ],
            })),
            ...finalTeam1.map((id) => ({
              id,
              deny: [PermissionsBitField.Flags.Connect],
            })),
          ];

          // Ahora FILTRAMOS los permisos para quitar IDs inválidos!
          vc1Permissions = filterValidIds(vc1Permissions);
          vc2Permissions = filterValidIds(vc2Permissions);

          // Crear el hilo de partida directamente bajo el canal de la fila
          const MATCH_TEXT_PARENT_CHANNEL_ID =
            config && (config.matchThreadsParentChannelId || config.matchThreadChannelId)
              ? (config.matchThreadsParentChannelId || config.matchThreadChannelId)
              : "1548203265433276466";
          const parentTextChannel = await interaction.guild.channels
            .fetch(MATCH_TEXT_PARENT_CHANNEL_ID)
            .catch(() => null);
          if (
            !parentTextChannel ||
            parentTextChannel.type !== ChannelType.GuildText
          )
            throw new Error(
              `El canal destino para hilos de partida no es un canal de texto válido o no existe.`
            );
          // Validar permisos del bot en el canal padre para evitar problemas de acceso/historial
          try {
            const botMember = interaction.guild.members.me;
            const neededParentPerms = [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.SendMessagesInThreads,
              PermissionsBitField.Flags.CreatePrivateThreads,
              PermissionsBitField.Flags.ManageThreads,
              PermissionsBitField.Flags.ManageRoles,
            ];
            const botPerms = parentTextChannel.permissionsFor(botMember);
            const missing = neededParentPerms.filter((p) => !botPerms?.has(p));
            if (missing.length > 0) {
              throw new Error(
                `Faltan permisos en el canal padre de hilos: ${missing
                  .map((x) => x.toString())
                  .join(", ")}`
              );
            }
          } catch (permErr) {
            throw new Error(
              `No puedo crear/gestionar el hilo de partida: ${permErr.message}`
            );
          }

          const allPlayerIdsToMove = [...finalTeam1, ...finalTeam2];
          const membersToMove = new Map();

          // 1. Crear el hilo (MANTENER EN FOREGROUND)
          const wagerForName = queue.wager?.amount > 0 ? ` | Apuesta ${queue.wager.amount} pts` : '';
          console.log(`[Match Creation] Creando hilo para partida #${matchNumber} en canal ${parentTextChannel.id}`);
          
          const thread = await parentTextChannel.threads.create({
            name: `Partida #${matchNumber} | ${queue.mode.toUpperCase()}${wagerForName}`,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            type: ChannelType.PrivateThread,
            invitable: false,
            reason: `Partida #${matchNumber}`,
          });
          
          console.log(`[Match Creation] Hilo creado: ${thread ? thread.id : 'undefined'}`);
          
          if (!thread) {
            throw new Error('No se pudo crear el hilo de la partida');
          }
          
          textChannel = thread;

          // 2. Definir menciones
          const playerIdsToMention = [
            ...new Set([...(finalTeam1 || []), ...(finalTeam2 || [])]),
          ];
          const staffRoleIds = [...new Set([...(config.staffRoleId || []), ...(config.manageRole || [])])]
            .filter(Boolean)
            .filter(roleId => interaction.guild.roles.cache.has(roleId)); // Solo IDs que existen en el servidor
          
          const playerMentions = playerIdsToMention.map((id) => `<@${id}>`).join(" ");
          const staffMentions = staffRoleIds.map((id) => `<@&${id}>`).join(" ");

          // 3. Configurar permisos en el canal padre para permitir escritura en hilos (SOLO JUGADORES)
          console.log(`[Match Creation] Configurando permisos en canal padre ${parentTextChannel.id}`);
          if (parentTextChannel.permissionOverwrites) {
            await Promise.allSettled(
              playerIdsToMention.map(playerId => 
                parentTextChannel.permissionOverwrites.create(playerId, {
                  ViewChannel: true,
                  SendMessagesInThreads: true
                }).then(() => {
                  console.log(`[Match Creation] Permisos de canal padre configurados para ${playerId}`);
                }).catch(err => {
                  console.error(`[Match Creation] Error configurando permisos de canal padre para ${playerId}:`, err.message);
                })
              )
            );
          } else {
            console.error(`[Match Creation] parentTextChannel.permissionOverwrites es undefined`);
          }
          
          // 4. Añadir explícitamente a los jugadores al hilo (garantiza acceso)
          console.log(`[Match Creation] Añadiendo ${playerIdsToMention.length} jugadores al hilo ${thread.id}`);
          if (thread.members) {
            await Promise.allSettled(
              playerIdsToMention.map(playerId => thread.members.add(playerId).then(() => {
                console.log(`[Match Creation] Usuario ${playerId} añadido al hilo`);
              }).catch(err => {
                console.error(`[Match Creation] Error añadiendo usuario ${playerId}:`, err.message);
              }))
            );
          } else {
            console.error(`[Match Creation] thread.members es undefined para hilo ${thread.id}`);
          }

          // 5. Enviar mensaje de bienvenida. ¡Mencionar a los jugadores aquí los añade al hilo SILENCIOSAMENTE!
          console.log(`[Match Creation] Enviando mensaje de bienvenida con menciones`);
          const welcomeMessage = await textChannel.send({
            content: `¡Bienvenidos a la partida! ${playerMentions} ${staffMentions}`,
            allowedMentions: {
              users: playerIdsToMention,
              roles: staffRoleIds,
              replied_user: false,
            },
          }).catch(() => null);

          // Registro inmediato en DB para que cleanupAllOrphanedMatches lo vea como registrado
          await ActiveMatch.findByIdAndUpdate(matchKeyFinal, { $set: { textChannelId: thread.id } }).catch(() => {});

          // 4. BACKGROUND: Mover jugadores, configurar permisos de voz, y agregar Staff silenciosamente
          Promise.resolve().then(async () => {
            try {
              // A. Mover jugadores y configurar permisos de voz
              await Promise.allSettled([
                movePlayersToMatchChannels({
                  guild: interaction.guild,
                  team1: finalTeam1,
                  team2: finalTeam2,
                  voiceChannels: [voice1, voice2],
                  excludedFromVoiceMove,
                }),
                voice1.permissionOverwrites.set(vc1Permissions, "Inicio de partida"),
                voice2.permissionOverwrites.set(vc2Permissions, "Inicio de partida"),
              ]);

              // B. Configurar permisos de escritura para roles de staff en el canal padre (BACKGROUND)
              console.log(`[Background Setup] Configurando permisos para ${staffRoleIds.length} roles de staff en canal padre`);
              if (parentTextChannel.permissionOverwrites) {
                await Promise.allSettled(
                  staffRoleIds.map(roleId => 
                    parentTextChannel.permissionOverwrites.create(roleId, {
                      ViewChannel: true,
                      SendMessagesInThreads: true,
                      ManageThreads: true
                    }).then(() => {
                      console.log(`[Background Setup] Permisos de staff configurados para rol ${roleId} en canal padre`);
                    }).catch(err => {
                      console.error(`[Background Setup] Error configurando permisos de staff para ${roleId}:`, err.message);
                    })
                  )
                );
              }

              // C. Adición silenciosa de staff (Ghost Pinging)
              // OPTIMIZACIÓN: No hacer guild.members.fetch() completo (descarga TODOS los miembros, tarda 1-3s).
              // role.members ya está populado en la caché de discord.js cuando el rol está cacheado.
              
              const staffMembersMap = new Map();
              for (const roleId of staffRoleIds) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                  role.members.forEach(m => { if (!m.user.bot && !playerIdsToMention.includes(m.id)) staffMembersMap.set(m.id, true); });
                }
              }
              const staffIds = Array.from(staffMembersMap.keys());
              if (staffIds.length > 0) {
                const chunks = [];
                for (let i = 0; i < staffIds.length; i += 50) chunks.push(staffIds.slice(i, i + 50));
                for (const chunk of chunks) {
                  const m = await textChannel.send({ content: chunk.map(id => `<@${id}>`).join(''), allowedMentions: { users: chunk } }).catch(() => null);
                  if (m) m.delete().catch(() => { });
                }
              }

              // D. Limpieza de respaldo (por si Discord generó algún system message residual)
              const cleanSystemMsgs = async () => {
                try {
                  const messages = await textChannel.messages.fetch({ limit: 50, force: true }).catch(() => new Map());
                  const toDelete = messages.filter(m => m.system);
                  for (const m of toDelete.values()) await m.delete().catch(() => { });
                } catch (_) { }
              };
              setTimeout(cleanSystemMsgs, 2000);


            } catch (err) {
              console.error(`[Background Setup] Error en gestión del hilo #${matchNumber}: ${err.message}`);
            }
          });


          const team1HeaderIcon = resolveEmojiTextLocal(
            (QUEUE_EMOJIS && QUEUE_EMOJIS.team1Header) || "🔵"
          );
          const team2HeaderIcon = resolveEmojiTextLocal(
            (QUEUE_EMOJIS && QUEUE_EMOJIS.team2Header) || "🔴"
          );
          const matchInfoEmbed = new EmbedBuilder()
            .setTitle(
              `⚔️ Partida #${matchNumber} | ${queue.mode.toUpperCase()}`
            )
            .setColor(COLORS.PRIMARY)
            .setDescription(
              "¡La partida ha comenzado! Buena suerte a ambos equipos."
            )
            .setFields(
              {
                name: `${team1HeaderIcon} Equipo 1`,
                value:
                  (finalTeam1 || []).map((id) => `<@${id}>`).join("\n") || "—",
                inline: true,
              },
              {
                name: `${team2HeaderIcon} Equipo 2`,
                value:
                  (finalTeam2 || []).map((id) => `<@${id}>`).join("\n") || "—",
                inline: true,
              }
            )
            .setImage(EMBED_DEFAULTS.thumbnail)
            .setFooter(EMBED_DEFAULTS.footer)
            .setTimestamp();
          if (queue.wager.amount > 0)
            matchInfoEmbed.addFields({
              name: `<a:MONEDA:1490919358707536002> Apuesta Activa`,
              value: `\`${queue.wager.amount}\` puntos por jugador`,
            });
          // OPTIMIZACIÓN: Iniciar envío de información de partida en paralelo
          const matchInfoPromise = textChannel.send({ embeds: [matchInfoEmbed] });

          const EMOJIS = config.emojis || {};
          const managementMenu = new StringSelectMenuBuilder()
            .setCustomId(`match:${interaction.guild.id}:${matchNumber}:menu`)
            .setPlaceholder("⚙️ Selecciona una acción para la partida...")
            .addOptions([
              {
                label: "Elegir Creador de Sala",
                value: "creator",
                emoji: "👑",
              },
              { label: "Elegir MVP", value: "mvp", emoji: "⭐" },
              { label: "Elegir Equipo Ganador", value: "winner", emoji: "🏆" },
              { label: "Cerrar y Aplicar Puntos", value: "close", emoji: "✅" },
              {
                label: "Anular Partida (Staff)",
                value: "staffclose",
                emoji: "🛡️",
              },
            ]);
          const controlRow = new ActionRowBuilder().addComponents(
            managementMenu
          );
          const controlPanelEmbed = new EmbedBuilder()
            .setTitle(`⚔️ Gestión de Partida #${matchNumber}`)
            .setColor(COLORS.PRIMARY)
            .setDescription(
              `Usa el menú desplegable para gestionar la partida.`
            )
            .addFields(
              {
                name: `${EMOJIS.crown || "👑"} Creador de Sala`,
                value: "`Aún no seleccionado`",
                inline: true,
              },
              {
                name: `${EMOJIS.mvp || "⭐"} MVP de la Partida`,
                value: "`Aún no seleccionado`",
                inline: true,
              },
              {
                name: `${EMOJIS.winner || "🏆"} Equipo Ganador`,
                value: "`Aún no seleccionado`",
                inline: true,
              },
              {
                name: `${EMOJIS.id || "🔑"} Datos de Sala`,
                value: "`Aún no registrados`",
                inline: false,
              }
            )
            .setImage(EMBED_DEFAULTS.thumbnail)
            .setFooter(EMBED_DEFAULTS.footer);

          // Esperar a que ambos mensajes se envíen
          const [_, controlPanelMessage] = await Promise.all([
            matchInfoPromise,
            textChannel.send({
              embeds: [controlPanelEmbed],
              components: [controlRow],
            }),
          ]);

          // Pinear el mensaje de control para que siempre esté visible
          controlPanelMessage.pin().catch(() => {});

          const baseMatch = createMatchObject({
            queue,
            matchTextChannel: textChannel,
            matchVoiceChannels: [voice1, voice2],
            creatorId: queue.creatorId,
          });
          const baseObj =
            typeof baseMatch.toObject === "function"
              ? baseMatch.toObject()
              : baseMatch;
          Object.assign(matchData, {
            _id: matchKeyFinal,
            guildId: interaction.guild.id,
            queueCategoryId: queue.filaCategoryId,
            matchNumber,
            mode: queue.mode,
            creatorId: queue.creatorId,
            team1: finalTeam1.filter(Boolean),
            team2: finalTeam2.filter(Boolean),
            selectedCreator: null,
            selectedMVP: null,
            selectedWinner: null,
            closed: false,
            status: "active",
            wagerAmount: queue.wager.amount,
            idProvided: null,
            idAndPasswordSet: false,
            textChannelId: baseObj.textChannelId,
            voiceChannelIds: baseObj.voiceChannelIds,
            messageId: controlPanelMessage.id,
            queueChannelId: queue.channelId || interaction.channel.id,
            previousVoice: queue.prevVoice || {},
            createdAt: baseObj.createdAt || new Date().toISOString(),
            voicePenaltyAppliedUserIds: matchData.voicePenaltyAppliedUserIds || [],
            gracePeriodEnd: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutos de gracia
          });

          // Actualizar memoria INMEDIATAMENTE para evitar condiciones de carrera si el usuario interactúa rápido
          matches.set(matchKeyFinal, {
            ...matchData,
            previousVoice: matchData.previousVoice || {},
          });

          // OPTIMIZACIÓN: Ejecutar actualizaciones de DB en paralelo
          await Promise.all([
            ActiveMatch.findByIdAndUpdate(matchKeyFinal, matchData),
            ActiveQueue.findByIdAndDelete(channelId).catch((e) =>
              console.error(
                `[Fila Start] Error eliminando fila ${channelId} de la DB:`,
                e
              )
            ),
          ]);
          queues.delete(channelId);
          clearTimeout(queue.timeout);
          if (queue.hardTimeout) clearTimeout(queue.hardTimeout);

          const playerIdsToCheck = [
            ...new Set([...(finalTeam1 || []), ...(finalTeam2 || [])]),
          ];
          if (playerIdsToCheck.length > 0 && textChannel) {
          const guild = interaction.guild;
            let membersMap = null;
            try {
              membersMap = await guild.members.fetch({ user: playerIdsToCheck });
            } catch (_) {
              membersMap = new Map();
            }
            const allowedSet = new Set([
              ...(ALLOWED_VOICE_CATEGORIES || []).map((x) => String(x)),
              "1489717329465053294" // Nueva categoría permitida para evitar penalizaciones
            ]);
            const penalizedIds = [];
            const ensurePromises = [];
            for (const playerId of playerIdsToCheck) {
              const member = membersMap.get(playerId);
            if (member) {
              const isOwner = Array.isArray(BOT_OWNER_ID)
                ? BOT_OWNER_ID.includes(member.id)
                : member.id === BOT_OWNER_ID;
              const isAdmin = member.permissions?.has(
                PermissionsBitField.Flags.Administrator
              );
                const isExemptByRole = [
                  ...(config.manageRole || []),
                  ...(config.staffRoleId || []),
                  "1484375565975617595", // Admin (fallback)
                  "1484375565975617594", // Moderador (fallback)
                ].some(roleId => member.roles?.cache?.has(roleId));
                const isExcluded = excludedFromQueueRestriction && excludedFromQueueRestriction.has(member.id);
                if (isOwner || isAdmin || isExemptByRole || isExcluded) {
                  continue;
                }
            }
              const voiceChannel =
                member && member.voice && member.voice.channel
                  ? member.voice.channel
                  : null;
              let isAllowed = false;
              if (voiceChannel) {
                const parentId = voiceChannel.parentId
                  ? String(voiceChannel.parentId)
                  : null;
                const channelId = String(voiceChannel.id);
                if (
                  (parentId && allowedSet.has(parentId)) ||
                  allowedSet.has(channelId)
                ) {
                  isAllowed = true;
                } else if (
                  WAITING_ROOM_VOICE_CHANNEL_ID &&
                  (String(WAITING_ROOM_VOICE_CHANNEL_ID) === channelId || (parentId && String(WAITING_ROOM_VOICE_CHANNEL_ID) === parentId))
                ) {
                  isAllowed = true;
                } else if (channelId === voice1.id || channelId === voice2.id) {
                  isAllowed = true;
                }
              }
              if (!isAllowed) {
                penalizedIds.push(playerId);
                ensurePromises.push(ensurePlayerRecord(playerId));
              }
            }
            if (penalizedIds.length > 0) {
               const gracePeriodEnd = matchData.gracePeriodEnd ? new Date(matchData.gracePeriodEnd) : null;
               const now = new Date();
              if (!gracePeriodEnd || now >= gracePeriodEnd) {
                try {
                  await Promise.all(ensurePromises);
                } catch (_) {}
                const penaltyAmount =
                typeof voicePenaltyPoints === "number" &&
                !Number.isNaN(voicePenaltyPoints) &&
                voicePenaltyPoints > 0
                  ? voicePenaltyPoints
                  : 10000;
              
              // Verificar puntos antes de aplicar penalización
              const playersWithPoints = await Player.find({ 
                _id: { $in: penalizedIds } 
              }).lean();
              let validPenalizedIds = playersWithPoints
                .filter(p => (p.currentSeason?.points || 0) >= penaltyAmount)
                .map(p => p._id);

              const alreadyPenalizedSet = new Set(
                Array.isArray(matchData.voicePenaltyAppliedUserIds)
                  ? matchData.voicePenaltyAppliedUserIds.map((id) => String(id))
                  : []
              );

              validPenalizedIds = validPenalizedIds.filter(
                (id) => !alreadyPenalizedSet.has(String(id)) && !excludedFromVoiceMove.has(String(id))
              );

              if (validPenalizedIds.length > 0) {
                const bulkOps = validPenalizedIds.map((userId) => ({
                  updateOne: {
                    filter: { _id: userId },
                    update: { $inc: { "currentSeason.points": -penaltyAmount } },
                  },
                }));
                try {
                  await Player.bulkWrite(bulkOps, { ordered: false });
                } catch (e) {
                  console.error(
                    "[Voice Check] Error aplicando penalizaciones de puntos:",
                    e
                  );
                }
                for (const userId of validPenalizedIds) {
                  try {
                    await textChannel.send({
                      content:
                        `⚠️ <@${userId}> se le descontaron **${penaltyAmount}** puntos por no jugar dentro del Discord (no estaba en un canal de voz permitido al iniciar la partida).`,
                      allowedMentions: {
                        users: [userId],
                        roles: [],
                        replied_user: false,
                      },
                    });
                    const logEmbed = new EmbedBuilder()
                      .setTitle('Penalización de 10k aplicada')
                      .setDescription(`Jugador: <@${userId}>\nMotivo: por no jugar dentro del Discord\nPartida: #${matchNumber}`)
                      .setColor(COLORS.WARNING)
                      .setTimestamp();
                    await sendLog(interaction.guild, logEmbed, [], 'penalty10k');
                  } catch (_) {}
                }

                for (const id of validPenalizedIds) {
                  alreadyPenalizedSet.add(String(id));
                }
                matchData.voicePenaltyAppliedUserIds = Array.from(
                  alreadyPenalizedSet
                );
                matches.set(matchKeyFinal, {
                  ...matchData,
                  previousVoice: new Map(
                    Object.entries(matchData.previousVoice)
                  ),
                });
              }
            }
            }
          }

          // Editar el embed de la fila para indicar que la partida fue iniciada desde esta fila y deshabilitar componentes
          try {
            // Construir un embed rico con los equipos y sus ranks para que "Partida Iniciada" se vea como la primera imagen
            let rankMap = getSeasonRankCache ? getSeasonRankCache() : null;
            if (!rankMap || Object.keys(rankMap).length === 0) {
              try {
                rankMap = await computeSeasonRanking();
              } catch (_) {
                rankMap = {};
              }
            }

            const formatTeam = (team, teamSize) => {
              const lines = [];
              for (let i = 0; i < teamSize; i++) {
                const pid = team[i];
                if (pid) {
                  const rankText = rankMap[pid]
                    ? `RANK ${rankMap[pid]}`
                    : "Unranked";
                  lines.push(`> ${EMOJIS.success || "✅"} <@${pid}> (${rankText})`);
                } else {
                  lines.push(`> ${EMOJIS.red_circle || "🔴"} Libre`);
                }
              }
              return lines.join("\n");
            };

            const team1List = formatTeam(finalTeam1 || [], queue.teamSize);
            const team2List = formatTeam(finalTeam2 || [], queue.teamSize);

            const team1HeaderIcon2 = resolveEmojiTextLocal(
              (QUEUE_EMOJIS && QUEUE_EMOJIS.team1Header) || "🔵"
            );
            const team2HeaderIcon2 = resolveEmojiTextLocal(
              (QUEUE_EMOJIS && QUEUE_EMOJIS.team2Header) || "🔴"
            );
            const startedEmbed = new EmbedBuilder()
              .setTitle("⚔️ Partida Iniciada")
              .setDescription(
                `La partida #${matchNumber} ha sido iniciada en el hilo de esta fila.`
              )
              .setColor(COLORS.PRIMARY)
              .setThumbnail(EMBED_DEFAULTS.thumbnail)
              .addFields(
                {
                  name: `${team1HeaderIcon2} Equipo 1 (${(finalTeam1 || []).length
                    }/${queue.teamSize})`,
                  value: team1List || "> Vacío",
                  inline: true,
                },
                {
                  name: `${team2HeaderIcon2} Equipo 2 (${(finalTeam2 || []).length
                    }/${queue.teamSize})`,
                  value: team2List || "> Vacío",
                  inline: true,
                }
              );

            const disabledComponents = interaction.message.components.map(
              (row) => {
                const newRow = new ActionRowBuilder();
                row.components.forEach((c) => {
                  newRow.addComponents(
                    c.type === ComponentType.Button
                      ? ButtonBuilder.from(c).setDisabled(true)
                      : StringSelectMenuBuilder.from(c).setDisabled(true)
                  );
                });
                return newRow;
              }
            );

            // OPTIMIZACIÓN: Editar mensaje de fila y enviar logs en paralelo (no bloqueante para el usuario)

            // Botones de Apuesta para Espectadores (solo en el canal de apostar puntos)
            const BETTING_CHANNEL_ID = '1548203227948777542';
            const isBettingChannel = queue.channelId === BETTING_CHANNEL_ID;
            
            let components = [];
            if (isBettingChannel) {
              const betRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`match_bet_t1:${matchKeyFinal}`)
                  .setLabel('Apostar Equipo 1')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji(resolveEmojiTextLocal((QUEUE_EMOJIS && QUEUE_EMOJIS.team1Button) || '🔵')),
                new ButtonBuilder()
                  .setCustomId(`match_bet_t2:${matchKeyFinal}`)
                  .setLabel('Apostar Equipo 2')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji(resolveEmojiTextLocal((QUEUE_EMOJIS && QUEUE_EMOJIS.team2Button) || '🔴'))
              );
              components = [betRow];
            }

            Promise.all([
              interaction.message
                .edit({
                  embeds: [startedEmbed],
                  components: components, // Botones de apuesta solo si es el canal de apostar puntos
                })
                .then((msg) => {
                  // Eliminar los botones de apuesta después de 2 minutos
                  if (msg) {
                    setTimeout(() => {
                      msg.edit({ components: [] }).catch(() => { });
                    }, 120 * 1000);
                  }
                })
                .catch(() => { }),
              (async () => {
                // Enviar log de inicio de partida al canal de logs
                try {
                  const team1HeaderIconLog = resolveEmojiTextLocal(
                    (QUEUE_EMOJIS && QUEUE_EMOJIS.team1Header) || "🔵"
                  );
                  const team2HeaderIconLog = resolveEmojiTextLocal(
                    (QUEUE_EMOJIS && QUEUE_EMOJIS.team2Header) || "🔴"
                  );
                  const logEmbed = new EmbedBuilder()
                    .setTitle(`⚔️ Partida Iniciada - #${matchNumber}`)
                    .setDescription(
                      `**Modo:** ${queue.mode.toUpperCase()}\n**Creador:** <@${queue.creatorId
                      }>`
                    )
                    .addFields(
                      {
                        name: `${team1HeaderIconLog} Equipo 1`,
                        value:
                          (queue.team1 || [])
                            .map((id) => `<@${id}>`)
                            .join(", ") || "—",
                        inline: false,
                      },
                      {
                        name: `${team2HeaderIconLog} Equipo 2`,
                        value:
                          (queue.team2 || [])
                            .map((id) => `<@${id}>`)
                            .join(", ") || "—",
                        inline: false,
                      },
                      {
                        name: "🧵 Hilo de Partida",
                        value: textChannel ? `<#${textChannel.id}>` : "—",
                        inline: true,
                      }
                    )
                    .setColor(COLORS.PRIMARY)
                    .setTimestamp();
                  if (queue.wager.amount > 0) {
                    logEmbed.addFields({
                      name: `<a:MONEDA:1490919358707536002> Apuesta Activa`,
                      value: `\`${queue.wager.amount}\` puntos por jugador`,
                    });
                  }

                  await sendLog(interaction.guild, logEmbed, [], "queues"); // Sin botones en el log

                  // Anunciar inicio de partida en el canal de anuncios si está configurado
                  try {
                    if (settings && settings.announcementsChannel) {
                      const announcementsChannel =
                        await interaction.guild.channels
                          .fetch(settings.announcementsChannel)
                          .catch(() => null);
                      if (announcementsChannel) {
                        await announcementsChannel
                          .send({ embeds: [logEmbed] }) // Sin botones en anuncios
                          .catch(() => { });
                      }
                    }
                  } catch (_) { }
                } catch (e) {
                  console.warn("Error enviando log de inicio:", e);
                }
              })(),
            ]).catch(() => { });
          } catch (editErr) {
            console.warn(
              `[Fila Start] No se pudo actualizar el embed de la fila para partida #${matchNumber}:`,
              editErr
            );
          }
        } catch (creationErr) {
          console.error(
            `[Match Creation] Error al crear la partida #${matchNumber || "N/A"
            }:`,
            creationErr
          );
          await safeReplyEphemeral(
            interaction,
            `❌ Error al crear la partida: ${creationErr.message}`
          );
          if (matchKeyFinal)
            await ActiveMatch.findByIdAndDelete(matchKeyFinal).catch(() => { });
        } finally {
          startingMatch.delete(queue.channelId);
        }
      } else if (value === "kick") {
        const playersList = [...(queue.team1 || []), ...(queue.team2 || [])];
        if (playersList.length === 0)
          return safeReplyEphemeral(
            interaction,
            "No hay jugadores en la fila para expulsar."
          );

        const members = await interaction.guild.members
          .fetch({ user: playersList })
          .catch(() => new Map());

        const options = playersList.map((id) => ({
          label: `${members.get(id)?.displayName || id}`,
          value: id,
        }));
        const kickMenu = new StringSelectMenuBuilder()
          .setCustomId(`fila:${channelId}:kick:select`)
          .setPlaceholder("Selecciona un jugador para expulsar")
          .addOptions(options);
        const row = new ActionRowBuilder().addComponents(kickMenu);
        return safeReplyEphemeral(interaction, {
          content: "Selecciona el jugador que quieres expulsar:",
          components: [row],
        });
      } else if (value === "close") {
        await interaction.deferUpdate().catch(() => { });
        await ActiveQueue.findByIdAndDelete(channelId).catch((e) =>
          console.error(
            `[Fila Close] Error eliminando fila ${channelId} de la DB:`,
            e
          )
        );
        [...queue.team1, ...queue.team2].forEach((id) =>
          settings.busyPlayers.delete(id)
        );

        queues.delete(channelId);
        clearTimeout(queue.timeout);
        if (queue.hardTimeout) clearTimeout(queue.hardTimeout);

        // Editar mensaje y confirmar efímero de inmediato para mejorar UX
        const closedIcon = resolveEmojiTextLocal(
          (QUEUE_EMOJIS && QUEUE_EMOJIS.queueClosed) || "❌"
        );
        const closedEmbed = new EmbedBuilder()
          .setTitle(`${closedIcon} Fila Cerrada`)
          .setDescription("Esta fila ha sido cerrada.")
          .setColor(COLORS.ERROR)
          .setFooter(EMBED_DEFAULTS.footer);

        const disabledComponents = interaction.message.components.map((row) => {
          const newRow = new ActionRowBuilder();
          row.components.forEach((c) => {
            newRow.addComponents(
              c.type === ComponentType.Button
                ? ButtonBuilder.from(c).setDisabled(true)
                : StringSelectMenuBuilder.from(c).setDisabled(true)
            );
          });
          return newRow;
        });

        await interaction.message
          .edit({ embeds: [closedEmbed], components: disabledComponents })
          .catch(() => { });
        const team1Mentions =
          (queue.team1 || []).map((id) => `<@${id}>`).join(", ") || "—";
        const team2Mentions =
          (queue.team2 || []).map((id) => `<@${id}>`).join(", ") || "—";
        const logClosedIcon = resolveEmojiTextLocal(
          (QUEUE_EMOJIS && QUEUE_EMOJIS.queueClosed) || "❌"
        );
        const logEmbed = new EmbedBuilder()
          .setTitle(`${logClosedIcon} Fila Cerrada`)
          .setDescription(
            `Modo: ${queue.mode.toUpperCase()}\nCerrada por: <@${interaction.user.id
            }>\nCanal: <#${channelId}>`
          )
          .addFields(
            { name: "Equipo 1", value: team1Mentions, inline: false },
            { name: "Equipo 2", value: team2Mentions, inline: false }
          )
          .setColor(COLORS.ERROR)
          .setTimestamp();
        sendLog(interaction.guild, logEmbed, [], "queues");
        safeReplyEphemeral(interaction, `${config.emojis?.success || '✅'} Fila cerrada.`).catch(() => { });

        // No mover jugadores de su canal de voz al cerrar la fila manualmente
        return;
      } else if (value === "propose_wager") {
        if (
          interaction.user.id !== queue.creatorId &&
          !hasPermission(interaction.member)
        ) {
          return safeReplyEphemeral(
            interaction,
            "⚠️ Solo el creador de la fila o un admin puede proponer una apuesta."
          );
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal:wager:${channelId}`)
          .setTitle("Proponer Apuesta de Puntos");

        const amountInput = new TextInputBuilder()
          .setCustomId("wager_amount_input")
          .setLabel("Puntos a apostar (Máx 50,000)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ej: 100 (Máx 50,000)")
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(amountInput);
        modal.addComponents(row);

        // Debug log para diagnosticar error 40060
        // PID incluido para detectar múltiples instancias
        console.log(`[DEBUG-WAGER] Intentando abrir modal. PID: ${process.pid}, ID: ${interaction.id}, CustomID: ${interaction.customId}, Replied: ${interaction.replied}, Deferred: ${interaction.deferred}`);
        
        if (interaction.replied || interaction.deferred) {
             console.error(`[DEBUG-WAGER] Interacción ya procesada. ID: ${interaction.id}, Replied: ${interaction.replied}, Deferred: ${interaction.deferred}, CustomID: ${interaction.customId}`);
             return safeReplyEphemeral(interaction, "⚠️ No se puede abrir el modal porque la interacción ya fue procesada. Intenta de nuevo.");
        }

        try {
          await interaction.showModal(modal);
        } catch (e) {
          console.error(`[DEBUG-WAGER] Error mostrando modal de apuesta (PID: ${process.pid}):`, e);
          // Si falla porque ya fue respondida (race condition), avisar al usuario
          if (e.code === 40060 || (e.message && e.message.includes('already been acknowledged'))) {
             await interaction.followUp({ content: '⚠️ Error: La interacción fue interrumpida (40060). Posiblemente doble instancia del bot o conflicto de red.', ephemeral: true }).catch(() => {});
          }
        }
        return;
      } else {
        return safeReplyEphemeral(interaction, "Opción no reconocida.");
      }
    } catch (err) {
      console.error("Error manejando menu fila:", err);
      try {
        await safeReplyEphemeral(
          interaction,
          "⚠️ Ocurrió un error interno al procesar el menú."
        );
      } catch (e) { }
    }

    return;
  },
};
