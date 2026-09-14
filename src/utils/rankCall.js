// src/utils/rankCall.js
// ─────────────────────────────────────────────────────────────────────────────
// Sistema automático de Ranking de Tiempo en Call
// • Postea / edita un mensaje fijo en el canal 🏆・rank-call
// • Se actualiza cada 30 minutos
// • Cuenta sesiones de voz activas en tiempo real
// ─────────────────────────────────────────────────────────────────────────────

const { EmbedBuilder } = require('discord.js');

// Clave en MongoDB Setting que guarda el ID del mensaje fijo
const MSG_SETTING_KEY  = 'rankCallMessageId';
// Clave que guarda el ID del canal rank-call
const CHAN_SETTING_KEY = 'rankCallChannelId';

// Intervalo de actualización (30 min en ms)
const UPDATE_INTERVAL = 30 * 60 * 1000;

// Referencia al timer para poder cancelarlo si es necesario
let _intervalRef = null;

// ─── Utilidades ──────────────────────────────────────────────────────────────

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h} h ${m} m ${s} s`;
}

/** Devuelve los segundos totales de un player sumando la sesión activa si está en voz. */
function resolveSeconds(player, guild) {
  let total = player.voiceTime?.totalSeconds || 0;
  if (player.voiceTime?.currentSession) {
    const inVoice = guild.voiceStates.cache.has(player._id);
    if (inVoice) {
      const start = new Date(player.voiceTime.currentSession).getTime();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      if (elapsed > 0) total += elapsed;
    }
  }
  return total;
}

// Medallas para los primeros 3 puestos
const MEDALS = ['🥇', '🥈', '🥉'];

// ─── Construcción del embed ───────────────────────────────────────────────────

async function buildRankCallEmbed(guild, Player, client, EMBED_DEFAULTS) {
  // 1. Traer top 10 por totalSeconds
  const raw = await Player.find({ 'voiceTime.totalSeconds': { $gt: 0 } })
    .sort({ 'voiceTime.totalSeconds': -1 })
    .limit(50)
    .select('_id voiceTime')
    .lean();

  if (!raw || raw.length === 0) {
    return new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🏆  Ranking de Tiempo en Call')
      .setDescription('> Aún no hay datos de actividad de voz registrados.')
      .setFooter({ text: `Actualizado cada 30 minutos · hoy a la ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` })
      .setTimestamp();
  }

  // 2. Calcular tiempo real (con sesiones activas)
  const withLive = raw.map(p => ({
    id: p._id,
    seconds: resolveSeconds(p, guild),
  }));

  // 3. Re-ordenar con el tiempo real y limitar a top 10
  withLive.sort((a, b) => b.seconds - a.seconds);
  const top = withLive.slice(0, 10);

  // 4. Resolver nombres (display del servidor o username) con mención real
  const resolvedNames = await Promise.all(
    top.map(async p => {
      try {
        const member = await guild.members.fetch({ user: p.id, force: false }).catch(() => null);
        if (member) return `<@${p.id}>`;
        const user  = await client.users.fetch(p.id).catch(() => null);
        if (user)   return `<@${p.id}>`;
      } catch {}
      return `<@${p.id}>`;
    })
  );

  // 5. Construir descripción al estilo de la captura
  let desc = '';
  for (let i = 0; i < top.length; i++) {
    const medal = MEDALS[i] || `**${i + 1}.**`;
    const name  = resolvedNames[i];
    const time  = formatTime(top[i].seconds);
    // Línea 1 = posición + nombre
    // Línea 2 = tiempo (con ⏰ como en la captura)
    desc += `${medal} ${name}\n⏰ Tiempo: **${time}**\n\n`;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🏆  Ranking de Tiempo en Call')
    .setDescription(desc.trim())
    .setThumbnail(EMBED_DEFAULTS?.thumbnail?.url || guild.iconURL({ dynamic: true }) || null)
    .setFooter({ text: 'Actualizado cada 30 minutos · Última actualización:' })
    .setTimestamp();
}

// ─── Postear / editar el mensaje fijo ────────────────────────────────────────

async function postOrEditRankCall({ guild, client, Player, Setting, EMBED_DEFAULTS }) {
  try {
    // Obtener canal
    const chanSetting = await Setting.findById(CHAN_SETTING_KEY).lean();
    if (!chanSetting?.value) return; // canal no configurado

    const channel = guild.channels.cache.get(chanSetting.value)
      || await guild.channels.fetch(chanSetting.value).catch(() => null);
    if (!channel) return;

    const embed = await buildRankCallEmbed(guild, Player, client, EMBED_DEFAULTS);

    // Intentar editar el mensaje existente
    const msgSetting = await Setting.findById(MSG_SETTING_KEY).lean();
    if (msgSetting?.value) {
      const existing = await channel.messages.fetch(msgSetting.value).catch(() => null);
      if (existing && existing.editable) {
        await existing.edit({ embeds: [embed] });
        return;
      }
    }

    // Si no existe, postear uno nuevo y guardar su ID
    const sent = await channel.send({ embeds: [embed] });
    await Setting.findByIdAndUpdate(MSG_SETTING_KEY, { value: sent.id }, { upsert: true });

  } catch (err) {
    console.error('[rankCall] Error al actualizar ranking de call:', err?.message || err);
  }
}

// ─── Inicialización (llamar desde ready.js) ───────────────────────────────────

function startRankCallLoop({ guild, client, Player, Setting, EMBED_DEFAULTS }) {
  if (_intervalRef) clearInterval(_intervalRef);

  // Primera ejecución inmediata
  postOrEditRankCall({ guild, client, Player, Setting, EMBED_DEFAULTS }).catch(() => {});

  // Luego cada 30 minutos
  _intervalRef = setInterval(() => {
    postOrEditRankCall({ guild, client, Player, Setting, EMBED_DEFAULTS }).catch(() => {});
  }, UPDATE_INTERVAL);

  console.log('[rankCall] Loop de ranking de call iniciado (cada 30 min).');
}

function stopRankCallLoop() {
  if (_intervalRef) {
    clearInterval(_intervalRef);
    _intervalRef = null;
  }
}

// ─── Comando manual: !rankcall refresh (solo owner/staff) ────────────────────

async function forceRefreshRankCall({ guild, client, Player, Setting, EMBED_DEFAULTS, message, BOT_OWNER_ID }) {
  const isOwner = Array.isArray(BOT_OWNER_ID)
    ? BOT_OWNER_ID.includes(message.author.id)
    : message.author.id === BOT_OWNER_ID;

  if (!isOwner) {
    return message.channel.send('🚫 Solo el OWNER puede forzar la actualización del rank-call.').catch(() => {});
  }

  await postOrEditRankCall({ guild, client, Player, Setting, EMBED_DEFAULTS });
  return message.react('✅').catch(() => {});
}

// ─── Comando: !setrankcallchannel (configura el canal) ───────────────────────

async function setRankCallChannel({ message, args, Setting, BOT_OWNER_ID, config }) {
  const isOwner = Array.isArray(BOT_OWNER_ID)
    ? BOT_OWNER_ID.includes(message.author.id)
    : message.author.id === BOT_OWNER_ID;

  const manageRoles = config?.manageRole || [];
  const hasStaff    = message.member?.roles?.cache?.some(r => manageRoles.includes(r.id));

  if (!isOwner && !hasStaff) {
    return message.channel.send('🚫 No tenés permiso para usar este comando.').catch(() => {});
  }

  // Aceptar mención de canal o ID directa
  const ch = message.mentions.channels.first()
    || message.guild.channels.cache.get(args[0]);

  if (!ch) {
    return message.channel.send('❌ Especificá el canal: `!setrankcallchannel #canal` o ID.').catch(() => {});
  }

  await Setting.findByIdAndUpdate(CHAN_SETTING_KEY, { value: ch.id }, { upsert: true });
  // Borrar mensaje guardado para que postee uno nuevo en el canal nuevo
  await Setting.findByIdAndUpdate(MSG_SETTING_KEY, { value: null }, { upsert: true });

  return message.channel.send(`✅ Canal de rank-call configurado: ${ch}. El mensaje se posteará en el próximo ciclo o al reiniciar.`).catch(() => {});
}

module.exports = {
  startRankCallLoop,
  stopRankCallLoop,
  forceRefreshRankCall,
  setRankCallChannel,
  postOrEditRankCall,
  MSG_SETTING_KEY,
  CHAN_SETTING_KEY,
};
