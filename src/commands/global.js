// src/commands/global.js
// Comando !global @Jugador1 @Jugador2
// Muestra el historial de enfrentamientos globales entre dos jugadores con UI premium.

module.exports = {
  globalCommand: async function globalCommand(message, args, deps) {
    const { client, Player, HeadToHead, EmbedBuilder, COLORS, config, EMBED_DEFAULTS } = deps;
    const EMOJIS = config?.emojis || {};

    // Obtener los dos usuarios mencionados o por ID
    const mentions = [...message.mentions.users.values()];
    let user1 = mentions[0] || null;
    let user2 = mentions[1] || null;

    if (!user1 || !user2) {
      const ids = args.filter(a => /^\d{17,20}$/.test(a));
      if (ids[0] && !user1) user1 = await client.users.fetch(ids[0]).catch(() => null);
      if (ids[1] && !user2) user2 = await client.users.fetch(ids[1]).catch(() => null);
    }

    if (!user1 || !user2) {
      return message.channel.send(
        `${EMOJIS.error || '❌'} **Uso correcto:** \`!global @Jugador1 @Jugador2\``
      ).catch(() => {});
    }

    if (user1.id === user2.id) {
      return message.channel.send(
        `${EMOJIS.warning || '⚠️'} No puedes comparar a un jugador consigo mismo.`
      ).catch(() => {});
    }

    // Clave canónica
    const [p1id, p2id] = [user1.id, user2.id].sort();
    const docId = `${p1id}:${p2id}`;
    const record = await HeadToHead.findById(docId).lean().catch(() => null);

    // Emojis de interfaz (aprovechando los personalizados del bot)
    const successEmoji = EMOJIS.success || '✅';
    const warningEmoji = EMOJIS.warning || '⚠️';
    const errorEmoji = EMOJIS.error || '❌';
    const vsEmoji = EMOJIS.swords || '⚔️';
    const crownEmoji = EMOJIS.crown || '👑';

    // Nombres
    let name1 = user1.displayName || user1.username;
    let name2 = user2.displayName || user2.username;

    if (!record || record.totalMatches === 0) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_DEFAULTS?.color || COLORS.WARNING || 0xFF8C00)
        .setAuthor({ name: `Historial de Enfrentamientos`, iconURL: EMBED_DEFAULTS?.thumbnail || null })
        .setDescription(`${warningEmoji} **Información no disponible**\n\n<@${user1.id}> y <@${user2.id}> **nunca se han enfrentado** en una partida registrada oficial que esté en el sistema.\n\n*¡Jueguen una partida en equipos contrarios para empezar a ver sus estadísticas aquí!*`)
        .setFooter(EMBED_DEFAULTS?.footer || { text: 'Sistema Global de Enfrentamientos' })
        .setTimestamp();
        
      if (EMBED_DEFAULTS?.thumbnail) embed.setThumbnail(EMBED_DEFAULTS.thumbnail);
      
      // Enviamos el contenido con las etiquedas afuera para que resalte
      return message.channel.send({
        content: `👋 <@${user1.id}> vs <@${user2.id}>`,
        embeds: [embed],
        allowedMentions: { parse: ['users'] }
      }).catch(() => {});
    }

    // Calcular victorias
    const user1Wins = user1.id === record.player1 ? record.player1Wins : record.player2Wins;
    const user2Wins = user2.id === record.player2 ? record.player2Wins : record.player1Wins;
    const total = record.totalMatches;

    // Determinar líder con tags enriquecidos
    let leaderLine = '';
    if (user1Wins > user2Wins) {
      const adv = user1Wins - user2Wins;
      leaderLine = `${crownEmoji} **<@${user1.id}>** lidera los enfrentamientos con **${user1Wins}** victorias contra **${user2Wins}**.\n*(Mantiene una ventaja de ${adv} ${adv === 1 ? 'victoria' : 'victorias'})*`;
    } else if (user2Wins > user1Wins) {
      const adv = user2Wins - user1Wins;
      leaderLine = `${crownEmoji} **<@${user2.id}>** lidera los enfrentamientos con **${user2Wins}** victorias contra **${user1Wins}**.\n*(Mantiene una ventaja de ${adv} ${adv === 1 ? 'victoria' : 'victorias'})*`;
    } else {
      leaderLine = `🤝 **¡Completamente igualados!**\nAmbos tienen **${user1Wins}** ${user1Wins === 1 ? 'victoria' : 'victorias'} en sus enfrentamientos directos.`;
    }

    // Barra Visual ASCII
    const BAR_LENGTH = 20;
    let bar = '';
    if (total > 0) {
      const blocks1 = Math.round((user1Wins / total) * BAR_LENGTH);
      const blocks2 = BAR_LENGTH - blocks1;
      bar = `\`${'█'.repeat(blocks1)}${'—'.repeat(blocks2)}\``;
    }

    // Porcentajes
    const pct1 = total > 0 ? ((user1Wins / total) * 100).toFixed(1) : '0.0';
    const pct2 = total > 0 ? ((user2Wins / total) * 100).toFixed(1) : '0.0';

    const lastDate = record.lastMatchDate
      ? `<t:${Math.floor(new Date(record.lastMatchDate).getTime() / 1000)}:R>`
      : 'Desconocida';

    const embed = new EmbedBuilder()
      .setColor(EMBED_DEFAULTS?.color || COLORS.PRIMARY || 0xED4245)
      .setAuthor({ name: `H2H Global: ${name1} vs ${name2}`, iconURL: user1.displayAvatarURL({ dynamic: true }) })
      .setTitle(`${vsEmoji} Historial de Enfrentamientos`)
      .setDescription(leaderLine)
      .addFields(
        {
          name: `${successEmoji} Jugador 1`,
          value: `<@${user1.id}>\n**🏆 ${user1Wins}** victorias\n📊 Winrate: **${pct1}%**`,
          inline: true
        },
        {
          name: '🎮 Choques',
          value: `**${total}** ${total === 1 ? 'partida total' : 'partidas en total'}`,
          inline: true
        },
        {
          name: `${errorEmoji} Jugador 2`,
          value: `<@${user2.id}>\n**🏆 ${user2Wins}** victorias\n📊 Winrate: **${pct2}%**`,
          inline: true
        },
        {
          name: '📈 Balanza Gráfica',
          value: `Jugador 1 ${bar} Jugador 2`,
          inline: false
        },
        {
          name: '🕐 Última partida en contra',
          value: lastDate,
          inline: false
        }
      )
      .setFooter(EMBED_DEFAULTS?.footer || { text: 'Sistema Global de Enfrentamientos' })
      .setTimestamp();
      
    if (EMBED_DEFAULTS?.thumbnail) embed.setThumbnail(EMBED_DEFAULTS.thumbnail);
    if (EMBED_DEFAULTS?.image) embed.setImage(EMBED_DEFAULTS.image);

    return message.channel.send({ 
      content: `👋 <@${user1.id}> vs <@${user2.id}>`, 
      embeds: [embed],
      allowedMentions: { parse: ['users'] }
    }).catch(() => {});
  }
};
