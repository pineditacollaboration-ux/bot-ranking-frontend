const { PermissionsBitField, EmbedBuilder } = require('discord.js');

function hasAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function addX2Time(message, args, ctx) {
  const { hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, parseDuration } = ctx;
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');

  const userId = args[0]?.replace(/[<@!>]/g, '') || null;
  const durationMs = args[1] ? parseDuration(args[1]) : null;

  if (!userId || durationMs === null) {
    const usageEmbed = new EmbedBuilder()
      .setTitle('⚠️ Uso Incorrecto')
      .setDescription('Formato: `!addx2time @usuario <tiempo>` (ej: 3horas, 1d)')
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] });
  }

  const hours = Math.ceil(durationMs / (1000 * 60 * 60));
  const until = Date.now() + durationMs;
  const doc = await Player.findByIdAndUpdate(userId, { $max: { x2_until: until } }, { new: true });
  if (!doc) return message.channel.send('Jugador no encontrado.');

  const member = await message.guild.members.fetch(userId).catch(() => null);
  const displayName = member?.displayName || userId;

  const embed = new EmbedBuilder()
    .setColor(0x00b894)
    .setTitle('Asignado X2 por tiempo')
    .setDescription(`Se asignó X2 a ${displayName} por ${args[1]}`)
    .addFields(
      { name: 'Hasta', value: `<t:${Math.floor(until / 1000)}:f>` },
      { name: 'Admin', value: message.member.displayName }
    )
    .setTimestamp();

  sendLog(message.guild, embed, [], 'stats');

  return message.channel.send(`✅ X2 por tiempo asignado a ${displayName} hasta <t:${Math.floor(until / 1000)}:f>.`);
}

async function addProteccion(message, args, ctx) {
  const { hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, parseDuration } = ctx;
  if (!hasPermission(message.member)) return message.channel.send('🚫 Solo el staff puede usar este comando.');
  const userId = args[0]?.replace(/[<@!>]/g, '') || null;
  const countOrHours = args[1];
  if (!userId || !countOrHours) {
    const usageEmbed = new EmbedBuilder()
      .setTitle('⚠️ Uso Incorrecto')
      .setDescription('Formato: `!addproteccion @usuario <matches|horas> <cantidad/tiempo>`')
      .setColor(COLORS.WARNING)
      .setFooter(EMBED_DEFAULTS.footer);
    return message.channel.send({ embeds: [usageEmbed] });
  }
  const mode = countOrHours.toLowerCase();

  let update = {};
  let desc = '';
  if (mode === 'matches') {
    const amount = Number(args[2]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return message.channel.send('La cantidad debe ser un número positivo.');
    }
    update = { $inc: { proteccion_matches: Math.floor(amount) } };
    desc = `Se añadieron ${Math.floor(amount)} protecciones por partido`;
  } else if (mode === 'horas') {
    const durationMs = args[2] ? parseDuration(args[2]) : null;
    if (durationMs === null) {
      return message.channel.send('Tiempo inválido. Ej: 3horas, 1d, 30m.');
    }
    const until = Date.now() + durationMs;
    update = { $max: { proteccion_until: until } };
    desc = `Se asignó protección por ${args[2]}`;
  } else {
    return message.reply('Modo inválido. Usa `matches` o `horas`.');
  }

  const doc = await Player.findByIdAndUpdate(userId, update, { new: true });
  if (!doc) return message.channel.send('Jugador no encontrado.');

  const member = await message.guild.members.fetch(userId).catch(() => null);
  const displayName = member?.displayName || userId;

  const embed = new EmbedBuilder()
    .setColor(0x0984e3)
    .setTitle('Protección de puntos asignada')
    .setDescription(`${desc} a ${displayName}`)
    .addFields(
      { name: 'Protecciones restantes', value: String(doc.proteccion_matches ?? 0), inline: true },
      { name: 'Protección hasta', value: doc.proteccion_until ? `<t:${Math.floor(doc.proteccion_until / 1000)}:f>` : '—', inline: true },
      { name: 'Admin', value: message.member.displayName, inline: true }
    )
    .setTimestamp();

  sendLog(message.guild, embed, [], 'stats');

  return message.channel.send(`✅ Protección asignada a ${displayName}.`);
}

module.exports = { addX2Time, addProteccion };

module.exports = { addX2Time, addProteccion };