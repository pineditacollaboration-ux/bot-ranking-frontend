const { AttachmentBuilder } = require('discord.js');
const { generateDailyRankingImage } = require('../utils/daily-ranking-image');

module.exports = async function dailyCommand(message, args, deps) {
  const { getDailyRankingFromDB, EmbedBuilder, COLORS, EMBED_DEFAULTS, config } = deps;
  const EMOJIS = config?.emojis || {};

  const ranking = await getDailyRankingFromDB();

  if (!ranking || ranking.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.rank || '📈'} Ranking Diario de Actividad ${EMOJIS.rank || '📈'}`)
      .setColor(COLORS.PRIMARY)
      .setTimestamp()
      .setFooter(EMBED_DEFAULTS.footer)
      .setDescription('Aún no hay suficiente actividad del día anterior para generar un ranking. ¡A jugar!');
    await message.channel.send({ embeds: [embed] }).catch(() => { });
    return;
  }

  // Preparar Top 10 de Puntos y Victorias
  const topPoints = ranking.slice(0, 10);
  const topWins = [...ranking].sort((a, b) => b.wins - a.wins || b.pointsGained - a.pointsGained).slice(0, 10);

  // Generar imágenes del ranking
  const pointsImageBuffer = await generateDailyRankingImage('points', topPoints, message.guild);
  const winsImageBuffer = await generateDailyRankingImage('wins', topWins, message.guild);

  const pointsAttachment = new AttachmentBuilder(pointsImageBuffer, { name: 'ranking-puntos.png' });
  const winsAttachment = new AttachmentBuilder(winsImageBuffer, { name: 'ranking-wins.png' });

  // Generar Embeds con las imágenes
  const pointsEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.rank || '📈'} Top 10 - Puntos Diarios ${EMOJIS.rank || '📈'}`)
    .setColor(COLORS.PRIMARY)
    .setDescription('Top jugadores con más puntos ganados del día anterior.')
    .setImage('attachment://ranking-puntos.png')
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  const winsEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.winner || '🏆'} Top 10 - Victorias Diarias ${EMOJIS.winner || '🏆'}`)
    .setColor(COLORS.GOLD || 0xFFD700)
    .setDescription('Top jugadores con más victorias del día anterior.')
    .setImage('attachment://ranking-wins.png')
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  await message.channel.send({ 
    embeds: [pointsEmbed, winsEmbed], 
    files: [pointsAttachment, winsAttachment] 
  }).catch(() => { });
}