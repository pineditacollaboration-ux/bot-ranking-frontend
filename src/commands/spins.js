const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

function extractUserIds(message, args) {
  const ids = new Set();
  message.mentions.users.forEach(user => ids.add(user.id));
  args.forEach(arg => {
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17) ids.add(clean);
  });
  return Array.from(ids);
}

async function addSpins(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog } = ctx;
  if (!hasPermission(message.member)) return message.reply('🚫 Solo el staff puede usar este comando.');

  const targetIds = extractUserIds(message, args);
  let amount = null;
  for (const arg of args) {
    if (/^\d+$/.test(arg) && arg.length < 17) {
      amount = parseInt(arg, 10);
      break;
    }
  }

  if (targetIds.length === 0 || amount === null || amount <= 0) {
    return message.reply('Uso: `!addgiros @usuario1 @usuario2... <cantidad>`');
  }

  const results = [];
  for (const id of targetIds) {
    const updated = await Player.findByIdAndUpdate(id, { $inc: { spins: amount } }, { new: true, upsert: true });
    results.push(`<@${id}> (${updated.spins})`);

    const logEmbed = new EmbedBuilder()
      .setTitle('🎰 Giros Añadidos')
      .setDescription(`**Staff:** <@${message.author.id}>\n**Jugador:** <@${id}>\n**Cantidad:** +${amount}\n**Total:** ${updated.spins || 0}`)
      .setColor(COLORS.SUCCESS)
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'spins');
  }

  return message.reply(`✅ Se añadieron **${amount}** giros a: ${results.join(', ')}`);
}

async function removeSpins(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog } = ctx;
  if (!hasPermission(message.member)) return message.reply('🚫 Solo el staff puede usar este comando.');

  const targetIds = extractUserIds(message, args);
  let amount = null;
  for (const arg of args) {
    if (/^\d+$/.test(arg) && arg.length < 17) {
      amount = parseInt(arg, 10);
      break;
    }
  }

  if (targetIds.length === 0 || amount === null || amount <= 0) {
    return message.reply('Uso: `!removegiros @usuario1 @usuario2... <cantidad>`');
  }

  const results = [];
  for (const id of targetIds) {
    const currentDoc = await ensurePlayerRecord(id);
    const newSpins = Math.max(0, (currentDoc.spins || 0) - amount);
    const updated = await Player.findByIdAndUpdate(id, { $set: { spins: newSpins } }, { new: true, upsert: true });
    results.push(`<@${id}> (${updated.spins})`);

    const logEmbed = new EmbedBuilder()
      .setTitle('🎰 Giros Removidos')
      .setDescription(`**Staff:** <@${message.author.id}>\n**Jugador:** <@${id}>\n**Cantidad:** -${amount}\n**Total:** ${updated.spins || 0}`)
      .setColor(COLORS.ERROR)
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'spins');
  }

  return message.reply(`✅ Se removieron **${amount}** giros de: ${results.join(', ')}`);
}

async function setSpins(message, args, ctx) {
  const { hasPermission, client, ensurePlayerRecord, Player, COLORS, sendLog } = ctx;
  if (!hasPermission(message.member)) return message.reply('🚫 Solo el staff puede usar este comando.');

  const targetIds = extractUserIds(message, args);
  let amount = null;
  for (const arg of args) {
    if (/^\d+$/.test(arg) && arg.length < 17) {
      amount = parseInt(arg, 10);
      break;
    }
  }

  if (targetIds.length === 0 || amount === null || amount < 0) {
    return message.reply('Uso: `!setgiros @usuario1 @usuario2... <cantidad>`');
  }

  const results = [];
  for (const id of targetIds) {
    const updated = await Player.findByIdAndUpdate(id, { $set: { spins: amount } }, { new: true, upsert: true });
    results.push(`<@${id}>`);

    const logEmbed = new EmbedBuilder()
      .setTitle('🎰 Giros Establecidos')
      .setDescription(`**Staff:** <@${message.author.id}>\n**Jugador:** <@${id}>\n**Nuevo Total:** ${updated.spins || 0}`)
      .setColor(COLORS.PRIMARY)
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'spins');
  }

  return message.reply(`✅ Se estableció el total de giros de ${results.join(', ')} en **${amount}**.`);
}

module.exports = { addSpins, removeSpins, setSpins };
