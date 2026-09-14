const { EmbedBuilder } = require('discord.js');

/**
 * Comando exclusivo para el owner para añadir puntos a todos los jugadores con partidas.
 */
async function puntosEveryoneCommand(message, args, ctx) {
  const { Player, COLORS, EMBED_DEFAULTS, sendLog, config } = ctx;
  const ALLOWED_USER_ID = '1391505274556387338';
  const EMOJIS = config?.emojis || {};

  // Restricción estricta por ID
  if (message.author.id !== ALLOWED_USER_ID) {
    return message.channel.send(`${EMOJIS.error || '❌'} No tienes permiso para usar este comando especial.`);
  }

  const amount = parseInt(args[0], 10);
  if (isNaN(amount)) {
    const usage = new EmbedBuilder()
      .setTitle('⚠️ Uso Incorrecto')
      .setDescription('Formato: `!puntoseveryone <cantidad>`\nEjemplo: `!puntoseveryone 500`')
      .setColor(COLORS.WARNING || 0xFFA500)
      .setFooter(EMBED_DEFAULTS?.footer || null);
    return message.channel.send({ embeds: [usage] });
  }

  // Filtro: Todos los jugadores (sin restricción después de reset)
  const eligibleFilter = {};

  try {
    // Aviso de inicio (opcional para comandos largos)
    const waitingMsg = await message.channel.send(`${EMOJIS.loading || '⏳'} Procesando actualización global de puntos...`);

    const result = await Player.updateMany(eligibleFilter, {
      $inc: { 
        'points': amount,
        'currentSeason.points': amount,
        'dailyStats.pointsGained': amount
      }
    });

    // Invalidar cachés para que el ranking se actualice de inmediato
    if (typeof ctx.invalidateGlobalRankCache === 'function') ctx.invalidateGlobalRankCache();
    if (typeof ctx.invalidateSeasonRankCache === 'function') ctx.invalidateSeasonRankCache();

    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.success || '✅'} Actualización Global Completada`)
      .setDescription(`Se han sumado **${amount.toLocaleString('es-ES')}** puntos a todos los jugadores activos.`)
      .addFields(
        { name: '👥 Jugadores Elegibles', value: result.matchedCount.toLocaleString('es-ES'), inline: true },
        { name: '📝 Jugadores Actualizados', value: result.modifiedCount.toLocaleString('es-ES'), inline: true }
      )
      .setColor(COLORS.SUCCESS || 0x00FF00)
      .setTimestamp();

    if (sendLog) {
      const logEmbed = new EmbedBuilder()
        .setTitle('📢 !puntoseveryone Ejecutado')
        .setDescription(`**Usuario:** <@${message.author.id}> (${message.author.id})\n**Cantidad:** ${amount}\n**Resultado:** ${result.modifiedCount} jugadores actualizados.`)
        .setColor(COLORS.INFO || 0x0099FF)
        .setTimestamp();
      sendLog(message.guild, logEmbed, [], 'stats');
    }

    await waitingMsg.delete().catch(() => {});
    return message.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[PuntosEveryone] Error:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Ocurrió un error crítico al actualizar los puntos globales.`);
  }
}

module.exports = { puntosEveryoneCommand };
