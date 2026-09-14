const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Modulariza el cierre de partidas y limpieza de recursos
module.exports = {
  handleMatchCloseButton: async function (interaction, matchObj, deps, isCancellation = false) {
    if (!deps) {
      console.error('[Match Closure] Error: Dependencias (deps) no definidas.');
      return;
    }
    const EMOJIS = (deps.config && deps.config.emojis) || {};
    try {
      // Idempotencia fuerte: intentar marcar cerrado en DB y memoria antes de proceder
      const { ActiveMatch, matches, safeReplyEphemeral, hasPermission } = deps;
      const createdAt = new Date(matchObj.createdAt);
      const minMs = 10 * 60 * 1000;
      const hasCloseRole = Array.isArray(deps.CLOSE_APPLY_ROLE_IDS) && interaction.member?.roles?.cache?.some(r => deps.CLOSE_APPLY_ROLE_IDS.includes(r.id));
      const isBotOwner = Array.isArray(deps.BOT_OWNER_ID) ? deps.BOT_OWNER_ID.includes(interaction.user.id) : interaction.user.id === deps.BOT_OWNER_ID;
      if (interaction.user.id !== matchObj.creatorId && !hasCloseRole) {
        return safeReplyEphemeral(interaction, `${EMOJIS.error || '❌'} Solo el creador o roles autorizados pueden cerrar y aplicar puntos.`);
      }
      if (!isBotOwner && (Date.now() - createdAt.getTime() < minMs)) {
        return safeReplyEphemeral(interaction, `${EMOJIS.warning || '⚠️'} No puedes cerrar la partida hasta que hayan transcurrido al menos 10 minutos.`);
      }
      if (matchObj.closed || (matches.has(matchObj._id) && matches.get(matchObj._id).closed)) {
        return safeReplyEphemeral(interaction, `${EMOJIS.loading || '⚙️'} ¡Ya estamos en ello! La partida está siendo cerrada.`);
      }

      let alreadyClosed = false;
      try {
        const res = await ActiveMatch.updateOne({ _id: matchObj._id, closed: false }, { $set: { closed: true } });
        if (res.modifiedCount === 0) {
          // Si otro proceso ya la cerró, abortar
          alreadyClosed = true;
        }
      } catch (_) { }

      if (alreadyClosed) {
        return safeReplyEphemeral(interaction, `${EMOJIS.loading || '⚙️'} ¡Ya está cerrándose!`);
      }

      // Marcar en memoria y desactivar componentes del mensaje
      matchObj.closed = true;
      if (matches.has(matchObj._id)) matches.get(matchObj._id).closed = true;
      await interaction.update({ content: `${EMOJIS.success || '✅'} Cierre iniciado. Aplicando resultados y limpiando canales...`, components: [], embeds: [] }).catch(() => { });

      // Ejecutar el cierre en segundo plano enviando el ID del usuario como staffId
      // isCancellation determina si es una anulación (true) o un cierre normal (false)
      await deps.handleMatchClosure(interaction.guild, matchObj, isCancellation, interaction.user.id, deps);
    } catch (e) {
      console.error(`[Cierre Asíncrono] Error en partida #${matchObj.matchNumber} iniciado por botón:`, e);
      try {
          // Revertir estado de cerrado para permitir reintento
          const { ActiveMatch, matches } = deps;
          await ActiveMatch.updateOne({ _id: matchObj._id }, { $set: { closed: false } });
          matchObj.closed = false;
          if (matches.has(matchObj._id)) matches.get(matchObj._id).closed = false;
          
          await interaction.followUp({ 
              content: `${EMOJIS.error || '❌'} **Error al cerrar la partida:** ${e.message}\n\nEl estado ha sido revertido. Por favor verifica que haya un ganador seleccionado y vuelve a intentarlo.`, 
              ephemeral: true 
          }).catch(() => {});
      } catch (revertErr) {
          console.error(`[Cierre Asíncrono] Falló la reversión de estado para partida #${matchObj.matchNumber}:`, revertErr);
      }
    }
  },

  cleanupMatchResources: async function (guild, matchDoc, deps, keepChannels = false) {
    const { ChannelType, PermissionsBitField, RESTJSONErrorCodes, ActiveMatch, matches, logMatchChatHistory } = deps;
    try {
      if (!guild || !matchDoc) return;
      const matchKey = matchDoc._id;

      // NUEVO: Deshabilitar botones de apuesta en el mensaje de la fila (Moved from handleMatchClosure)
      // Esto asegura que se limpien incluso si la partida es huérfana o eliminada por mantenimiento
      if (matchDoc.queueChannelId) {
        try {
          const queueChannel = await guild.channels.fetch(matchDoc.queueChannelId).catch(() => null);
          if (queueChannel) {
            const messages = await queueChannel.messages.fetch({ limit: 100 }).catch(() => null);
            if (messages) {
              // Buscar el mensaje que tiene los botones de apuesta para esta partida
              const queueMessage = messages.find(msg =>
                msg.components?.some(row =>
                  row.components?.some(btn =>
                    btn.customId?.includes(matchKey)
                  )
                )
              );

              if (queueMessage) {
                // Remover los botones de apuesta (dejar el embed intacto)
                await queueMessage.edit({ components: [] }).catch(() => { });
              }
            }
          }
        } catch (err) {
          // Ignorar errores de permisos o canales faltantes durante limpieza
        }
      }

      // OPTIMIZACIÓN: Ejecutar TODO en paralelo (permisos, log, borrado de hilo, borrado de DB)
      const operations = [
        // Borrar de DB
        ActiveMatch.findByIdAndDelete(matchKey)
      ];

      if (!keepChannels) {
        // Mapa de fallback: si voiceChannelIds no está en el registro de DB, usar matchNumber para encontrar los canales
        const MATCH_VOICE_CHANNELS_FALLBACK = {
          1: ['1489717377766654102', '1489717425627861142'],
          2: ['1489717461447213119', '1489717480065863811'],
          3: ['1489717497887195227', '1489717509316939837'],
          4: ['1489717519089401948', '1489717528539304157'],
          5: ['1489717535237476357', '1489717541889773829'],
          6: ['1489717547757736142', '1489717554456035429'],
          7: ['1489717559707308305', '1489717567118643200'],
          8: ['1489717573393318082', '1489717578413768845'],
          9: ['1489717582289436732', '1489717587347640550'],
          10: ['1489717592540184697', '1489717595811872808'],
          11: ['1489717598571724931', '1489717600387862570'],
          12: ['1489717602073710683', '1489717603860615409'],
          13: ['1489717606175871156', '1489717608520617997'],
          14: ['1489717611922198612', '1489717613692059669'],
          15: ['1489717615738884216', '1489717617429315705'],
          16: ['1489717619048317010', '1489717622604824766'],
          17: ['1489717624379015330', '1489717625243173044'],
          18: ['1489717626086232356', '1489717627122221327'],
          19: ['1489717627780731142', '1489717629206663289'],
          20: ['1489717630356029495', '1489717632222363689']
        };

        // Resolver los IDs de canales de voz: usar voiceChannelIds del registro, o el fallback por matchNumber
        const voiceIdsToReset = (matchDoc.voiceChannelIds && matchDoc.voiceChannelIds.length > 0)
          ? matchDoc.voiceChannelIds
          : (matchDoc.matchNumber && MATCH_VOICE_CHANNELS_FALLBACK[matchDoc.matchNumber]) || [];

        if (voiceIdsToReset.length === 0) {
          console.warn(`[Cleanup] Partida #${matchDoc.matchNumber}: No se encontraron IDs de canales de voz para resetear.`);
        } else {
          console.log(`[Cleanup] Reseteando ${voiceIdsToReset.length} canales de voz para partida #${matchDoc.matchNumber} (${matchDoc.voiceChannelIds?.length > 0 ? 'desde DB' : 'desde fallback'}).`);
        }

        operations.push(
          // Permisos de canales de voz
          voiceIdsToReset.length > 0
            ? Promise.allSettled(voiceIdsToReset.map(async (vcId) => {
              const voiceChannel = await guild.channels.fetch(vcId).catch(() => null);
              if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice && voiceChannel.manageable) {
                return voiceChannel.permissionOverwrites.set([
                  { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
                  { id: '1489744493677641789', allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.Connect] }
                ], 'Limpieza de partida');
              } else if (!voiceChannel) {
                console.warn(`[Cleanup] Canal de voz ${vcId} no encontrado en el servidor (partida #${matchDoc.matchNumber}).`);
              }
            }))
            : Promise.resolve(),
          // Log y borrado de hilo
          matchDoc.textChannelId
            ? (async () => {
              try {
                // Log y borrado en paralelo
                const [logResult, threadChannel] = await Promise.allSettled([
                  logMatchChatHistory(guild, matchDoc.textChannelId, matchDoc.matchNumber, matchDoc._id),
                  guild.channels.fetch(matchDoc.textChannelId)
                ]);
                if (threadChannel.status === 'fulfilled' && threadChannel.value) {
                  // SAFETY CHECK: Prevent deletion of permanent channels or queue channels
                  // Only delete if it's explicitly a Thread or if we are sure it's temporary.
                  const isThread = threadChannel.value.isThread();
                  const isQueueChannel = matchDoc.queueChannelId && matchDoc.queueChannelId === matchDoc.textChannelId;
                  
                  if (isThread && !isQueueChannel) {
                    await threadChannel.value.delete('Partida finalizada.');
                  } else {
                    console.warn(`[Cleanup] Skipped deletion of channel ${matchDoc.textChannelId} (isThread: ${isThread}, isQueueChannel: ${isQueueChannel}) to prevent data loss.`);
                    if (!isThread) {
                         // Optional: Send a closing message if we can't delete
                         const EMOJIS_CLEANUP = (deps.config && deps.config.emojis) || {};
                         await threadChannel.value.send(`${EMOJIS_CLEANUP.stop || '🏁'} **Partida Finalizada.** Este canal se mantendrá abierto.`).catch(() => {});
                    }
                  }
                }
              } catch (threadError) {
                if (threadError.code !== RESTJSONErrorCodes.UnknownChannel) {
                  console.warn(`[Cleanup] Error en hilo ${matchDoc.textChannelId}: ${threadError.message}`);
                }
              }
            })()
            : Promise.resolve(),
          // NUEVO: Limpieza de overwrites individuales en el canal padre (CRITICO para no llegar al limite de 100)
          (async () => {
            try {
              const allPlayers = [...new Set([...(matchDoc.team1 || []), ...(matchDoc.team2 || [])])].filter(Boolean);
              if (allPlayers.length === 0) return;

              const parentId = (deps.config && (deps.config.matchThreadsParentChannelId || deps.config.matchThreadChannelId)) || "1494433823285575711";
              const parentChannel = await guild.channels.fetch(parentId).catch(() => null);
              if (parentChannel && parentChannel.manageable) {
                await Promise.allSettled(allPlayers.map(playerId => 
                  parentChannel.permissionOverwrites.delete(playerId, `Limpieza partida #${matchDoc.matchNumber}`).catch(() => {})
                ));
              }
            } catch (err) {
              console.warn(`[Cleanup Perms] Error limpiando overwrites del canal padre: ${err.message}`);
            }
          })()
        );
      } else {
        // Si mantenemos canales, solo reseteamos permisos básicos si es necesario o limpiamos chat
        // En este caso, para revancha, simplemente no borramos nada.
        console.log(`[Cleanup] Manteniendo canales para partida #${matchDoc.matchNumber} (Revancha/Reuso).`);
      }

      await Promise.allSettled(operations);

      // Limpiar de memoria
      matches.delete(matchKey);
    } catch (error) {
      console.error(`[Cleanup] Error crítico al limpiar la partida #${matchDoc?.matchNumber}:`, error);
    }
  },

  handleMatchClosure: async function (guild, matchObj, isCancellation = false, staffId = null, deps) {
    const { ActiveMatch, matches, applyMatchResults, updateAffectedNicknames, movePlayerToOriginalVoiceChannel, settings, moveSpectatorsToWaitingRoom, sendLog, EmbedBuilder, COLORS, client, cleanupMatchResources, Player, EMBED_DEFAULTS, excludedFromVoiceMove } = deps;
    const matchKey = matchObj._id;
    let shouldCleanup = false;
    
    // REFRESCAR MATCHOBJ DESDE DB PARA ASEGURAR APUESTAS ACTUALIZADAS
    let freshMatchObj = matchObj;
    try {
        const fromDb = await ActiveMatch.findById(matchKey).lean();
        if (fromDb) {
            freshMatchObj = { ...fromDb };
            // Preservar datos en memoria que pueden no estar en DB si hubo desincronización
            if (!freshMatchObj.queueChannelId) freshMatchObj.queueChannelId = matchObj.queueChannelId;
            
            // Si la DB no tiene previousVoice o está vacío, usar el de memoria
            const dbPrevVoice = freshMatchObj.previousVoice;
            const hasDbPrevVoice = dbPrevVoice && (dbPrevVoice instanceof Map ? dbPrevVoice.size > 0 : Object.keys(dbPrevVoice).length > 0);
            
            if (!hasDbPrevVoice) {
                freshMatchObj.previousVoice = matchObj.previousVoice;
            }
            
            // FIX CRÍTICO: Si la DB devuelve equipos vacíos pero en memoria sí existen, usar los de memoria.
            // Esto evita que "Resultados Aplicados" salga con listas vacías si la DB no se actualizó a tiempo.
            if ((!freshMatchObj.team1 || freshMatchObj.team1.length === 0) && matchObj.team1?.length > 0) {
                freshMatchObj.team1 = matchObj.team1;
            }
            if ((!freshMatchObj.team2 || freshMatchObj.team2.length === 0) && matchObj.team2?.length > 0) {
                freshMatchObj.team2 = matchObj.team2;
            }

            // FIX ADICIONAL: Preservar selecciones (MVP, Ganador, Creador) si la DB no las tiene pero la memoria sí.
            if (!freshMatchObj.selectedWinner && matchObj.selectedWinner) freshMatchObj.selectedWinner = matchObj.selectedWinner;
            if (!freshMatchObj.selectedMVP && matchObj.selectedMVP) freshMatchObj.selectedMVP = matchObj.selectedMVP;
            if (!freshMatchObj.selectedCreator && matchObj.selectedCreator) freshMatchObj.selectedCreator = matchObj.selectedCreator;

            // FIX: Preservar voiceChannelIds de memoria si la DB lo tiene vacío.
            // Esto es crítico para que movePlayerToOriginalVoiceChannel valide correctamente
            // si el jugador está en un canal de esta partida antes de moverlo.
            if ((!freshMatchObj.voiceChannelIds || freshMatchObj.voiceChannelIds.length === 0) && matchObj.voiceChannelIds?.length > 0) {
                freshMatchObj.voiceChannelIds = matchObj.voiceChannelIds;
            }
        }
    } catch (errRefresh) {
        console.warn(`[HandleMatchClosure] No se pudo refrescar la partida #${matchObj.matchNumber} desde DB:`, errRefresh);
    }
    matchObj = freshMatchObj;

    // ULTIMA LINEA DE DEFENSA: Si después de todo no hay equipos y NO es cancelación, abortar para no enviar resultados vacíos.
    if (!isCancellation && (!matchObj.team1 || matchObj.team1.length === 0 || !matchObj.team2 || matchObj.team2.length === 0)) {
         console.error(`[CRITICAL] Intentando cerrar partida #${matchObj.matchNumber} sin equipos. Abortando.`);
         // Intentar avisar en el canal si es posible
         if (guild) {
             const channel = guild.channels.cache.get(matchObj.textChannelId);
             if (channel) channel.send("⚠️ **Error Crítico:** No se han encontrado los datos de los equipos. El cierre se ha cancelado para evitar pérdida de datos. Contacta a un administrador.").catch(() => {});
         }
         return; 
    }

    try {
      // OPTIMIZACIÓN: Marcar como cerrado en DB de forma no bloqueante
      if (!isCancellation) {
        Promise.resolve().then(() => ActiveMatch.updateOne({ _id: matchKey, closed: false }, { $set: { closed: true } })).catch(() => { });
        matchObj.closed = true;
        if (matches.has(matchKey)) matches.get(matchKey).closed = true;
        // Guardar quién cerró la partida (staffId viene del botón o comando)
        if (staffId) matchObj.closerId = staffId;
      }
      
      shouldCleanup = false; // Default safe state: do NOT cleanup unless success confirmed

      // Limpiar botones de apuesta en el mensaje de la fila (si existe)
      if (matchObj.queueMessageId && matchObj.queueChannelId) {
        const queueChannel = await guild.channels.fetch(matchObj.queueChannelId).catch(() => null);
        if (queueChannel) {
          const queueMsg = await queueChannel.messages.fetch(matchObj.queueMessageId).catch(() => null);
          if (queueMsg) {
            await queueMsg.edit({ components: [] }).catch(() => { });
          }
        }
      }

      if (!guild) {
        await ActiveMatch.findByIdAndDelete(matchKey);
        matches.delete(matchKey);
        shouldCleanup = true; // Already deleted/handled
        return;
      }

      if (!isCancellation) {
        // Cierre normal: aplicar resultados
        matchObj.guildId = guild.id;
        try {
            // No skip move, move players immediately
            await applyMatchResults(guild, matchObj, false);
        } catch (err) {
            console.error(`Error al aplicar resultados para la partida #${matchObj.matchNumber}:`, err);
            throw err; // Re-throw to trigger safety fallback (revert closed status)
        }
        
        shouldCleanup = true; // Cleanup immediately
      } else {
        // OPTIMIZACIÓN: Anulación ultra-rápida con paralelización total

        // --- LOGICA DE REEMBOLSO DE APUESTAS ---
        const EMOJIS = (deps.config && deps.config.emojis) || {};
        if (matchObj.bets && (matchObj.bets.team1?.length > 0 || matchObj.bets.team2?.length > 0)) {
           const allBets = [...(matchObj.bets.team1 || []), ...(matchObj.bets.team2 || [])];
           if (allBets.length > 0) {
             const bulkOps = [];
             for (const bet of allBets) {
               bulkOps.push({
                 updateOne: {
                   filter: { _id: bet.userId },
                   update: { $inc: { 'currentSeason.points': bet.amount } }
                 }
               });
               
               // [DM DESACTIVADO] Notificar reembolso por DM
               // Promise.resolve().then(async () => {
               //   try {
               //     const user = await guild.client.users.fetch(bet.userId).catch(() => null);
               //     if (user) {
               //       await user.send({
               //         embeds: [new EmbedBuilder()
               //           .setTitle(`<a:MONEDA:1490919358707536002> Apuesta Reembolsada`)
               //           .setDescription(`La partida #${matchObj.matchNumber} ha sido anulada.\n\n${EMOJIS.money || '💰'} **Se te han devuelto:** ${bet.amount} puntos.`)
               //           .setColor(COLORS.WARNING)
               //           .setFooter(EMBED_DEFAULTS.footer)
               //           .setTimestamp()]
               //       }).catch(() => {});
               //     }
               //   } catch (_) {}
               // });
             }
             if (bulkOps.length > 0) {
                // Si falla el reembolso, lanzar error para evitar que se cierre la partida y se pierdan los puntos
                await Player.bulkWrite(bulkOps);
                
                // --- AUDIT LOG DE REEMBOLSOS ---
                try {
                    const totalRefreshed = allBets.reduce((acc, b) => acc + b.amount, 0);
                    const refundEmbed = new EmbedBuilder()
                        .setTitle(`<a:MONEDA:1490919358707536002> Apuestas Reembolsadas`)
                        .setDescription(`Se han reembolsado las apuestas de la partida anulada **#${matchObj.matchNumber}**.`)
                        .addFields(
                            { name: 'Total Usuarios', value: `${allBets.length}`, inline: true },
                            { name: 'Total Puntos', value: `${totalRefreshed}`, inline: true }
                        )
                        .setColor(COLORS.WARNING)
                        .setTimestamp();
                    
                    if (EMBED_DEFAULTS && EMBED_DEFAULTS.footer) {
                        refundEmbed.setFooter(EMBED_DEFAULTS.footer);
                    }

                    await sendLog(guild, refundEmbed, [], 'matches');
                } catch (logErr) {
                    console.warn('No se pudo enviar log de reembolso:', logErr);
                }
             }
           }
        }
        // ----------------------------------------

        const allPlayersInMatch = [...(matchObj.team1 || []), ...(matchObj.team2 || [])].filter(Boolean);

        // Liberar jugadores inmediatamente
        for (const playerId of allPlayersInMatch) {
          settings.busyPlayers.delete(playerId);
        }

        // OPTIMIZACIÓN: Mover jugadores, espectadores y enviar logs TODO EN PARALELO
        const [moveResults, spectatorResult, logResult, channelResult] = await Promise.allSettled([
          // Mover todos los jugadores en paralelo (sin batches ni delays)
          Promise.allSettled(allPlayersInMatch.map(playerId => {
            if (excludedFromVoiceMove && excludedFromVoiceMove.has(playerId)) return;
            const originalChannel = (matchObj.previousVoice || {})[playerId];
            console.log(`[Anulación Debug] Moviendo a ${playerId} a canal original: ${originalChannel}`);
            return movePlayerToOriginalVoiceChannel(guild, playerId, originalChannel, matchObj.voiceChannelIds);
          })),
          // Mover espectadores en paralelo
          moveSpectatorsToWaitingRoom(guild, matchObj),
          // Enviar log en paralelo y guardar historial
          (async () => {
            const logEmbed = new EmbedBuilder()
              .setTitle(`${EMOJIS.stop || '🛡️'} Partida Anulada`)
              .setDescription(`La partida #${matchObj.matchNumber} fue anulada por <@${staffId}>. No se aplicaron puntos.\n\n**Participantes:**\n${allPlayersInMatch.map(id => `<@${id}>`).join(', ')}`)
              .setColor(COLORS.WARNING)
              .setTimestamp();
            const logMsg = await sendLog(guild, logEmbed, [], 'matches');

            // Guardar en historial como anulada para que aparezca el log
            let historyId = null;
            try {
                const { MatchHistory } = deps;
                if (MatchHistory) {
                    const savedHist = await new MatchHistory({
                        matchNumber: matchObj.matchNumber,
                        date: new Date(),
                        mode: matchObj.mode,
                        season: settings?.currentSeason || null,
                        team1: matchObj.team1,
                        team2: matchObj.team2,
                        winner: 'annulled',
                        mvp: null,
                        wager: matchObj.wager?.amount || 0,
                        guildId: guild.id,
                        creator: matchObj.creatorId,
                        logChannelId: logMsg?.channelId,
                        logMessageId: logMsg?.id,
                        notifiedHistory: false
                    }).save();
                    historyId = savedHist?._id;
                }
            } catch (histErr) {
                console.error(`[MatchClosure] Error guardando historial de anulación para #${matchObj.matchNumber}:`, histErr);
            }
            return { logMsg, historyId };
          })(),
          // Enviar mensaje al canal en paralelo
          (async () => {
            const channel = await guild.channels.fetch(matchObj.textChannelId).catch(() => null);
            
            // Obtener el miembro que anuló la partida de forma robusta
            let staffMember = guild.members.cache.get(staffId);
            if (!staffMember) {
              try {
                staffMember = await guild.members.fetch(staffId);
              } catch (err) {
                console.warn(`[MatchClosure] No se pudo obtener el miembro ${staffId}:`, err.message);
              }
            }
            
            const staffTag = staffMember?.user?.tag || staffId;
            const staffAvatar = staffMember?.displayAvatarURL();

            const embed = new EmbedBuilder()
                .setTitle(`${EMOJIS.stop || '🛡️'} PARTIDA ANULADA`)
                .setDescription(`La partida **#${matchObj.matchNumber}** ha sido cancelada.\nNo se han aplicado cambios en el ranking ni se han otorgado puntos.`)
                .addFields(
                    { name: `${EMOJIS.battle || '👥'} Participantes`, value: allPlayersInMatch.map(id => `<@${id}>`).join(', ') || '—' },
                    { name: `${EMOJIS.next || '🔗'} TRANSCRIPCIÓN`, value: `[Ver Historial de Chat](${(deps.config?.webTranscriptBaseUrl || deps.settings?.webTranscriptBaseUrl) || ''}${matchObj._id})`, inline: false }
                )
                .setColor(COLORS.WARNING)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setFooter({ text: `Anulada por: ${staffTag}`, iconURL: staffAvatar })
                .setTimestamp();

            if (channel) {
              await channel.send({ embeds: [embed] }).catch(() => {});
            }

            // NUEVO: Enviar también al canal de historial (!sethistorychannel)
            if (settings && settings.historyChannel) {
              try {
                const historyChannel = await guild.channels.fetch(settings.historyChannel).catch(() => null);
                if (historyChannel) {
                   const historyMsg = await historyChannel.send({ embeds: [embed] }).catch(() => null);
                   if (historyMsg) {
                       console.log(`[MatchClosure] Enviado exitosamente al canal de historial (Anulación).`);
                       return { historyChannelId: historyChannel.id, historyMessageId: historyMsg.id };
                   }
                }
              } catch (err) {
                console.warn(`[MatchClosure] Error al buscar canal de historial para anulación #${matchObj.matchNumber}:`, err.message);
              }
            }
            return null;
          })()
        ]);
        
        // Finalizar actualización de notificación si fue exitosa
        const historyId = logResult.status === 'fulfilled' ? logResult.value?.historyId : null;
        const historyData = channelResult.status === 'fulfilled' ? channelResult.value : null;

        if (historyId) {
             const { MatchHistory } = deps;
             const updateData = { notifiedHistory: true };
             if (historyData) {
                 updateData.historyChannelId = historyData.historyChannelId;
                 updateData.historyMessageId = historyData.historyMessageId;
             }
             await MatchHistory.updateOne({ _id: historyId }, { $set: updateData }).catch(() => {});
        }
        shouldCleanup = true; // SUCCESS: Anulación completada
      }
    } catch (e) {
      console.error(`[Cierre] Error en partida #${matchObj.matchNumber}:`, e);
      
      // REVERTIR ESTADO CERRADO para permitir reintento si falló algo crítico
      if (!shouldCleanup) {
           Promise.resolve().then(async () => {
                await ActiveMatch.updateOne({ _id: matchKey }, { $set: { closed: false } }).catch(() => {});
                matchObj.closed = false;
                if (matches.has(matchKey)) matches.get(matchKey).closed = false;
                console.log(`[Revert] Estado 'closed' revertido para partida #${matchObj.matchNumber} debido a error.`);
           }).catch(() => {});
      }

      // Enviar log de error de forma no bloqueante
      Promise.resolve().then(() => {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Error Crítico en Cierre de Partida')
          .setDescription(`Error al cerrar partida #${matchObj.matchNumber}.\n\n**Error:**\n\`\`\`${e.message}\`\`\``)
          .setColor(COLORS.ERROR);
        return sendLog(client.guilds.cache.get(matchObj.guildId), errorEmbed, [], 'errors');
      }).catch(() => { });
    } finally {
      // OPTIMIZACIÓN: Limpieza en segundo plano (no bloqueante) SOLO SI NO HUBO ERROR CRITICO
      if (shouldCleanup) {
          Promise.resolve().then(() => cleanupMatchResources(guild, matchObj, deps)).catch(() => { });
      } else {
          console.warn(`[Cleanup Skipped] Partida #${matchObj.matchNumber} no eliminada para permitir revisión/reintento.`);
      }
    }
  }
};
