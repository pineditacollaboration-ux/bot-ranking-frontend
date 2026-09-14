/**
 * Roles utilities: temporary role removal and cleanup operations.
 * Factory returns functions bound to client/config/Player.
 */
module.exports = {
  createRolesUtils: function ({ client, config, Player, MatchHistory, settings, sendLog, COLORS, EmbedBuilder }) {
    const NON_EXPIRING_ROLE_IDS = new Set([
      ...(Array.isArray(config?.voiceTimeRewards)
        ? config.voiceTimeRewards.map((reward) => String(reward.roleId))
        : []),
      '1499293726856712232',
      '1499269694656610335',
      '1499292933642391653',
      '1499270095782809630',
      '1499293080392568852',
      '1499270198513897542',
      '1499293289034285118',
      '1499270322606833664',
      '1499293167428567091',
      '1499293574968250379',
      '1499292762946670704'
    ]);

    /**
     * Remueve un rol temporal de un usuario de forma segura y atómica.
     * @param {string} userId El ID del usuario.
     * @param {string} roleId El ID del rol a remover.
     */
    async function removeTemporaryRole(userId, roleId) {
      if (NON_EXPIRING_ROLE_IDS.has(String(roleId))) {
        try {
          await Player.updateOne(
            { _id: userId },
            { $pull: { temporaryRoles: { roleId: roleId } } }
          );
          console.log(`[RolesUtils] Rol permanente protegido ${roleId} para ${userId}: no se removerá, solo se limpió el registro temporal en DB.`);
        } catch (error) {
          console.error(`[RolesUtils] Error limpiando rol permanente protegido ${roleId} para ${userId}:`, error);
        }
        return;
      }
      try {
        const guild = client.guilds.cache.get(config.guildId || "1484375565908705414");
        if (!guild) return;

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId).catch(e => console.warn(`No se pudo remover rol temporal ${roleId} de ${userId}:`, e.message));
          console.log(`[RolesUtils] Rol temporal ${roleId} removido de ${userId} (Discord).`);

          // Log de remoción automática (Expiración o sistema)
          if (sendLog && EmbedBuilder && COLORS) {
             try {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🎭 Rol Removido (Auto/Expirado)')
                    .setDescription(`**Sistema:** Automático\n**Jugador:** <@${userId}>\n**Rol:** <@&${roleId}>`)
                    .setColor(COLORS.WARNING)
                    .setTimestamp();
                await sendLog(guild, logEmbed, [], 'autorole');
             } catch(logErr) {
                 console.error('[RolesUtils] Error logging removal:', logErr);
             }
          }
        }

        // Usar $pull para una operación atómica en la DB.
        await Player.updateOne(
          { _id: userId },
          { $pull: { temporaryRoles: { roleId: roleId }, activeWarnings: { roleId: roleId } } }
        );
        console.log(`[RolesUtils] Rol temporal ${roleId} removido de ${userId} (DB cleanup).`);
      } catch (error) {
        console.error(`Error en removeTemporaryRole para ${userId} y rol ${roleId}:`, error);
      }
    }

    /**
     * Limpia roles expirados de la DB en lote, dado un mapa { userId: [roleId] }.
     */
    async function cleanupExpiredRolesFromJSON(rolesToClean) {
      if (!rolesToClean || Object.keys(rolesToClean).length === 0) return;

      const bulkOps = [];
      for (const userId in rolesToClean) {
        const rolesToRemove = rolesToClean[userId];
        bulkOps.push({
          updateOne: {
            filter: { _id: userId },
            update: {
              $pull: {
                activeWarnings: { roleId: { $in: rolesToRemove } },
                temporaryRoles: { roleId: { $in: rolesToRemove } }
              }
            }
          }
        });
      }
      if (bulkOps.length > 0) {
        await Player.bulkWrite(bulkOps);
        console.log(`[Limpieza] Roles expirados eliminados de la DB para ${bulkOps.length} usuarios.`);
      }
    }

    async function updateChampionRoles(championRoles) {
      try {
        const guild = client.guilds.cache.get(config.guildId || "1484375565908705414");
        if (!guild) return;
        
        console.log('[ChampionRoles] Iniciando actualización periódica...');

        const MIN_GAMES_FEW_LOSSES = 20;
        const MIN_MVPS_IMPERADOR = 10;
        const MIN_STREAK_MAXX = 10;
        const MIN_1V1_PLAYED = 10;
        const MIN_WAGER_WINS = 5;
        const MIN_WAGER_TOTAL = 1000;

        // Top 1: el jugador con más puntos de temporada, sin mínimo de partidas.
        const topByPoints = await Player.find()
          .sort({ 'currentSeason.points': -1 })
          .select('_id currentSeason.points')
          .limit(1)
          .lean();
        
        const top1Id = topByPoints[0]?._id || null;
        console.log(`[ChampionRoles] Top 1 Detectado: ${top1Id || 'Ninguno'}`);

        const topByMvp = await Player.find()
          .sort({ 'currentSeason.mvps': -1, 'currentSeason.points': -1 })
          .select('_id currentSeason.mvps')
          .limit(25)
          .lean();
        let maxMvpId = null;
        for (const p of topByMvp) {
          const mvps = (p.currentSeason?.mvps || 0);
          if (mvps >= MIN_MVPS_IMPERADOR) { maxMvpId = p._id; break; }
        }
        console.log(`[ChampionRoles] Max MVP Detectado: ${maxMvpId || 'Ninguno (min 10 MVPs)'}`);

        const topByStreak = await Player.find()
          .sort({ 'currentSeason.streak': -1, 'currentSeason.points': -1 })
          .select('_id currentSeason.streak')
          .limit(25)
          .lean();
        let maxStreakId = null;
        for (const p of topByStreak) {
          const streak = (p.currentSeason?.streak || 0);
          if (streak >= MIN_STREAK_MAXX) { maxStreakId = p._id; break; }
        }
        console.log(`[ChampionRoles] Max Streak Detectado: ${maxStreakId || 'Ninguno (min racha 10)'}`);

        const players = await Player.find().select('_id currentSeason.wins currentSeason.losses').lean();
        let fewLossesId = null;
        let minLosses = Infinity;
        for (const p of players) {
          const wins = (p.currentSeason?.wins || 0);
          const losses = (p.currentSeason?.losses || 0);
          const played = wins + losses;
          if (played >= MIN_GAMES_FEW_LOSSES && losses < minLosses) {
            minLosses = losses;
            fewLossesId = p._id;
          }
        }
        
        const currentSeasonName = settings?.currentSeason || null;
        const seasonFilter = currentSeasonName ? { season: currentSeasonName } : {};

        const agg1x1 = await MatchHistory.aggregate([
          { $match: Object.assign({ mode: '1v1' }, seasonFilter) },
          { $project: { winnerTeam: { $cond: [{ $eq: ['$winner', 'team1'] }, '$team1', '$team2'] } } },
          { $unwind: '$winnerTeam' },
          { $group: { _id: '$winnerTeam', wins: { $sum: 1 } } },
          { $sort: { wins: -1 } },
          { $limit: 1 },
        ]);
        let rei1x1Id = agg1x1[0]?._id || null;
        if (rei1x1Id) {
          const agg1x1Played = await MatchHistory.aggregate([
            { $match: Object.assign({ mode: '1v1' }, seasonFilter) },
            { $project: { participants: { $concatArrays: ['$team1', '$team2'] } } },
            { $unwind: '$participants' },
            { $group: { _id: '$participants', played: { $sum: 1 } } },
            { $match: { _id: rei1x1Id } },
          ]);
          const played = agg1x1Played[0]?.played || 0;
          if (played < MIN_1V1_PLAYED) rei1x1Id = null;
        }

        const aggWager = await MatchHistory.aggregate([
          { $match: Object.assign({ wager: { $gt: 0 } }, seasonFilter) },
          { $project: { winners: { $cond: [{ $eq: ['$winner', 'team1'] }, '$team1', '$team2'] }, wager: '$wager' } },
          { $unwind: '$winners' },
          { $group: { _id: '$winners', total: { $sum: '$wager' }, wins: { $sum: 1 } } },
          { $sort: { total: -1 } },
          { $limit: 1 },
        ]);
        let iziMoneyId = null;
        if (aggWager[0] && aggWager[0].total >= MIN_WAGER_TOTAL && aggWager[0].wins >= MIN_WAGER_WINS) {
          iziMoneyId = aggWager[0]._id;
        }

        const pairs = [
          ['Top 1', championRoles?.terrorTop1, top1Id],
          ['Max MVP', championRoles?.imperradorMaxMvp, maxMvpId],
          ['1x1 Wins', championRoles?.rei1x1MaxWins, rei1x1Id],
          ['Few Losses', championRoles?.jogadorValorizadoFewLosses, fewLossesId],
          ['Wager Won', championRoles?.iziMoneyMaxWagerWon, iziMoneyId],
          ['Max Streak', championRoles?.maxxWinnerMaxStreak, maxStreakId],
        ];

        for (const [label, roleId, userId] of pairs) {
          if (!roleId) continue;
          
          const roleObj = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
          if (!roleObj) {
            console.warn(`[ChampionRoles] Rol ${label} no encontrado en server (ID: ${roleId})`);
            continue;
          }

          const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
          const hasHierarchy = botMember && botMember.roles.highest && botMember.roles.highest.comparePositionTo(roleObj) > 0;
          
          if (!hasHierarchy) {
            console.warn(`[ChampionRoles] El bot no tiene jerarquía para asignar el rol ${label} (${roleObj.name})`);
            continue;
          }

          const holders = roleObj.members;
          for (const m of holders.values()) {
            if (userId === null || m.id !== userId) {
              await m.roles.remove(roleObj).catch((e) => console.error(`[ChampionRoles] Error removiendo rol ${label} a ${m.user.tag}:`, e.message));
            }
          }

          if (userId) {
            // Verificar si el usuario está en el servidor antes de intentar asignar el rol
            const championMember = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
            if (championMember) {
              if (!championMember.roles.cache.has(roleObj.id)) {
                await championMember.roles.add(roleObj)
                  .then(() => console.log(`[ChampionRoles] ✅ Rol ${label} asignado a ${championMember.user.tag}`))
                  .catch((e) => console.error(`[ChampionRoles] ❌ Error asignando rol ${label} a ${championMember.user.tag}:`, e.message));
              }
            }
            // No imprimir warning si el usuario no está en el servidor - es normal que los campeones se vayan
          }
        }
      } catch (err) {
        console.error('[ChampionRoles] Error en la lógica de actualización:', err);
      }
    }
    return { removeTemporaryRole, cleanupExpiredRolesFromJSON, updateChampionRoles };
  }
};
