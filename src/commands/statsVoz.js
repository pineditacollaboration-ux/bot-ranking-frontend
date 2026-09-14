const { ChannelType } = require('discord.js');

async function statsVozCommand(message, args, { settings, Setting, COLORS, BOT_OWNER_ID }) {
  const guild = message.guild;
  if (!guild) return;

  const isOwner = Array.isArray(BOT_OWNER_ID)
    ? BOT_OWNER_ID.includes(message.author.id)
    : message.author.id === BOT_OWNER_ID;

  if (!isOwner) {
    return message.channel.send('🚫 Solo el dueño del bot puede usar este comando.').catch(() => { });
  }

  const categoryId = '1403183437644435569';
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return message.channel.send('❌ No se encontró la categoría para el canal de stats de voz.').catch(() => {});
  }

  let channel = null;
  if (settings.voiceStatsChannelId) {
    channel = await guild.channels.fetch(settings.voiceStatsChannelId).catch(() => null);
  }

  const voiceCount = guild.voiceStates.cache.filter(vs => vs.channelId && vs.member && !vs.member.user.bot).size;
  const name = `Miembros En Call: ${voiceCount}`;

  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: category.id
    }).catch(() => null);
    if (!channel) {
      return message.channel.send('❌ No se pudo crear el canal de stats de voz.').catch(() => {});
    }
  } else {
    if (channel.parentId !== category.id) {
      await channel.setParent(category.id).catch(() => {});
    }
    if (channel.name !== name) {
      await channel.setName(name).catch(() => {});
    }
  }

  settings.voiceStatsChannelId = channel.id;
  if (Setting) {
    await Setting.findByIdAndUpdate('voiceStatsChannelId', { value: channel.id }, { upsert: true }).catch(() => {});
  }

  return message.channel.send({ content: `✅ Canal de stats de voz configurado: ${channel}.` }).catch(() => {});
}

module.exports = statsVozCommand;
