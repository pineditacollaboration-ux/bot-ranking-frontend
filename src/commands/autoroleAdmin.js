const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

async function postAutorolePanel(message, args, {
  client,
  COLORS,
  EMBED_DEFAULTS,
  config,
}) {
  // Solo admins o dueño del bot
  const isAdmin = message.member.permissions.has('Administrator');
  if (!isAdmin) {
    return message.channel.send('🚫 Solo administradores pueden publicar el panel de autorol.').catch(() => { });
  }

  const channelId = args[0] || (config && config.autorolePanelChannelId) || message.channel.id;
  const channel = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return message.channel.send('❌ No pude encontrar el canal configurado para el panel.').catch(() => { });
  }

  // Usar banner del servidor; si no existe, usar fondo local
  const bannerUrl = message.guild.bannerURL({ size: 2048 }) || null;
  const iconUrl = message.guild.iconURL({ size: 256 }) || null;
  const bannerFile = bannerUrl ? null : { attachment: 'background.png', name: 'autorole-banner.png' };

  const embed = new EmbedBuilder()
    .setTitle('🎮 Panel de Autoroles')
    .setDescription([
      'Elige tu modo preferido para recibir el rol correspondiente.',
      '',
      '⚔️ **1v1** — rol temporal de 5 horas (máx. 30 usos/semana)',
      '🛡️ **2v2** — rol temporal de 5 horas (máx. 30 usos/semana)',
      '👑 **Royal 3v3/4v4** — rol permanente',
      '',
      'Los roles temporales se removerán automáticamente al expirar.'
    ].join('\n'))
    .setColor(COLORS?.PRIMARY || 0x5865F2)
    .setFooter({ text: 'Selecciona una opción en el menú inferior' })
    .setTimestamp();

  if (typeof EMBED_DEFAULTS !== 'undefined' && EMBED_DEFAULTS.thumbnail) {
    embed.setThumbnail(EMBED_DEFAULTS.thumbnail);
  } else if (iconUrl) {
    embed.setThumbnail(iconUrl);
  }

  if (typeof EMBED_DEFAULTS !== 'undefined' && EMBED_DEFAULTS.thumbnail) {
    embed.setImage(EMBED_DEFAULTS.thumbnail);
  } else if (bannerUrl) {
    embed.setImage(bannerUrl);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('autorole:main')
    .setPlaceholder('🧩 Selecciona tu modo de juego')
    .addOptions([
      {
        label: '⚔️ 1v1 (5h)',
        description: 'Rol temporal por 5 horas',
        value: 'role:1v1:1489717015756407016',
      },
      {
        label: '🛡️ 2v2 (5h)',
        description: 'Rol temporal por 5 horas',
        value: 'role:2v2:1489735948597067907',
      },
      {
        label: '👑 Royal 3v3/4v4 (permanente)',
        description: 'Rol permanente',
        value: 'role:royal:1489762472675115189',
      },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);
  const payload = { embeds: [embed], components: [row] };
  await channel.send(payload).catch(() => { });
  return message.channel.send('✅ Panel de autorol publicado en el canal indicado.').catch(() => { });
}

async function postPcMovilPanel(message, args, {
  client,
  COLORS,
  EMBED_DEFAULTS,
}) {
  const isAdmin = message.member.permissions.has('Administrator');
  if (!isAdmin) {
    return message.channel.send('🚫 Solo administradores pueden publicar el panel de autorol.').catch(() => { });
  }

  const channelId = args[0] || message.channel.id;
  const channel = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return message.channel.send('❌ No pude encontrar el canal configurado para el panel.').catch(() => { });
  }

  const bannerUrl = message.guild.bannerURL({ size: 2048 }) || null;
  const iconUrl = message.guild.iconURL({ size: 256 }) || null;

  const embed = new EmbedBuilder()
    .setTitle('🖥️📱 Panel de Roles PC / Móvil')
    .setDescription([
      'Elige tu plataforma para recibir el rol correspondiente, sin el no podras crear ni entrar a filas.',
      '',
      '🖥️ **PC** — rol permanente',
      '📱 **Móvil** — rol permanente',
      '',
      'Los roles permanentes no expiran.'
    ].join('\n'))
    .setColor(COLORS?.PRIMARY || 0x5865F2)
    .setFooter({ text: 'Selecciona una opción en el menú inferior' })
    .setTimestamp();

  if (EMBED_DEFAULTS?.thumbnail) {
    embed.setThumbnail(EMBED_DEFAULTS.thumbnail);
    embed.setImage(EMBED_DEFAULTS.thumbnail);
  } else {
    if (iconUrl) embed.setThumbnail(iconUrl);
    if (bannerUrl) embed.setImage(bannerUrl);
  }

  const config = require('../../config.json');
  const PC_ROLE_ID = (config && config.pcRoleId) ? config.pcRoleId : '000000000000000000';
  const MOVIL_ROLE_ID = (config && config.mobileRoleId) ? config.mobileRoleId : '000000000000000001';

  const menu = new StringSelectMenuBuilder()
    .setCustomId('autorole:main')
    .setPlaceholder('🧩 Selecciona tu dispositivo')
    .addOptions([
      {
        label: '🖥️ PC (permanente)',
        description: 'Rol permanente',
        value: `role:pc:${PC_ROLE_ID}`,
      },
      {
        label: '📱 Móvil (permanente)',
        description: 'Rol permanente',
        value: `role:movil:${MOVIL_ROLE_ID}`,
      },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);
  const payload = { embeds: [embed], components: [row] };
  await channel.send(payload).catch(() => { });
  return message.channel.send('✅ Panel PC/Móvil publicado en el canal indicado.').catch(() => { });
}

module.exports = {
  postAutorolePanel,
  postPcMovilPanel,
};
