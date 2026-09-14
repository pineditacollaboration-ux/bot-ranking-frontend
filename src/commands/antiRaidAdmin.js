const { EmbedBuilder } = require('discord.js');

async function setAntiRaid(message, args, { Setting, settings, COLORS, sendLog, BOT_OWNER_ID }) {
  const isOwner = Array.isArray(BOT_OWNER_ID)
    ? BOT_OWNER_ID.includes(message.author.id)
    : message.author.id === BOT_OWNER_ID;

  if (!isOwner) return message.channel.send('🚫 Solo el Dueño del Bot puede usar este comando.');

  const option = args[0]?.toLowerCase();
  if (!['on', 'off'].includes(option)) {
    return message.channel.send('Uso: `!setantiraid on` o `!setantiraid off`').catch(() => {});
  }

  const enabled = option === 'on';
  await Setting.findByIdAndUpdate('antiRaidNewAccounts', { value: enabled }, { upsert: true });
  settings.antiRaidNewAccounts = enabled;

  const logEmbed = new EmbedBuilder()
    .setTitle('⚙️ Anti-Raid Configurado')
    .setDescription(`**Ejecutado por:** <@${message.author.id}>\n**Estado:** ${enabled ? 'Activado 🟢' : 'Desactivado 🔴'}`)
    .setColor(enabled ? COLORS.SUCCESS : COLORS.WARNING)
    .setTimestamp();
  sendLog(message.guild, logEmbed, [], 'raid');

  return message.channel.send(`✅ Sistema Anti-Raid para cuentas nuevas (menores a 30 días) ha sido **${enabled ? 'ACTIVADO' : 'DESACTIVADO'}**.`).catch(() => {});
}

module.exports = { setAntiRaid };
