const { EmbedBuilder } = require('discord.js');

module.exports = async function coinsCommand(message, ctx) {
  const { ensurePlayerRecord, COLORS } = ctx;

  const target = message.mentions.users.first() || message.author;
  const player = await ensurePlayerRecord(target.id);
  const coinAmount = Math.floor(player.styleCoins || 0);

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setAuthor({ name: `Saldo de ${player.customName || target.username}`, iconURL: target.displayAvatarURL() })
    .setDescription(`Actualmente tienes **${coinAmount}** Royal Coins 🪙.`);


  return message.channel.send({ embeds: [embed] });
};