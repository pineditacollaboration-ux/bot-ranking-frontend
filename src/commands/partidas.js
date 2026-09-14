// src/commands/partidas.js
const { EmbedBuilder } = require('discord.js');

module.exports = async function partidasCommand(message, ctx) {
  const { matches, COLORS, Player } = ctx;
  const ongoingMatches = [...matches.values()].filter(m => !m.closed);
  const embed = new EmbedBuilder()
    .setTitle('🔴 Partidas en Curso')
    .setColor(COLORS.PRIMARY)
    .setTimestamp();

  if (ongoingMatches.length === 0) {
    embed.setDescription('Actualmente no hay ninguna partida en curso.\n¡Anímate a crear una con `!fila`!');
  } else {
    // Obtener todos los IDs de jugadores para buscar sus nombres personalizados
    const allPlayerIds = new Set();
    ongoingMatches.forEach(match => {
      (match.team1 || []).forEach(id => allPlayerIds.add(id));
      (match.team2 || []).forEach(id => allPlayerIds.add(id));
    });

    // Buscar nombres personalizados en la base de datos
    const playersDocs = await Player.find({ _id: { $in: [...allPlayerIds] } }).select('customName').lean();
    const nameMap = {};
    playersDocs.forEach(doc => {
      if (doc.customName) nameMap[doc._id] = doc.customName;
    });

    let description = 'Estas son las partidas que se están jugando ahora mismo:\n\n';
    ongoingMatches.forEach(match => {
      const team1Mentions = (match.team1 || []).map(id => nameMap[id] || `<@${id}>`).join(', ');
      const team2Mentions = (match.team2 || []).map(id => nameMap[id] || `<@${id}>`).join(', ');
      description += `**Partida #${match.matchNumber} (${(match.mode || '').toUpperCase()}) en <#${match.textChannelId}>**\n`;
      description += `> 🔵 **Equipo 1:** ${team1Mentions}\n`;
      description += `> 🔴 **Equipo 2:** ${team2Mentions}\n\n`;
    });
    embed.setDescription(description);
  }

  return message.channel.send({ embeds: [embed] });
};