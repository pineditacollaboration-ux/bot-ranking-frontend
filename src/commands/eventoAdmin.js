const { EmbedBuilder } = require('discord.js');

function parseHours(arg) {
  const n = Number(arg);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function eventoCommand(message, args, ctx) {
  const { config, hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, settings, Setting } = ctx;
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) return message.channel.send('🚫 Solo el staff puede usar este comando.');

  const tipoRaw = (args[0] || '').toLowerCase();
  const horas = parseHours(args[1]);
  const tipo = tipoRaw.replace('ó', 'o');

  const isX2 = ['x2', 'puntosx2', 'puntos_x2'].includes(tipo);
  const isX3 = ['x3', 'puntosx3', 'puntos_x3'].includes(tipo);
  const isX4 = ['x4', 'puntosx4', 'puntos_x4'].includes(tipo);
  const isX5 = ['x5', 'puntosx5', 'puntos_x5'].includes(tipo);
  const isProteccion = ['proteccion', 'protección', 'shield'].includes(tipo);

  if ((!isX2 && !isX3 && !isX4 && !isX5 && !isProteccion) || horas === null) {
    const usage = new EmbedBuilder()
      .setTitle('⚠️ Uso Incorrecto')
      .setDescription('Formato: `!evento <x2|x3|x4|x5|proteccion> <horas>`\nEjemplos: `!evento x3 6`, `!evento proteccion 12`')
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usage] });
  }

  const until = Date.now() + horas * 60 * 60 * 1000;

  const eligibleFilter = {
    $or: [
      { wins: { $gt: 0 } },
      { losses: { $gt: 0 } },
      { 'currentSeason.wins': { $gt: 0 } },
      { 'currentSeason.losses': { $gt: 0 } }
    ]
  };

  let update;
  let title;
  let desc;
  let color = COLORS.SUCCESS;

  if (isX2) {
    update = { $max: { x2_until: until } };
    title = '⚡ Evento Global: Puntos X2';
    desc = `Se activó **Puntos X2** por **${horas}h** para jugadores con al menos una partida.`;
  } else if (isX3) {
    update = { $max: { x3_until: until } };
    title = '🔥 Evento Global: Puntos X3';
    desc = `Se activó **Puntos X3** por **${horas}h** para jugadores con al menos una partida.`;
    color = COLORS.GOLD;
  } else if (isX4) {
    update = { $max: { x4_until: until } };
    title = '🚀 Evento Global: Puntos X4';
    desc = `Se activó **Puntos X4** por **${horas}h** para jugadores con al menos una partida.`;
    color = COLORS.GOLD;
  } else if (isX5) {
    update = { $max: { x5_until: until } };
    title = '💎 Evento Global: Puntos X5';
    desc = `Se activó **Puntos X5** por **${horas}h** para jugadores con al menos una partida.`;
    color = COLORS.GOLD;
  } else {
    update = { $max: { proteccion_until: until } };
    title = '🛡️ Evento Global: Protección de Puntos';
    desc = `Se activó **Protección de Puntos** por **${horas}h** para jugadores con al menos una partida.`;
    color = COLORS.PRIMARY;
  }

  // Guardar estado global del evento
  if (Setting) {
    await Setting.findByIdAndUpdate('global_event', {
      $set: {
        value: {
          type: isX2 ? 'x2' : isX3 ? 'x3' : isX4 ? 'x4' : isX5 ? 'x5' : 'proteccion',
          until: until,
          title: title
        }
      }
    }, { upsert: true });
  }

  const result = await Player.updateMany(eligibleFilter, update);
  const matched = result?.matchedCount ?? 0;
  const modified = result?.modifiedCount ?? 0;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`${desc}\n\n**Hasta:** <t:${Math.floor(until / 1000)}:f>\n**Elegibles:** ${matched.toLocaleString('es-ES')}\n**Actualizados:** ${modified.toLocaleString('es-ES')}`)
    .setColor(color)
    .setTimestamp();

  try { sendLog(message.guild, embed, [], 'stats'); } catch (_) { }

  const channelId = settings?.announcementsChannel;
  if (channelId) {
    const chan = await message.guild.channels.fetch(channelId).catch(() => null);
    if (chan && typeof chan.send === 'function') {
      return await chan.send({ embeds: [embed] }).catch(() => { });
    }
  }

  return await message.channel.send({ embeds: [embed] });
}

module.exports = { eventoCommand };

