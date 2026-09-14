const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

async function helpCommand(message, args, deps) {
  const { hasPermission, client, COLORS, EMBED_DEFAULTS, config } = deps;
  const EMOJIS = config?.emojis || {};
  const isAdmin = hasPermission(message.member);

  const categories = [
    {
      id: 'home',
      label: `${EMOJIS.home || '🏠'} Inicio`,
      description: 'Página principal del menú de ayuda.',
      embed: new EmbedBuilder()
        .setTitle(`${EMOJIS.rank || '🏆'} Menú de Ayuda — ROYAL RANKED`)
        .setDescription(
          '**¡Bienvenido al centro de comandos!**\n\n' +
          'Usa el menú desplegable de abajo para navegar por las diferentes categorías y descubrir todo lo que puedes hacer.\n\n' +
          '¡Prepárate para competir, escalar en el ranking y demostrar tu estilo!'
        )
    },
    {
      id: 'general',
      label: `${EMOJIS.controller || '🎮'} Comandos Generales`,
      description: 'Comandos para todos los jugadores.',
      embed: new EmbedBuilder()
        .setTitle(`${EMOJIS.controller || '🎮'} Comandos Generales`)
        .setDescription('Comandos disponibles para todos los miembros del servidor.')
        .addFields(
          { name: '**Perfil y Estadísticas**', value: '\u200b' },
          { name: '`!p` / `!profile` `[@usuario]`', value: `${EMOJIS.profile || '📊'} **Muestra tu tarjeta de jugador** con estadísticas completas: puntos, victorias, derrotas, MVP, racha actual, y más. Si mencionas a otro usuario, verás sus estadísticas.\n\n**Uso:** \`!p\` o \`!p @usuario\``, inline: false },
          { name: '`!rank`', value: `${EMOJIS.rank || '🏆'} **Muestra los rankings del servidor** ordenados por diferentes criterios: puntos totales, victorias, derrotas, MVP, y más. Incluye Top 10 con imágenes generadas automáticamente.\n\n**Uso:** \`!rank\``, inline: false },
          { name: '`!historial [@usuario]`', value: `${EMOJIS.scroll || '📜'} **Muestra el historial de partidas** de un jugador con detalles de cada partida: resultado, puntos ganados/perdidos, MVP, fecha, y oponentes.\n\n**Uso:** \`!historial\` o \`!historial @usuario\``, inline: false },
          { name: '`!grafica` / `!statsGraph` `[@usuario]`', value: `${EMOJIS.chart || '📈'} **Genera una gráfica visual** de tu evolución de puntos en las últimas partidas. Perfecto para analizar tu progreso y tendencias.\n\n**Uso:** \`!grafica\` o \`!grafica @usuario\``, inline: false },
          
          { name: '**Sistema de Filas**', value: '\u200b' },
          { name: '`!fila <modo>`', value: `${EMOJIS.battle || '⚔️'} **Crea una sala de espera** para organizar partidas competitivas. Modos disponibles: \`1v1\`, \`2v2\`, \`3v3\`, \`4v4\`, \`5v5\`. El sistema gestiona automáticamente los equipos y apuestas.\n\n**Uso:** \`!fila 2v2\``, inline: false },
          { name: '`!partidas`', value: `${EMOJIS.red_circle || '🔴'} **Muestra las partidas activas** que se están jugando actualmente en el servidor con información de equipos y estado.\n\n**Uso:** \`!partidas\``, inline: false },
          
          { name: '**Economía y Tienda**', value: '\u200b' },
          { name: '`!tienda` / `!shop`', value: `${EMOJIS.shop || '🛒'} **Abre la tienda interactiva** donde puedes comprar roles, colores, giros de ruleta, y más usando tus Royal Coins.\n\n**Uso:** \`!tienda\` o \`!shop\``, inline: false },
          { name: '`!saldo` / `!coins` `[@usuario]`', value: `${EMOJIS.money || '💰'} **Muestra tu saldo de Royal Coins** con historial de transacciones recientes. Puedes ver el saldo de otros usuarios mencionándolos.\n\n**Uso:** \`!saldo\` o \`!saldo @usuario\``, inline: false },
          { name: '`!giros` / `!spins`', value: `${EMOJIS.spin || '🎰'} **Muestra tus giros disponibles** para la ruleta. Los giros se obtienen mediante recompensas diarias, eventos, o compras en la tienda.\n\n**Uso:** \`!giros\` o \`!spins\``, inline: false },
          { name: '`!ruleta`', value: `${EMOJIS.spin || '🎰'} **Gira la ruleta de premios** para ganar Royal Coins, giros extra, roles especiales, y más. Requiere tener giros disponibles.\n\n**Uso:** \`!ruleta\``, inline: false },
          
          { name: '**Rankings Diarios**', value: '\u200b' },
          { name: '`!daily`', value: `${EMOJIS.chart || '📈'} **Muestra el ranking de actividad** del día anterior. Incluye Top 10 de puntos ganados y victorias con imágenes generadas.\n\n**Uso:** \`!daily\``, inline: false },
          { name: '`!dailycoins`', value: `${EMOJIS.money || '🪙'} **Muestra el ranking de jugadores** con más Royal Coins en el servidor. Actualizado en tiempo real.\n\n**Uso:** \`!dailycoins\``, inline: false },
          
          { name: '**Personalización**', value: '\u200b' },
          { name: '`!nombre <nuevo_nombre>`', value: `${EMOJIS.tag || '🏷️'} **Establece tu nombre personalizado** que se mostrará junto a tu rango en el perfil y rankings. Máximo 20 caracteres.\n\n**Uso:** \`!nombre MiNombrePro\``, inline: false },
          
          { name: '**Información Externa**', value: '\u200b' },
          { name: '`!info <UID>`', value: `${EMOJIS.search || '🔎'} **Consulta información de Free Fire** usando la Pixy API. Muestra datos básicos de la cuenta como nivel, likes, y estado.\n\n**Uso:** \`!info 123456789\``, inline: false },
          { name: '`!checkban <UID>`', value: `${EMOJIS.no_entry || '⛔'} **Verifica si una cuenta está baneada** en Free Fire y muestra el periodo restante del ban usando la Pixy API.\n\n**Uso:** \`!checkban 123456789\``, inline: false },
          
          { name: '**Voz y Actividad**', value: '\u200b' },
          { name: '`!horas` `[@usuario]`', value: `${EMOJIS.clock || '⏱️'} **Muestra tu tiempo de actividad** en canales de voz del servidor. Incluye recompensas por tiempo acumulado (roles especiales).\n\n**Uso:** \`!horas\` o \`!horas @usuario\``, inline: false }
        )
    },
    {
      id: 'vip',
      label: `${EMOJIS.vip || '💎'} Comandos VIP`,
      description: 'Comandos exclusivos para miembros VIP.',
      embed: new EmbedBuilder()
        .setTitle(`${EMOJIS.vip || '💎'} Comandos VIP`)
        .setDescription('Comandos exclusivos para miembros VIP y roles especiales.')
        .addFields(
          { name: '`!prime`', value: `${EMOJIS.diamond || '💎'} **Muestra información VIP** incluyendo beneficios, duración, y recompensas exclusivas.\n\n**Uso:** \`!prime\``, inline: false },
          { name: '`!exclusivo`', value: `${EMOJIS.star || '🌟'} **Accede a contenido exclusivo** para miembros VIP (roles especiales, canales privados, etc.).\n\n**Uso:** \`!exclusivo\``, inline: false },
          { name: '`!reclamartienda`', value: `${EMOJIS.gift || '🎁'} **Reclama premios especiales** de la tienda VIP.\n\n**Uso:** \`!reclamartienda\``, inline: false }
        )
    },
    {
      id: 'bot_info',
      label: `${EMOJIS.info || 'ℹ️'} Información del Bot`,
      description: 'Detalles sobre el bot.',
      embed: new EmbedBuilder()
        .setTitle(`${EMOJIS.info || 'ℹ️'} Información del Bot`)
        .setDescription('Detalles y estadísticas sobre el bot.')
        .addFields() // Se llenará dinámicamente
        .setFooter(EMBED_DEFAULTS.footer)
    },
    {
      id: 'admin',
      label: `${EMOJIS.shield || '🛡️'} Comandos de Administración`,
      description: 'Comandos exclusivos para el staff.',
      adminOnly: true,
      embed: new EmbedBuilder()
        .setTitle(`${EMOJIS.shield || '🛡️'} Comandos de Administración (Página 1)`)
        .setDescription('Herramientas exclusivas para la gestión del servidor y los jugadores.')
        .addFields(
          { name: '**Gestión de Estadísticas**', value: '\u200b' },
          { name: '`!addpuntos` / `!removepuntos`', value: `${EMOJIS.chart || '📈'} Añade/remueve puntos. Afecta ranking.\n\n**Uso:** \`!addpuntos @usuario 500\``, inline: false },
          { name: '`!addwin` / `!removewin`', value: `${EMOJIS.winner || '🏆'} Añade/remueve victorias. Afecta ratio.\n\n**Uso:** \`!addwin @usuario 3\``, inline: false },
          { name: '`!addderrotas` / `!removederrotas`', value: `${EMOJIS.cross_mark || '✖️'} Añade/remueve derrotas.\n\n**Uso:** \`!addderrotas @usuario 2\``, inline: false },
          { name: '`!addmvp` / `!removemvp`', value: `${EMOJIS.mvp || '⭐'} Añade/remueve MVPs.\n\n**Uso:** \`!addmvp @usuario 5\``, inline: false },
          { name: '`!addcreacion` / `!removecreacion`', value: `${EMOJIS.bolt || '⚡'} Añade/remueve creaciones de filas.\n\n**Uso:** \`!addcreacion @usuario 10\``, inline: false },
          { name: '`!addracha` / `!removeracha`', value: `${EMOJIS.fire || '🔥'} Añade/remueve racha de victorias.\n\n**Uso:** \`!addracha @usuario 5\``, inline: false },
          { name: '`!addx2`', value: `${EMOJIS.diamond || '💎'} Otorga puntos x2 indefinido.\n\n**Uso:** \`!addx2 @usuario\``, inline: false },
          { name: '`!addx2time`', value: `${EMOJIS.clock || '⏰'} Otorga puntos x2 temporal.\n\n**Uso:** \`!addx2time @usuario 2h\``, inline: false },
          { name: '`!addproteccion`', value: `${EMOJIS.shield_check || '🛡️'} Otorga protección de puntos.\n\n**Uso:** \`!addproteccion @usuario\``, inline: false },
          { name: '`!addcartera`', value: `${EMOJIS.money || '💰'} Añade saldo a cartera.\n\n**Uso:** \`!addcartera @usuario 1000\``, inline: false },
          { name: '**Economía**', value: '\u200b' },
          { name: '`!addcoins` / `!removecoins`', value: `${EMOJIS.money || '🪙'} Añade/remueve Royal Coins.\n\n**Uso:** \`!addcoins @usuario 500\``, inline: false },
          { name: '`!addspins` / `!removespins`', value: `${EMOJIS.spin || '🎰'} Añade/remueve giros de ruleta.\n\n**Uso:** \`!addspins @usuario 10\``, inline: false },
          { name: '`!setspins`', value: `${EMOJIS.spin || '🎰'} Establece giros exactos.\n\n**Uso:** \`!setspins @usuario 5\``, inline: false },
          { name: '`!evento`', value: `${EMOJIS.celebration || '🎉'} Gestiona eventos especiales.\n\n**Uso:** \`!evento\``, inline: false },
          { name: '**Gestión de Temporadas**', value: '\u200b' },
          { name: '`!startseason`', value: `${EMOJIS.flag_finish || '🏁'} Inicia nueva temporada.\n\n**Uso:** \`!startseason\``, inline: false },
          { name: '`!endseason`', value: `${EMOJIS.medal || '🎖️'} Finaliza temporada actual.\n\n**Uso:** \`!endseason\``, inline: false },
          { name: '`!seasonstatus`', value: `${EMOJIS.info || 'ℹ️'} Muestra estado de temporada.\n\n**Uso:** \`!seasonstatus\``, inline: false },
          { name: '`!setseasonsummarychannel`', value: `${EMOJIS.megaphone || '📢'} Canal de resúmenes de temporada.\n\n**Uso:** \`!setseasonsummarychannel #anuncios\``, inline: false },
          { name: '**Moderación**', value: '\u200b' },
          { name: '`!addadvertencia` / `!removeadvertencia`', value: `${EMOJIS.alert || '🚨'} Añade/remueve advertencias.\n\n**Uso:** \`!addadvertencia @usuario Toxicidad\``, inline: false },
          { name: '`!blacklist` / `!unblacklist`', value: `${EMOJIS.ban || '🚫'} Añade/remueve de blacklist.\n\n**Uso:** \`!blacklist @usuario\``, inline: false },
          { name: '`!blacklistinfo`', value: `${EMOJIS.info || 'ℹ️'} Muestra info de blacklist.\n\n**Uso:** \`!blacklistinfo @usuario\``, inline: false }
        )
    },
    {
      id: 'admin2',
      label: `${EMOJIS.shield || '🛡️'} Admin (Página 2)`,
      description: 'Más comandos de administración.',
      adminOnly: true,
      embed: new EmbedBuilder()
        .setTitle(`${EMOJIS.shield || '🛡️'} Comandos de Administración (Página 2)`)
        .setDescription('Más herramientas exclusivas para la gestión del servidor.')
        .addFields(
          { name: '**Moderación (Continuación)**', value: '\u200b' },
          { name: '`!mantenimiento`', value: `${EMOJIS.maintenance || '🛠️'} Activa/desactiva mantenimiento.\n\n**Uso:** \`!mantenimiento on\``, inline: false },
          { name: '`!as` / `!rs` / `!es`', value: `${EMOJIS.loading || '⚙️'} Comandos rápidos de admin.\n\n**Uso:** \`!as\`, \`!rs\`, \`!es\``, inline: false },
          { name: '`!limpiarfilas`', value: `${EMOJIS.trash || '🗑️'} Elimina todas las filas.\n\n**Uso:** \`!limpiarfilas\``, inline: false },
          { name: '`!fixmatches`', value: `${EMOJIS.maintenance || '🛠️'} Repara partidas corruptas.\n\n**Uso:** \`!fixmatches\``, inline: false },
          { name: '`!blacklistall`', value: `${EMOJIS.list || '📋'} Muestra todos en blacklist.\n\n**Uso:** \`!blacklistall\``, inline: false },
          { name: '**Gestión de Jugadores**', value: '\u200b' },
          { name: '`!resetstats`', value: `${EMOJIS.reset || '♻️'} Resetea estadísticas de jugador.\n\n**Uso:** \`!resetstats @usuario\``, inline: false },
          { name: '`!resetallstats`', value: `${EMOJIS.reset || '♻️'} Resetea TODAS las estadísticas.\n\n**Uso:** \`!resetallstats\``, inline: false },
          { name: '`!exemptnick` / `!unexemptnick`', value: `${EMOJIS.unlock || '🔓'} Exime de forzar nickname.\n\n**Uso:** \`!exemptnick @usuario\``, inline: false },
          { name: '`!exemptlist`', value: `${EMOJIS.list || '📋'} Muestra usuarios exentos.\n\n**Uso:** \`!exemptlist\``, inline: false },
          { name: '`!exemptmove` / `!unexemptmove`', value: `${EMOJIS.unlock || '🔓'} Exime de mover canales.\n\n**Uso:** \`!exemptmove @usuario\``, inline: false },
          { name: '`!syncnicks`', value: `${EMOJIS.sync || '🔄'} Sincroniza nicknames con DB.\n\n**Uso:** \`!syncnicks\``, inline: false },
          { name: '**Canales de Voz Temporales**', value: '\u200b' },
          { name: '`!voz tiempo`', value: `${EMOJIS.voice_required || '🎙️'} Crea canal de voz temporal.\n\n**Uso:** \`!voz tiempo @usuario 1h Sala\``, inline: false },
          { name: '`!voztiempo`', value: `${EMOJIS.clock || '⏰'} Muestra canales temporales activos.\n\n**Uso:** \`!voztiempo\``, inline: false },
          { name: '**Gestión de Roles**', value: '\u200b' },
          { name: '`!addrol`', value: `${EMOJIS.theater || '🎭'} Añade rol a usuario.\n\n**Uso:** \`!addrol @usuario @Rol\``, inline: false },
          { name: '`!addrolall`', value: `${EMOJIS.theater || '🎭'} Añade rol a todos.\n\n**Uso:** \`!addrolall @Rol\``, inline: false },
          { name: '**Configuración (Logs)**', value: '\u200b' },
          { name: '`!setlogchannel`', value: `${EMOJIS.text || '📝'} Canal principal de logs.\n\n**Uso:** \`!setlogchannel #logs\``, inline: false },
          { name: '`!setlogpoints`', value: `${EMOJIS.chart || '📈'} Canal de logs de puntos.\n\n**Uso:** \`!setlogpoints #logs-puntos\``, inline: false },
          { name: '`!setlogcoins`', value: `${EMOJIS.money || '🪙'} Canal de logs de coins.\n\n**Uso:** \`!setlogcoins #logs-coins\``, inline: false },
          { name: '`!setlogwarnings`', value: `${EMOJIS.alert || '🚨'} Canal de logs de advertencias.\n\n**Uso:** \`!setlogwarnings #logs-warnings\``, inline: false },
          { name: '`!setlogmatches`', value: `${EMOJIS.battle || '⚔️'} Canal de logs de partidas.\n\n**Uso:** \`!setlogmatches #logs-matches\``, inline: false }
        )
    },
    {
      id: 'admin3',
      label: `${EMOJIS.shield || '🛡️'} Admin (Página 3)`,
      description: 'Más comandos de administración.',
      adminOnly: true,
      embed: new EmbedBuilder()
        .setTitle(`${EMOJIS.shield || '🛡️'} Comandos de Administración (Página 3)`)
        .setDescription('Configuración y supervisión del servidor.')
        .addFields(
          { name: '**Configuración (Logs - Continuación)**', value: '\u200b' },
          { name: '`!setlogqueues`', value: `${EMOJIS.battle || '⚔️'} Canal de logs de filas.\n\n**Uso:** \`!setlogqueues #logs-queues\``, inline: false },
          { name: '`!setlogautorole`', value: `${EMOJIS.theater || '🎭'} Canal de logs de auto-roles.\n\n**Uso:** \`!setlogautorole #logs-autorole\``, inline: false },
          { name: '`!setlogerrors`', value: `${EMOJIS.error || '❌'} Canal de logs de errores.\n\n**Uso:** \`!setlogerrors #logs-errors\``, inline: false },
          { name: '`!setlogstats`', value: `${EMOJIS.chart || '📈'} Canal de logs de estadísticas.\n\n**Uso:** \`!setlogstats #logs-stats\``, inline: false },
          { name: '`!setlogshop`', value: `${EMOJIS.shop || '🛒'} Canal de logs de tienda.\n\n**Uso:** \`!setlogshop #logs-shop\``, inline: false },
          { name: '`!setlogroulette`', value: `${EMOJIS.spin || '🎰'} Canal de logs de ruleta.\n\n**Uso:** \`!setlogroulette #logs-roulette\``, inline: false },
          { name: '**Configuración (Otros)**', value: '\u200b' },
          { name: '`!setannouncements`', value: `${EMOJIS.megaphone || '📢'} Canal de anuncios.\n\n**Uso:** \`!setannouncements #anuncios\``, inline: false },
          { name: '`!sethistorychannel`', value: `${EMOJIS.scroll || '📜'} Canal de historial.\n\n**Uso:** \`!sethistorychannel #historial\``, inline: false },
          { name: '`!setdailycoinschannel`', value: `${EMOJIS.money || '🪙'} Canal ranking diario coins.\n\n**Uso:** \`!setdailycoinschannel #daily-coins\``, inline: false },
          { name: '`!setchampionsdailychannel`', value: `${EMOJIS.crown || '👑'} Canal ranking diario campeones.\n\n**Uso:** \`!setchampionsdailychannel #daily-champs\``, inline: false },
          { name: '`!setdailyrewardchannel`', value: `${EMOJIS.gift || '🎁'} Canal de recompensas diarias.\n\n**Uso:** \`!setdailyrewardchannel #daily-rewards\``, inline: false },
          { name: '**Supervisión**', value: '\u200b' },
          { name: '`!panel`', value: `${EMOJIS.loading || '⚙️'} Panel de control del bot.\n\n**Uso:** \`!panel\``, inline: false },
          { name: '`!sendembed`', value: `${EMOJIS.megaphone || '📢'} Envía embed personalizado.\n\n**Uso:** \`!sendembed\``, inline: false },
          { name: '`!diagnoselogs`', value: `${EMOJIS.search || '🔎'} Diagnostica problemas del sistema.\n\n**Uso:** \`!diagnoselogs\``, inline: false },
          { name: '`!tiktok`', value: `${EMOJIS.phone || '📱'} Gestiona TikTok Live.\n\n**Uso:** \`!tiktok\``, inline: false }
        )
    }
  ];

  const buildHelpMessage = (category_id) => {
    const category = categories.find(c => c.id === category_id);
    if (!category) return null;

    if (category_id === 'bot_info') {
      category.embed.setFields([
        { name: `${EMOJIS.clock || '⏰'} Uptime`, value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true },
        { name: `${EMOJIS.profile || '📊'} Servidores`, value: `**${client.guilds.cache.size}**`, inline: true },
        { name: `${EMOJIS.person || '👥'} Usuarios Totales`, value: `**${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)}**`, inline: true },
        { name: `${EMOJIS.loading || '⚙️'} Versión Discord.js`, value: require('discord.js').version, inline: true }
      ]);
    }

    const visibleCategories = categories.filter(c => !c.adminOnly || isAdmin);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`help_menu_${message.author.id}`)
      .setPlaceholder('Selecciona una categoría...')
      .addOptions(visibleCategories.map(c => ({
        label: c.label,
        description: c.description,
        value: c.id,
        default: c.id === category_id
      })));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const finalEmbed = category.embed
      .setColor(COLORS.GOLD)
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .setImage(EMBED_DEFAULTS.image)
      .setFooter({ text: `${EMOJIS.bolt || '⚡'} ROYAL RANKED | ¡Sube de nivel, domina y deja tu marca!`, iconURL: EMBED_DEFAULTS.footer.iconURL })
      .setTimestamp();

    return { embeds: [finalEmbed], components: [row] };
  };

  const initialMessage = buildHelpMessage('home');
  const sentMessage = await message.channel.send(initialMessage);

  const collector = sentMessage.createMessageComponentCollector({
    filter: i => i.customId === `help_menu_${message.author.id}` && i.user.id === message.author.id,
    time: 120000
  });

  collector.on('collect', async i => {
    if (!i.isStringSelectMenu()) return;
    await i.deferUpdate().catch(() => {});
    const newCategory = i.values[0];
    const newMessage = buildHelpMessage(newCategory);
    if (newMessage) await sentMessage.edit(newMessage).catch(() => {});
  });

  collector.on('end', () => {
    if (sentMessage && !sentMessage.deleted) {
      const disabledRow = ActionRowBuilder.from(sentMessage.components[0]);
      disabledRow.components[0].setDisabled(true);
      sentMessage.edit({ components: [disabledRow] }).catch(() => {});
    }
  });
}

