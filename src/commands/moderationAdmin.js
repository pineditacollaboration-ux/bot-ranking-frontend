const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { generateDailyLeaderboard } = require('../utils/leaderboardImage');

async function postReglamentoCommand(message, args, { hasPermission, client, COLORS, EMBED_DEFAULTS, config }) {
  const EMOJIS = config?.emojis || {};
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member?.roles?.cache?.has(roleId));
  if (!hasRole && !hasPermission(message.member)) {
    return message.channel.send(`${EMOJIS.ban || '🚫'} Solo el staff puede usar este comando.`);
  }
  const channelId = args[0] || '1489717381285675073'; // Canal de reglamentos (ejemplo)
  const targetChannel = await message.guild.channels.fetch(channelId).catch(() => null);
  if (!targetChannel || !targetChannel.isTextBased()) {
    return message.channel.send(`${EMOJIS.error || '❌'} Canal inválido: ${channelId}`);
  }

  const embed1 = new EmbedBuilder()
    .setTitle('📘 Reglamento Oficial — ROYAL RANKED')
    .setColor(COLORS.PRIMARY)
    .setImage(EMBED_DEFAULTS.thumbnail)
    .addFields(
      {
        name: 'Reglas Generales de Conducta',
        value: [
          '• Respeto ante todo: prohibida la toxicidad, insultos, racismo y conducta antideportiva.',
          '• No abusos: no explotar bugs del bot; reportar fallos al staff.',
          '• Juego limpio: prohibidos hacks, smurfing y elo boosting.',
          '• Comunicación clara: seguir indicaciones del bot y del staff.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Filas y Partidas: Crear o Entrar',
        value: [
          '• Conectado a canal de voz permitido.',
          '• No AFK tras unirte; si no estás listo, no te unas.',
          '• Si el creador de la fila sale, la fila se cierra para todos.',
          '• Si el creador usa emulador/tela, debe avisarlo en el chat de la fila.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Filas y Partidas: En Curso y Cierre',
        value: [
          '• No abandonar partidas en curso: puede ser derrota automática y penalización.',
          '• Reportar resultados honestamente en el canal de la partida.',
          '• En desacuerdo, interviene el staff; se aceptan clips, capturas y testimonios del hilo.',
          '• No cerrar la fila sin terminar la partida; si va 6-6, se termina la sala y luego se cierra.',
          '• Tiempo estimado para cierre de partida: 10 minutos; si se abandona la fila, es victoria del equipo contrario.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Reglas de Apuestas',
        value: [
          '• Para proponer o aceptar, debes tener los puntos necesarios en tu saldo.',
          '• Todos los jugadores deben aceptar la apuesta para que esta sea válida y la partida pueda comenzar.',
          '• Abandonar una partida con apuesta activa: derrota y descuento de los puntos apostados.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Importante',
        value: [
          '• Prohibido compartir, regalar o prestar puntos para apostar o jugar; se aplica advertencia y, a la tercera, blacklist del Discord.',
          '• Prohibido hacer bugs del juego (ej. bug botiquín); se cuenta como ronda ganada para el equipo contrario.',
          '• Prohibido buscar bugs del bot para conseguir puntos; se remueven los puntos obtenidos y 1 semana en blacklist.',
          '• Las reglas deben pactarse dentro de la fila; si no se pactan, se juega con las predeterminadas del Discord.',
          '• El que crea la fila, crea la sala; si la sala del creador tiene bug o ping alto, se sale y la crea el otro equipo.',
          '• Jugar en una cuenta en blacklist sin avisar en el chat de la fila: victoria para el equipo contrario.',
          '• Si se banea una cuenta o se mete a blacklist sin haber entrado a la sala, se apela la fila; solo válido dentro de la sala.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Reglas de Canales (Lectura Obligatoria)',
        value: [
          '• Lee y cumple las reglas de: <#1420264787509772420>, <#1420266979817816144>, <#1407145958340558879>, <#1407132407504572621>, <#1455622696334524437>, <#1407137125530341376>.',
          '• Incumplir las reglas de estos canales conlleva sanciones.'
        ].join('\n'),
        inline: false
      }
    )
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  const tiendaChannelId = (config && config.shopChannelId) || '1489717372628504700';
  const ruletaChannelId = (config && config.rouletteChannelId) || '1489717421576294401';

  const embed2 = new EmbedBuilder()
    .setTitle('💼 Economía, Sanciones y Reglas Técnicas')
    .setColor(COLORS.PRIMARY)
    .setImage(EMBED_DEFAULTS.thumbnail)
    .addFields(
      {
        name: 'Economía y Tienda',
        value: [
          `• Uso de la tienda (!tienda) en <#${tiendaChannelId}>: Las Royal Coins se ganan jugando partidas; no pedir al staff ni a otros usuarios.`,
          '• Compras de roles y efectos son automáticas; premios como Nitro/Diamantes los entrega manualmente el staff.',
          '• Prohibido intercambiar Royal Coins o premios del bot por dinero real u otros bienes externos.',
          `• Uso de la ruleta (!ruleta) en <#${ruletaChannelId}>: Los giros se obtienen como recompensa, en tienda, por VIP o individualmente.`,
          '• Abusar de errores del sistema anula premios y puede conllevar sanción.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Sanciones',
        value: [
          '• Advertencias: infracciones menores; acumular agrava sanciones.',
          '• Pérdida de puntos: abandono, falsificación de resultados y otras infracciones moderadas.',
          '• Blacklist: trampas, toxicidad extrema, abuso de bugs; sin acceso al bot.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Prohibiciones y Reglas Técnicas',
        value: [
          '• Prohibido jugar en Free Fire MAX; el de tela sí vale.',
          '• Windows Kernel OS: válido solo con todos los servicios activos.',
          '• M10 chipeada: cada ronda ganada se otorga al rival; cambiar arma cada ronda.',
          '• Roles PC/Móvil: tener rol incorrecto implica blacklist 1 día.',
          '• Ranked: nivel mínimo de cuenta FF 20.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Procedimientos de Revisión y Cierre de Fila',
        value: [
          '• Para pedir revisión: mínimo 3 rondas ganadas; 3 minutos para subir a análisis y transmitir si se pide revisión; no se cierra la fila hasta finalizar la revisión.',
          '• No cerrar la fila sin al menos 5 minutos desde haber terminado la sala; solo se rasca por repetición, reglas o algo mayor.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Aceptación de Reglas en Chat',
        value: [
          '• Si un equipo publica reglas y el otro confirma sin aclarar objeciones, se considera aceptación total.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Discord Obligatorio (Voz)',
        value: [
          '• Prohibido jugar fuera del Discord/canal de voz.',
          '• Solo con !exclusivo y permiso de un administrador.',
          '• Incumplimiento: descuento de 10,000 puntos.'
        ].join('\n'),
        inline: false
      }
    )
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  await targetChannel.send({ embeds: [embed1] }).catch(() => null);
  await targetChannel.send({ embeds: [embed2] }).catch(() => null);
  return message.channel.send(`${EMOJIS.success || '✅'} Reglamento publicado en dos embeds.`);
}



function panel(message, args, { hasPermission, queues, matches, client, COLORS, EMBED_DEFAULTS, config }) {
  const EMOJIS = config?.emojis || {};
  const AUTHORIZED_ROLES = [
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
    "1484375565975617595", // Admin (fallback)
    "1484375565975617594", // Moderador (fallback)
  ];
  const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
  if (!hasRole) {
    return message.channel.send(`${EMOJIS.ban || '🚫'} Solo el staff puede usar este comando.`);
  }

  const buildPanelEmbed = () => {
    const activeQueues = [...queues.values()].map(q => `> • **${q.mode.toUpperCase()}** en <#${q.channelId}> por <@${q.creatorId}> (${q.team1.length + q.team2.length}/${q.maxPlayers()})`).join('\n') || '> Ninguna';
    const ongoingMatches = [...matches.values()].map(m => `> • **Partida #${m.matchNumber}** (${m.mode.toUpperCase()}) en <#${m.textChannelId}>`).join('\n') || '> Ninguna';
    const uptime = `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`;
    const memoryUsage = `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`;
    const playerCount = 0; // Se puede mejorar con Player.countDocuments()

    return new EmbedBuilder()
      .setTitle(`${EMOJIS.maintenance || '🛡️'} Panel de Control del Bot ${EMOJIS.maintenance || '🛡️'}`)
      .setColor(COLORS.PRIMARY)
      .addFields(
        { name: "⚔️ Filas Activas", value: activeQueues, inline: false },
        { name: "🎮 Partidas en Curso", value: ongoingMatches, inline: false },
        { name: "⚙️ Estadísticas del Bot", value: `> **Uptime:** ${uptime}\n> **Memoria:** ${memoryUsage}\n> **Jugadores Registrados:** ${playerCount}`, inline: false }
      )
      .setTimestamp()
      .setFooter(EMBED_DEFAULTS.footer);
  };

  const refreshButton = new ButtonBuilder()
    .setCustomId(`panel_refresh_${message.author.id}`)
    .setLabel("🔄 Actualizar")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(refreshButton);
  return message.channel.send({ embeds: [buildPanelEmbed()], components: [row] }).then((sentMessage) => {
    const collector = sentMessage.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id && i.customId.startsWith('panel_refresh_'),
      time: 300000 // 5 minutos
    });

    collector.on('collect', async i => {
      await i.update({ embeds: [buildPanelEmbed()] });
      collector.stop();
    });

    collector.on('end', () => {
      sentMessage.edit({ components: [] }).catch(() => { });
    });
  });
}

function sendEmbed(message, args, { BOT_OWNER_ID, client, COLORS, EMBED_DEFAULTS, config }) {
  const EMOJIS = config?.emojis || {};
  if (!(Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID)) {
    return message.reply({ content: `${EMOJIS.ban || '🚫'} Este comando es exclusivo para el dueño del bot.` });
  }

  const [targetGuildId, targetChannelId, ...messageParts] = args;
  if (!targetGuildId || !targetChannelId || messageParts.length === 0) {
    const usageEmbed = new EmbedBuilder()
      .setTitle(`Uso Incorrecto del Comando \`!sendembed\``)
      .setDescription("Debes proporcionar el ID del servidor, el ID del canal y el contenido del embed.")
      .addFields({ name: "Formato", value: "`!sendembed <ID_Servidor> <ID_Canal> <Contenido del embed>`" })
      .setColor(COLORS.WARNING);
    return message.channel.send({ embeds: [usageEmbed] });
  }

  const embedContent = messageParts.join(' ');

  return client.guilds.fetch(targetGuildId).catch(() => null).then(async (targetGuild) => {
    if (!targetGuild) {
      return message.reply({ content: `${EMOJIS.error || '❌'} No se pudo encontrar el servidor con ID \`${targetGuildId}\` o el bot no está en él.` });
    }
    const targetChannel = await targetGuild.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased()) {
      return message.reply({ content: `${EMOJIS.error || '❌'} No se pudo encontrar el canal de texto con ID \`${targetChannelId}\` en el servidor de destino.` });
    }

    const remoteEmbed = new EmbedBuilder()
      .setDescription(embedContent)
      .setColor(EMBED_DEFAULTS.color)
      .setFooter(EMBED_DEFAULTS.footer);

    await targetChannel.send({ embeds: [remoteEmbed] });
    return message.reply({ content: `${EMOJIS.success || '✅'} Embed enviado correctamente al canal ${targetChannel} en el servidor **${targetGuild.name}**.` });
  }).catch((error) => {
    console.error("Error en !sendembed:", error);
    return message.reply({ content: `${EMOJIS.error || '❌'} Ocurrió un error al intentar enviar el embed. Revisa la consola.` });
  });
}

async function championsPanel(message, args, { client, config, COLORS, EMBED_DEFAULTS }) {
  const EMOJIS = config?.emojis || {};
  const guild = message.guild;
  const championRoles = (config && config.championRoles) || {};
  const entries = [
    ['TERROR DE RYL (Top 1)', championRoles.terrorTop1],
    ['IMPERADOR (Max MVP)', championRoles.imperradorMaxMvp],
    ['MELHOR 1X1 (Max Win 1x1)', championRoles.rei1x1MaxWins],
    ['JOGADOR VALORIZADO (Pocas Derrotas)', championRoles.jogadorValorizadoFewLosses],
    ['EASY MONEY (Apuestas Ganadas)', championRoles.iziMoneyMaxWagerWon],
    ['MAX WINNER (Mayor Racha)', championRoles.maxxWinnerMaxStreak],

  ];

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJIS.rank || '🏆'} Panel de Campeones`)
    .setColor(COLORS.PRIMARY)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  for (const [name, roleId] of entries) {
    if (!roleId) {
      embed.addFields({ name, value: 'Sin configurar', inline: false });
      continue;
    }
    const roleObj = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!roleObj) {
      embed.addFields({ name, value: `Rol no encontrado (ID: ${roleId})`, inline: false });
      continue;
    }
    const holders = roleObj.members;
    const values = holders.map(member => `<@${member.id}>`);
    const value = values.length > 0 ? values.join(', ') : 'Vacante';
    embed.addFields({ name, value, inline: true });
  }

  return message.channel.send({ embeds: [embed] });
}

// Elmodule.exports se movió al final del archivo

// Previsualizar el ranking diario con datos ficticios
async function previewDaily(message, args, { hasPermission, COLORS, EMBED_DEFAULTS, config, BOT_OWNER_ID }) {
  const EMOJIS = config?.emojis || {};
  const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
  if (!isOwner) return message.channel.send('🚫 Solo el dueño del bot puede usar este comando.');

  // Generar datos ficticios para la preview
  const dummyPlayers = Array.from({ length: 10 }, (_, i) => ({
    id: '000000000000000000',
    customName: `Jugador_Ejemplo_${i + 1}`,
    pointsGained: Math.floor(Math.random() * 500) + 50,
    wins: Math.floor(Math.random() * 20) + 1,
    played: Math.floor(Math.random() * 30) + 5
  }));

  const pointsList = dummyPlayers.sort((a, b) => b.pointsGained - a.pointsGained).map((p, i) => {
    return `> **${i + 1}.** ${p.customName} - **${p.pointsGained}** pts ganados`;
  }).join('\n');

  const winsList = [...dummyPlayers].sort((a, b) => b.wins - a.wins).map((p, i) => {
    return `> **${i + 1}.** ${p.customName} - **${p.wins}** victorias`;
  }).join('\n');

  const pointsEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.rank || '📈'} [Preview] Top 10 - Puntos Diarios ${EMOJIS.rank || '📈'}`)
    .setColor(COLORS.PRIMARY)
    .setDescription(`Vista previa del ranking de puntos.\n\n${pointsList}`)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  const winsEmbed = new EmbedBuilder()
    .setTitle(`${EMOJIS.winner || '🏆'} [Preview] Top 10 - Victorias Diarias ${EMOJIS.winner || '🏆'}`)
    .setColor(COLORS.GOLD || 0xFFD700)
    .setDescription(`Vista previa del ranking de victorias.\n\n${winsList}`)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  await message.channel.send({ content: "👀 **Vista Previa del Diseño Diario** (Datos ficticios)", embeds: [pointsEmbed, winsEmbed] }).catch(() => { });
}

// Ejecutar manualmente el envío diario (recompensas + embeds)
async function runDailyNow(message, args, { hasPermission, rankingUtils, settings, COLORS, EMBED_DEFAULTS, client, config, BOT_OWNER_ID }) {
  const EMOJIS = config?.emojis || {};
  const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
  if (!isOwner) {
    return message.channel.send('🚫 Solo el dueño del bot puede usar este comando.');
  }

  const guild = message.guild;
  const results = { rewards: false, summary: false, champions: false };

  // Recompensas diarias
  let fullRanking = [];
  try {
    try {
      fullRanking = await rankingUtils.getDailyRankingFromDB();
    } catch (_) { }

    if (rankingUtils && typeof rankingUtils.distributeDailyRewards === 'function') {
      await rankingUtils.distributeDailyRewards(guild);
      results.rewards = true;
    }
  } catch (e) {
    console.warn('[RunDailyNow] Error distribuyendo recompensas:', e?.message || e);
  }

  try {
    const summaryChannelId = settings?.dailySummaryChannelId;
    const summaryChannel = summaryChannelId ? (await guild.channels.fetch(summaryChannelId).catch(() => null)) : null;
    if (summaryChannel && summaryChannel.isTextBased()) {

      if (!fullRanking || fullRanking.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📈 Ranking Diario de Actividad')
          .setColor(COLORS?.PRIMARY || 0x5865F2)
          .setFooter(EMBED_DEFAULTS?.footer || { text: guild.name })
          .setTimestamp()
          .setDescription('Aún no hay suficiente actividad del día anterior.');
        await summaryChannel.send({ embeds: [embed] }).catch(() => { });
      } else {
        const topPoints = fullRanking.slice(0, 10);
        const topWins = [...fullRanking].sort((a, b) => b.wins - a.wins || b.pointsGained - a.pointsGained).slice(0, 10);

        const pointsList = topPoints.map((p, i) => {
          const displayName = p.customName || `<@${p.id}>`;
          return `> **${i + 1}.** ${displayName} - **${p.pointsGained}** pts ganados`;
        }).join('\n');

        const winsList = topWins.map((p, i) => {
          const displayName = p.customName || `<@${p.id}>`;
          return `> **${i + 1}.** ${displayName} - **${p.wins}** victorias`;
        }).join('\n');

        const pointsEmbed = new EmbedBuilder()
          .setTitle(`${EMOJIS.rank || '📈'} Top 10 - Puntos Diarios ${EMOJIS.rank || '📈'}`)
          .setColor(COLORS.PRIMARY)
          .setDescription(`Top jugadores con más puntos ganados del día anterior.\n\n${pointsList}`)
          .setFooter(EMBED_DEFAULTS.footer)
          .setTimestamp();

        const winsEmbed = new EmbedBuilder()
          .setTitle(`${EMOJIS.winner || '🏆'} Top 10 - Victorias Diarias ${EMOJIS.winner || '🏆'}`)
          .setColor(COLORS.GOLD || 0xFFD700)
          .setDescription(`Top jugadores con más victorias del día anterior.\n\n${winsList}`)
          .setFooter(EMBED_DEFAULTS.footer)
          .setTimestamp();

        await summaryChannel.send({ 
          content: "🏆 **Ranking Diario** 🏆\n¡Aquí están los mejores jugadores del día anterior!",
          embeds: [pointsEmbed, winsEmbed] 
        }).catch(e => console.error("Error enviando ranking diario:", e));
      }
      results.summary = true;
    }
  } catch (_) { }

  // Panel de Campeones — SOLO si está configurado el canal específico
  try {
    const championsChannelId = settings?.championsDailyChannelId;
    const championsChannel = championsChannelId ? (await guild.channels.fetch(championsChannelId).catch(() => null)) : null;
    if (!(championsChannel && championsChannel.isTextBased())) {
      throw new Error('Canal del Panel de Campeones no configurado o inválido');
    }

    const championRoles = (config && config.championRoles) || {};
    const entries = [
      ['TERROR DE RYL (Top 1)', championRoles.terrorTop1],
      ['IMPERADOR (Max MVP)', championRoles.imperradorMaxMvp],
      ['MELHOR 1X1 (Max Win 1x1)', championRoles.rei1x1MaxWins],
      ['JOGADOR VALORIZADO (Pocas Derrotas)', championRoles.jogadorValorizadoFewLosses],
      ['EASY MONEY (Apuestas Ganadas)', championRoles.iziMoneyMaxWagerWon],
      ['MAX WINNER (Mayor Racha)', championRoles.maxxWinnerMaxStreak],

    ];

    const champsEmbed = new EmbedBuilder()
      .setTitle('🏆 Panel de Campeones')
      .setColor(COLORS?.PRIMARY || 0x5865F2)
      .setFooter(EMBED_DEFAULTS?.footer || { text: guild.name })
      .setTimestamp();

    for (const [name, roleId] of entries) {
      if (!roleId) {
        champsEmbed.addFields({ name, value: 'Sin configurar', inline: false });
        continue;
      }
      const roleObj = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
      if (!roleObj) {
        champsEmbed.addFields({ name, value: `Rol no encontrado (ID: ${roleId})`, inline: false });
        continue;
      }
      const holders = roleObj.members;
      const values = holders.map(member => `<@${member.id}>`);
      const value = values.length > 0 ? values.join(', ') : 'Vacante';
      champsEmbed.addFields({ name, value, inline: true });
    }

    await championsChannel.send({ embeds: [champsEmbed] }).catch(() => { });
    results.champions = true;
  } catch (e) {
    console.warn('[RunDailyNow] Error enviando Panel de Campeones:', e?.message || e);
  }

  // Eliminado: no enviar ranking de Style Coins en el envío diario manual

  const ok = Object.values(results).some(Boolean);
  return message.channel.send(ok ? '✅ Envío diario ejecutado.' : '❌ No se pudo ejecutar el envío diario. Revisa la consola.');
}

module.exports = {
  panel,
  sendEmbed,
  championsPanel,
  previewDaily,
  runDailyNow,
  postReglamentoCommand
};
