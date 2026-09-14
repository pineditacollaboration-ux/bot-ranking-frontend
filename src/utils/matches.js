// src/utils/matches.js
// Centraliza funciones relacionadas con partidas: mover espectadores y aplicar resultados.

module.exports = function createMatchesUtils({
  Player,
  MatchHistory,
  HeadToHead,
  ActiveMatch,
  EmbedBuilder,
  COLORS,
  EMBED_DEFAULTS,
  settings,
  config,
  WIN_POINTS,
  LOSE_POINTS,
  MVP_POINTS,
  CREATOR_POINTS,
  ROLE_PUNTOS_X2,
  ROLE_PROTECCION,
  WAITING_ROOM_VOICE_CHANNEL_ID,
  ChannelType,
  PermissionsBitField,
  sendLog,
  movePlayerToOriginalVoiceChannel,
  ensurePlayerRecord,
  matches,
  cleanupMatchResources,
  getMatchDeps,
  updateChampionRoles,
  championRoles,
  excludedFromVoiceMove: globalExcludedFromVoiceMove,
  cacheInvalidator, // NUEVO: Sistema de invalidación inteligente
  performanceOptimizer, // NUEVO: Optimizador de performance para movimientos de voz
  updateAffectedNicknames,
}) {
  const PQueue = require('p-queue').default;
  const moveQueue = new PQueue({ concurrency: 16 });

  // Configuración de milestones por partidas
  const MATCH_MILESTONES = [
    {
      roleId: '1490461749923807273',
      name: 'PREDADOR DO RANK',
      requiredMatches: 100,
      points: 40000,
      x2Hours: 2,
      proteccionHours: 2
    },
    {
      roleId: '1490461649398661352',
      name: 'DEUS DA RANQUEADA',
      requiredMatches: 150,
      points: 80000,
      x2Hours: 4,
      proteccionHours: 4
    },
    {
      roleId: '1490461402748420257',
      name: 'GOD RANKED',
      requiredMatches: 200,
      points: 120000,
      x2Hours: 6,
      proteccionHours: 6
    },
    {
      roleId: '1490455145765666916',
      name: 'CACADOR DE CAPAS',
      requiredMatches: 200,
      points: 190000,
      x2Hours: 8,
      proteccionHours: 8
    },
    {
      roleId: '1490457065666248875',
      name: 'ABSOLUTE BEAST',
      requiredMatches: 250,
      points: 250000,
      x2Hours: 10,
      proteccionHours: 10
    }
  ];

  // ── Verificar y otorgar milestones por partidas ───────────────────────────
  async function checkAndAwardMatchMilestones(userId, guild) {
    try {
      const player = await Player.findOne({ _id: userId });
      if (!player) return;

      const totalMatches = (player.currentSeason?.wins || 0) + (player.currentSeason?.losses || 0);
      const awardedMilestones = player.awardedMatchMilestones || [];

      for (const milestone of MATCH_MILESTONES) {
        // Si ya tiene el milestone, saltar
        if (awardedMilestones.includes(milestone.roleId)) continue;

        // Verificar si completó las partidas requeridas
        if (totalMatches >= milestone.requiredMatches) {
          console.log(`[Match Milestone] Otorgando ${milestone.name} a ${userId} (${totalMatches} partidas)`);

          // Otorgar rol
          if (guild) {
            const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
            if (member) {
              await member.roles.add(milestone.roleId).catch(err => {
                console.error(`[Match Milestone] Error otorgando rol ${milestone.name}:`, err);
              });
            }
          }

          // Agregar puntos a temporada actual
          await Player.updateOne(
            { _id: userId },
            {
              $inc: {
                'currentSeason.points': milestone.points,
                points: milestone.points
              },
              $push: { awardedMatchMilestones: milestone.roleId }
            }
          );

          // Agregar horas de X2 y protección a la cartera
          const oneHourMs = 3600000;
          await Player.updateOne(
            { _id: userId },
            {
              $inc: {
                x2_credit_ms: milestone.x2Hours * oneHourMs,
                proteccion_credit_ms: milestone.proteccionHours * oneHourMs
              }
            }
          );

          // Log del milestone otorgado
          if (sendLog) {
            const logEmbed = new EmbedBuilder()
              .setTitle(`🏆 Milestone de Partidas: ${milestone.name}`)
              .setDescription(`**Jugador:** <@${userId}>\n**Partidas:** ${totalMatches}\n**Puntos:** ${milestone.points.toLocaleString()}\n**X2:** ${milestone.x2Hours}h\n**Protección:** ${milestone.proteccionHours}h`)
              .setColor(COLORS.GOLD)
              .setTimestamp();
            await sendLog(guild, logEmbed, [], 'milestones');
          }

          console.log(`[Match Milestone] ✅ ${milestone.name} otorgado a ${userId}`);
        }
      }
    } catch (error) {
      console.error('[Match Milestone] Error verificando milestones:', error);
    }
  }

  // ── Head-to-Head: actualizar marcadores globales entre cada par ────────────
  async function updateH2HRecords(matchObj) {
    if (!HeadToHead) return;
    if (matchObj.selectedWinner !== 'team1' && matchObj.selectedWinner !== 'team2') return;

    const winners = matchObj.selectedWinner === 'team1'
      ? (matchObj.team1 || [])
      : (matchObj.team2 || []);
    const losers = matchObj.selectedWinner === 'team1'
      ? (matchObj.team2 || [])
      : (matchObj.team1 || []);

    if (winners.length === 0 || losers.length === 0) return;

    const ops = [];
    const now = new Date();

    for (const winnerId of winners) {
      for (const loserId of losers) {
        if (!winnerId || !loserId || winnerId === loserId) continue;
        const [p1, p2] = [winnerId, loserId].sort();
        const docId = `${p1}:${p2}`;
        const isP1Winner = winnerId === p1;
        ops.push({
          updateOne: {
            filter: { _id: docId },
            update: {
              $setOnInsert: { player1: p1, player2: p2 },
              $inc: {
                totalMatches: 1,
                player1Wins: isP1Winner ? 1 : 0,
                player2Wins: isP1Winner ? 0 : 1
              },
              $set: { lastMatchDate: now }
            },
            upsert: true
          }
        });
      }
    }

    if (ops.length > 0) {
      await HeadToHead.bulkWrite(ops, { ordered: false }).catch(err =>
        console.error('[H2H] Error actualizando registros H2H:', err)
      );
    }
  }

  // Helper: procesar tareas en lotes para evitar rate limits
  async function processInBatches(items, worker, batchSize = 16, delayMs = 0) {
    const total = items.length;
    for (let i = 0; i < total; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((it) => worker(it)));
      if (i + batchSize < total && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async function moveSpectatorsToWaitingRoom(guild, matchObj) {
    if (!guild || !matchObj || !matchObj.voiceChannelIds || matchObj.voiceChannelIds.length === 0) return;

    const allPlayersInMatch = new Set([...(matchObj.team1 || []), ...(matchObj.team2 || [])].filter(Boolean));
    const spectatorReturnChannelId = WAITING_ROOM_VOICE_CHANNEL_ID || '1400896746044784670';
    const spectatorReturnChannel = await guild.channels.fetch(spectatorReturnChannelId).catch(() => null);

    if (!spectatorReturnChannel) {
      console.warn(`[Spectators] No se pudo encontrar el canal/categoría de retorno de espectadores (ID: ${spectatorReturnChannelId}).`);
      return;
    }

    const matchVoiceChannels = await Promise.all(
      matchObj.voiceChannelIds.map(id => guild.channels.fetch(id).catch(() => null))
    );

    let targetChannel;
    if (spectatorReturnChannel.type === ChannelType.GuildCategory) {
      const availableChannels = spectatorReturnChannel.children.cache.filter(
        ch => ch.type === ChannelType.GuildVoice && ch.joinable && ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.MoveMembers)
      );
      if (availableChannels.size > 0) {
        targetChannel = availableChannels.random();
      }
    } else if (spectatorReturnChannel.type === ChannelType.GuildVoice) {
      targetChannel = spectatorReturnChannel;
    }

    if (!targetChannel) {
      console.warn('[Spectators] No hay un canal de destino disponible para espectadores.');
      return;
    }

    const spectatorIds = [];
    for (const vc of matchVoiceChannels) {
      if (!vc || vc.type !== ChannelType.GuildVoice) continue;
      vc.members?.forEach(member => {
        if (member.user?.bot) return;
        if (!allPlayersInMatch.has(member.id)) {
          spectatorIds.push(member.id);
        }
      });
    }

    if (spectatorIds.length === 0) return;

    // OPTIMIZACIÓN: Si son pocos espectadores, moverlos en paralelo sin batches
    if (spectatorIds.length <= 10) {
      Promise.allSettled(spectatorIds.map(async (id) => {
        try {
          const member = guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
          if (!member?.voice?.channelId) return;
          // Verificar exención
          if (globalExcludedFromVoiceMove && globalExcludedFromVoiceMove.has(id)) return;
          if (member.voice.channelId === targetChannel.id) return;
          await member.voice.setChannel(targetChannel.id).catch(() => { });
        } catch (_) { }
      })).catch(() => { });
      return;
    }

    let fetchedMembers = null;
    try {
      fetchedMembers = await guild.members.fetch({ user: spectatorIds }).catch(() => new Map());
    } catch (_) { }

    await processInBatches(spectatorIds, async (id) => {
      try {
        const member = guild.members.cache.get(id) || (fetchedMembers && fetchedMembers.get(id)) || await guild.members.fetch(id).catch(() => null);
        if (!member?.voice?.channelId) return;

        // Verificar exención
        if (globalExcludedFromVoiceMove && globalExcludedFromVoiceMove.has(id)) {
          console.log(`[Spectators Move] Usuario ${id} está exento. Saltando...`);
          return;
        }

        if (member.voice.channelId === targetChannel.id) return;
        await moveQueue.add(() => member.voice.setChannel(targetChannel.id)).catch(() => { });
      } catch (_) { }
    });
  }

  async function applyMatchResults(guild, matchObj, skipMove = false) {
    console.log(`[DEBUG applyMatchResults] Start for #${matchObj.matchNumber} (ID: ${matchObj._id})`);
    try {
      // 1. Sincronizar estado más reciente de la partida desde DB
      let fresh = null;
      try {
        if (matchObj._id) {
          fresh = await ActiveMatch.findById(matchObj._id).lean().catch(() => null);
        }
        if (!fresh && matchObj.matchNumber) {
          fresh = await ActiveMatch.findOne({ guildId: guild.id, matchNumber: matchObj.matchNumber }).lean().catch(() => null);
        }
        if (fresh) {
          if (fresh.bets && (fresh.bets.team1?.length > 0 || fresh.bets.team2?.length > 0)) matchObj.bets = fresh.bets;
          if (fresh.selectedWinner) matchObj.selectedWinner = fresh.selectedWinner;
          if (fresh.selectedMVP) matchObj.selectedMVP = fresh.selectedMVP;
          if (fresh.selectedCreator) matchObj.selectedCreator = fresh.selectedCreator;
          if (fresh._id) matchObj._id = fresh._id;
        }
      } catch (errSync) { console.error(`[Sync Error] #${matchObj.matchNumber}:`, errSync); }

      // 2. VERIFICACIÓN DE IDEMPOTENCIA
      const matchCreatedAt = matchObj.createdAt ? new Date(matchObj.createdAt) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingHistory = await MatchHistory.findOne({ matchNumber: matchObj.matchNumber, guildId: guild.id, date: { $gt: matchCreatedAt } }).catch(() => null);
      const freshForSkip = matchObj._id ? await ActiveMatch.findById(matchObj._id).lean().catch(() => null) : null;
      const skipMainStats = !!freshForSkip?.statsApplied;

      if (skipMainStats) console.log(`[Resultados] Partida #${matchObj.matchNumber} ya tiene puntos aplicados.`);

      // 3. Preparar datos
      const winners = (matchObj.selectedWinner === 'team1' ? (matchObj.team1 || []) : (matchObj.team2 || [])).filter(Boolean);
      const losers = (matchObj.selectedWinner === 'team1' ? (matchObj.team2 || []) : (matchObj.team1 || [])).filter(Boolean);
      if (winners.length === 0 && losers.length === 0) throw new Error(`No hay jugadores en la partida #${matchObj.matchNumber}`);

      const allPlayerIds = [...new Set([...winners, ...losers, matchObj.selectedMVP, matchObj.selectedCreator].filter(Boolean))];
      if (matchObj.bets) [...(matchObj.bets.team1 || []), ...(matchObj.bets.team2 || [])].forEach(b => { if(b.userId) allPlayerIds.push(b.userId); });
      const uniquePlayerIds = [...new Set(allPlayerIds)];

      await Promise.all(uniquePlayerIds.map(id => ensurePlayerRecord(id)));
      const playerDocs = await Player.find({ _id: { $in: uniquePlayerIds } });
      const playerMap = new Map(playerDocs.map(p => [p._id, p]));
      const members = new Map();
      const memberFetch = await Promise.allSettled(uniquePlayerIds.map(id => guild.members.fetch(id)));
      memberFetch.forEach(r => { if (r.status === 'fulfilled') members.set(r.value.id, r.value); });

      const bulkOps = [];
      const changed = { winners: [], losers: [], extras: [] };
      const wagerAmount = Number(matchObj.wagerAmount || 0);

      // 4. Calcular pozo (House System)
      let actualWagerPool = 0;
      if (wagerAmount > 0) {
        for (const id of losers) {
          const doc = playerMap.get(id);
          actualWagerPool += Math.min(wagerAmount, (doc?.currentSeason?.points || 0));
        }
      }
      const wagerShare = winners.length > 0 ? Math.floor(actualWagerPool / winners.length) : 0;

      // 5. Aplicar Puntos
      if (!skipMainStats) {
        for (const id of winners) {
          const doc = playerMap.get(id);
          if (!doc) continue;
          const member = members.get(id);
          let mult = 1;
          if (doc.x5_until > Date.now()) mult = 5;
          else if (doc.x4_until > Date.now()) mult = 4;
          else if (doc.x3_until > Date.now()) mult = 3;
          else if (doc.x2_until > Date.now() || (member?.roles.cache.has(ROLE_PUNTOS_X2)) || doc.puntosX2_matches > 0) mult = 2;

          const gain = (WIN_POINTS * mult) + wagerShare;
          bulkOps.push({ updateOne: { filter: { _id: id }, update: { $inc: { wins: 1, 'dailyStats.played': 1, 'dailyStats.wins': 1, 'dailyStats.pointsGained': gain, 'currentSeason.points': gain, 'currentSeason.wins': 1, 'currentSeason.streak': 1 }, $set: { 'dailyStats.lastPlayed': Date.now() } } } });
          if (mult === 2 && !member?.roles.cache.has(ROLE_PUNTOS_X2) && !(doc.x2_until > Date.now()) && doc.puntosX2_matches > 0) bulkOps.push({ updateOne: { filter: { _id: id, puntosX2_matches: { $gt: 0 } }, update: { $inc: { puntosX2_matches: -1 } } } });
          const streak = (doc.currentSeason?.streak || 0) + 1;
          if (streak > (doc.currentSeason?.maxStreak || 0)) bulkOps.push({ updateOne: { filter: { _id: id }, update: { $set: { 'currentSeason.maxStreak': streak } } } });
          changed.winners.push({ id, gain });
        }
        for (const id of losers) {
          const doc = playerMap.get(id);
          if (!doc) continue;
          const member = members.get(id);
          let mult = 1;
          if (doc.x5_until > Date.now()) mult = 5;
          else if (doc.x4_until > Date.now()) mult = 4;
          else if (doc.x3_until > Date.now()) mult = 3;
          else if (doc.x2_until > Date.now() || (member?.roles.cache.has(ROLE_PUNTOS_X2)) || doc.puntosX2_matches > 0) mult = 2;
          const isProt = (member?.roles.cache.has(ROLE_PROTECCION)) || doc.proteccion_matches > 0 || (doc.proteccion_until > Date.now());
          const loss = Math.min(isProt ? wagerAmount : (LOSE_POINTS * mult) + wagerAmount, (doc.currentSeason?.points || 0));
          const up = { $inc: { losses: 1, 'dailyStats.played': 1, 'dailyStats.losses': 1, 'dailyStats.pointsGained': -loss, 'currentSeason.losses': 1, 'currentSeason.points': -loss }, $set: { 'currentSeason.streak': 0, 'dailyStats.lastPlayed': Date.now() } };
          if (isProt && doc.proteccion_matches > 0 && !member?.roles.cache.has(ROLE_PROTECCION) && !(doc.proteccion_until > Date.now())) up.$inc.proteccion_matches = -1;
          bulkOps.push({ updateOne: { filter: { _id: id }, update: up } });
          changed.losers.push({ id, loss });
        }
        if (matchObj.selectedMVP) {
          bulkOps.push({ updateOne: { filter: { _id: matchObj.selectedMVP }, update: { $inc: { mvps: 1, 'currentSeason.mvps': 1, 'currentSeason.points': MVP_POINTS } } } });
          changed.extras.push({ id: matchObj.selectedMVP, type: 'MVP', gain: MVP_POINTS });
        }
        if (matchObj.selectedCreator) {
          bulkOps.push({ updateOne: { filter: { _id: matchObj.selectedCreator }, update: { $inc: { creations: 1, 'currentSeason.creations': 1, 'currentSeason.points': CREATOR_POINTS } } } });
          changed.extras.push({ id: matchObj.selectedCreator, type: 'CREATOR', gain: CREATOR_POINTS });
        }
      }

      // 6. Apuestas
      const winTeam = matchObj.selectedWinner === 'team1' ? 'team1' : 'team2';
      if (matchObj.bets && !matchObj.bets.paid) {
        for (const b of (matchObj.bets[winTeam] || [])) {
          bulkOps.push({ updateOne: { filter: { _id: b.userId }, update: { $inc: { 'currentSeason.points': b.amount * 2, 'dailyStats.pointsGained': b.amount } } } });
          changed.extras.push({ id: b.userId, type: 'BET_WIN', gain: b.amount * 2 });
        }
        await ActiveMatch.updateOne({ _id: matchObj._id }, { $set: { 'bets.paid': true } }).catch(() => {});
      } else if (matchObj.bets && matchObj.bets.paid) {
        // Ya pagadas: reconstruir lista para mostrar en embed
        for (const b of (matchObj.bets[winTeam] || [])) {
          changed.extras.push({ id: b.userId, type: 'BET_WIN', gain: b.amount * 2 });
        }
      }

      // 7. DB Commit & Cache Invalidation
      if (bulkOps.length > 0) {
        await Player.bulkWrite(bulkOps, { ordered: false });
        if (matchObj._id) await ActiveMatch.updateOne({ _id: matchObj._id }, { $set: { statsApplied: true } }).catch(() => {});
        if (cacheInvalidator) cacheInvalidator.onMatchCompleted(guild.id, uniquePlayerIds);
      }

      // 7b. Verificar y otorgar milestones por partidas (fire-and-forget)
      const matchPlayers = [...(matchObj.team1 || []), ...(matchObj.team2 || [])].filter(Boolean);
      for (const playerId of matchPlayers) {
        checkAndAwardMatchMilestones(playerId, guild).catch(err => {
          console.error(`[Match Milestone] Error verificando milestones para ${playerId}:`, err);
        });
      }

      // 8. Historial
      const historyPayload = { matchNumber: matchObj.matchNumber, date: new Date(), mode: matchObj.mode || '1v1', season: settings.currentSeason || 'Season 1', team1: matchObj.team1 || [], team2: matchObj.team2 || [], winner: matchObj.selectedWinner, mvp: matchObj.selectedMVP, creator: matchObj.selectedCreator, wager: wagerAmount, guildId: guild.id };
      let historyId = existingHistory?._id;
      if (existingHistory) await MatchHistory.updateOne({ _id: existingHistory._id }, { $set: historyPayload });
      else { const saved = await new MatchHistory(historyPayload).save(); historyId = saved._id; }

      // 8b. Head-to-Head: actualizar marcadores globales (fire-and-forget, no bloquea el flujo)
      updateH2HRecords(matchObj).catch(err => console.error('[H2H] Error inesperado en updateH2HRecords:', err));

      // 9. Post-processing (Voice & Logs)
      if (!skipMove) {
        const toMove = [...new Set([...(matchObj.team1 || []), ...(matchObj.team2 || [])].filter(Boolean))];
        Promise.allSettled(toMove.map(id => movePlayerToOriginalVoiceChannel(guild, id, matchObj.previousVoice?.[id], matchObj.voiceChannelIds))).catch(() => {});
        moveSpectatorsToWaitingRoom(guild, matchObj).catch(() => {});
      }

      const winnersField = changed.winners.length > 0
        ? changed.winners.map(w => `<@${w.id}> *(+${w.gain} pts)*`).join('\n')
        : (winners.map(id => `<@${id}>`).join('\n') || '—');
      const losersField = changed.losers.length > 0
        ? changed.losers.map(l => {
            // Detectar si usó protección (perdió menos de LOSE_POINTS completo)
            const fullLoss = LOSE_POINTS + (wagerAmount || 0);
            const shieldUsed = l.loss < fullLoss && wagerAmount === 0;
            return `<@${l.id}> *(-${l.loss} pts)*${shieldUsed ? ' 🛡️' : ''}`;
          }).join('\n')
        : (losers.map(id => `<@${id}>`).join('\n') || '—');
      const extrasField = changed.extras
        .map(e => {
          if (e.type === 'MVP') return `⭐ MVP: <@${e.id}> (+${e.gain} pts)`;
          if (e.type === 'CREATOR') return `👑 Creador: <@${e.id}> (+${e.gain} pts)`;
          if (e.type === 'BET_WIN') return `🏦 Apuesta Ganada: <@${e.id}> (+${e.gain} pts)`;
          return `<@${e.id}> (+${e.gain} pts)`;
        })
        .join('\n') || '—';

      // Calcular duración de la partida
      let duracionStr = '—';
      if (matchObj.createdAt) {
        const diffMs = Date.now() - new Date(matchObj.createdAt).getTime();
        const totalMin = Math.floor(diffMs / 60000);
        const horas = Math.floor(totalMin / 60);
        const mins = totalMin % 60;
        duracionStr = horas > 0 ? `${horas}h ${mins}m` : `${mins}m`;
      }

      // Detectar jugadores penalizados por salir de call durante la partida
      const penalizedIds = Array.isArray(matchObj.voicePenaltyAppliedUserIds) && matchObj.voicePenaltyAppliedUserIds.length > 0
        ? matchObj.voicePenaltyAppliedUserIds.map(id => `<@${id}>`).join(', ')
        : null;

      const embed = new EmbedBuilder()
        .setTitle(`📊 RESUMEN DE PARTIDA #${matchObj.matchNumber}`)
        .setDescription(
          `**Modo:** \`${(matchObj.mode || '1v1').toUpperCase()}\` • **Duración:** \`${duracionStr}\`` +
          (wagerAmount > 0 ? ` • **Wager:** \`${wagerAmount} pts\`` : '')
        )
        .addFields(
          { name: '🏆 GANADORES', value: winnersField.substring(0, 1024), inline: true },
          { name: '💀 PERDEDORES', value: losersField.substring(0, 1024), inline: true }
        )
        .addFields(
          { name: '✨ EXTRAS & BONOS', value: extrasField.substring(0, 1024), inline: false }
        );

      if (penalizedIds) {
        embed.addFields({ name: '⚠️ Penalizados por salir de Call', value: penalizedIds.substring(0, 1024), inline: false });
      }

      embed.addFields(
        { name: '🔗 TRANSCRIPCIÓN', value: `[Ver Historial de Chat](${(config.webTranscriptBaseUrl || settings.webTranscriptBaseUrl) || ''}${matchObj._id})`, inline: false }
      )
      .setColor(COLORS.SUCCESS)
      .setTimestamp();
      
      if (matchObj.closerId) embed.setFooter({ text: `Cerrada por: ${members.get(matchObj.closerId)?.user.tag || matchObj.closerId}`, iconURL: members.get(matchObj.closerId)?.displayAvatarURL() });

      // Enviar al hilo de la partida para que los jugadores lo vean antes de que se cierre
      if (matchObj.textChannelId) {
        try {
          const threadChan = await guild.channels.fetch(matchObj.textChannelId).catch(() => null);
          if (threadChan && typeof threadChan.send === 'function') {
            const allPlayers = [...new Set([...(matchObj.team1 || []), ...(matchObj.team2 || [])].filter(Boolean))];
            const mentionLine = allPlayers.map(id => `<@${id}>`).join(' ');
            await threadChan.send({ content: mentionLine, embeds: [embed], allowedMentions: { users: allPlayers } }).catch(() => {});
          }
        } catch (_) {}
      }

      const logMsg = await sendLog(guild, embed, [], 'matches');
      if (logMsg && historyId) await MatchHistory.updateOne({ _id: historyId }, { $set: { logChannelId: logMsg.channelId, logMessageId: logMsg.id } }).catch(() => {});

      // 10. Limpieza y Actualización Final
      const affectedIds = [...new Set([...(matchObj.team1 || []), ...(matchObj.team2 || []), matchObj.selectedMVP, matchObj.selectedCreator].filter(Boolean))];
      if (updateAffectedNicknames) updateAffectedNicknames(guild, affectedIds).catch(() => {});
      
      const allPlayersInMatch = [...(matchObj.team1 || []), ...(matchObj.team2 || [])].filter(Boolean);
      for (const playerId of allPlayersInMatch) {
        settings.busyPlayers.delete(playerId);
      }

      if (settings.historyChannel) {
        const chan = await guild.channels.fetch(settings.historyChannel).catch(() => null);
        if (chan) {
          const m = await chan.send({ embeds: [embed] }).catch(() => null);
          if (m && historyId) await MatchHistory.updateOne({ _id: historyId }, { $set: { historyChannelId: chan.id, historyMessageId: m.id, notifiedHistory: true } }).catch(() => {});
        }
      }

      return changed;
    } catch (error) {
      console.error(`[applyMatchResults] Error:`, error);
      await sendLog(guild, new EmbedBuilder().setTitle('❌ Error Resultados').setDescription(`Partida #${matchObj.matchNumber}\n${error.message}`).setColor(COLORS.ERROR), [], 'errors').catch(() => {});
      throw error;
    }
  }



  // NUEVO: crear objeto de partido como util
  function createMatchObject({ queue, matchTextChannel, matchVoiceChannels, creatorId }) {
    return {
      textChannelId: matchTextChannel?.id || null,
      queueChannelId: queue?.channelId || null, // Guardar ID del canal de fila para safety check
      voiceChannelIds: matchVoiceChannels?.map(c => c.id) || [],
      creatorId,
      status: 'active',
      createdAt: new Date().toISOString(),
      mode: queue?.mode,
      team1: queue?.team1?.slice() || [],
      team2: queue?.team2?.slice() || [],
      wagerAmount: queue?.wager?.amount || 0,
    };
  }

  // NUEVO: mover jugadores a los canales del partido (equipo 1 -> voz[0], equipo 2 -> voz[1])
  async function movePlayersToMatchChannels({ guild, team1 = [], team2 = [], voiceChannels, excludedFromVoiceMove }) {
    const successes = [];
    const failures = [];

    if (!guild || !voiceChannels || voiceChannels.length < 2) {
      return { successes, failures: [{ error: 'Invalid guild or voiceChannels' }] };
    }

    const exemptions = excludedFromVoiceMove || globalExcludedFromVoiceMove;
    const allIds = [...new Set([...team1, ...team2])];

    try {
      // OPTIMIZATION: Use performanceOptimizer to batch fetch and move members
      if (performanceOptimizer && performanceOptimizer.movePlayersToBatch) {
        // Fetch all members at once (5-10x faster)
        const members = await performanceOptimizer.getMembers(guild, allIds);
        
        // Extract team members as Map for movePlayersToBatch
        const team1Members = new Map();
        const team2Members = new Map();
        
        for (const id of team1) {
          if (exemptions && exemptions.has(id)) {
            console.log(`[Voice Move] Usuario ${id} está exento de movimiento automático de voz (Opt). Saltando...`);
            continue;
          }
          const member = members.get(id);
          if (member) team1Members.set(id, member);
        }
        
        for (const id of team2) {
          if (exemptions && exemptions.has(id)) {
            console.log(`[Voice Move] Usuario ${id} está exento de movimiento automático de voz (Opt). Saltando...`);
            continue;
          }
          const member = members.get(id);
          if (member) team2Members.set(id, member);
        }

        // Move both teams in parallel
        const [result1, result2] = await Promise.all([
          performanceOptimizer.movePlayersToBatch(team1Members, voiceChannels[0], 10).catch(e => ({ success: [], failed: [{ error: e.message }] })),
          performanceOptimizer.movePlayersToBatch(team2Members, voiceChannels[1], 10).catch(e => ({ success: [], failed: [{ error: e.message }] }))
        ]);

        if (result1 && result1.success) successes.push(...result1.success);
        if (result2 && result2.success) successes.push(...result2.success);
        
        if (result1 && result1.failed) failures.push(...result1.failed);
        if (result2 && result2.failed) failures.push(...result2.failed);
        
        return { successes, failures };
      }

      // FALLBACK: Si no está disponible performanceOptimizer, usar lógica original optimizada
      // OPTIMIZACIÓN: Si son pocos jugadores (<= 12), moverlos en paralelo sin batches ni cola limitada
      if (allIds.length <= 12) {
        await Promise.allSettled(allIds.map(async (playerId) => {
          try {
            // Verificar exención
            const exemptions = excludedFromVoiceMove || globalExcludedFromVoiceMove;
            if (exemptions && exemptions.has(playerId)) return;

            const member = guild.members.cache.get(playerId) || await guild.members.fetch(playerId).catch(() => null);
            if (!member) {
              failures.push({ playerId, error: 'Member not found' });
              return;
            }

            // Determinar target channel
            let targetChannelId;
            if (team1.includes(playerId)) targetChannelId = voiceChannels[0].id;
            else if (team2.includes(playerId)) targetChannelId = voiceChannels[1].id;
            else return;

            if (member.voice?.channelId === targetChannelId) {
              successes.push(playerId);
              return;
            }
            await member.voice.setChannel(targetChannelId).catch((e) => {
              failures.push({ playerId, error: e?.message || 'Move failed' });
            });
            successes.push(playerId);
          } catch (e) {
            failures.push({ playerId, error: e.message });
          }
        }));
        return { successes, failures };
      }

      // Para muchos jugadores (>12), usar prefetch + batches
      let fetchedMembers = null;
      try {
        fetchedMembers = await guild.members.fetch({ user: allIds }).catch(() => new Map());
      } catch (_) { }
      
      const moveOnePrefetched = async (playerId, targetChannelId) => {
        try {
          // Verificar si el usuario está exento de movimiento de voz
          const exemptions = excludedFromVoiceMove || globalExcludedFromVoiceMove;
          if (exemptions && exemptions.has(playerId)) {
            console.log(`[Voice Move] Usuario ${playerId} está exento de movimiento automático de voz. Saltando...`);
            return;
          }

          const member = guild.members.cache.get(playerId) || (fetchedMembers && fetchedMembers.get(playerId)) || await guild.members.fetch(playerId).catch(() => null);
          if (!member) {
            failures.push({ playerId, error: 'Member not found' });
            return;
          }
          if (member.voice?.channelId === targetChannelId) {
            successes.push(playerId);
            return;
          }
          await moveQueue.add(() => member.voice.setChannel(targetChannelId)).catch((e) => {
            failures.push({ playerId, error: e?.message || 'Move failed' });
          });
          successes.push(playerId);
        } catch (e) {
          failures.push({ playerId, error: e.message });
        }
      };
      
      const jobs = [
        ...team1.map(id => ({ id, target: voiceChannels[0].id })),
        ...team2.map(id => ({ id, target: voiceChannels[1].id })),
      ];
      await processInBatches(jobs, ({ id, target }) => moveOnePrefetched(id, target));

    } catch (error) {
      console.error('[movePlayersToMatchChannels] Error:', error);
      failures.push({ error: error.message });
    }

    return { successes, failures };
  }

  // NUEVO: mover jugadores al canal de espera (categoría o voz)
  async function movePlayersToWaitingRoom(guild, playerIds) {
    try {
      if (!guild || !Array.isArray(playerIds) || playerIds.length === 0) return;

      const waitingRoomId = WAITING_ROOM_VOICE_CHANNEL_ID || '1400896746044784670';
      const waitingRoom = await guild.channels.fetch(waitingRoomId).catch(() => null);
      if (!waitingRoom) {
        console.warn(`[WaitingRoom] No se encontró el canal/categoría de espera (ID: ${waitingRoomId}).`);
        return;
      }

      let targetChannel = null;
      if (waitingRoom.type === ChannelType.GuildCategory) {
        const available = waitingRoom.children.cache.filter(
          ch => ch.type === ChannelType.GuildVoice && ch.joinable && ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.MoveMembers)
        );
        if (available.size > 0) targetChannel = available.random();
      } else if (waitingRoom.type === ChannelType.GuildVoice) {
        targetChannel = waitingRoom;
      }

      if (!targetChannel) {
        console.warn('[WaitingRoom] No hay un canal de destino disponible para mover jugadores.');
        return;
      }

      let fetchedMembers = null;
      try {
        fetchedMembers = await guild.members.fetch({ user: playerIds }).catch(() => new Map());
      } catch (_) { }
      await processInBatches(playerIds, async (id) => {
        try {
          const member = guild.members.cache.get(id) || (fetchedMembers && fetchedMembers.get(id)) || await guild.members.fetch(id).catch(() => null);
          if (!member?.voice?.channelId) return;
          if (member.voice.channelId === targetChannel.id) return;
          await moveQueue.add(() => member.voice.setChannel(targetChannel.id)).catch(() => { });
        } catch (e) {
          // noop
        }
      });
    } catch (err) {
      console.error('[WaitingRoom] Error moviendo jugadores a sala de espera:', err);
    }
  }

  // NUEVO: Limpieza proactiva de partidas huérfanas
  async function cleanupAllOrphanedMatches(guild) {
    if (!guild) return 0;
    console.log(`[Proactive Cleanup] Iniciando limpieza de partidas huérfanas para el servidor: ${guild.name}`);
    const matchesInDB = await ActiveMatch.find({ guildId: guild.id }).lean();
    if (matchesInDB.length === 0) {
      if (matches.size > 0) {
        console.warn(`[Proactive Cleanup] Inconsistencia detectada: ${matches.size} partidas en memoria, pero 0 en la DB. Limpiando memoria.`);
        matches.clear();
      }
      return 0;
    }

    const STUCK_CREATING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos para partidas atascadas
    const now = Date.now();

    const cleanupPromises = matchesInDB.map(async (matchDoc) => {
      const createdAt = matchDoc.createdAt ? new Date(matchDoc.createdAt).getTime() : (matchDoc._id.includes('-') ? parseInt(matchDoc._id.split('-')[1]) : 0);
      const isCreating = matchDoc.status === 'creating';

      // REGLA 1: Ignorar partidas en estado 'creating' SOLO SI son recientes
      if (isCreating && (now - createdAt < STUCK_CREATING_TIMEOUT_MS)) {
        return false;
      }

      // Si es una partida normal o una 'creating' vieja, procedemos a verificar su canal
      const textChannelId = matchDoc.textChannelId;
      if (!textChannelId) {
        // Si no tiene canal y es vieja, borrar de DB
        if (isCreating || (now - createdAt > STUCK_CREATING_TIMEOUT_MS)) {
          console.log(`[Proactive Cleanup] Borrando registro sin canal: #${matchDoc.matchNumber || 'S/N'}`);
          await ActiveMatch.findByIdAndDelete(matchDoc._id).catch(() => {});
          return true;
        }
        return false;
      }

      const textChannel = guild.channels.cache.get(matchDoc.textChannelId) || await guild.channels.fetch(matchDoc.textChannelId).catch(() => null);
      const controlMessage = textChannel && textChannel.isThread?.() && !textChannel.archived
        ? await textChannel.messages.fetch(matchDoc.messageId).catch(() => null)
        : null;

      if (!textChannel || !controlMessage) {
        const reason = !textChannel ? 'El canal de texto no existe' : 'El mensaje de control fue borrado';
        console.log(`[Proactive Cleanup] Partida huérfana encontrada: #${matchDoc.matchNumber} (${reason}). Limpiando...`);
        await cleanupMatchResources(guild, matchDoc, getMatchDeps());
        return true;
      }
      return false;
    });

    const results = await Promise.all(cleanupPromises);
    let cleanedCount = results.filter(Boolean).length;

    // --- NUEVO: LIMPIEZA DE HILOS FANTASMA (Hilos sin registro en DB) ---
    try {
      const configObj = require('../../config.json');
      const parentChannelId = configObj.matchThreadsParentChannelId || configObj.matchThreadChannelId;
      const parentChannel = guild.channels.cache.get(parentChannelId) || await guild.channels.fetch(parentChannelId).catch(() => null);
      
      if (parentChannel && parentChannel.threads) {
        const fetchedThreads = await parentChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
        const dbThreadIds = new Set(matchesInDB.map(m => m.textChannelId).filter(Boolean));
        
        for (const [threadId, thread] of fetchedThreads.threads) {
          // Si el hilo parece una partida pero NO está en nuestra DB activa
          if (thread.name.startsWith('partida-') && !dbThreadIds.has(threadId)) {
            // PERIODO DE GRACIA: No borrar hilos creados hace menos de 2 minutos
            // Esto evita borrar hilos que están en proceso de creación (race condition)
            if (thread.createdTimestamp && (Date.now() - thread.createdTimestamp < 120000)) {
              continue;
            }
            console.log(`[Proactive Cleanup] Hilo fantasma detectado: ${thread.name} (${threadId}). Eliminando...`);
            await thread.delete('Limpieza de hilo fantasma (sin registro en DB)').catch(() => {});
            cleanedCount++;
          }
        }
      }
    } catch (ghostErr) {
      console.error(`[Proactive Cleanup] Error en limpieza de hilos fantasma:`, ghostErr);
    }

    if (cleanedCount > 0) {
      console.log(`[Proactive Cleanup] Limpieza finalizada. Se eliminaron ${cleanedCount} recursos/partidas huérfanas.`);
    }
    return cleanedCount;
  }
  
  /**
   * RECOVERY: Busca partidas no notificadas de las últimas 24h y las envía.
   */
  async function reconcileMatchNotifications(guild) {
    if (!guild) return;
    try {
      if (!settings || !settings.historyChannel) {
        return;
      }

      const historyChannel = await guild.channels.fetch(settings.historyChannel).catch(() => null);
      if (!historyChannel) {
        return;
      }

      console.log(`[Reconciliation] Iniciando escaneo de notificaciones pendientes...`);

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pending = await MatchHistory.find({
        date: { $gt: oneDayAgo },
        notifiedHistory: { $ne: true }
      }).sort({ date: 1 }).limit(20).lean();

      if (pending.length === 0) return;

      console.log(`[Reconciliation] Re-enviando ${pending.length} notificaciones de historial perdidas...`);

      for (const doc of pending) {
        try {
          console.log(`[Reconciliation] Procesando Partida #${doc.matchNumber} (${doc._id})`);
          
          let winners, losers;
          if (doc.winner === 'annulled') {
            winners = [...(doc.team1 || []), ...(doc.team2 || [])];
            losers = [];
          } else {
            winners = (doc.winner === 'team1' ? doc.team1 : doc.team2) || [];
            losers = (doc.winner === 'team1' ? doc.team2 : doc.team1) || [];
          }

          const embed = new EmbedBuilder()
            .setTitle(doc.winner === 'annulled' ? `⚠️ Partida Anulada (Recuperado) - Partida #${doc.matchNumber}` : `✅ Resultados Aplicados (Recuperado) - Partida #${doc.matchNumber}`)
            .addFields(
              { name: doc.winner === 'annulled' ? '👥 Jugadores' : '🏆 Ganadores', value: winners.length > 0 ? winners.map(id => `<@${id}>`).join('\n') : '—', inline: true },
              { name: doc.winner === 'annulled' ? '—' : '💔 Perdedores', value: losers.length > 0 ? losers.map(id => `<@${id}>`).join('\n') : '—', inline: true }
            )
            .setColor(doc.winner === 'annulled' ? COLORS.WARNING : COLORS.SUCCESS)
            .setFooter({ text: 'Sistema de Recuperación' })
            .setTimestamp(doc.date);
          
          if (doc.mvp) embed.addFields({ name: '⭐ MVP', value: `<@${doc.mvp}>`, inline: true });
          if (doc.winner === 'annulled') {
            embed.setDescription('Esta partida fue marcada como anulada/cancelada.');
          }

          // Añadir link de transcripción si existe base URL
          const baseUrl = config.webTranscriptBaseUrl || settings.webTranscriptBaseUrl;
          if (baseUrl) {
            embed.addFields({ name: '🔗 TRANSCRIPCIÓN', value: `[Ver Historial de Chat](${baseUrl}${doc._id})`, inline: false });
          }

          const sentMsg = await historyChannel.send({ embeds: [embed] }).catch(() => null);
          if (sentMsg) {
            await MatchHistory.updateOne({ _id: doc._id }, { $set: { historyChannelId: historyChannel.id, historyMessageId: sentMsg.id, notifiedHistory: true } });
            console.log(`[Reconciliation] ✅ Notificación recuperada para partida #${doc.matchNumber}`);
          }
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.error(`[Reconciliation] Fallo en doc ${doc._id}:`, err.message);
        }
      }
      console.log('[Reconciliation] Ciclo finalizado.');
    } catch (err) {
      console.error(`[Reconciliation] Error crítico:`, err.message, err.stack);
    }
  }

  return {
    moveSpectatorsToWaitingRoom,
    applyMatchResults,
    createMatchObject,
    movePlayersToMatchChannels,
    movePlayersToWaitingRoom,
    checkAndAwardMatchMilestones,
    // NUEVO: exportar limpieza proactiva y reconciliación
    cleanupAllOrphanedMatches,
    reconcileMatchNotifications
  };
}
