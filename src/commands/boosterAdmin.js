const { EmbedBuilder } = require('discord.js');

/**
 * Comando para otorgar beneficios de booster manualmente.
 * Uso: !darbeneficiosbooster @usuario <cantidad_de_impulsos>
 */
async function darBeneficiosBooster(message, args, ctx) {
  const { 
    hasPermission, ensurePlayerRecord, Player, COLORS, EMBED_DEFAULTS, 
    sendLog, config, invalidateGlobalRankCache, invalidateSeasonRankCache, 
    updateAffectedNicknames 
  } = ctx;
  
  const EMOJIS = config?.emojis || {};
  
  // 1. Verificación de permisos (Solo roles específicos autorizados)
  const AUTHORIZED_ROLES = [
    '1489755784484229222', '1489729736925249717', '1490579398980538419',
    '1490537392707207269', '1490748724685705347', '1489717079098654720',
    '1490531904007704617', '1489717134878707713'
  ];

  const hasAuthorizedRole = message.member.roles.cache.some(r => AUTHORIZED_ROLES.includes(r.id));
  
  // Bypass para el Dueño del Bot si es necesario, pero siguiendo tu lista estrictamente:
  if (!hasAuthorizedRole) {
    return message.channel.send(`${EMOJIS.error || '🚫'} No tienes permiso para usar este comando (Rol no autorizado).`);
  }

  // 2. Obtener el objetivo (miembro del servidor)
  const target = message.mentions.members.first() || (args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : null);
  if (!target) {
    return message.channel.send(`${EMOJIS.error || '❌'} Debes mencionar a un usuario o poner su ID.\nUso: \`!darbeneficiosbooster @usuario <cantidad>\``);
  }

  // 3. Obtener la cantidad de impulsos (por defecto 1)
  const quantity = parseInt(args[1]) || 1;
  if (isNaN(quantity) || quantity < 1) {
    return message.channel.send(`${EMOJIS.error || '❌'} La cantidad debe ser un número mayor a 0.`);
  }

  // --- CONFIGURACIÓN DE BENEFICIOS POR CADA IMPULSO ---
  const POINTS_PER_BOOST = 10000;
  const COINS_PER_BOOST = 10;
  const MUTE_DAYS_PER_BOOST = 5;
  const X2_HOURS_PER_BOOST = 4;
  const PROTECT_HOURS_PER_BOOST = 4;
  
  // IDs de Roles (según el sistema actual)
  const MUTE_ROLE_ID = '1489754585143705631';
  const PASE_LIBRE_ROLE_ID = '1489754427220037724';

  // Totales
  const totalPoints = POINTS_PER_BOOST * quantity;
  const totalCoins = COINS_PER_BOOST * quantity;
  const muteDurationMs = MUTE_DAYS_PER_BOOST * quantity * 24 * 60 * 60 * 1000;
  const x2DurationMs = X2_HOURS_PER_BOOST * quantity * 60 * 60 * 1000;
  const protectDurationMs = PROTECT_HOURS_PER_BOOST * quantity * 60 * 60 * 1000;

  try {
    // Asegurar registro en DB
    const player = await ensurePlayerRecord(target.id);
    
    // 1. Aplicar Puntos
    player.currentSeason.points = (player.currentSeason.points || 0) + totalPoints;
    
    // 2. Aplicar Style Coins
    player.styleCoins = (player.styleCoins || 0) + totalCoins;
    
    // 3. Aplicar Créditos de Cartera (Boosters)
    player.x2_credit_ms = (player.x2_credit_ms || 0) + x2DurationMs;
    player.proteccion_credit_ms = (player.proteccion_credit_ms || 0) + protectDurationMs;

    // 4. Aplicar Rol Mute Temporal en DB
    if (!player.temporaryRoles) player.temporaryRoles = [];
    const existingMute = player.temporaryRoles.find(r => r.roleId === MUTE_ROLE_ID);
    if (existingMute) {
      const existingMs = (existingMute.expiresAt instanceof Date) ? existingMute.expiresAt.getTime() : Number(existingMute.expiresAt || 0);
      existingMute.expiresAt = new Date(Math.max(existingMs, Date.now()) + muteDurationMs);
    } else {
      player.temporaryRoles.push({ roleId: MUTE_ROLE_ID, expiresAt: new Date(Date.now() + muteDurationMs) });
    }

    // Guardar cambios en DB
    await player.save();

    // 5. Otorgar Roles en el Servidor de Discord
    // Pase Libre es permanente, Mute es gestionado por el sistema temporal (aunque lo añadimos aquí para efecto inmediato)
    await target.roles.add([MUTE_ROLE_ID, PASE_LIBRE_ROLE_ID]).catch(e => {
      console.error('[Booster] Error al añadir roles:', e);
    });

    // 6. Invalidar Caches de Ranking
    if (invalidateGlobalRankCache) invalidateGlobalRankCache();
    if (invalidateSeasonRankCache) invalidateSeasonRankCache();

    // 7. Enviar Respuesta de Éxito
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJIS.boost || '🚀'} Beneficios Booster Entregados`)
      .setDescription(`Se han otorgado recompensas por **${quantity} impulso(s)** a <@${target.id}>.`)
      .addFields(
        { 
          name: '💰 Divisas', 
          value: `• **+${totalPoints.toLocaleString()}** Puntos\n• **+${totalCoins}** Royal Coins`, 
          inline: true 
        },
        { 
          name: '🛡️ Cartera', 
          value: `• **+${X2_HOURS_PER_BOOST * quantity}h** Puntos X2\n• **+${PROTECT_HOURS_PER_BOOST * quantity}h** Protección`, 
          inline: true 
        },
        { 
          name: '🎭 Roles', 
          value: `• <@&${MUTE_ROLE_ID}> (**${MUTE_DAYS_PER_BOOST * quantity} días**)\n• <@&${PASE_LIBRE_ROLE_ID}> (Eterno)`, 
          inline: false 
        }
      )
      .setColor(COLORS.SUCCESS)
      .setThumbnail(target.user.displayAvatarURL())
      .setFooter(EMBED_DEFAULTS.footer)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    // 8. Enviar Logs
    const logEmbed = new EmbedBuilder()
      .setTitle('🚀 Entrega de Beneficios Booster')
      .setDescription(`**Staff:** <@${message.author.id}>\n**Usuario:** <@${target.id}>\n**Impulsos:** ${quantity}`)
      .addFields(
        { name: 'Detalle de Recompensas', value: `Puntos: +${totalPoints}\nCoins: +${totalCoins}\nMute: ${MUTE_DAYS_PER_BOOST * quantity}d\nCréditos: ${X2_HOURS_PER_BOOST * quantity}h X2 / ${PROTECT_HOURS_PER_BOOST * quantity}h Prot.` }
      )
      .setColor(COLORS.SUCCESS)
      .setTimestamp();
    
    // Loguear en categorías relevantes
    sendLog(message.guild, logEmbed, [], 'coins');
    sendLog(message.guild, logEmbed, [], 'points');
    sendLog(message.guild, logEmbed, [], 'vips');

    // 9. Actualizar nicks si es necesario
    if (updateAffectedNicknames) {
      updateAffectedNicknames(message.guild, [target.id]).catch(() => {});
    }

  } catch (error) {
    console.error('[Booster Command] Error:', error);
    return message.channel.send(`${EMOJIS.error || '❌'} Hubo un error al procesar el comando.`);
  }
}

module.exports = { darBeneficiosBooster };
