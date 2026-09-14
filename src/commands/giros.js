const { EmbedBuilder } = require('discord.js');

function extractUserIds(message, args) {
  const ids = new Set();
  message.mentions.users.forEach(user => ids.add(user.id));
  args.forEach(arg => {
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17) ids.add(clean);
  });
  return Array.from(ids);
}

module.exports = async function girosCommand(message, args, ctx) {
  const { ensurePlayerRecord, COLORS } = ctx;

  let targetIds = extractUserIds(message, args);

  if (targetIds.length === 0) {
    targetIds = [message.author.id];
  }

  const embeds = [];

  for (const targetId of targetIds) {
    const player = await ensurePlayerRecord(targetId);
    const spinAmount = player.spins || 0;

    let user = message.client.users.cache.get(targetId);
    if (!user) {
      try {
        user = await message.client.users.fetch(targetId);
      } catch (e) {}
    }

    const displayName = player.customName || (user ? user.username : 'Usuario Desconocido');
    const iconURL = user ? user.displayAvatarURL() : undefined;

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setAuthor({ name: `Giros de Ruleta de ${displayName}`, iconURL })
      .setDescription(`Actualmente tienes **${spinAmount}** giros disponibles para la ruleta 🎰.`);
    
    embeds.push(embed);
  }

  // Enviar embeds (máximo 10 por mensaje)
  const chunks = [];
  for (let i = 0; i < embeds.length; i += 10) {
    chunks.push(embeds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    await message.channel.send({ embeds: chunk });
  }
};