async function helpOldCommand(message, args, deps) {
  const { COLORS, EMBED_DEFAULTS, hasPermission, config } = deps;
  const EMOJIS = config?.emojis || {};
  const isAdmin = hasPermission(message.member);

  const helpEmbed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setAuthor({ name: `${EMOJIS.bolt || '⚡'} ROYAL RANKED`, iconURL: message.guild.iconURL({ dynamic: true }) })
    .setTitle(`${EMOJIS.rank || '🏆'} COMANDOS OFICIALES — ROYAL RANKED`)
    .setDescription(`**${EMOJIS.boom || '💥'} ¡Bienvenido a ROYAL RANKED!**\nUsa los comandos sabiamente y convierte tu perfil en leyenda.`)
    .setThumbnail(message.guild.iconURL({ dynamic: true }))
    .addFields(
      { name: `${EMOJIS.target || '🎯'} Perfil y Estadísticas`, value: '`!p [@usuario]`\n`!rank`', inline: false },
      { name: `${EMOJIS.controller || '🎮'} Filas Competitivas`, value: '`!fila <modo>` (ej: 2v2, 3v3)', inline: false }
    )
    .setImage(EMBED_DEFAULTS.thumbnail)
    .setFooter({ text: `${EMOJIS.bolt || '⚡'} ROYAL RANKED | ¡Sube de nivel, domina y deja tu marca!`, iconURL: EMBED_DEFAULTS.footer.iconURL })
    .setTimestamp();

  if (isAdmin) {
    helpEmbed.addFields(
      { name: `${EMOJIS.shield || '🛡️'} Comandos de Administración`, value: 'Usa `!help-admin` para ver los comandos de staff.', inline: false }
    );
  }

  await message.channel.send({ embeds: [helpEmbed] });
}

module.exports = { helpCommand, helpOldCommand };
