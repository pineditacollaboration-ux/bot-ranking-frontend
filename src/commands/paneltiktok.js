const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = async function postTikTokPanel(message, args, ctx) {
  const { COLORS, EMBED_DEFAULTS } = ctx;
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send('🚫 Solo el staff puede usar este comando.');

  const channelId = args[0] || message.channel.id;
  const targetChannel = await message.guild.channels.fetch(channelId).catch(() => null);
  if (!targetChannel || !targetChannel.isTextBased()) return message.channel.send(`❌ Canal inválido: ${channelId}`);

  const embed = new EmbedBuilder()
    .setTitle('🔗 Vincula tu TikTok')
    .setDescription('Pulsa el botón de abajo para vincular tu cuenta de TikTok con tu perfil de Discord. Esto permite notificaciones automáticas cuando estés en directo.')
    .setColor(COLORS.PRIMARY)
    .setImage(EMBED_DEFAULTS.thumbnail)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  const btn = new ButtonBuilder()
    .setCustomId('panel:tiktok:open')
    .setLabel('Vincular TikTok')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(btn);

  await targetChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
  return message.channel.send(`✅ Panel de TikTok enviado correctamente a <#${channelId}>.`);
};
