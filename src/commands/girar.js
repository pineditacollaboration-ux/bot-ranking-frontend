const { AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { generatePrizeCard } = require('../utils/roulette-generator');
const { generateRouletteGif, generateRouletteStaticImage, PRIZE_EMOJIS } = require('../utils/roulette-gif');

module.exports = async function girarCommand(message, ctx) {
  const {
    Player,
    ROULETTE_PRIZES,
    ROULETTE_PROBABILITIES,
    COLORS,
    deliverPrize,
    ROULETTE_CHANNEL_ID: ROULETTE_CHANNEL_ID_CTX,
  } = ctx;

  const ROULETTE_CHANNEL_ID = '1548203042955071568';

  const STREAMER_CATEGORY_ID = '1473558364289241253';
  const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

  const EMOJIS = ctx.config.emojis || {};
  if (message.channel.id !== ROULETTE_CHANNEL_ID && !isInStreamerCategory) {
    // [DM DESACTIVADO] Aviso de canal correcto para !girar
    // try {
    //   await message.author.send(`${EMOJIS.warning || '⚠️'} El comando \`!girar\` solo se puede usar en el canal <#${ROULETTE_CHANNEL_ID}>.`);
    // } catch (e) {
    //   console.warn(`No se pudo enviar DM a ${message.author.tag} sobre el canal de la ruleta.`);
    // }
    if (message.deletable) await message.delete().catch(() => { });
    return;
  }

  const player = await Player.findOneAndUpdate(
    { _id: message.author.id, spins: { $gt: 0 } },
    { $inc: { spins: -1 } },
    { new: true }
  );

  if (!player) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Sin Giros Disponibles')
      .setDescription(`No tienes giros para la ruleta. ¡Consigue más aquí!\n\n📍 **Canales disponibles:**\n• <#1548203045505081356> - Giros gratis\n• <#1548203018829430874> - Más opciones\n• <#1548203017197715516> - Compra VIP`)
      .setColor(COLORS.ERROR || '#ff0000')
      .setFooter({ text: 'Próximo giro en la siguiente recompensa' })
      .setTimestamp();
    return message.reply({ embeds: [errorEmbed], flags: [64] }).catch(() => {});
  }

  console.log(`[Roulette Command] Triggered by ${message.author.tag}`);

  const total = ROULETTE_PROBABILITIES.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let prizeIndex = -1;
  for (let i = 0; i < ROULETTE_PROBABILITIES.length; i++) {
    r -= ROULETTE_PROBABILITIES[i];
    if (r < 0) { prizeIndex = i; break; }
  }

  const prize = ROULETTE_PRIZES[prizeIndex];

  let notificationText = '';
  try {
    if (typeof deliverPrize === 'function') {
      notificationText = await deliverPrize(message.member, prize);
    }
  } catch (e) {
    console.error('Error al entregar premio en ruleta:', e);
    notificationText = '⚠️ Hubo un error al entregar tu premio. Contacta al staff.';
  }

  const prizeEmoji = PRIZE_EMOJIS[prize.id] || '🎁';
  
  // Colores por tipo de premio
  const prizeColors = {
    points: '#FFD700',
    spins: '#00BFFF',
    role: '#9B59B6',
    manual_dm: '#FF69B4',
    manual: '#FF69B4'
  };
  
  const embedColor = prizeColors[prize.type] || '#FFD700';
  
  const finalEmbed = new EmbedBuilder()
    .setTitle(`${prizeEmoji} ¡PREMIO OBTENIDO! ${prizeEmoji}`)
    .setColor(embedColor)
    .setDescription(`**¡Felicidades, <@${message.author.id}>!**\n\n🎁 **Ganaste:** ${prize.name}`)
    .setThumbnail('https://cdn.discordapp.com/emojis/957109761788141578.png?size=256')
    .addFields(
      { name: '📊 Tipo', value: prize.type.toUpperCase(), inline: true },
      { name: '🎲 Giros restantes', value: `${player.spins}`, inline: true }
    )
    .setFooter({ text: '🎰 Ruleta de Premios' })
    .setTimestamp();

  const btn = new ButtonBuilder()
    .setCustomId('ruleta:spin')
    .setLabel('GIRAR DE NUEVO')
    .setStyle(ButtonStyle.Success)
    .setEmoji(EMOJIS.spin || '🎰');
  const row = new ActionRowBuilder().addComponents(btn);

  const finalOptions = { embeds: [finalEmbed], components: [row] };

  await message.reply(finalOptions).catch(() => {});

  try {
    const { sendLog } = ctx;
    const logEmbed = new EmbedBuilder()
      .setTitle(`🎰 Ruleta Girada - ${prize.name}`)
      .setDescription(`**Jugador:** <@${message.author.id}>\n**Premio:** ${prizeEmoji} ${prize.name}\n**Giros restantes:** ${player.spins}`)
      .setColor(prize.color || COLORS.PRIMARY)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'roulette');
  } catch (e) {
    console.warn('[Logs] No se pudo enviar log de ruleta:', e);
  }
};
