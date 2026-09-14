const { EmbedBuilder } = require('discord.js');

module.exports = async function dailyCoinsCommand(message, args, deps) {
  const { getStyleCoinsRankingFromDB, COLORS, EMBED_DEFAULTS, config } = deps;
  const EMOJIS = config?.emojis || {};

  const ranking = await getStyleCoinsRankingFromDB(15);

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJIS.money || '🪙'} Ranking de Royal Coins (Top 15)`)

    .setColor(COLORS.GOLD)
    .setTimestamp()
    .setFooter(EMBED_DEFAULTS.footer);

  if (ranking.length === 0) {
    embed.setDescription('No hay jugadores con Royal Coins actualmente.');

  } else {
    const description = ranking.map((p, i) => {
      const displayName = p.customName || `<@${p.id}>`;
      return `**${i + 1}.** ${displayName} — **${Math.floor(p.styleCoins)}** ${EMOJIS.money || '🪙'}`;
    }).join('\n');
    embed.setDescription(description);
  }

  await message.channel.send({ embeds: [embed] });
}