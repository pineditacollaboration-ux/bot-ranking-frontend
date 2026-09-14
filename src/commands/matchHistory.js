module.exports = {
  handleMatchHistoryCommand: async function handleMatchHistoryCommand(context, targetUser, deps) {
    const { MatchHistory, EmbedBuilder, COLORS, ActionRowBuilder, ButtonBuilder, ButtonStyle, Player, config } = deps;
    const EMOJIS = config?.emojis || {};

    // Obtener nombre personalizado si existe
    let displayName = targetUser.username;
    if (Player) {
      try {
        const pDoc = await Player.findOne({ _id: targetUser.id }).select('customName').lean();
        if (pDoc && pDoc.customName) displayName = pDoc.customName;
      } catch (_) { }
    }

    // OPTIMIZACIÓN: Proyección, límite y lean() para reducir tiempo de consulta
    const userHistory = await MatchHistory.find({ $or: [{ team1: targetUser.id }, { team2: targetUser.id }] })
      .select('matchNumber date mode winner team1 team2 mvp wager season guildId logChannelId logMessageId historyChannelId historyMessageId')
      .sort({ date: -1 })
      .limit(50)
      .lean();

    const replyMethod = context.isInteraction ? (context.isDeferred ? 'editReply' : 'reply') : 'reply';

    if (userHistory.length === 0) {
      const payload = {
        content: '',
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setAuthor({ name: `Historial de ${displayName}`, iconURL: targetUser.displayAvatarURL() })
            .setDescription('Este jugador aún no ha disputado ninguna partida.')
        ]
      };
      if (context.isInteraction) payload.ephemeral = true;
      return context[replyMethod](payload);
    }

    const perPage = 5;
    const maxPage = Math.ceil(userHistory.length / perPage);
    let page = 1;

    const generateEmbed = (p) => {
      const start = (p - 1) * perPage;
      const end = start + perPage;
      const slice = userHistory.slice(start, end);

      const description = slice.map(match => {
        let isWinner = false;
        let resultIcon = ' L ';
        let resultText = 'Derrota';
        
        if (match.winner === 'cancel') {
            resultIcon = '🚫';
            resultText = 'Anulada';
        } else {
            isWinner = (match.winner === 'team1' && match.team1.includes(targetUser.id)) || (match.winner === 'team2' && match.team2.includes(targetUser.id));
            resultIcon = isWinner ? (EMOJIS.success || '🏆') : (EMOJIS.error || '❌');
            resultText = isWinner ? 'Victoria' : 'Derrota';
        }
        
        const opponentTeam = match.team1.includes(targetUser.id) ? match.team2 : match.team1;
        const opponentMentions = opponentTeam.map(id => `<@${id}>`).join(', ');
        const date = new Date(match.date).toLocaleString('es-ES', {
          day: 'numeric',
          month: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const gid = match.guildId || (context.guild ? context.guild.id : (context.guildId || null));
        const matchUrl = (match.historyChannelId && match.historyMessageId && gid)
          ? `https://discord.com/channels/${gid}/${match.historyChannelId}/${match.historyMessageId}`
          : (match.logChannelId && match.logMessageId && gid)
            ? `https://discord.com/channels/${gid}/${match.logChannelId}/${match.logMessageId}`
            : null;
        
        const matchLabel = matchUrl ? `[Partida #${match.matchNumber}](${matchUrl})` : `Partida #${match.matchNumber}`;

        return `**${resultIcon} ${resultText}** vs ${opponentMentions || 'N/A'}\n*${matchLabel} | Modo: ${match.mode || 'N/A'} | ${date}*`;
      }).join('\n\n');

      return new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setAuthor({ name: `Historial de ${displayName}`, iconURL: targetUser.displayAvatarURL() })
        .setDescription(description)
        .setFooter({ text: `Página ${p} de ${maxPage}` });
    };

    const getRow = (currentPage, maxP, authorId) => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hist_prev_${authorId}`).setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 1),
        new ButtonBuilder().setCustomId(`hist_next_${authorId}`).setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= maxP)
      );
    };

    const author = context.isInteraction ? context.user : context.author;
    const replyOptions = { embeds: [generateEmbed(page)], components: [getRow(page, maxPage, author.id)], fetchReply: true, ephemeral: context.isInteraction };
    const sentMessage = await context[replyMethod](replyOptions).catch(() => null);

    if (!sentMessage) return;
    const collector = sentMessage.createMessageComponentCollector({ filter: i => i.user.id === author.id && i.customId.startsWith('hist_'), time: 120000 });

    if (context.isInteraction && context.isButton && context.customId && context.customId.startsWith('hist_')) {
      const authorId = context.customId.split('_').pop();
      if (context.user.id !== authorId) {
        return context.followUp({ content: '⚠️ Solo quien ejecutó el comando puede cambiar de página.', ephemeral: true });
      }

      if (context.customId.includes('next')) page++;
      else if (context.customId.includes('prev')) page--;

      await context.update({ embeds: [generateEmbed(page)], components: [getRow(page, maxPage, author.id)] }).catch(() => { });
      collector.stop();
      return;
    }

    collector.on('collect', async i => {
      if (i.customId.includes('next')) page++;
      else if (i.customId.includes('prev')) page--;
      await i.update({ embeds: [generateEmbed(page)], components: [getRow(page, maxPage, author.id)] }).catch(() => { });
    });

    collector.on('end', () => {
      if (sentMessage && !sentMessage.deleted) {
        sentMessage.edit({ components: [] }).catch(() => { });
      }
    });
  }
};
