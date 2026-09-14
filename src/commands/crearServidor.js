const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');

// ─── Utilidades ──────────────────────────────────────────────────────────────

function randCode(n = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function progressBar(pct, size = 18) {
  const filled = Math.round((pct / 100) * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

// ─── Permisos ─────────────────────────────────────────────────────────────────

const F = PermissionsBitField.Flags;
const BASE_PUBLIC  = [F.ViewChannel, F.ReadMessageHistory, F.SendMessages, F.AddReactions, F.Connect];
const STAFF_EXTRA  = [F.ManageRoles, F.ManageMessages, F.EmbedLinks, F.AttachFiles];
const STAFF_FULL   = [...BASE_PUBLIC, ...STAFF_EXTRA];

// Únicos roles con permiso de borrar/gestionar canales
const CHANNEL_MANAGE_ROLES = ['1489717134878707713', '1517717411967668325'];

function capitalizeVoiceName(name) {
  return name.replace(/(・|^)(.)/u, (_, sep, ch) => sep + ch.toUpperCase());
}

function buildPerms(guild, visibility, { everyoneId, staffRoles, vipRoleIds, modVoiceRoles }, opts = {}, ch = null) {
  const overwrites = [];

  everyoneId = String(everyoneId);

  // Verificar existencia de roles de restricción
  const restrictRoleExists = ch?._restrictToRole
    ? guild.roles.cache.has(ch._restrictToRole)
    : false;

  const restrictRolesExist = ch?._restrictToRoles && Array.isArray(ch._restrictToRoles)
    ? ch._restrictToRoles.some(rid => guild.roles.cache.has(rid))
    : false;

  const hasWriteRestriction = ch && (
    (ch._restrictToRole && restrictRoleExists) ||
    (ch._restrictToRoles && restrictRolesExist) ||
    ch._denyMessages
  );

  let everyoneDeny = [F.EmbedLinks, F.AttachFiles];
  if (hasWriteRestriction) everyoneDeny.push(F.SendMessages);

  switch (visibility) {
    case 'public': {
      const allow = hasWriteRestriction
        ? [F.ViewChannel, F.ReadMessageHistory, F.AddReactions, F.Connect]
        : [F.ViewChannel, F.ReadMessageHistory, F.SendMessages, F.AddReactions, F.Connect];
      overwrites.push({ id: everyoneId, allow, deny: everyoneDeny });
      break;
    }
    case 'public-no-connect': {
      const allow = hasWriteRestriction
        ? [F.ViewChannel, F.ReadMessageHistory, F.AddReactions]
        : [F.ViewChannel, F.ReadMessageHistory, F.SendMessages, F.AddReactions];
      overwrites.push({ id: everyoneId, allow, deny: [...everyoneDeny, F.Connect] });
      break;
    }
    case 'vip':
      overwrites.push({ id: everyoneId, allow: [F.ViewChannel, F.ReadMessageHistory], deny: [...everyoneDeny, F.SendMessages, F.Connect] });
      if (vipRoleIds?.length) {
        for (const vid of vipRoleIds) overwrites.push({ id: vid, allow: BASE_PUBLIC });
      }
      break;
    case 'private':
      overwrites.push({ id: everyoneId, deny: [...everyoneDeny, F.ViewChannel] });
      break;
    case 'vip-private':
      overwrites.push({ id: everyoneId, deny: [...everyoneDeny, F.ViewChannel] });
      if (vipRoleIds?.length) {
        for (const vid of vipRoleIds) overwrites.push({ id: vid, allow: BASE_PUBLIC });
      }
      break;
    default:
      overwrites.push({ id: everyoneId, allow: [F.ViewChannel, F.ReadMessageHistory], deny: everyoneDeny });
  }

  // Restricción de escritura por rol único
  if (ch?._restrictToRole && restrictRoleExists) {
    overwrites.push({ id: ch._restrictToRole, allow: [F.SendMessages, F.EmbedLinks, F.AttachFiles] });
  }

  // Restricción de escritura por múltiples roles
  if (ch?._restrictToRoles && Array.isArray(ch._restrictToRoles)) {
    for (const roleId of ch._restrictToRoles) {
      if (guild.roles.cache.has(roleId)) {
        overwrites.push({ id: roleId, allow: [F.SendMessages, F.EmbedLinks, F.AttachFiles] });
      }
    }
  }

  // Restringir moderadores de voz si lo requiere la categoría
  if (opts._denyVoiceMods && modVoiceRoles?.length > 0) {
    const NO_MOD_VOICE = [F.MuteMembers, F.DeafenMembers, F.MoveMembers];
    for (const rid of modVoiceRoles) {
      if (!staffRoles.includes(rid)) {
        const existing = overwrites.find(o => o.id === rid);
        if (existing) {
          existing.deny = [...(existing.deny || []), ...NO_MOD_VOICE];
        } else {
          overwrites.push({ id: rid, deny: NO_MOD_VOICE });
        }
      }
    }
  }

  // Staff: todos los permisos EXCEPTO ManageChannels
  for (const sid of staffRoles) {
    if (hasWriteRestriction && ch._restrictToRole !== sid && !(ch._restrictToRoles?.includes(sid))) {
      overwrites.push({ id: sid, allow: STAFF_FULL, deny: [F.ManageChannels, F.SendMessages] });
    } else {
      overwrites.push({ id: sid, allow: STAFF_FULL, deny: [F.ManageChannels] });
    }
  }

  // Solo los dos roles autorizados pueden gestionar/borrar canales
  for (const rid of CHANNEL_MANAGE_ROLES) {
    const existing = overwrites.find(o => o.id === rid);
    if (existing) {
      existing.allow = [...(existing.allow || []), F.ManageChannels];
      existing.deny  = (existing.deny || []).filter(p => p !== F.ManageChannels);
    } else {
      if (hasWriteRestriction && ch?._restrictToRole !== rid && !(ch?._restrictToRoles?.includes(rid))) {
        overwrites.push({ id: rid, allow: [...STAFF_FULL, F.ManageChannels], deny: [F.SendMessages] });
      } else {
        overwrites.push({ id: rid, allow: [...STAFF_FULL, F.ManageChannels] });
      }
    }
  }

  // Filtrar IDs que no existen en el servidor
  const filtered = overwrites.filter(o => o.id === everyoneId || guild.roles.cache.has(o.id));
  return filtered.map(o => ({ ...o, id: String(o.id) }));
}

// ─── Layout del servidor ──────────────────────────────────────────────────────

const SUPERSCRIPTS = ['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'];
function toSuperscript(n) {
  return String(n).split('').map(d => SUPERSCRIPTS[parseInt(d)] || d).join('');
}

function buildMatchRooms(from, to) {
  const channels = [];
  for (let i = from; i <= to; i++) {
    const num = String(i).padStart(2, '0');
    channels.push({ name: `#${num} - Time 1`, type: ChannelType.GuildVoice });
    channels.push({ name: `#${num} - Time 2`, type: ChannelType.GuildVoice });
  }
  return channels;
}

function buildWaitingRooms(from, to) {
  const channels = [];
  for (let i = from; i <= to; i++) {
    channels.push({ name: `🩸・Esperando${toSuperscript(i)}`, type: ChannelType.GuildVoice });
  }
  return channels;
}

const LAYOUT = [
  // ── GENERAL ─────────────────────────────────────────────────────────────
  {
    category: '✦・GENERAL',
    visibility: 'public',
    channels: [
      { name: '🌐・general',         type: ChannelType.GuildText },
      { name: '📝・inscripciones',   type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '📡・actualizaciones', type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── RECEPCIÓN ───────────────────────────────────────────────────────────
  {
    category: '✦・RECEPCION',
    visibility: 'public',
    channels: [
      { name: '🎯・como-jugar',    type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '📣・avisos',        type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🙋・hazte-miembro', type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '📌・reglas',        type: ChannelType.GuildText, setting: 'logChannelTerminosId', _restrictToRole: '1489717134878707713' },
      { name: '⚡・royal-booster', type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── ROYAL RANKED ─────────────────────────────────────────────────────────
  {
    category: '✦・ROYAL RANKED',
    visibility: 'public',
    channels: [
      { name: '🥊・premiacion',      type: ChannelType.GuildText, setting: 'rankingChannelId', _restrictToRole: '1489717134878707713' },
      { name: '📈・ranking',         type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '📞・rank-call',       type: ChannelType.GuildText, setting: 'rankCallChannelId', _restrictToRole: '1489717134878707713' },
      { name: '🎖️・podio',           type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🏛️・hall-de-la-fama', type: ChannelType.GuildText, setting: 'historyChannel', _restrictToRole: '1489717134878707713' },
      { name: '🌟・mejores-del-dia', type: ChannelType.GuildText, setting: 'championsDailyChannel', _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── TIENDA ────────────────────────────────────────────────────────────────
  {
    category: '✦・TIENDA',
    visibility: 'public',
    channels: [
      { name: '🔮・vips',        type: ChannelType.GuildText, setting: 'logChannelVipsId', _restrictToRole: '1489717134878707713' },
      { name: '📦・paquetes',    type: ChannelType.GuildText, setting: 'logChannelShopId', _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── ATRACTIVOS ─────────────────────────────────────────────────────────────
  {
    category: '✦・ATRACTIVOS',
    visibility: 'public',
    channels: [
      { name: '🎡・ruleta',            type: ChannelType.GuildText, setting: 'logChannelRouletteId', _restrictToRole: '1489717134878707713' },
      { name: '💰・tienda-royalcoins', type: ChannelType.GuildText, setting: 'coinsChannelId', _restrictToRole: '1489717134878707713' },
      { name: '🎁・cajas-premiadas',   type: ChannelType.GuildText, setting: 'dailyRewardChannelId', _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── CARGOS ────────────────────────────────────────────────────────────────
  {
    category: '✦・CARGOS',
    visibility: 'public',
    channels: [
      { name: '🎙️・req-influencer',   type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🗂️・req-cargos',       type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🌈・cargos-comunidad', type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── INTERACCIÓN ───────────────────────────────────────────────────────────
  {
    category: '✦・INTERACCION',
    visibility: 'public',
    channels: [
      { name: '🎊・sorteos',            type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '⌨️・comandos-generales', type: ChannelType.GuildText, setting: 'allowedCommandChannelId' },
      { name: '🗡️・mural-de-partidas',  type: ChannelType.GuildText, _restrictToRoles: ['1489717134878707713', '1517717411967668325', '1489717079098654720', '1490748724685705347', '1490537392707207269', '1489755784484229222', '1489729736925249717'] },
      { name: '😵・mural-de-verguenza', type: ChannelType.GuildText, _restrictToRoles: ['1489717134878707713', '1517717411967668325', '1489717079098654720', '1490748724685705347', '1490537392707207269', '1489755784484229222', '1489729736925249717'] },
    ],
  },
  // ── SOPORTE TICKET ────────────────────────────────────────────────────────
  {
    category: '✦・SOPORTE TICKET',
    visibility: 'public',
    channels: [
      { name: '🎟️・ticket',           type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🔀・migracion-reclut', type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── RESÚMENES ──────────────────────────────────────────────────────────────
  {
    category: '✦・RESUMENES',
    visibility: 'public',
    channels: [
      { name: '🗓️・resumen-diario',    type: ChannelType.GuildText, setting: 'dailySummaryChannel', _restrictToRole: '1489717134878707713' },
      { name: '💰・coins-diario',      type: ChannelType.GuildText, setting: 'dailyCoinsChannel', _restrictToRole: '1489717134878707713' },
      { name: '🎁・recompensa-diaria', type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── INFLUENCERS ──────────────────────────────────────────────────────────────
  {
    category: '✦・INFLUENCERS',
    visibility: 'vip-private',
    channels: [
      { name: '💫・chat-influencers', type: ChannelType.GuildText, _restrictToRoles: ['1528544349971812563', '1490955629576065135', '1490955448516481055', '1490955410813882478', '1489717134878707713'] },
      { name: '📯・anuncios-influ',   type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
    ],
  },
  // ── CANALES TEMPORALES DE VOZ ───────────────────────────────────────────────────
  {
    category: '✦・CANALES TEMPORALES',
    visibility: 'public',
    _tempVoiceCat: true,
    channels: [],
  },
  // ── REGLAS Y ANALISIS ─────────────────────────────────────────────────────
  {
    category: '✦・REGLAS Y ANALISIS',
    visibility: 'public',
    channels: [
      { name: '📋・reglas-partida',  type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '📋・reglas-analisis', type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🚨・exposed',         type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🚫・blacklist',       type: ChannelType.GuildText, _restrictToRole: '1489717134878707713' },
      { name: '🔍・ANALISIS 1',      type: ChannelType.GuildVoice },
      { name: '🔍・ANALISIS 2',      type: ChannelType.GuildVoice },
      { name: '🔍・ANALISIS 3',      type: ChannelType.GuildVoice },
      { name: '🔍・ANALISIS 4',      type: ChannelType.GuildVoice },
      { name: '🔍・ANALISIS 5',      type: ChannelType.GuildVoice },
    ],
  },
  // ── FILA PARTIDAS FF (se crea de último) ────────────────────────────────────
  {
    category: '✦・FILA PARTIDAS FF',
    visibility: 'public',
    _queueFila: true,
    _filaPartidasCat: true,
    channels: [
      { name: '🎰・apostar-puntos', type: ChannelType.GuildText },
      { name: '🕹️・fila-desafio',   type: ChannelType.GuildText },
      { name: '🕹️・fila-desafio-2', type: ChannelType.GuildText },
      { name: '🕹️・fila-desafio-3', type: ChannelType.GuildText },
      ...buildWaitingRooms(1, 10),
    ],
  },
  // ── PARTIDAS RANKED (se crea de último) ──────────────────────────────────────
  {
    category: '✦・PARTIDAS RANKED',
    visibility: 'public',
    _queuePartida: true,
    _voiceCat: true,
    _denyVoiceMods: true,
    channels: [
      { name: '💬・partidas', type: ChannelType.GuildText, setting: 'matchThreadsParentChannelId' },
      ...buildMatchRooms(1, 15),
    ],
  },
  // ── LOGS PRIVADOS (se crea de último) ─────────────────────────────────────────
  {
    category: '✦・LOGS Y REGISTROS',
    visibility: 'private',
    channels: [
      { name: '📜・logs-general',      type: ChannelType.GuildText, setting: 'logChannelId' },
      { name: '💻・logs-errores',      type: ChannelType.GuildText, setting: 'logChannelErrorsId' },
      { name: '🛑・logs-anti-raid',    type: ChannelType.GuildText, setting: 'logChannelRaidId' },
      { name: '⚠️・logs-advertencias', type: ChannelType.GuildText, setting: 'logChannelWarningsId' },
      { name: '👮・logs-autoroles',    type: ChannelType.GuildText, setting: 'logChannelAutoroleId' },
      { name: '🔄・logs-filas',        type: ChannelType.GuildText, setting: 'logChannelQueuesId' },
      { name: '⚔️・logs-partidas',     type: ChannelType.GuildText, setting: 'logChannelMatchesId' },
      { name: '➕・logs-puntos',       type: ChannelType.GuildText, setting: 'logChannelPointsId' },
      { name: '💰・logs-coins',        type: ChannelType.GuildText, setting: 'logChannelCoinsId' },
      { name: '📊・logs-stats',        type: ChannelType.GuildText, setting: 'logChannelStatsId' },
      { name: '🛒・logs-tienda',       type: ChannelType.GuildText, setting: 'logChannelShopId' },
      { name: '🎰・logs-ruleta',       type: ChannelType.GuildText, setting: 'logChannelRouletteId' },
      { name: '💸・logs-penalizacion', type: ChannelType.GuildText, setting: 'logChannelPenalty10kId' },
      { name: '💰・logs-apuestas',     type: ChannelType.GuildText, setting: 'logChannelBetsId' },
      { name: '🎡・logs-giros',        type: ChannelType.GuildText, setting: 'logChannelSpinsId' },
      { name: '🔁・logs-resets',       type: ChannelType.GuildText, setting: 'logChannelResetId' },
      { name: '🔊・logs-voz-temp',     type: ChannelType.GuildText, setting: 'logChannelVoiceTempId' },
      { name: '📜・logs-terminos',     type: ChannelType.GuildText, setting: 'logChannelTerminosId' },
      { name: '💎・logs-vips',         type: ChannelType.GuildText, setting: 'logChannelVipsId' },
      { name: '✨・logs-exclusivo',    type: ChannelType.GuildText, setting: 'logChannelExclusivoId' },
      { name: '📞・logs-roles-call',   type: ChannelType.GuildText, setting: 'logChannelRolesCallId' },
      { name: '📋・resumen-temporada', type: ChannelType.GuildText, setting: 'seasonSummaryChannelId' },
    ],
  },
  // ── PANEL DE STAFF (se crea de último) ───────────────────────────────────────
  {
    category: '✦・PANEL DE STAFF',
    visibility: 'private',
    channels: [
      { name: '⚙️・chat-staff',     type: ChannelType.GuildText },
      { name: '🛠️・herramientas',   type: ChannelType.GuildText },
      { name: '🧪・zona-pruebas',   type: ChannelType.GuildText },
      { name: '🖥️・comandos-admin', type: ChannelType.GuildText },
    ],
  },
];

// ─── Comando principal ────────────────────────────────────────────────────────

async function crearServidor(message, args, ctx) {
  const { Setting, COLORS, BOT_OWNER_ID, config } = ctx;
  const guild = message.guild;
  if (!guild) return;

  // Solo el owner del bot puede ejecutarlo
  const isOwner = Array.isArray(BOT_OWNER_ID)
    ? BOT_OWNER_ID.includes(message.author.id)
    : message.author.id === BOT_OWNER_ID;

  if (!isOwner) {
    return message.channel.send({ content: '🚫 Solo el **OWNER** del bot puede usar este comando.' }).catch(() => {});
  }

  const neededPerms = [F.ManageChannels, F.ManageRoles];
  const botPerms = guild.members.me?.permissions;

  if (!botPerms?.has(neededPerms)) {
    const missing = neededPerms.filter(p => !botPerms?.has(p));
    return message.channel.send({ content: `❌ El bot necesita los permisos: ${missing.map(p => String(p)).join(', ')}` }).catch(() => {});
  }

  // Fetch del servidor
  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});

  // Detectar roles clave
  const staffIds = [...new Set([
    ...(config?.manageRole || []),
    ...(config?.staffRoleId || []),
  ])];

  let vipRoleIds = guild.roles.cache
    .filter(r => r.name.toLowerCase().includes('vip'))
    .map(r => r.id);

  if (!vipRoleIds.length && config?.allowedRoles?.[0]) {
    vipRoleIds.push(config.allowedRoles[0]);
  }

  const everyoneId = guild.roles.everyone.id;

  const modVoiceRoles = guild.roles.cache.filter(r =>
    !r.permissions.has(F.Administrator) &&
    (r.permissions.has(F.MoveMembers) || r.permissions.has(F.MuteMembers) || r.permissions.has(F.DeafenMembers))
  ).map(r => r.id);

  const permCtx = { everyoneId, staffRoles: staffIds, vipRoleIds, modVoiceRoles };

  const totalCats = LAYOUT.length;
  const totalChs  = LAYOUT.reduce((s, g) => s + g.channels.length, 0);

  const C_BLUE  = 0x5865F2;
  const C_GREEN = COLORS?.SUCCESS  || 0x57F287;
  const C_WARN  = COLORS?.WARNING  || 0xFEE75C;

  // ── Embed de Preview ────────────────────────────────────────────────────────
  const staffMention = staffIds.length
    ? staffIds.slice(0, 3).map(id => `<@&${id}>`).join(' ')
    : '⚠️ ninguno detectado';
  const vipMention = vipRoleIds.length
    ? vipRoleIds.map(id => `<@&${id}>`).join(' ')
    : '⚠️ ninguno detectado';

  const previewEmbed = new EmbedBuilder()
    .setColor(C_BLUE)
    .setTitle('🏰  ROYAL RANKED — CREAR SERVIDOR')
    .setAuthor({ name: guild.name, iconURL: guild.iconURL?.() || undefined })
    .setDescription(
      [
        '```',
        `  Servidor    ${guild.name}`,
        `  Categorías  ${totalCats}`,
        `  Canales     ${totalChs}`,
        '```',
        '',
        '**📋  Estructura que se creará:**',
        '> 📗 Reglas  ·  ⚡ Cargos  ·  💬 Interacción',
        '> 🎫 Soporte  ·  🪙 Economía & Ranking',
        '> 🕹️ Fila Partidas FF (con espera 01~10)',
        '> ⚔️ Partidas Ranked (01~15)',
        '> 🌀 Canales Temporales  ·  🌟 Influencers',
        '> 🔒 Logs Privados  ·  ⚙️ Staff',
        '',
        '**ℹ️  Importante:**',
        '> • No se modifican canales ni roles existentes.',
        '> • Todos los IDs se guardan automáticamente en la DB.',
      ].join('\n')
    )
    .addFields(
      { name: '🛡️  Roles Staff detectados', value: staffMention, inline: true },
      { name: '💎  Rol VIP detectado',       value: vipMention,   inline: true },
    )
    .setFooter({ text: 'Presioná CREAR para continuar  ·  Caduca en 90 s' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cs_confirm')
      .setLabel('CREAR ESTRUCTURA')
      .setEmoji('🏰')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('cs_cancel')
      .setLabel('CANCELAR')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary),
  );

  const previewMsg = await message.channel.send({ embeds: [previewEmbed], components: [row] }).catch(() => null);
  if (!previewMsg) return;

  // ── Collector botones ────────────────────────────────────────────────────────
  const btnCollector = previewMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
    max: 1,
    filter: btn => btn.user.id === message.author.id,
  });

  btnCollector.on('end', async (collected, reason) => {
    if (reason !== 'ok' && previewMsg?.editable) {
      await previewMsg.edit({
        components: [],
        embeds: [
          EmbedBuilder.from(previewEmbed)
            .setColor(C_WARN)
            .setTitle('⏹️  OPERACIÓN CANCELADA')
            .setDescription('No se creó nada. Timeout o cancelación manual.')
            .setFooter({ text: 'Volvé a ejecutar !crearservidor para reintentar.' }),
        ],
      }).catch(() => {});
    }
  });

  btnCollector.on('collect', async btn => {
    // Cancelar
    if (btn.customId === 'cs_cancel') {
      btnCollector.stop('ok');
      await btn.deferUpdate().catch(() => {});
      await previewMsg.edit({
        components: [],
        embeds: [
          EmbedBuilder.from(previewEmbed)
            .setColor(C_WARN)
            .setTitle('⏹️  CANCELADO')
            .setDescription('No se creó nada en el servidor.')
            .setFooter({ text: 'Podés volver a ejecutar !crearservidor cuando quieras.' }),
        ],
      }).catch(() => {});
      return;
    }

    if (btn.customId !== 'cs_confirm') return;

    // Confirmar — deferUpdate para que Discord no marque "interaction failed"
    btnCollector.stop('ok');
    await btn.deferUpdate().catch(() => {});

    try {
      await btn.followUp({ content: '🏗️ Iniciando creación del servidor...', ephemeral: true }).catch(() => {});
    } catch (_) {}

    // ── Actualizar embed a modo progreso ────────────────────────────────────
    try {
      await guild.roles.fetch({ limit: 200 }).catch(() => {});
    } catch (_) {}

    function resolveCounterName(ch) {
      return ch.name;
    }

    const progressEmbed = new EmbedBuilder()
      .setColor(C_BLUE)
      .setTitle('🏗️  CONSTRUYENDO EL SERVIDOR...')
      .setDescription(
        '```\n' +
        `  [${progressBar(0)}]  0 %\n` +
        '```\n' +
        '> Iniciando...'
      )
      .setFooter({ text: 'No cierres Discord durante el proceso.' });

    await previewMsg.edit({ embeds: [progressEmbed], components: [] }).catch(() => {});

    // ── Contadores ────────────────────────────────────────────────────────────
    let catsDone = 0, chsDone = 0, failed = 0, settingsSaved = 0;
    const failedList      = [];
    const voiceCatIds     = [];
    const queueCatIds     = [];
    let tempVoiceCatId    = null;
    let filaPartidasCatId = null;
    let voiceStatsCatId   = null;

    let __lastProgressUpdate = 0;
    async function updateProgress(label = '', force = false) {
      const done = catsDone + chsDone + failed;
      const pct  = Math.min(100, Math.round((done / (totalCats + totalChs)) * 100));
      const now  = Date.now();
      // Throttle reducido + todas las labels de categoría/canal SIEMPRE fuerzan update para evitar "0% pegado"
      if (!force && now - __lastProgressUpdate < 350 && done !== (totalCats + totalChs)) return;
      __lastProgressUpdate = now;
      await previewMsg.edit({
        embeds: [
          progressEmbed.setDescription(
            '```\n' +
            `  [${progressBar(pct)}]  ${pct} %\n` +
            '```\n' +
            `> 📁 Categorías  **${catsDone} / ${totalCats}**\n` +
            `> 🔗 Canales     **${chsDone} / ${totalChs}**\n` +
            `> ❌ Errores     **${failed}**\n` +
            `> 💾 Settings    **${settingsSaved}** guardados` +
            (label ? `\n> ⚡ ${label}` : '')
          ),
        ],
      }).catch(() => {});
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function withTimeout(promise, ms, tag = 'operación') {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT (${ms}ms) en ${tag}`)), ms));
      return Promise.race([promise, timeout]);
    }

    // Verificar permisos REALES del bot en este guild (no solo confiar en el check inicial)
    try {
      await guild.members.fetchMe().catch(() => {});
      const me = guild.members.me;
      const needPerms = [
        ['ManageChannels', F.ManageChannels],
        ['ManageRoles',    F.ManageRoles],
        ['ManageGuild',    F.ManageGuild],
      ];
      const missing = needPerms.filter(([, f]) => !me?.permissions?.has(f));
      if (missing.length) {
        console.error('[crearServidor] ⛔ PERMISOS FALTANTES REALES:', missing.map(m => m[0]).join(', '));
      } else {
        console.log('[crearServidor] ✅ Permisos reales confirmados: ManageChannels + ManageRoles.');
      }
      console.log('[crearServidor] 🪪 Bot ID:', me?.id, '| Rol superior:', me?.roles?.hoist?.name || '(ninguno)');
    } catch (_p) { /* no-op */ }

    // Handler para ver rate-limits reales + WARNING si es > 60s
    let longestRetry = 0;
    try {
      const restMan = message.client?.rest;
      if (restMan && !restMan.__csLogged) {
        restMan.__csLogged = true;
        restMan.on('rateLimited', info => {
          const ra = Number(info.retryAfter || info.timeout || 0);
          if (ra > longestRetry) longestRetry = ra;
          const mins = (ra / 60000).toFixed(1);
          const sev = ra > 60000 ? '🔴 RATE-LIMIT LARGO' : '🟡';
          console.warn(`[RL DISCORD] ${sev} Route=${info.route} Retry=${ra}ms (${mins}min) Limit=${info.limit}`);
        });
      }
    } catch (_) { /* no-op */ }

    let attemptCount = 0;
    async function safeCreateChannel(options, kind = 'canal') {
      attemptCount++;
      const tryNum = attemptCount;
      console.log(`[crearServidor #${tryNum}] creando ${kind}: "${options.name}" ...`);
      const t0 = Date.now();
      try {
        // ⚠️ SIN withTimeout PROPIO. discord.js ya conoce RetryAfter=2610s y esperará
        // (el rest.timeout=90s y retries=10 definidos en index.js NO matan el rate-limit bucket,
        //  solo cortan requests que NUNCA respondieron; discord.js sabe esperar los 43min correctos).
        const res = await guild.channels.create(options);
        const dur = Date.now() - t0;
        if (dur > 15000) {
          console.log(`[crearServidor #${tryNum}] OK ${kind}: "${options.name}" → ${res.id} ⏱️ ${(dur/1000).toFixed(1)}s (esperó rate-limit)`);
        } else {
          console.log(`[crearServidor #${tryNum}] OK ${kind}: "${options.name}" → ${res.id} (${dur}ms)`);
        }
        return res;
      } catch (e) {
        const dur = Date.now() - t0;
        console.error(
          `[crearServidor #${tryNum}] FALLO ${kind}: "${options.name}"`,
          `→ code=${e.code || e.status || 'n/a'}`,
          `msg=${e.message}`,
          `(${dur}ms)`
        );
        throw e;
      }
    }

    await updateProgress('Preparando entorno...', true);

    try {
      for (const group of LAYOUT) {
        let catId = null;

        try {
          await updateProgress(`Creando categoría ${group.category.replace(/^\S+\s+/, '')}...`, true);
          const cat = await safeCreateChannel({
            name: group.category,
            type: ChannelType.GuildCategory,
            reason: '!crearservidor — Royal Ranked',
          }, `categoría ${group.category}`);

          catId = cat.id;
          catsDone++;

          // Asignar permisos por separado para no bloquear la creación
          try {
            const perms = buildPerms(guild, group.visibility, permCtx, group);
            await withTimeout(
              cat.edit({ permissionOverwrites: perms }),
              30_000,
              `permisos categoría ${group.category}`
            ).catch(e => {
              console.warn(`[crearServidor] Permisos fallaron en categoría ${group.category}:`, e.message);
            });
          } catch (permErr) {
            console.warn(`[crearServidor] buildPerms lanzó excepción en cat ${group.category}:`, permErr?.message || permErr);
          }

          // Registrar categorías especiales
          if (group._queueFila)       queueCatIds.push(cat.id);
          if (group._queuePartida)    queueCatIds.push(cat.id);
          if (group._voiceCat)        voiceCatIds.push(cat.id);
          if (group._tempVoiceCat)    tempVoiceCatId    = cat.id;
          if (group._filaPartidasCat) filaPartidasCatId = cat.id;
          if (group._statsVozCat)     voiceStatsCatId   = cat.id;

          // Guardar setting de categoría si corresponde
          if (group.settingCatKey && typeof Setting?.findByIdAndUpdate === 'function') {
            await Setting.findByIdAndUpdate(group.settingCatKey, { value: cat.id }, { upsert: true })
              .then(() => settingsSaved++)
              .catch(e => failedList.push(`[Setting] ${group.settingCatKey}: ${e.message}`));
          }

        } catch (e) {
          console.error(`[crearServidor] ERROR creando categoría ${group.category}:`, e.message);
          failed++;
          failedList.push(`[Cat] ${group.category}: ${e.message}`);
        }

        await updateProgress(`${group.category.replace(/^\S+\s+/, '')} • ${catId ? 'OK' : 'FALLÓ'}`, true);

        // Si la categoría falló, contar sus canales como fallidos y seguir
        if (!catId) {
          failed += group.channels.length;
          continue;
        }

        // ── Canales dentro de la categoría ──────────────────────────────────────
        for (let i = 0; i < group.channels.length; i++) {
          const ch = group.channels[i];
          try {
            let perms = [];
            try {
              perms = buildPerms(guild, group.visibility, permCtx, group, ch);
            } catch (permErr) {
              console.warn(`[crearServidor] buildPerms excepción en canal ${ch.name}:`, permErr?.message || permErr);
              perms = [{ id: everyoneId, allow: [F.ViewChannel] }];
            }

            const rawName = resolveCounterName(ch);
            const chName  = ch.type === ChannelType.GuildVoice ? capitalizeVoiceName(rawName) : rawName;

            const channelOptions = {
              name:                 chName,
              type:                 ch.type,
              parent:               catId,
              permissionOverwrites: perms,
              reason:               '!crearservidor — Royal Ranked',
            };

            if (ch.userLimit && ch.type === ChannelType.GuildVoice) {
              channelOptions.userLimit = ch.userLimit;
            }

            const created = await safeCreateChannel(channelOptions, `canal ${group.category}/${ch.name}`);
            chsDone++;

            if (ch.setting && typeof Setting?.findByIdAndUpdate === 'function') {
              await Setting.findByIdAndUpdate(ch.setting, { value: created.id }, { upsert: true })
                .then(() => settingsSaved++)
                .catch(e => failedList.push(`[Setting] ${ch.setting}: ${e.message}`));
            }

          } catch (e) {
            console.error(`[crearServidor] ERROR canal ${ch.name}:`, e.message);
            failed++;
            failedList.push(`[Ch] ${ch.name}: ${e.message}`);
          }

          // Actualizar progreso cada canal (o cada 2 pero forzado por label)
          if ((i + 1) % 2 === 0 || i === group.channels.length - 1) {
            await updateProgress(`${group.category.replace(/^\S+\s+/, '')} • canal ${i + 1}/${group.channels.length}`);
          }
        }

        await updateProgress(`Categoría completada: ${group.category.replace(/^\S+\s+/, '')}`, true);
      }
    } catch (fatalErr) {
      console.error('[crearServidor] ERROR FATAL EN LOOP:', fatalErr);
      failed++;
      failedList.push(`[FATAL] Loop principal: ${fatalErr?.message || String(fatalErr)}`);
    }

    // ── Guardar settings batch ──────────────────────────────────────────────
    await updateProgress('Guardando settings en la DB...', true);

    if (typeof Setting?.findByIdAndUpdate === 'function') {
      try {
        if (tempVoiceCatId)      { await Setting.findByIdAndUpdate('tempVoiceCategoryId',    { value: tempVoiceCatId },    { upsert: true }).catch(()=>{}); settingsSaved++; }
        if (voiceStatsCatId)     { await Setting.findByIdAndUpdate('voiceStatsCategoryId',   { value: voiceStatsCatId },   { upsert: true }).catch(()=>{}); settingsSaved++; }
        if (queueCatIds.length)  { await Setting.findByIdAndUpdate('queueCategories',        { value: queueCatIds },       { upsert: true }).catch(()=>{}); settingsSaved++; }
        if (filaPartidasCatId)   { await Setting.findByIdAndUpdate('allowedQueueCategoryId', { value: filaPartidasCatId }, { upsert: true }).catch(()=>{}); settingsSaved++; }
        if (voiceCatIds.length)  { await Setting.findByIdAndUpdate('allowedVoiceCategories', { value: voiceCatIds },       { upsert: true }).catch(()=>{}); settingsSaved++; }
      } catch (e) {
        failedList.push(`[Batch-Settings]: ${e.message}`);
      }
    }

    await updateProgress('Generando resumen final...', true);

    // ── Embed final ──────────────────────────────────────────────────────────
    const successRate = Math.round(((catsDone + chsDone) / (totalCats + totalChs)) * 100);
    const isSuccess   = failed === 0;

    const finalEmbed = new EmbedBuilder()
      .setColor(isSuccess ? C_GREEN : C_WARN)
      .setTitle(isSuccess ? '✅  SERVIDOR CREADO EXITOSAMENTE' : '⚠️  CREACIÓN COMPLETADA CON ERRORES')
      .setDescription(
        '```\n' +
        `  [${progressBar(successRate)}]  ${successRate} %\n` +
        '```'
      )
      .addFields(
        { name: '📁  Categorías',     value: `**${catsDone}** / ${totalCats}`,  inline: true },
        { name: '🔗  Canales',        value: `**${chsDone}** / ${totalChs}`,    inline: true },
        { name: '💾  Settings DB',    value: `**${settingsSaved}** guardados`,  inline: true },
        { name: '❌  Fallaron',       value: `**${failed}**`,                   inline: true },
        { name: '🗂️  Cats de Voz',    value: `**${voiceCatIds.length}** reg.`, inline: true },
        { name: '📋  Filas/Partidas', value: `**${queueCatIds.length}** cats`, inline: true },
        {
          name: '📌  IDs clave (guardadas en DB)',
          value: [
            `• \`tempVoiceCategoryId\`    ${tempVoiceCatId    ? `→ \`${tempVoiceCatId}\``    : '❌'}`,
            `• \`voiceStatsCategoryId\`   ${voiceStatsCatId   ? `→ \`${voiceStatsCatId}\``   : '❌'}`,
            `• \`queueCategories\`        → **${queueCatIds.length}** guardadas`,
            `• \`allowedQueueCategoryId\` ${filaPartidasCatId ? `→ \`${filaPartidasCatId}\`` : '❌'}`,
            `• \`allowedVoiceCategories\` → **${voiceCatIds.length}** guardadas`,
          ].join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: `Finalizado · ${new Date().toLocaleString('es-CO')}  ·  Reiniciá el bot para aplicar los settings nuevos.` });

    if (failed > 0 && failedList.length > 0) {
      finalEmbed.addFields({
        name: `⚠️  Errores (${failed})`,
        value: failedList.slice(0, 10).join('\n') + (failed > 10 ? `\n+${failed - 10} más...` : ''),
      });
    }

    if (longestRetry >= 60_000) {
      const mins = (longestRetry / 60_000).toFixed(1);
      finalEmbed.addFields({
        name: `⏱️  Rate-limit Discord detectado (${mins} min)`,
        value:
          'Discord impuso una espera larga por la cantidad de intentos anteriores. ' +
          'Esperá ese tiempo y volvé a ejecutar, o corrélo en un servidor **nuevo** (otro guildId) sin castigo.' +
          `\nEspera máxima reportada: **${mins} minutos**.`,
        inline: false,
      });
    }

    try { await previewMsg.edit({ embeds: [finalEmbed], components: [] }); } catch {}
  });
}

module.exports = crearServidor;
