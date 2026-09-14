const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

async function resetStats(message, args, ctx) {
  const { hasPermission, Player, COLORS, EMBED_DEFAULTS, sendLog, tryUpdateNicknameForMember, config } = ctx;
  const EMOJIS = config?.emojis || {};
  try {
    if (!hasPermission(message.member)) return message.channel.send(`${EMOJIS.error || '🚫'} Solo el staff puede usar este comando.`);
    
    const mentions = message.mentions.users;
    if (mentions.size === 0) {
      return message.channel.send(`${EMOJIS.warning || '⚠️'} Debes mencionar al menos a un usuario. Ejemplo: \`!resetstats @usuario1 @usuario2...\``);
    }
    
    const results = [];
    
    for (const [targetId, targetUser] of mentions) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`${EMOJIS.reset || '♻️'} Estadísticas Reseteadas`)
          .setDescription(`**Administrador:** <@${message.author.id}>\n**Jugador:** <@${targetId}>\nTodas las estadísticas han sido puestas a 0.`)
          .setColor(COLORS.WARNING)
          .setTimestamp();
        sendLog(message.guild, logEmbed, [], 'reset');

        await Player.updateOne(
          { _id: targetId },
          {
            $set: {
              points: 0,
              wins: 0,
              losses: 0,
              mvps: 0,
              streak: 0,
              maxStreak: 0,
              creations: 0,
              'currentSeason.points': 0,
              'currentSeason.wins': 0,
              'currentSeason.losses': 0,
              'currentSeason.mvps': 0,
              'currentSeason.streak': 0,
              'currentSeason.maxStreak': 0,
              'currentSeason.creations': 0,
            },
          }
        );
        await tryUpdateNicknameForMember(message.guild, targetId, '');
        results.push(`${EMOJIS.success || '✅'} Estadísticas de <@${targetId}> reseteadas.`);
    }

    if (results.length === 1) {
         const embed = new EmbedBuilder()
          .setTitle(`${EMOJIS.delete || '♻️'} Estadísticas Reseteadas`)
          .setDescription(results[0].replace(`${EMOJIS.success || '✅'} `, ''))
          .setColor(COLORS.SUCCESS)
          .setFooter(EMBED_DEFAULTS.footer)
          .setTimestamp();
        await message.channel.send({ embeds: [embed] });
    } else {
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
  } catch (e) {
    console.error("Error en !resetstats:", e);
    return message.channel.send(`${EMOJIS.error || '❌'} Hubo un error al intentar resetear las estadísticas.`);
  }
}

async function resetAllStats(message, args, ctx) {
  const { hasPermission, Player, MatchHistory, COLORS, sendLog, tryUpdateNicknameForMember, config } = ctx;
  const EMOJIS = config?.emojis || {};
  
  // Verificar que sea owner del bot
  if (!config.botOwnerId || !config.botOwnerId.includes(message.author.id)) {
    return message.channel.send(`${EMOJIS.error || '🚫'} Solo el owner del bot puede usar este comando.`);
  }

  const confirmButton = new ButtonBuilder()
    .setCustomId(`reset_all_confirm_${message.author.id}`)
    .setLabel("Sí, resetear todo")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`reset_all_cancel_${message.author.id}`)
    .setLabel("Cancelar")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
  await message.channel.send({ content: `${EMOJIS.warning || '⚠️'} **Acción PELIGROSA:** ¿Deseas resetear TODAS las estadísticas?`, components: [row] });
}

module.exports = { resetStats, resetAllStats };
