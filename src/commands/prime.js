
const { EmbedBuilder } = require('discord.js');

async function primeCommand(message, args, deps) {
  const { client, Player, ensurePlayerRecord, COLORS, EMBED_DEFAULTS } = deps;

  // --- RESTRICTION CHECK ---
  const ALLOWED_CHANNEL_ID = '1401035609417715775';
  const BYPASS_ROLES = [
    '1407834282042593430', 
    '1409311314148327595', 
    '1451685064961429666', 
    '1421579084986847232'
  ];

  const isOwner = message.guild?.ownerId === message.author.id;
  const hasBypassRole = message.member?.roles.cache.some(r => BYPASS_ROLES.includes(r.id));
  const isAllowedChannel = message.channel.id === ALLOWED_CHANNEL_ID;

  if (!isOwner && !hasBypassRole && !isAllowedChannel) {
    const reply = await message.reply(`❌ Este comando solo está permitido en <#${ALLOWED_CHANNEL_ID}>.`);
    setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
    }, 5000);
    return;
  }
  // -------------------------

  // 1. Identify target user
  let target = message.mentions.users.first()
    || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null)
    || message.author;

  // 2. Fetch data
  const playerDoc = await ensurePlayerRecord(target.id);
  if (!playerDoc) {
    return message.channel.send("❌ No se encontraron datos para este usuario.");
  }

  // 3. Calculate Peak Stats
  // Start with current season
  let peakPoints = playerDoc.currentSeason?.points || 0;
  
  // Check global points if they track something different (often global points are just current season, but let's be safe)
  if ((playerDoc.points || 0) > peakPoints) {
      peakPoints = playerDoc.points;
  }

  // Check past seasons
  if (Array.isArray(playerDoc.pastSeasons)) {
    for (const season of playerDoc.pastSeasons) {
      if ((season.points || 0) > peakPoints) {
        peakPoints = season.points;
      }
    }
  }

  // Peak Streak
  // Usually stored in root maxStreak or currentSeason.maxStreak
  const rootMaxStreak = playerDoc.maxStreak || 0;
  const seasonMaxStreak = playerDoc.currentSeason?.maxStreak || 0;
  const peakStreak = Math.max(rootMaxStreak, seasonMaxStreak);

  // Total Wins/MVPs (Lifetime)
  const totalWins = playerDoc.wins || 0;
  const totalMvps = playerDoc.mvps || 0;

  // 4. Build Embed
  const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const embed = new EmbedBuilder()
    .setAuthor({ name: `Prime Status: ${target.username}`, iconURL: target.displayAvatarURL() })
    .setColor(COLORS?.PRIMARY || '#5865F2') // Bot main color
    .setThumbnail(EMBED_DEFAULTS?.thumbnail || client.user.displayAvatarURL({ extension: 'gif' })) // Bot GIF
    .addFields(
      { name: '🏆 Puntos Máximos', value: `${fmt(peakPoints)}`, inline: true },
      { name: '⚡ Racha Máxima', value: `${fmt(peakStreak)}`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true }, // Spacer
      { name: '✅ Victorias Totales', value: `${fmt(totalWins)}`, inline: true },
      { name: '🌟 MVPs Totales', value: `${fmt(totalMvps)}`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true } // Spacer
    )
    .setFooter(EMBED_DEFAULTS?.footer || { text: 'Bot Prime Status' })
    .setTimestamp();

  // 5. Send
  await message.channel.send({ embeds: [embed] });
}

module.exports = { primeCommand };
