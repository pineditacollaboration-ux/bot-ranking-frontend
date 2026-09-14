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

// Asigna partidas con puntos x2 al jugador (consume 1 por victoria si no tiene el rol de x2)
async function addX2(message, args, ctx) {
  const { hasPermission, ensurePlayerRecord, Player, COLORS, sendLog } = ctx;
  if (!hasPermission(message.member)) return message.reply('🚫 Solo el staff puede usar este comando.');

  const targetIds = extractUserIds(message, args);

  // Handle amount extraction when multiple users are mentioned.
  // Usually amount is the last argument.
  let amountStr = args[args.length - 1];
  let amount = parseInt(amountStr, 10);
  
  if (targetIds.length === 0 || isNaN(amount) || amount <= 0) {
    return message.reply('Uso: `!addx2 @usuario1 @usuario2... <cantidad>`');
  }

  const results = [];
  
  for (const targetId of targetIds) {
      await ensurePlayerRecord(targetId);
      const updated = await Player.findByIdAndUpdate(
        targetId,
        { $inc: { puntosX2_matches: amount } },
        { new: true, upsert: true }
      );
    
      const total = updated?.puntosX2_matches || 0;
    
      const logEmbed = new EmbedBuilder()
        .setTitle('⚡ Puntos X2 Asignados')
        .setDescription(`**Staff:** <@${message.author.id}>\n**Jugador:** <@${targetId}>\n**Cantidad:** +${amount}\n**Total:** ${total}`)
        .setColor(COLORS.SUCCESS)
        .setTimestamp();
      sendLog(message.guild, logEmbed, [], 'points');
      results.push(`✅ **+${amount}** x2 a <@${targetId}> (Total: ${total})`);
  }

  if (results.length === 1) {
       return message.reply(results[0].replace('✅ ', ''));
  } else {
       // Bulk response
       const parts = [];
       let currentChunk = "";
       for (const line of results) {
           if (currentChunk.length + line.length > 1900) {
               parts.push(currentChunk);
               currentChunk = "";
           }
           currentChunk += line + "\n";
       }
       if (currentChunk) parts.push(currentChunk);
       
       for (const part of parts) {
           await message.channel.send(part);
       }
  }
}

module.exports = { addX2 };