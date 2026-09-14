// index.js (completo, unido y con sistema de StyleCoins + tienda + ranking diario)
// NOTA: Asegúrate de tener un config.json actualizado con los campos usados abajo:
// token, prefix (opcional), filaCategoryId, allowedRoles, allowedVoiceCategories, role1v1, role2v2,
// manageRole, categoryId, waitingCategoryId, winPoints, losePoints, mvpPoints, creatorPoints,
// specialRoles (puntosX2, proteccion), coinsChannelId, rankingChannelId (para embed diario), staffRoleIds (opcional), queueCategories, dailyRewardChannelId (canal recompensas diarias), dailyRewardAmount (monto por jugador)

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  PermissionsBitField,
  ChannelType,
  ActivityType,
  AttachmentBuilder,
  ThreadAutoArchiveDuration,
  Partials,
} = require('discord.js'); // Asegúrate de tener discord.js v14
const { exec } = require('child_process');
const mongoose = require('mongoose');
const { RESTJSONErrorCodes } = require('discord-api-types/v10');

// --- NUEVO: Dependencia para generar imágenes ---
let createCanvas = null;
let loadImage = null;
let registerFont = null;
try {
  ({ createCanvas, loadImage, registerFont } = require('canvas'));
} catch (_) {
  try {
    ({ createCanvas, loadImage, registerFont } = require('@napi-rs/canvas'));
  } catch (_) {
    createCanvas = null;
    loadImage = null;
    registerFont = null;
  }
}
const baseParseDuration = require('parse-duration');
function parseDuration(text) {
  if (!text || typeof text !== 'string') return null;
  let s = text.toLowerCase();
  s = s.replace(/días|dias|día|dia/g, 'd');
  s = s.replace(/semanas|semana|sem/g, 'w');
  s = s.replace(/meses|mes/g, '30d');
  s = s.replace(/años|año/g, '365d');
  s = s.replace(/horas|hora|h/g, 'h');
  s = s.replace(/minutos|minuto|min|m/g, 'm');
  s = s.replace(/segundos|segundo|seg|s/g, 's');
  s = s.replace(/\s+/g, '');
  const ms = baseParseDuration(s);
  if (!ms || ms < 1000) return null;
  return ms;
}
const PQueue = require('p-queue').default; // NUEVO: Importar la librería de cola de tareas
// FORCE_RESTART: 2025-12-24 - Fix stuck queue
// Opcional: Registra una fuente personalizada para un mejor diseño
// registerFont(path.join(__dirname, 'fonts', 'MyCoolFont.ttf'), { family: 'MyCoolFont' });

// --- OPTIMIZACIÓN: Cargar recursos una sola vez ---
let cardBackground = null;
if (typeof loadImage === 'function') {
  loadImage(path.join(__dirname, 'card_background.png')).then(img => { cardBackground = img; }).catch(() => { });
}


// --- CARGAR CONFIGURACIÓN EXTERNA O INTERNA ---
let config;
const externalConfigPath = path.join(process.cwd(), 'config.json');
if (fs.existsSync(externalConfigPath)) {
  try {
    config = JSON.parse(fs.readFileSync(externalConfigPath, 'utf8'));
    console.log('--- Configuración cargada desde config.json externo ---');
  } catch (e) {
    console.error('Error al leer config.json externo, usando el interno:', e);
    config = require('./config.json');
  }
} else {
  config = require('./config.json');
}

const winsAdminCommand = require('./src/commands/winsAdmin');
const statsAdmin = require('./src/commands/statsAdmin');
const tiktokCommand = require('./src/commands/tiktok');
const postTikTokPanel = require('./src/commands/paneltiktok');
const infoCommand = require('./src/commands/info');
const checkBanCommand = require('./src/commands/checkban');
const updateChamps = require('./src/commands/updateChamps');
const createBootstrapUtils = require('./src/utils/bootstrap');
const { startWebServer } = require('./web-server');

// OPTIMIZACIÓN: Usar una librería más ligera y moderna para tareas programadas si es necesario.
const { schedule } = require('node-cron');

const client = new Client({
  // Aumentar el timeout para peticiones a la API de Discord.
  rest: {
    timeout: 90_000, // Aumentado de 60s a 90s
    retries: 10,     // Aumentado de 5 a 10
    // Manejar errores de undici (ConnectTimeoutError) a nivel global de REST
    rejectOnRateLimit: (data) => data.timeout > 10000,
  },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers, // Privileged Intent: Necesario para guildMemberAdd/Remove y fetch() de miembros
    GatewayIntentBits.GuildPresences, // Privileged Intent: Necesario para leer estados personalizados y actividades
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// FIX: Deshabilitar warnings de memory leak en WebSocketShard (no son memory leaks reales)
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 0; // 0 = sin límite

// También establecer el límite en el cliente específicamente
client.setMaxListeners(0);

// Deshabilitar específicamente los warnings de AsyncEventEmitter
process.on('warning', (warning) => {
  if (warning.name === 'MaxListenersExceededWarning' && warning.message.includes('WebSocketShard')) {
    return; // Ignorar warnings de WebSocketShard
  }
  console.warn(warning);
});

// Manejo global de errores para evitar caídas silenciosas o ruidosas
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ UNHANDLED REJECTION:', reason);
  // No salimos del proceso, solo loggeamos
});

process.on('uncaughtException', (error) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', error);
  // Opcional: process.exit(1); si es crítico
});

/* ------------------ Modelos de Base de Datos ------------------ */
const { Player, MatchHistory, Setting, Blacklist, Excluded, ActiveMatch, ActiveQueue, Suggestion, ActiveTempVoice, Invitation, Clip, StreamerChannel, HeadToHead } = require('./models');
const VipKey = require('./src/models/VipKey');

// Handlers externos
const onGuildMemberAdd = require('./src/events/guildMemberAdd');
const onGuildMemberRemove = require('./src/events/guildMemberRemove');
const onGuildMemberUpdate = require('./src/events/guildMemberUpdate');
const onClientError = require('./src/events/error');
const onVoiceStateUpdate = require('./src/events/voiceStateUpdate');
const onInteractionCreate = require('./src/events/interactionCreate');
const onMessageCreate = require('./src/events/messageCreate');
const onChannelDelete = require('./src/events/channelDelete');

// --- Comandos externos ---
const partidasCommand = require('./src/commands/partidas');
const profileCommand = require('./src/commands/profile');
const tiendaCommand = require('./src/commands/tienda');
const reclamartiendaCommand = require('./src/commands/reclamartienda');
const girarCommand = require('./src/commands/girar');
const filaCommand = require('./src/commands/fila');
const dailyCommand = require('./src/commands/daily');
const dailyCoinsCommand = require('./src/commands/dailyCoins');
const { addSpins, removeSpins, setSpins } = require('./src/commands/spins');
const { addX2 } = require('./src/commands/x2Admin');
const { addX2Time, addProteccion } = require('./src/commands/x2TimeAndShieldAdmin');
const { addCartera, resetCarteraCommand } = require('./src/commands/carteraAdmin');
const { eventoCommand } = require('./src/commands/eventoAdmin');
const { eventosCommand } = require('./src/commands/eventos');
const statsGraph = require('./src/commands/statsGraph');
const statsVozCommand = require('./src/commands/statsVoz');
const girosCommand = require('./src/commands/giros');
const coinsCommand = require('./src/commands/coins');
const { addCoins, removeCoins } = require('./src/commands/coinsAdmin');
const { addWin, removeWin } = require('./src/commands/winsAdmin');
const { rankCommand } = require('./src/commands/rank');
const { nombreCommand } = require('./src/commands/nombre');
const { addLoss, removeLoss } = require('./src/commands/lossesAdmin');
const { addMvp, removeMvp } = require('./src/commands/mvpAdmin');
const { addAdvertencia, removeAdvertencia } = require('./src/commands/warningsAdmin');
const { helpCommand, helpOldCommand } = require('./src/commands/help');
const { puntosEveryoneCommand } = require('./src/commands/pointsEveryone');
const { addPuntos, removePuntos } = require('./src/commands/pointsAdmin');
const { resetStats, resetAllStats } = require('./src/commands/resetAdmin');
const { exemptNick, unexemptNick, exemptList } = require('./src/commands/nickAdmin');
const { exemptMove, unexemptMove, exemptMoveList, voiceTempCommand } = require('./src/commands/voiceAdmin');
const { addRol, removeRol, addRolAll, removeRolAll } = require('./src/commands/rolesAdmin');
const addpermisoRol = require('./src/commands/addpermisoRol');
const addrolcall = require('./src/commands/addrolcall');
const { setHistoryChannel, setAnnouncementsChannel, setLogChannel, setLogPointsChannel, setLogCoinsChannel, setLogWarningsChannel, setLogMatchesChannel, setLogQueuesChannel, setLogAutoroleChannel, setLogErrorsChannel, setLogStatsChannel, setDailySummaryChannel, setDailyCoinsChannel, setChampionsDailyChannel, setDailyRewardChannel, setLogShopChannel, setLogRouletteChannel, setLogPenalty10kChannel, setLogBetsChannel, setLogSpinsChannel, setLogResetChannel, setLogVoiceTempChannel, setTikTokChannel, setLogRaidChannel, setLogTerminosChannel, setLogVipsChannel, setLogExclusivoChannel, setLogRolesCallChannel, setEmojiCommand, emojiPanelCommand } = require('./src/commands/settingsAdmin');
const { startSeason, endSeason, setSeasonSummaryChannel, previewSeasonEmbed, seasonStatus } = require('./src/commands/seasonAdmin');
const { syncNicks } = require('./src/commands/syncAdmin');
const { fixMatches, cleanQueues, setMaintenance, setShopEnabled } = require('./src/commands/maintenanceAdmin');
const { blacklistAdd, blacklistRemove, blacklistInfo, blacklistAll } = require('./src/commands/blacklistAdmin');
const { panel, sendEmbed, championsPanel, previewDaily, runDailyNow, postReglamentoCommand } = require('./src/commands/moderationAdmin');
const { handleMatchHistoryCommand } = require('./src/commands/matchHistory');
const voiceTimeCommand = require('./src/commands/voiceTime');
const topVoice = require('./src/commands/topVoice');
const { primeCommand } = require('./src/commands/prime.js');
const freelikes = require('./src/commands/freelikes');
const { postAutorolePanel, postPcMovilPanel } = require('./src/commands/autoroleAdmin');
const diagnoseLogs = require('./src/commands/diagnoseLogs');
const { acceptSuggestion, rejectSuggestion, deleteSuggestion } = require('./src/commands/suggestionsAdmin');
const { exclusivo, unexclusivo, exclusivolist } = require('./src/commands/exclusivo');
const { setAntiRaid } = require('./src/commands/antiRaidAdmin');
const terminosCommand = require('./src/commands/terminos');
const clipCommand = require('./src/commands/clip');
const { vipSangrientoCommand, vipAbsolutoCommand, vipFantasmaCommand, vipSenhorCommand, vipPresencaCommand, vipCaosCommand, vipCeusCommand, reclamarVipCommand, logsVipsCommand, keysCommand, borrarKeysCommand, borrarKeyCommand } = require('./src/commands/vipSystem');
const createSuggestionsUtils = require('./src/utils/suggestions');
const { updateServerStats } = require('./src/utils/stats');
const { panelStreamerCommand, pasoAPasoCommand } = require('./src/commands/panelStreamer');
const setupServerCommand = require('./src/commands/setupserver');
const crearServidorCommand = require('./src/commands/crearServidor');
// const organizarServidorCommand = require('./src/commands/organizarServidor');
const borrarServidorCommand = require('./src/commands/borrarServidor');
const { darBeneficiosBooster } = require('./src/commands/boosterAdmin');
const reqCargosCommand = require('./src/commands/reqCargos');
const enviarliveCommand = require('./src/commands/enviarLive');
const filaCreadorCommand = require('./src/commands/filacreador');
const { globalCommand } = require('./src/commands/global');

const commands = { 
  ...statsAdmin, 
  puntosEveryoneCommand, 
  menureqcargos: reqCargosCommand, 
  darBeneficiosBooster, 
  setupserver: setupServerCommand, 
  crearservidor: crearServidorCommand, 
  borrarservidor: borrarServidorCommand, 
  panelstreamer: panelStreamerCommand, 
  pasoapaso: pasoAPasoCommand, 
  autorolpanel: postAutorolePanel, 
  rolpcymovil: postPcMovilPanel, 
  updateChamps, 
  partidasCommand, 
  profileCommand, 
  tiendaCommand, 
  reclamartiendaCommand, 
  ruletaCommand: girarCommand, 
  girar: girarCommand, 
  filaCommand, 
  dailyCommand, 
  dailyCoinsCommand, 
  addSpins, 
  removeSpins, 
  setSpins, 
  girosCommand, 
  coinsCommand, 
  addCoins, 
  removeCoins, 
  addWin, 
  removeWin, 
  rankCommand, 
  nombreCommand, 
  addLoss, 
  removeLoss, 
  addMvp, 
  removeMvp, 
  addAdvertencia, 
  removeAdvertencia, 
  helpCommand, 
  helpOldCommand, 
  addPuntos, 
  removePuntos, 
  resetStats, 
  resetAllStats, 
  exemptNick, 
  unexemptNick, 
  exemptList, 
  exemptMove, 
  unexemptMove, 
  exemptMoveList, 
  voiceTempCommand, 
  addRol, 
  removeRol, 
  addRolAll, 
  removeRolAll, 
  addpermisoRol, 
  addrolcall, 
  setHistoryChannel, 
  setAnnouncementsChannel, 
  setLogChannel, 
  setLogPointsChannel, 
  setLogCoinsChannel, 
  setLogWarningsChannel, 
  setLogMatchesChannel, 
  setLogQueuesChannel, 
  setLogAutoroleChannel, 
  setLogErrorsChannel, 
  setLogStatsChannel, 
  setDailySummaryChannel, 
  setDailyCoinsChannel, 
  setChampionsDailyChannel, 
  setDailyRewardChannel, 
  setLogShopChannel, 
  setLogRouletteChannel, 
  setLogPenalty10kChannel, 
  setLogBetsChannel, 
  setLogSpinsChannel, 
  setLogResetChannel, 
  setLogVoiceTempChannel, 
  setTikTokChannel, 
  startSeason, 
  endSeason, 
  setSeasonSummaryChannel, 
  previewSeasonEmbed, 
  seasonStatus, 
  syncNicks, 
  fixMatches, 
  cleanQueues, 
  setMaintenance, 
  setShopEnabled, 
  blacklistAdd, 
  blacklistRemove, 
  blacklistInfo, 
  blacklistAll, 
  panel, 
  sendEmbed, 
  championsPanel, 
  runDailyNow, 
  previewDaily, 
  handleMatchHistoryCommand, 
  voiceTimeCommand, 
  freelikes, 
  postAutorolePanel, 
  postPcMovilPanel, 
  diagnoseLogs, 
  acceptSuggestion, 
  rejectSuggestion, 
  deleteSuggestion, 
  addX2, 
  addX2Time, 
  addProteccion, 
  addCartera, 
  eventoCommand, 
  eventosCommand, 
  tiktokCommand, 
  statsGraph, 
  infoCommand, 
  checkBanCommand, 
  statsVozCommand, 
  setAntiRaid, 
  setLogRaidChannel, 
  topVoice, 
  terminosCommand, 
  setLogTerminosChannel, 
  primeCommand, 
  exclusivo, 
  unexclusivo, 
  exclusivolist, 
  clipCommand, 
  vipSangrientoCommand, 
  vipAbsolutoCommand, 
  vipFantasmaCommand, 
  vipSenhorCommand, 
  vipPresencaCommand, 
  vipCaosCommand, 
  vipCeusCommand, 
  reclamarVipCommand, 
  logsVipsCommand, 
  keysCommand, 
  borrarKeysCommand, 
  borrarKeyCommand, 
  setLogVipsChannel, 
  setLogExclusivoChannel, 
  setLogRolesCallChannel, 
  resetCarteraCommand, 
  postReglamentoCommand, 
  postTikTokPanel, 
  enviarlive: enviarliveCommand 
};

// Expose panel TikTok command
commands.postTikTokPanel = postTikTokPanel;
commands.updateChamps = updateChamps;
commands.setEmojiCommand = setEmojiCommand;
commands.emojiPanelCommand = emojiPanelCommand;
commands.filaCreadorCommand = filaCreadorCommand;
commands.clipCommand = clipCommand;
commands.globalCommand = globalCommand;


const createLogger = require('./src/utils/logger');
const createCacheInvalidator = require('./src/utils/cacheInvalidator');

const { handleMatchManagementSelection, handleMatchResponseSelection, updateMatchManagementMessage } = require('./src/interactions/matchManagement');
const { handleMatchCloseButton, handleMatchClosure, cleanupMatchResources } = require('./src/interactions/matchClosure');
const { handleQueueKickSelect, handleWagerModalSubmit, handleQueueJoinButton, handleQueueLeaveButton, handleQueueWagerAccept, handleQueueWagerCancel } = require('./src/interactions/queue');
const { handleQueueMenuSelection } = require('./src/interactions/queueMenu');
const { handleAutoroleSelection } = require('./src/interactions/autorole');
const { handleReqCargosSelection } = require('./src/interactions/reqCargos');

const { handleStreamerMenuSelection, handleStreamerModalSubmit } = require('./src/interactions/streamerInteractions');

const buildShopItems = require('./src/constants/shop');
const { ROULETTE_PRIZES, ROULETTE_PROBABILITIES, createRouletteUtils } = require('./src/utils/roulette');
const createNickUtils = require('./src/utils/nicknames');
const createPermissionsUtils = require('./src/utils/permissions');
const { checkVoiceChannelPermissions, movePlayerToOriginalVoiceChannel } = require('./src/utils/voice');
const createQueueUtils = require('./src/utils/queue');
const createPlayerUtils = require('./src/utils/player');
const createRepliesUtils = require('./src/utils/replies');
const createMatchesUtils = require('./src/utils/matches');
const createProfileUtils = require('./src/utils/profile');
const { createRolesUtils } = require('./src/utils/roles');
const { registerSchedulers } = require('./src/utils/scheduler');
const createInvitationService = require('./src/utils/invitationService');
const InvitationScheduler = require('./src/utils/invitationScheduler');
const createPerformanceOptimizer = require('./src/utils/performanceOptimizer');
const ImageGenerationManager = require('./src/utils/imageGenerationManager');
const { setBotNickname, startStatusTicker, setMaintenancePresence } = require('./src/utils/status');
const suggestionsUtils = createSuggestionsUtils({ Suggestion });
const invitationService = createInvitationService(Invitation, Player);
const { checkTikTokLive, getTikTokLiveStatus, ensureStreamerChannel, closeStreamerChannel } = require('./src/utils/tiktok');

// Inicializar utilidades de respuestas (ephemerales/temporales)
const repliesUtils = createRepliesUtils({});
const { safeReplyEphemeral, tempReply } = repliesUtils;

function getMatchDeps() {
  return {
    hasPermission,
    hasStrictStaff,
    config,
    safeReplyEphemeral,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ActiveMatch,
    matches,
    EmbedBuilder,
    client,
    sendLog,
    COLORS,
    RESTJSONErrorCodes,
    ChannelType,
    PermissionsBitField,
    applyMatchResults,
    updateAffectedNicknames,
    movePlayerToOriginalVoiceChannel,
    settings,
    moveSpectatorsToWaitingRoom,
    logMatchChatHistory,
    handleMatchCloseButton,
    cleanupMatchResources,
    handleMatchClosure,
    updateMatchManagementMessage,
    invalidateSeasonRankCache: rankingUtils.invalidateSeasonRankCache,
    invalidateGlobalRankCache: rankingUtils.invalidateGlobalRankCache,
    CLOSE_APPLY_ROLE_IDS,
    Player,
    ensurePlayerRecord,
    EMBED_DEFAULTS,
    BOT_OWNER_ID,
    excludedFromVoiceMove,
    excludedFromQueueRestriction,
  };
}

function getQueueDeps() {
  return {
    queues,
    Queue,
    hasPermission,
    MANAGE_ROLE,
    client,
    ActiveQueue,
    settings,
    resetQueueTimeout,
    setHardTimeout,
    getOrRestoreQueue,
    movePlayerToOriginalVoiceChannel,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    // Extras para menú de fila
    BOT_OWNER_ID,
    startingMatch,
    getNextMatchNumber,
    ActiveMatch,
    matches,
    EmbedBuilder,
    COLORS,
    EMBED_DEFAULTS,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField,
    SPECTATOR_ROLE_ID,
    config,
    checkVoiceChannelPermissions,
    ThreadAutoArchiveDuration,
    ChannelType,
    sendLog,
    safeReplyEphemeral,
    // Ranking en tiempo real para mostrar RANK en "Partida Iniciada"
    computeSeasonRanking: rankingUtils.computeSeasonRanking,
    getSeasonRankCache: rankingUtils.getSeasonRankCache,
    // Utilidades centralizadas de partidas
    createMatchObject: createMatchObjectUtil,
    movePlayersToMatchChannels: movePlayersToMatchChannelsUtil,
    // Dependencias adicionales para handlers de botones de fila
    ALLOWED_VOICE_CATEGORIES,
    WAITING_ROOM_VOICE_CHANNEL_ID,
    blacklistedUsers,
    ensurePlayerRecord,
    // NUEVO: mover jugadores a sala de espera al cerrar fila
    movePlayersToWaitingRoom,
    QUEUE_EMOJIS,
    excludedFromVoiceMove,
    excludedFromQueueRestriction,
    checkTikTokLive,
    getTikTokLiveStatus,
    ensureStreamerChannel,
    closeStreamerChannel,
    Player,
    voicePenaltyPoints: VOICE_PENALTY_POINTS,
    BOT_OWNER_ID,
    PermissionsBitField,
  };
}

/* ------------------ Constantes y Configuración Global ------------------ */
const EMBED_DEFAULTS = {
  color: 0xFF0000, // Rojo fuerte
  thumbnail:
    "https://cdn.discordapp.com/attachments/1548203413014319115/1548248123531591700/ROYALRANKED2banner-ezgif.com-optimize.gif?ex=6aa65ded&is=6aa50c6d&hm=e46fb34beff382baf8e425aeb6f835ccab9113ed0b3ffad821c7f891370f1837&",
  footer: { text: "ROYAL RANKED ⚡", iconURL: "https://cdn.discordapp.com/attachments/1548203413014319115/1548248123531591700/ROYALRANKED2banner-ezgif.com-optimize.gif?ex=6aa65ded&is=6aa50c6d&hm=e46fb34beff382baf8e425aeb6f835ccab9113ed0b3ffad821c7f891370f1837&" },
  logChannelId: null // Se cargará desde la DB
};

const COLORS = {
  SUCCESS: 0x57F287, // Verde
  ERROR: 0xED4245,   // Rojo
  WARNING: 0xFF0000, // Amarillo
  PRIMARY: 0xED4245,  // Rojo
  GOLD: 0xFF0000     // Dorado
};

const QUEUE_EMOJIS = Object.assign({
  team1Button: (config && config.emojis && config.emojis.blue_circle) || '🟣',
  team2Button: (config && config.emojis && config.emojis.red_circle) || '⚪',
  leaveButton: (config && config.emojis && config.emojis.cross_mark) || '✖️',
  wagerButton: (config && config.emojis && config.emojis.money) || '💰',
  slotFilled: (config && config.emojis && config.emojis.success) || '✅',
  slotEmpty: (config && config.emojis && config.emojis.blue_circle) || '🔘',
  team1Header: (config && config.emojis && config.emojis.blue_circle) || '🟣',
  team2Header: (config && config.emojis && config.emojis.red_circle) || '⚪',
  queueClosed: (config && config.emojis && config.emojis.error) || '❌',
  wagerHeader: (config && config.emojis && config.emojis.money) || '💰'
}, (config && config.queueEmojis) || {});

function resolveEmojiText(token) {
  try {
    if (!token) return '';
    if (typeof token === 'object') {
      const id = token.id;
      const cached = id ? client.emojis?.cache?.get(id) : null;
      const name = cached?.name || token.name || 'emoji';
      const animated = (cached?.animated ?? token.animated) ? true : false;
      return `<${animated ? 'a:' : ':'}${name}:${id}>`;
    }
    if (typeof token === 'string') {
      const m = token.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
      if (m) return token;
      if (/^\d+$/.test(token)) {
        const cached = client.emojis?.cache?.get(token);
        const name = cached?.name || 'emoji';
        const animated = cached?.animated ? true : false;
        return `<${animated ? 'a:' : ':'}${name}:${token}>`;
      }
      const foundByName = client.emojis?.cache?.find(e => e?.name === token);
      if (foundByName) return `<${foundByName.animated ? 'a:' : ':'}${foundByName.name}:${foundByName.id}>`;
      return token;
    }
    return '';
  } catch (_) {
    return '';
  }
}

function resolveEmojiTextForGuild(token, key, guild) {
  const FALLBACKS = {
    slotFilled: (config && config.emojis && config.emojis.success) || '✅',
    slotEmpty: (config && config.emojis && config.emojis.blue_circle) || '🔘',
    team1Header: (config && config.emojis && config.emojis.blue_circle) || '🔵',
    team2Header: (config && config.emojis && config.emojis.red_circle) || '🔴',
    wagerHeader: (config && config.emojis && config.emojis.money) || '💰'
  };
  try {
    if (!token) return FALLBACKS[key] || '';
    if (typeof token === 'object') {
      const id = token.id;
      const cached = id ? guild?.emojis?.cache?.get(id) : null;
      if (!cached) return FALLBACKS[key] || '';
      const name = cached.name || token.name || 'emoji';
      return `<${cached.animated ? 'a:' : ':'}${name}:${id}>`;
    }
    if (typeof token === 'string') {
      const m = token.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
      if (m) {
        const id = m[2];
        const cached = guild?.emojis?.cache?.get(id);
        return cached ? token : (FALLBACKS[key] || '');
      }
      if (/^\d+$/.test(token)) {
        const cached = guild?.emojis?.cache?.get(token);
        if (!cached) return FALLBACKS[key] || '';
        const name = cached.name || 'emoji';
        return `<${cached.animated ? 'a:' : ':'}${name}:${token}>`;
      }
      const foundByName = guild?.emojis?.cache?.find(e => e?.name === token);
      return foundByName ? `<${foundByName.animated ? 'a:' : ':'}${foundByName.name}:${foundByName.id}>` : (FALLBACKS[key] || token);
    }
    return FALLBACKS[key] || '';
  } catch (_) {
    return FALLBACKS[key] || '';
  }
}

let blacklistedUsers = new Map();
let excludedFromNickUpdate = new Set();
let excludedFromVoiceMove = new Set();
let excludedFromQueueRestriction = new Set();
let settings = {
  busyPlayers: new Set(), // OPTIMIZACIÓN: Set para O(1) lookup de jugadores ocupados.
  announcementsChannel: null,
  historyChannel: null,
  logChannelId: null,
  seasonSummaryChannelId: null,
  currentSeason: null,
  lastPrizedQueueTimestamp: 0 // NUEVO: Para controlar la fila premiada diaria
};

// Inicializar util de logs (migrado a src/utils/logger.js)
const logger = createLogger({ client, settingsRef: settings, ChannelType, AttachmentBuilder, EmbedBuilder, COLORS, config });
const { sendLog, logMatchChatHistory } = logger;

// OPTIMIZACIÓN: Creación de colas de tareas para operaciones intensivas
const nicknameUpdateQueue = new PQueue({ concurrency: 1 }); // Procesar actualizaciones de nicks de una en una para evitar race conditions
const imageGenerationQueue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 5 }); // OPTIMIZACIÓN: Aumentado de 2 a 3, con límite de 5 por segundo

/* ------------------ Utilidades de Base de Datos ------------------ */
// Migrado: connectToDatabase y loadInitialData ahora viven en src/utils/bootstrap.js
/**
 * NUEVA FUNCIÓN: Limpia proactivamente TODAS las partidas huérfanas de un servidor.
 * Se ejecuta antes de crear una nueva partida para asegurar que la numeración sea correcta.
 * @param {import('discord.js').Guild} guild El servidor a limpiar.
 */
// Limpieza proactiva de partidas huérfanas migrada a src/utils/matches.js
// Usar: matchesUtils.cleanupAllOrphanedMatches(guild)
async function loadActiveMatches() {
  const activeMatchesFromDB = await ActiveMatch.find({}).lean();
  if (activeMatchesFromDB.length > 0) {
    console.log(`[Recovery] Se encontraron ${activeMatchesFromDB.length} partidas en la base de datos. Verificando estado...`); // eslint-disable-line no-irregular-whitespace
    // SOLUCIÓN: Obtener el objeto guild completo desde el cliente para asegurar que tiene todas las propiedades.
    const mainGuild = client.guilds.cache.get(config.guildId || "1484375565908705414");
    if (!mainGuild) {
      console.error("[Recovery] No se pudo encontrar el servidor principal. Abortando recuperación.");
      return;
    }

    let cleanedCount = 0;
    const validMatches = new Map(); // Mapa temporal para evitar modificar `matches` mientras se itera

    for (const matchDoc of activeMatchesFromDB) { // eslint-disable-line no-irregular-whitespace
      const threadChannel = matchDoc.textChannelId ? mainGuild.channels.cache.get(matchDoc.textChannelId) || await mainGuild.channels.fetch(matchDoc.textChannelId).catch(() => null) : null;
      // SOLUCIÓN: Si el hilo está archivado, se considera una partida terminada y se limpia.
      if (threadChannel) {
        // NUEVA LÓGICA: Si el canal existe, verificar el estado del mensaje de control.
        const controlMessage = matchDoc.messageId && !threadChannel.archived ? await threadChannel.messages.fetch(matchDoc.messageId).catch(() => null) : null;

        // Una partida es huérfana si su mensaje de control no existe o si ya fue marcado como finalizado.
        let isFinished = false;
        if (controlMessage && controlMessage.embeds && controlMessage.embeds[0] && controlMessage.embeds[0].title) {
          try { isFinished = String(controlMessage.embeds[0].title).includes('Finalizada'); } catch (_) { isFinished = false; }
        }

        // También considerar finalizada si la DB dice que está cerrada (protección contra crashes durante cierre)
        if (matchDoc.closed) isFinished = true;

        if (!controlMessage || isFinished) {
          // RECOVERY: Verificar si hay apuestas pendientes de pago en partidas finalizadas
          if (isFinished && matchDoc.selectedWinner && matchDoc.bets && (matchDoc.bets.team1.length > 0 || matchDoc.bets.team2.length > 0) && !matchDoc.bets.paid) {
            console.log(`[Recovery] Partida finalizada pero con apuestas pendientes detectada: #${matchDoc.matchNumber}. Intentando procesar pagos...`);
            try {
              const { applyMatchResults } = getMatchDeps();
              // Preparar objeto match para applyMatchResults
              const recoveryMatch = { ...matchDoc };
              if (!(recoveryMatch.previousVoice instanceof Map)) {
                recoveryMatch.previousVoice = new Map(Object.entries(recoveryMatch.previousVoice || {}));
              }
              await applyMatchResults(mainGuild, recoveryMatch);
            } catch (errRecovery) {
              console.error(`[Recovery] Error al procesar pagos pendientes de partida #${matchDoc.matchNumber}:`, errRecovery);
            }
          }

          // La partida es HUÉRFANA porque ya terminó o su control se perdió. Limpieza completa.
          const reason = !controlMessage ? "mensaje de control no encontrado" : "ya finalizada";
          console.log(`[Recovery] Partida huérfana detectada (${reason}): #${matchDoc.matchNumber}. Limpiando...`); // eslint-disable-line no-irregular-whitespace
          await cleanupMatchResources(mainGuild, matchDoc, getMatchDeps());
          cleanedCount++;
        } else {
          // La partida es VÁLIDA. La cargamos en memoria.
          [...(matchDoc.team1 || []), ...(matchDoc.team2 || [])].forEach(id => settings.busyPlayers.add(id));

          const matchData = { ...matchDoc };
          matchData.previousVoice = matchDoc.previousVoice || {};

          // Convert rematchVotes back to Sets
          matchData.rematchVotes = {
            team1: new Set(matchDoc.rematchVotes?.team1 || []),
            team2: new Set(matchDoc.rematchVotes?.team2 || [])
          };

          validMatches.set(matchDoc._id, matchData);
        }
      } else {
        // La partida es HUÉRFANA porque el hilo fue borrado. Limpieza completa.
        console.log(`[Recovery] Partida huérfana detectada (hilo no encontrado): #${matchDoc.matchNumber}. Limpiando...`);
        await cleanupMatchResources(mainGuild, matchDoc, getMatchDeps());
        cleanedCount++;
      }
    }

    // Asignación final y correcta al mapa global de partidas.
    matches.clear();
    validMatches.forEach((value, key) => {
      matches.set(key, value);
    });
    console.log(`✅ Recuperación finalizada. Partidas activas: ${matches.size}. Partidas huérfanas limpiadas: ${cleanedCount}.`);
  }
}

async function loadActiveQueues() {
  const activeQueuesFromDB = await ActiveQueue.find({}).lean();

  // LOGGING: Verificar usuarios de TikTok vinculados en arranque
  const tiktokUsersCount = await Player.countDocuments({ tiktokUsername: { $ne: null, $exists: true } });
  console.log(`[Startup] ${tiktokUsersCount} usuarios tienen cuenta de TikTok vinculada.`);

  if (activeQueuesFromDB.length > 0) {
    console.log(`[Recovery] Se encontraron ${activeQueuesFromDB.length} filas activas en la base de datos. Reanudando...`);
    for (const queueDoc of activeQueuesFromDB) {
      const queue = new Queue(queueDoc.mode, queueDoc.creatorId, { username: queueDoc.creatorUsername, displayAvatarURL: () => queueDoc.creatorAvatarURL }, { guild: { id: queueDoc.guildId }, channel: { parentId: queueDoc.filaCategoryId } }, queueDoc.customName);
      Object.assign(queue, {
        ...queueDoc,
        prevVoice: queueDoc.prevVoice || {},
        kicked: new Set(queueDoc.kicked || [])
      });
      if (!queue.wager) queue.wager = { amount: 0, proposerId: null, accepted: new Set() };
      const docWager = queueDoc.wager || {};
      queue.wager.amount = docWager.amount || 0;
      queue.wager.accepted = new Set(Array.isArray(docWager.accepted) ? docWager.accepted : []);
      // Asegurar channelId válido: usar queueDoc.channelId o _id como fallback
      const channelId = queueDoc.channelId || queueDoc._id;

      // Validación: Verificar que el canal de voz aún existe
      const channelExists = await client.channels.fetch(channelId).catch(() => null);
      if (!channelExists) {
        console.warn(`[Recovery] Fila ${channelId} no tiene canal válido. Eliminando de DB...`);
        await ActiveQueue.findByIdAndDelete(queueDoc._id).catch(() => { });
        continue;
      }

      queue.channelId = channelId;

      [...(queue.team1 || []), ...(queue.team2 || [])].forEach(id => settings.busyPlayers.add(id));

      queues.set(channelId, queue);
      // Reanudar el temporizador de inactividad para cada fila recuperada
      resetQueueTimeout(channelId);
      // Programar también el límite duro respetando el tiempo transcurrido
      setHardTimeout(channelId);
    }
    console.log(`✅ Recuperación de filas finalizada. Filas activas: ${queues.size}.`);
  }
}

// [migrado] ensurePlayerRecord ahora proviene de src/utils/player.js
/**
 * NUEVA FUNCIÓN: Encuentra el número de partida más bajo que no esté en uso.
 * MODIFICADO: Ahora considera también el historial para evitar reutilizar números y romper idempotencia.
 * @param {string} guildId El ID del servidor.
 * @param {string} [currentMatchId] Opcional: El ID de la partida que está intentando obtener un número.
 * @returns {Promise<number>} El siguiente número de partida disponible.
 */
// Timestamp de la última limpieza proactiva — evita ejecutarla en cada inicio de partida
let _lastOrphanCleanupTs = 0;
const ORPHAN_CLEANUP_COOLDOWN_MS = 3 * 60 * 1000; // Máximo 1 vez cada 3 minutos

async function getNextMatchNumber(guildId, currentMatchId) {
  // 0. Limpieza proactiva con cooldown — solo corre si pasaron 3+ minutos desde la última vez.
  // Sin el cooldown, cada inicio de partida hacía 10-40 requests a Discord para verificar canales,
  // bloqueando el Event Loop y causando lag en !fila, !p, y todos los demás comandos.
  const now = Date.now();
  if (now - _lastOrphanCleanupTs > ORPHAN_CLEANUP_COOLDOWN_MS) {
    _lastOrphanCleanupTs = now; // Marcar inmediatamente para evitar ejecuciones paralelas
    try {
      const guildObj = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (guildObj && typeof matchesUtils !== 'undefined' && matchesUtils.cleanupAllOrphanedMatches) {
        await matchesUtils.cleanupAllOrphanedMatches(guildObj).catch(err => console.error(`[getNextMatchNumber] Error en limpieza proactiva:`, err));
      }
    } catch (err) {
      console.error(`[getNextMatchNumber] Error crítico en limpieza:`, err);
    }
  } else {
    const secsRemaining = Math.ceil((ORPHAN_CLEANUP_COOLDOWN_MS - (now - _lastOrphanCleanupTs)) / 1000);
    console.log(`[getNextMatchNumber] Limpieza proactiva en cooldown (${secsRemaining}s restantes). Saltando.`);
  }

  // 1. Obtener todos los números usados en PARTIDAS ACTIVAS (DB).
  // IMPORTANTE: NO filtrar por closed: false, para evitar reutilizar números de partidas que aún no terminan su cleanup.
  const activeMatches = await ActiveMatch.find({ guildId })
    .select('matchNumber matchId status _id')
    .lean();

  const usedNumbers = new Set();
  const creatingMatches = new Map(); // matchId -> match data

  activeMatches.forEach(m => {
    const id = m.matchId || m._id;
    if (m.matchNumber) {
      usedNumbers.add(m.matchNumber);
    } else if (m.status === 'creating' || !m.matchNumber) {
      creatingMatches.set(id, m);
    }
  });

  // 2. Considerar partidas en memoria
  matches.forEach(match => {
    if (match.guildId === guildId) {
      const id = match.matchId || match._id;
      if (match.matchNumber) {
        usedNumbers.add(match.matchNumber);
      } else if (match.status === 'creating' || !match.matchNumber) {
        creatingMatches.set(id, match);
      }
    }
  });

  // 3. Si no hay un matchId actual, simplemente devolvemos el primer hueco
  if (!currentMatchId) {
    let nextNum = 1;
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }
    return nextNum;
  }

  // 4. Determinar la posición del matchId actual entre todos los que están "creando"
  const sortedCreatingIds = Array.from(creatingMatches.keys()).filter(Boolean).sort();
  const myIndex = sortedCreatingIds.indexOf(currentMatchId);

  // Si por alguna razón no estamos en la lista (raro), nos añadimos al final
  const effectiveIndex = myIndex === -1 ? sortedCreatingIds.length : myIndex;

  // 5. Encontrar el n-ésimo hueco disponible (donde n = effectiveIndex)
  let foundHoles = 0;
  let candidateNum = 1;

  while (true) {
    if (!usedNumbers.has(candidateNum)) {
      if (foundHoles === effectiveIndex) {
        if (candidateNum > 20) {
          throw new Error('MAX_MATCHES_REACHED');
        }
        return candidateNum;
      }
      foundHoles++;
    }
    candidateNum++;
  }
}

/* ------------------ Ranking players (existing) ------------------ */
// computeSortedRankingArray migrada a src/utils/ranking.js (ya no se usa aquí)

/* ------------------ Tienda y StyleCoins ------------------ */

const SHOP_ITEMS = buildShopItems(config);

/* ------------------ Sistema de Ruleta ------------------ */

// ROULETTE_PRIZES ahora se importan desde './src/utils/roulette'

// ROULETTE_PROBABILITIES ahora se importan desde './src/utils/roulette'



// getDailyRanking removido — usar rankingUtils.getDailyRankingFromDB

// getDailyRankingFromDB migrado a src/utils/ranking.js — usar rankingUtils.getDailyRankingFromDB

// distributeDailyRewards migrado a src/utils/ranking.js — usar rankingUtils.distributeDailyRewards

// computeGlobalRanking wrapper removido — usar rankingUtils.computeGlobalRanking

/* ------------------ Nickname sync ------------------ */

// tryUpdateNicknameForMember ahora proviene de nickUtils (migrado)
/**
 * OPTIMIZACIÓN: Actualiza los apodos de manera más eficiente.
 * - Calcula el ranking global UNA SOLA VEZ.
 * - Usa `bulkWrite` para actualizar la base de datos en una sola operación.
 * @param {import('discord.js').Guild} guild - El servidor donde se ejecuta.
 */
// updateNicknamesEfficiently ahora proviene de nickUtils (migrado)

/* ------------------ Queues & Matches (existing) ------------------ */

const queues = new Map();
const matches = new Map();
const ALLOWED_MODES = ['1v1', '2v2', '3v3', '4v4', '5v5', 'filavv2'];
const creatingQueue = new Set(); // NUEVO: Para prevenir duplicados de filas por race conditions.
const startingMatch = new Set(); // NUEVO: Para prevenir duplicados de partidas

class Queue {
  constructor(mode, creatorId, creatorUser, message, customName = '') {
    this.mode = mode;
    // Asegurarse de que message.guild no sea undefined/null antes de acceder a .id
    if (!message || !message.guild) {
      throw new Error("Error al crear Queue: 'message' o 'message.guild' es undefined. Esto no debería ocurrir si el mensaje proviene de un servidor.");
    }
    this.guildId = message.guild.id; // Obtener guildId del objeto message
    this.customName = customName;
    const TEAM_SIZES = { '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4, '5v5': 5, 'filavv2': 6 };
    this.teamSize = TEAM_SIZES[mode] ?? (parseInt(mode.charAt(0), 10) || 2);
    this.creatorId = creatorId;
    this.team1 = [creatorId];
    this.team2 = [];
    this.creatorUsername = creatorUser.username;
    this.creatorAvatarURL = creatorUser.displayAvatarURL();
    this.messageId = null;
    this.channelId = message.channel.id;
    this.filaCategoryId = message.channel.parentId; // <-- AÑADIDO: Guardar la categoría de la fila // eslint-disable-line no-irregular-whitespace
    this.prevVoice = {}; // Almacena el canal de voz previo de los jugadores
    this.locked = false; // Estado para bloquear la fila
    this.timeout = null; // Para el temporizador de cierre automático de la fila
    this.kicked = new Set(); // NUEVO: Jugadores expulsados de esta fila (movido aquí)
    this.wager = { // <-- NUEVO: Sistema de Apuestas
      amount: 0,
      isPrized: false, // NUEVO: Para marcar si la fila es premiada
      proposerId: null,
      accepted: new Set() // IDs de usuarios que aceptaron
    };
  }
  maxPlayers() { return this.teamSize * 2; }
  hasUser(id) { return this.team1.includes(id) || this.team2.includes(id); }
  isFullTeam(t) { return (t === 1 ? this.team1.length : this.team2.length) >= this.teamSize; }
  addToTeam(t, id) {
    if (this.hasUser(id)) this.removeUser(id);
    if (this.isFullTeam(t)) return false;
    if (t === 1) this.team1.push(id); else this.team2.push(id);
    return true;
  }
  removeUser(id) {
    this.team1 = this.team1.filter(u => u !== id);
    this.team2 = this.team2.filter(u => u !== id);
    this.wager.accepted.delete(id); // Quitar de la lista de aceptados si sale
    if (this.prevVoice && this.prevVoice[id]) delete this.prevVoice[id];
  }
  async buildEmbed() {
    const guild = client.guilds.cache.get(this.guildId);
    if (!guild) return new EmbedBuilder().setTitle('Error').setDescription('No se pudo encontrar el servidor.');

    const allPlayerIds = [...this.team1, ...this.team2];
    const cachedRank = typeof rankingUtils.getSeasonRankCache === 'function' ? rankingUtils.getSeasonRankCache() : null;
    const rankMap = cachedRank || {};

    // Función auxiliar para obtener el tier badge de un jugador
    const getTierBadge = (rank, totalPlayers) => {
      const EMOJIS = config.emojis || {};
      if (!rank || rank > totalPlayers) return EMOJIS.badge || '🏅';
      const percentile = (rank / totalPlayers) * 100;
      if (rank === 1) return EMOJIS.crown || '👑';
      if (rank <= 3) return EMOJIS.diamond || '💎';
      if (percentile <= 5) return EMOJIS.diamond_blue || '💠';
      if (percentile <= 10) return EMOJIS.diamond || '💎';
      if (percentile <= 20) return EMOJIS.sparkles || '✨';
      if (percentile <= 35) return EMOJIS.medal || '⭐';
      if (percentile <= 50) return EMOJIS.medal || '🎖️';
      return EMOJIS.badge || '🏅';
    };

    // Obtener total de jugadores para cálculo de percentiles
    const totalPlayers = Object.keys(rankMap).length || 100;

    const formatTeam = async (team, teamSize) => {
      const items = [];
      for (let i = 0; i < teamSize; i++) {
        const playerId = team[i];
        if (playerId) {
          let tag, rank;
          const playerDoc = await ensurePlayerRecord(playerId);
          const displayName = playerDoc?.customName || `<@${playerId}>`;

          if (rankMap[playerId]) {
            rank = rankMap[playerId];
            tag = `RANK ${rank}`;
          } else {
            const pts = playerDoc?.currentSeason?.points || 0;
            tag = `${pts} pts`;
            rank = null;
          }
          // const tierBadge = rank ? getTierBadge(rank, totalPlayers) : '';
          const occupiedEmoji = resolveEmojiTextForGuild(QUEUE_EMOJIS.slotFilled, 'slotFilled', guild);
          items.push(`> ${occupiedEmoji} ${displayName} (${tag})`);
        } else {
          items.push(`> ${resolveEmojiTextForGuild(QUEUE_EMOJIS.slotEmpty, 'slotEmpty', guild)} Libre`);
        }
      }
      return items.join('\n');
    };

    // Calcular promedio de rank por equipo
    const calculateTeamAverage = (team) => {
      const ranks = team.map(pid => rankMap[pid]).filter(r => r);
      if (ranks.length === 0) return null;
      return Math.round(ranks.reduce((sum, r) => sum + r, 0) / ranks.length);
    };

    const team1Avg = calculateTeamAverage(this.team1);
    const team2Avg = calculateTeamAverage(this.team2);

    const team1List = await formatTeam(this.team1, this.teamSize);
    const team2List = await formatTeam(this.team2, this.teamSize);

    // Nombres de campos con promedio
    const team1Header = team1Avg
      ? `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team1Header, 'team1Header', guild)} Equipo 1 (${this.team1.length}/${this.teamSize}) | Promedio: RANK ${team1Avg}`
      : `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team1Header, 'team1Header', guild)} Equipo 1 (${this.team1.length}/${this.teamSize})`;

    const team2Header = team2Avg
      ? `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team2Header, 'team2Header', guild)} Equipo 2 (${this.team2.length}/${this.teamSize}) | Promedio: RANK ${team2Avg}`
      : `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team2Header, 'team2Header', guild)} Equipo 2 (${this.team2.length}/${this.teamSize})`;

    let title = this.customName && this.customName.trim().length > 0
      ? `${this.mode.toUpperCase()} | Fila: ${this.customName.trim()}`
      : `${this.mode.toUpperCase()} | ¡Fila de Desafío Creada!`;

    let description = "¡Bienvenido(a) a la fila de Desafío! Aquí se forman todos los equipos. En caso de que desees participar, utiliza los botones de abajo para realizar las acciones disponibles.";

    // --- NUEVO: Personalización para Streamer ---
    if (this.streamerName) {
      title = `${this.mode.toUpperCase()} | Fila: FILA DESAFIO DE ${this.streamerName.toUpperCase()}`;
      description = "¡Bienvenido(a) a la fila de Desafío! Aquí podras jugar contra el streamer en directo!.";
    }

    // Personalización según el canal (prioridad sobre streamer si es canal específico de PC/Móvil)
    if (this.channelId === '1468732266116157611') { // SOLO PC
      title = "🖥️ SOLO PC | ¡Fila de Desafío!";
      description = "¡Bienvenido(a) a la fila **exclusiva para PC**! Para unirte, es obligatorio tener el rol de PC. ¡Demuestra quién manda en el teclado y ratón!";
    } else if (this.channelId === '1468731929963528306') {
      title = "📱 SOLO MÓVIL | ¡Fila de Desafío!";
      description = "¡Bienvenido(a) a la fila **exclusiva para MÓVIL**! Para unirte, es obligatorio tener el rol de Móvil. ¡Que gane el mejor con los dedos más rápidos!";
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(title)
      .setDescription(description)
      .setImage(EMBED_DEFAULTS.thumbnail)
      .addFields(
        { name: team1Header, value: team1List || '> Vacío', inline: true },
        { name: team2Header, value: team2List || '> Vacío', inline: true }
      )
      .setFooter({ text: `Creada por ${this.creatorUsername}`, iconURL: this.creatorAvatarURL })
      .setTimestamp();



    // --- NUEVO: Añadir información de la apuesta si existe ---
    if (this.wager.amount > 0) {
      const acceptedList = this.wager.accepted.size > 0
        ? [...this.wager.accepted].map(id => `> • <@${id}>`).join('\n')
        : '> *Nadie ha aceptado aún.*';
      const wagerIcon = resolveEmojiTextForGuild(QUEUE_EMOJIS.wagerHeader || '💰', 'wagerHeader', guild);
      embed.addFields({
        name: `${wagerIcon} Apuesta Propuesta: ${this.wager.amount} puntos`,
        value: `**Aceptada por:**\n${acceptedList}`,
        inline: false
      });
    }

    return embed;
  }

  async buildLightEmbed() {
    let title = this.customName && this.customName.trim().length > 0
      ? `${this.mode.toUpperCase()} | Fila: ${this.customName.trim()}`
      : `${this.mode.toUpperCase()} | Fila creada`;

    let description = "¡Bienvenido(a) a la fila de Desafío! Aquí se forman todos los equipos. En caso de que desees participar, utiliza los botones de abajo para realizar las acciones disponibles.";

    // --- NUEVO: Personalización para Streamer ---
    if (this.streamerName) {
      title = `${this.mode.toUpperCase()} | Fila: FILA DESAFIO DE ${this.streamerName.toUpperCase()}`;
      description = "¡Bienvenido(a) a la fila de Desafío! Aquí podras jugar contra el streamer en directo!.";
    }

    const guild = client.guilds.cache.get(this.guildId);
    const cachedRank = typeof rankingUtils.getSeasonRankCache === 'function' ? rankingUtils.getSeasonRankCache() : null;
    const rankMap = cachedRank || {};

    // Función auxiliar para obtener el tier badge de un jugador
    const getTierBadge = (rank, totalPlayers) => {
      const EMOJIS = config.emojis || {};
      if (!rank || rank > totalPlayers) return EMOJIS.badge || '🏅';
      const percentile = (rank / totalPlayers) * 100;
      if (rank === 1) return EMOJIS.crown || '👑';
      if (rank <= 3) return EMOJIS.diamond || '💎';
      if (percentile <= 5) return EMOJIS.diamond_blue || '💠';
      if (percentile <= 10) return EMOJIS.diamond || '💎';
      if (percentile <= 20) return EMOJIS.sparkles || '✨';
      if (percentile <= 35) return EMOJIS.medal || '⭐';
      if (percentile <= 50) return EMOJIS.medal || '🎖️';
      return EMOJIS.badge || '🏅';
    };

    const totalPlayers = Object.keys(rankMap).length || 100;

    const formatTeam = async (team, teamSize) => {
      const lines = [];
      for (let i = 0; i < teamSize; i++) {
        const pid = team[i];
        if (pid) {
          let tag, rank;
          const playerDoc = await ensurePlayerRecord(pid);
          const displayName = playerDoc?.customName || `<@${pid}>`;

          if (rankMap[pid]) {
            rank = rankMap[pid];
            tag = `RANK ${rank}`;
          } else {
            const pts = playerDoc?.currentSeason?.points || 0;
            tag = `${pts} pts`;
            rank = null;
          }
          // const tierBadge = rank ? getTierBadge(rank, totalPlayers) : '';
          const occupiedEmoji = resolveEmojiTextForGuild(QUEUE_EMOJIS.slotFilled, 'slotFilled', guild);
          lines.push(`> ${occupiedEmoji} ${displayName} (${tag})`);
        } else {
          lines.push(`> ${resolveEmojiTextForGuild(QUEUE_EMOJIS.slotEmpty, 'slotEmpty', guild)} Libre`);
        }
      }
      return lines.join('\n');
    };

    // Calcular promedio de rank por equipo
    const calculateTeamAverage = (team) => {
      const ranks = team.map(pid => rankMap[pid]).filter(r => r);
      if (ranks.length === 0) return null;
      return Math.round(ranks.reduce((sum, r) => sum + r, 0) / ranks.length);
    };

    const team1Avg = calculateTeamAverage(this.team1);
    const team2Avg = calculateTeamAverage(this.team2);

    const team1List = await formatTeam(this.team1, this.teamSize);
    const team2List = await formatTeam(this.team2, this.teamSize);

    // Nombres de campos con promedio
    const team1Header = team1Avg
      ? `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team1Header, 'team1Header', guild)} Equipo 1 (${this.team1.length}/${this.teamSize}) | Promedio: RANK ${team1Avg}`
      : `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team1Header, 'team1Header', guild)} Equipo 1 (${this.team1.length}/${this.teamSize})`;

    const team2Header = team2Avg
      ? `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team2Header, 'team2Header', guild)} Equipo 2 (${this.team2.length}/${this.teamSize}) | Promedio: RANK ${team2Avg}`
      : `${resolveEmojiTextForGuild(QUEUE_EMOJIS.team2Header, 'team2Header', guild)} Equipo 2 (${this.team2.length}/${this.teamSize})`;

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(title)
      .setDescription('¡Bienvenido(a) a la fila de Desafío! Aquí se forman todos los equipos. En caso de que desees participar, utiliza los botones de abajo para realizar las acciones disponibles.')
      .setImage(EMBED_DEFAULTS.thumbnail)
      .addFields(
        { name: team1Header, value: team1List || '> Vacío', inline: true },
        { name: team2Header, value: team2List || '> Vacío', inline: true }
      )
      .setFooter({ text: `Creada por ${this.creatorUsername}`, iconURL: this.creatorAvatarURL })
      .setTimestamp();

    // Mostrar sección de apuesta si aplica
    if (this.wager.amount > 0) {
      const acceptedList = this.wager.accepted.size > 0
        ? [...this.wager.accepted].map(id => `> • <@${id}>`).join('\n')
        : '> *Nadie ha aceptado aún.*';
      const wagerIcon = resolveEmojiTextForGuild(QUEUE_EMOJIS.wagerHeader || '💰', 'wagerHeader', guild);
      embed.addFields({
        name: `${wagerIcon} Apuesta Propuesta: ${this.wager.amount} puntos`,
        value: `**Aceptada por:**\n${acceptedList}`,
        inline: false,
      });
    }

    return embed;
  }
}

/* ------------------ Aplicar resultados (existing) ------------------ */

const WIN_POINTS = Number(config.winPoints || 200);
const LOSE_POINTS = Number(config.losePoints || 200);
const MVP_POINTS = Number(config.mvpPoints || 80);
const CREATOR_POINTS = Number(config.creatorPoints || 80);
const SPECIAL_ROLES = config.specialRoles || {};
const ROLE_PUNTOS_X2 = SPECIAL_ROLES.puntosX2 || null;
const ROLE_PROTECCION = SPECIAL_ROLES.proteccion || null;
const CHAMPION_ROLES = config.championRoles || {};
const MANAGE_ROLE = Array.isArray(config.manageRole) ? config.manageRole : (config.manageRole ? [config.manageRole] : []);
const HOT_STREAK_ROLE_ID = SPECIAL_ROLES.hotStreakRole || null;
const ALLOWED_ROLES = Array.isArray(config.allowedRoles) ? config.allowedRoles : [];
const ROLE_1V1 = Array.isArray(config.role1v1) ? config.role1v1 : []; // <-- Esta línea ya existe, la dejo para contexto
const ROLE_2V2 = Array.isArray(config.role2v2) ? config.role2v2 : [];
const QUEUE_CATEGORIES = config.queueCategories || {}; // { [filaCategoryId]: partidaCategoryId }
const SPECTATOR_ROLE_ID = config.spectatorRoleId || null;
const STAFF_ROLE_IDS = Array.isArray(config.staffRoleId) ? config.staffRoleId : [];
const ALLOWED_VOICE_CATEGORIES = Array.isArray(config.allowedVoiceCategories) ? config.allowedVoiceCategories : [];
const WAITING_ROOM_VOICE_CHANNEL_ID = config.waitingRoomVoiceChannelId || null;
const VOICE_PENALTY_POINTS = Number(config.voicePenaltyPoints || 10000);
const QUEUE_TIMEOUT_MINUTES = config.queueTimeoutMinutes || 10; // Default a 10 minutos si no está en config.json
const queueUtils = createQueueUtils({
  queues,
  ActiveQueue,
  Queue,
  client, QUEUE_TIMEOUT_MINUTES, COLORS, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, EmbedBuilder, ComponentType, settings, movePlayerToOriginalVoiceChannel, sendLog, QUEUE_EMOJIS
});
const { resetQueueTimeout, handleQueueTimeout, setHardTimeout, handleQueueHardTimeout, getOrRestoreQueue } = queueUtils;
const BOT_OWNER_ID = config.botOwnerId || '1391505274556387338';

const permissionsUtils = createPermissionsUtils({ BOT_OWNER_ID, PermissionsBitField, MANAGE_ROLE, STAFF_ROLE_IDS });
const { hasPermission, hasStrictStaff } = permissionsUtils;
const CLOSE_APPLY_ROLE_IDS = [
  ...(config.manageRole || []),
  ...(config.staffRoleId || []),
  "1484375565975617595", // Admin (fallback)
  "1484375565975617594", // Moderador (fallback)
];

/**
 * Actualiza los apodos solo de los jugadores afectados por una partida.
 * Es mucho más rápido que recalcular todo el ranking.
 * @param {import('discord.js').Guild} guild
 * @param {string[]} playerIds - IDs de los jugadores en la partida.
 */
// Migrado: updateAffectedNicknames ahora proviene de nickUtils (src/utils/nicknames.js)

// Migrado: moveSpectatorsToWaitingRoom ahora vive en src/utils/matches.js y se importa desde createMatchesUtils.

// Migrado: applyMatchResults ahora vive en src/utils/matches.js y se importa desde createMatchesUtils.


/* ------------------ Respuestas ephemerales / temporales (migrado) ------------------ */

// Migrado: safeReplyEphemeral y tempReply ahora provienen de src/utils/replies.js

let rankingCache = {
  data: null,
  globalRankMap: null,
  globalRankMapTimestamp: 0,
  timestamp: 0
};

// NUEVO: Inicializar sistema de invalidación inteligente de caché
const cacheInvalidator = createCacheInvalidator();

// NUEVO: Inicializar optimizaciones de rendimiento
const performanceOptimizer = createPerformanceOptimizer();

// NUEVO: Inicializar manager de generación de imágenes con worker threads
const imageGenerationManager = new ImageGenerationManager(Math.max(2, require('os').cpus().length - 1));
imageGenerationManager.initialize();

const createRankingUtils = require('./src/utils/ranking');
const rankingUtils = createRankingUtils({ Player, COLORS, EMBED_DEFAULTS, config, client, rankingCache, settings, Setting, cacheInvalidator });
// NUEVO: Inicializar los listeners de invalidación para que el ranking se actualice en tiempo real tras las partidas
if (rankingUtils.setupCacheInvalidationListeners) rankingUtils.setupCacheInvalidationListeners();
// Inicializar utilidades de nicknames (inyectar dependencias)
const nickUtils = createNickUtils({ Player, rankingUtils, RESTJSONErrorCodes, client, excludedFromNickUpdate });
const { tryUpdateNicknameForMember, updateNicknamesEfficiently, updateAffectedNicknames } = nickUtils;
// Inicializar utilidades de ruleta (depende de updateNicknamesEfficiently)
const rouletteUtils = createRouletteUtils({ Player, config, EmbedBuilder, sendLog, COLORS, updateNicknamesEfficiently, updateAffectedNicknames });
const { deliverPrize } = rouletteUtils;

// Inicializar utilidades de jugador (ensurePlayerRecord) + invalidación de caché
const playerUtils = createPlayerUtils({ Player });
const { ensurePlayerRecord, invalidatePlayerCache } = playerUtils;

const profileUtils = createProfileUtils({
  Player,
  MatchHistory,
  ensurePlayerRecord,
  rankingUtils,
  client,
  createCanvas,
  loadImage,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  cardBackground,
  settings,
  ROLE_PUNTOS_X2,
  ROLE_PROTECCION,
  imageGenerationManager, // NUEVO: Pasar image generation manager
  config, // PASAR CONFIG PARA EMOJIS GLOBALES
});
const { buildPlayerCard: buildPlayerCardUtil } = profileUtils;

// Inicializar utilidades de roles temporales ANTES de inyectarlas en matches
const rolesUtils = createRolesUtils({ client, config, Player, MatchHistory, settings });
const { removeTemporaryRole, cleanupExpiredRolesFromJSON, updateChampionRoles } = rolesUtils;

const matchesUtils = createMatchesUtils({
  Player,
  MatchHistory,
  HeadToHead,
  ActiveMatch,
  EmbedBuilder,
  COLORS,
  EMBED_DEFAULTS,
  settings,
  config,
  WIN_POINTS,
  LOSE_POINTS,
  MVP_POINTS,
  CREATOR_POINTS,
  ROLE_PUNTOS_X2,
  ROLE_PROTECCION,
  WAITING_ROOM_VOICE_CHANNEL_ID,
  ChannelType,
  PermissionsBitField,
  sendLog,
  movePlayerToOriginalVoiceChannel,
  ensurePlayerRecord,
  // Nueva inyección: para limpieza de partidas huérfanas
  matches,
  cleanupMatchResources,
  getMatchDeps,
  updateChampionRoles,
  championRoles: CHAMPION_ROLES,
  excludedFromVoiceMove,
  cacheInvalidator, // NUEVO: Inyectar sistema de invalidación inteligente
  performanceOptimizer, // NUEVO: Inyectar optimizador de performance
  updateAffectedNicknames, // NUEVO: Para actualizar apodos post-partida
});
const { moveSpectatorsToWaitingRoom, movePlayersToWaitingRoom, applyMatchResults, createMatchObject: createMatchObjectUtil, movePlayersToMatchChannels: movePlayersToMatchChannelsUtil, cleanupAllOrphanedMatches, reconcileMatchNotifications } = matchesUtils;


/* ------------------ Lógica de Fila y Timeout ------------------ */

// [migrado] resetQueueTimeout ahora proviene de src/utils/queue.js

/* ------------------ Mensajes y comandos (messageCreate) ------------------ */

// Guardia simple para evitar ejecución duplicada de comandos si el evento se dispara dos veces
const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGE_IDS = 1000; // OPTIMIZACIÓN: Limitar tamaño del Set

client.on('messageCreate', (message) => {
  if (processedMessageIds.has(message.id)) return;
  processedMessageIds.add(message.id);
  // OPTIMIZACIÓN: Limpiar Set cuando crece demasiado
  if (processedMessageIds.size > MAX_PROCESSED_MESSAGE_IDS) {
    const toDelete = Array.from(processedMessageIds).slice(0, 500);
    toDelete.forEach(id => processedMessageIds.delete(id));
  }
  // Limpiar el ID después de un breve periodo para no crecer indefinidamente
  setTimeout(() => processedMessageIds.delete(message.id), 30000);

  return onMessageCreate(message, {
    Player,
    COLORS,
    matches,
    ALLOWED_VOICE_CATEGORIES,
    WAITING_ROOM_VOICE_CHANNEL_ID,
    blacklistedUsers,
    BOT_OWNER_ID,
    hasPermission,
    ActiveMatch,
    updateMatchManagementMessage,
    getMatchDeps,
    config,
    QUEUE_CATEGORIES,
    creatingQueue,
    ALLOWED_MODES,
    ALLOWED_ROLES,
    MANAGE_ROLE,
    PermissionsBitField,
    settings,
    queues,
    Queue,
    QUEUE_TIMEOUT_MINUTES,
    handleQueueTimeout,
    handleQueueHardTimeout,
    sendLog,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EMBED_DEFAULTS,
    ActiveQueue,
    ensurePlayerRecord,
    ROLE_2V2,
    ROLE_1V1,
    client,
    imageGenerationQueue,
    buildPlayerCard: buildPlayerCardUtil,
    SHOP_ITEMS,
    ROULETTE_PRIZES,
    ROULETTE_PROBABILITIES,
    deliverPrize,
    rankingUtils,
    nicknameUpdateQueue,
    updateNicknamesEfficiently,
    updateAffectedNicknames,
    parseDuration,
    Excluded,
    excludedFromNickUpdate,
    excludedFromVoiceMove,
    excludedFromQueueRestriction,
    removeTemporaryRole,
    Setting,
    generateSeasonSummaryEmbed,
    MatchHistory,
    Blacklist,
    tryUpdateNicknameForMember,
    cleanupAllOrphanedMatches,
    loadActiveMatches,
    startingMatch,
    commands,
    setMaintenancePresence,
    // Sugerencias
    suggestionsUtils,
    QUEUE_EMOJIS,
    ActiveTempVoice,
    invitationService,
    checkTikTokLive,
    getTikTokLiveStatus,
    ensureStreamerChannel,
    closeStreamerChannel,
    Clip,
    VipKey,
    StreamerChannel,
    updateServerStats,
    updateChampionRoles,
    CHAMPION_ROLES,
  });
});

/* ------------------ Lógica de Ranking (Reutilizable) ------------------ */

// getRanking wrapper removido — usar rankingUtils.getRanking

// renderRanking wrapper removido — usar rankingUtils.renderRanking

/* ------------------ Lógica de comandos reutilizable ------------------ */



// Migración: usar logger.sendLog; ver src/utils/logger.js
// Migración: usar logger.logMatchChatHistory; ver src/utils/logger.js

/**
 * NUEVA FUNCIÓN: Verifica si el bot tiene los permisos necesarios en un canal de voz.
 * @param {import('discord.js').VoiceChannel} channel - El canal de voz a verificar.
 * @param {import('discord.js').GuildMember} botMember - El miembro del bot en el servidor.
 * @returns {{hasPermission: boolean, missing: string[]}} - Si tiene permisos y cuáles faltan.
 */
// [migrado] checkVoiceChannelPermissions ahora se importa desde src/utils/voice.js


/* ------------------ INTERACTIONS (botones / selects) ------------------ */
// Guardia simple para evitar manejo duplicado de la misma interacción
const processedInteractionIds = new Set();
const MAX_PROCESSED_INTERACTION_IDS = 1000; // OPTIMIZACIÓN: Limitar tamaño del Set

client.on('interactionCreate', (interaction) => {
  if (processedInteractionIds.has(interaction.id)) return;
  processedInteractionIds.add(interaction.id);
  // OPTIMIZACIÓN: Limpiar Set cuando crece demasiado
  if (processedInteractionIds.size > MAX_PROCESSED_INTERACTION_IDS) {
    const toDelete = Array.from(processedInteractionIds).slice(0, 500);
    toDelete.forEach(id => processedInteractionIds.delete(id));
  }
  setTimeout(() => processedInteractionIds.delete(interaction.id), 30000);

  return onInteractionCreate(interaction, {
    blacklistedUsers,
    BOT_OWNER_ID,
    settings,
    safeReplyEphemeral,
    client,
    deliverPrize,
    ROULETTE_PRIZES,
    ROULETTE_PROBABILITIES,
    buildPlayerCard: buildPlayerCardUtil,
    buildSeasonStatsCard,
    handleMatchHistoryCommand,
    MatchHistory,
    EmbedBuilder,
    AttachmentBuilder,
    COLORS,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    queues,
    ActiveQueue,
    Queue,
    resetQueueTimeout,
    getOrRestoreQueue,
    getQueueDeps,
    handleQueueJoinButton,
    handleQueueWagerAccept,
    handleQueueWagerCancel,
    handleQueueLeaveButton,
    MANAGE_ROLE,
    PermissionsBitField,
    matches,
    handleMatchClosure,
    handleMatchManagementSelection,
    ActiveMatch,
    handleMatchResponseSelection,
    handleQueueKickSelect,
    handleQueueMenuSelection,
    handleWagerModalSubmit,
    sendLog,
    handleAutoroleSelection,
    Player,
    ensurePlayerRecord,
    invalidatePlayerCache,
    removeTemporaryRole,
    CLOSE_APPLY_ROLE_IDS,
    getMatchDeps,
    invitationService,
    checkTikTokLive,
    getTikTokLiveStatus,
    ensureStreamerChannel,
    closeStreamerChannel,
    Clip,
    ActiveTempVoice,
    ChannelType,
    config,
    StreamerChannel,
    handleStreamerMenuSelection,
    handleStreamerModalSubmit,
    handleReqCargosSelection,
    Setting,
  });

});

client.on('guildMemberAdd', (member) => onGuildMemberAdd(member, {
  ensurePlayerRecord,
  rankingCache,
  computeGlobalRanking: rankingUtils.computeGlobalRanking,
  tryUpdateNicknameForMember,
  Setting,
  sendLog,
  EmbedBuilder,
  COLORS,
  updateServerStats,
}));


client.on('guildMemberRemove', (member) => onGuildMemberRemove(member, { Player, Setting, updateServerStats }));


client.on('guildMemberUpdate', (oldMember, newMember) => onGuildMemberUpdate(oldMember, newMember, { sendLog, COLORS, EmbedBuilder, client }));

client.on('voiceStateUpdate', (oldState, newState) => onVoiceStateUpdate(oldState, newState, { Player, matches, ALLOWED_VOICE_CATEGORIES, WAITING_ROOM_VOICE_CHANNEL_ID, settings, voicePenaltyPoints: VOICE_PENALTY_POINTS, BOT_OWNER_ID, excludedFromQueueRestriction, excludedFromVoiceMove, sendLog, EmbedBuilder, COLORS }));

client.on('channelDelete', (channel) => onChannelDelete(channel, { queues, settings, ActiveQueue, StreamerChannel }));

client.on('error', onClientError);

// Manejador modularizado: ver src/events/ready.js (onReady)

// Roles utilities moved to src/utils/roles.js and are initialized via createRolesUtils above.
async function startTournament(guild, tournamentId) {
}

// OPTIMIZACIÓN: Esta función ahora usa el sistema de caché de getRanking.
// [migrado] buildPlayerCard ahora proviene de src/utils/profile.js (buildPlayerCardUtil)

async function generateSeasonSummaryEmbed(guild, endedSeasonName) {
  const playersWithSeasonStats = (await Player.find({ 'pastSeasons.name': endedSeasonName }).lean())
    .map(data => {
      const seasonData = data.pastSeasons?.find(s => s.name === endedSeasonName);
      if (!seasonData || ((seasonData.wins || 0) + (seasonData.losses || 0)) < 1) {
        return null; // Si no hay datos de temporada o no jugó, se ignora.
      }
      const played = (seasonData.wins || 0) + (seasonData.losses || 0);
      return {
        id: data._id,
        points: seasonData.points || 0,
        wins: seasonData.wins || 0,
        losses: seasonData.losses || 0,
        mvps: seasonData.mvps || 0,
        played,
        winrate: played > 0 ? ((seasonData.wins / played) * 100) : 0,
      };
    })
    .filter(Boolean);

  const getTop5 = (metric, format) => {
    return playersWithSeasonStats
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 5)
      .map((p, i) => `**${i + 1}.** <@${p.id}> - ${format(p)}`)
      .join('\n') || 'N/A';
  };

  const topPoints = getTop5('points', p => `**${p.points}** Puntos`);
  const topWins = getTop5('wins', p => `**${p.wins}** Victorias`);
  const topMvps = getTop5('mvps', p => `**${p.mvps}** MVPs`);
  const topWinrate = getTop5('winrate', p => `**${p.winrate.toFixed(1)}%** WR (${p.played} jugadas)`);

  const summaryEmbed = new EmbedBuilder()
    .setTitle(`🏆 Resumen Final de la Temporada: ${endedSeasonName} 🏆`) // eslint-disable-line no-irregular-whitespace
    .setDescription('¡Felicidades a los mejores jugadores de la temporada! Aquí están los resultados finales.')
    .setColor(COLORS.GOLD)
    .setImage(EMBED_DEFAULTS.thumbnail)
    .addFields(
      { name: '🏅 Top 5 - Puntos', value: topPoints, inline: false },
      { name: '✅ Top 5 - Victorias', value: topWins, inline: false },
      { name: '⭐ Top 5 - MVPs', value: topMvps, inline: false },
      { name: '📈 Top 5 - Tasa de Victorias (WR)', value: topWinrate, inline: false }
    )
    .setFooter({ text: "¡Prepárense para la nueva temporada!", iconURL: EMBED_DEFAULTS.footer.iconURL })
    .setTimestamp();

  return summaryEmbed;
}

async function buildSeasonStatsCard(targetUser) {
  if (!settings.currentSeason) return null;

  const seasonRecord = (await Player.findById(targetUser.id).select('currentSeason').lean())?.currentSeason;
  if (!seasonRecord) return null;

  const matchesPlayed = (seasonRecord.wins || 0) + (seasonRecord.losses || 0);
  if (matchesPlayed === 0) return null; // eslint-disable-line no-irregular-whitespace

  const winrate = ((seasonRecord.wins / matchesPlayed) * 100).toFixed(1);

  const seasonRanking = (await Player.find({}).select('currentSeason.points').lean())
    .map(data => ({ id: data._id, points: data.currentSeason?.points || 0 }))
    .sort((a, b) => b.points - a.points);
  const seasonPos = seasonRanking.findIndex(p => p.id === targetUser.id) + 1 || 'N/A';

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setAuthor({ name: `Stats de Temporada: ${settings.currentSeason}`, iconURL: targetUser.displayAvatarURL() })
    .setThumbnail(targetUser.displayAvatarURL()) // eslint-disable-line no-irregular-whitespace
    .addFields(
      { name: '🏆 Rank de Temporada', value: `\`#${seasonPos}\``, inline: true },
      { name: '✨ Puntos de Temporada', value: `\`${seasonRecord.points || 0}\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: true }, // Espaciador
      { name: '✅ Victorias', value: `\`${seasonRecord.wins || 0}\``, inline: true },
      { name: '❌ Derrotas', value: `\`${seasonRecord.losses || 0}\``, inline: true },
      { name: '🎮 Partidas Jugadas', value: `\`${matchesPlayed}\``, inline: true },
      { name: '📈 Winrate de Temporada', value: `\`${winrate}%\``, inline: true },
      { name: '⭐ MVPs de Temporada', value: `\`${seasonRecord.mvps || 0}\``, inline: true }
    )
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  return embed;
}

// [migrado] handleQueueTimeout ahora proviene de src/utils/queue.js

// [migrado] movePlayerToOriginalVoiceChannel ahora se importa desde src/utils/voice.js

// [migrado] createMatchObject ahora proviene de src/utils/matches.js

// [migrado] movePlayersToMatchChannels ahora proviene de src/utils/matches.js

/**
 * Maneja la selección del nuevo menú de gestión de partidas.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
// Manejador modularizado: ver src/interactions/matchManagement.js (handleMatchManagementSelection)

/**
 * Maneja la selección del menú de respuesta (creador, mvp, ganador).
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
// Manejador modularizado: ver src/interactions/matchManagement.js (handleMatchResponseSelection)

/**
 * Centraliza la lógica para limpiar los recursos de una partida (canales de voz y texto).
 * @param {import('discord.js').Guild} guild El servidor.
 * @param {object} matchDoc El documento de la partida desde la DB.
 */
// Manejador modularizado: ver src/interactions/matchClosure.js (cleanupMatchResources)

/**
 * Maneja la lógica de los botones de cierre de partida.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {boolean} isStaffClose
*/
// Manejador modularizado: ver src/interactions/matchClosure.js (handleMatchCloseButton)

/**
 * NUEVA FUNCIÓN CENTRALIZADA: Maneja todo el proceso de cierre de una partida.
 * Es independiente de la interacción y puede ser llamada desde cualquier parte del código.
 * @param {object} matchObj El objeto de la partida.
 * @param {boolean} isCancellation Si es una anulación (no se aplican puntos).
 * @param {string} [staffId] El ID del staff que anula la partida (opcional).
 */
// Manejador modularizado: ver src/interactions/matchClosure.js (handleMatchClosure)

// Migrado: deliverPrize ahora proviene de rouletteUtils (src/utils/roulette.js)

/**
 * Actualiza el mensaje de gestión de partida con la información más reciente.
 * @param {import('discord.js').Guild} guild
 * @param {object} matchObj
 * @param {object} updatePayload - Los campos a actualizar en la DB.
 */
// Manejador modularizado: ver src/interactions/matchManagement.js (updateMatchManagementMessage)

// Cron jobs centralizados: ver src/utils/scheduler.js (registerSchedulers)

(async () => {
  const bootstrapUtils = createBootstrapUtils({ mongoose, config, Blacklist, Excluded, Setting, EMBED_DEFAULTS });
  await bootstrapUtils.connectToDatabase();
  const init = await bootstrapUtils.loadInitialData();
  // Aplicar resultados iniciales
  blacklistedUsers = init.blacklistedUsersMap;
  // Mantener la misma referencia del Set para que nickUtils/scheduler respeten los exentos
  excludedFromNickUpdate.clear();
  for (const id of init.excludedSet) excludedFromNickUpdate.add(id);
  excludedFromVoiceMove.clear();
  for (const id of init.excludedFromVoiceMoveSet) excludedFromVoiceMove.add(id);
  // NEW: Initialize Queue Restriction Exemption Set
  excludedFromQueueRestriction.clear();
  for (const id of init.excludedFromQueueRestrictionSet) excludedFromQueueRestriction.add(id);
  Object.assign(settings, init.settingsPatch);

  const onReady = require('./src/events/ready');
  client.once('clientReady', () => {
    // Configurar listeners de invalidación inteligente de caché
    rankingUtils.setupCacheInvalidationListeners();

    // Inicializar scheduler de invitaciones
    const invitationScheduler = new InvitationScheduler(client);
    invitationScheduler.start();

    onReady(client, {
      loadActiveQueues,
      loadActiveMatches,
      reconcileMatchNotifications,
      nicknameUpdateQueue,
      updateNicknamesEfficiently,
      registerSchedulers,
      checkTikTokLive,
      Player,
      ActiveTempVoice,
      removeTemporaryRole,
      rankingUtils,
      mainGuildId: config.guildId || "1484375565908705414",

      timezone: "America/Bogota",
      settings,
      COLORS,
      EMBED_DEFAULTS,
      setBotNickname,
      startStatusTicker,
      setMaintenancePresence,
      ActivityType,
      cleanupExpiredRolesFromJSON,
      matches, // PASSED: Mapa de partidas activas para sync de voz
      ALLOWED_VOICE_CATEGORIES, // PASSED: Categorías permitidas para sync de voz
      WAITING_ROOM_VOICE_CHANNEL_ID, // PASSED: Canal de espera para sync de voz
      updateChampionRoles,
      CHAMPION_ROLES,
      sendLog,
      updateServerStats,
      Setting,

    });
  }); // Usar 'once' para que solo se ejecute la primera vez que esté listo.
  // ==================== GLOBAL ERROR HANDLERS ====================
  // CRITICAL: These handlers prevent the bot from crashing on unhandled errors
  process.on('unhandledRejection', (reason, promise) => {
    console.error('\n========== ⚠️ UNHANDLED REJECTION ==========');
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    if (reason instanceof Error) {
      console.error('Stack:', reason.stack);
    }
    console.error('==========================================\n');

    // Send to error channel if client is ready
    if (client.isReady()) {
      try {
        const loggerUtils = createLogger({ client, settingsRef: settings });
        const errChannel = loggerUtils.resolveLogChannelId('errors');
        if (errChannel) {
          const ch = client.channels.cache.get(errChannel);
          if (ch && ch.isTextBased()) {
            const errorMsg = reason instanceof Error ? reason.stack : String(reason);
            ch.send(`⚠️ **Unhandled Rejection**\n\`\`\`js\n${errorMsg.substring(0, 1900)}\n\`\`\``).catch(() => { });
          }
        }
      } catch (logErr) {
        console.error('Error logging to Discord:', logErr);
      }
    }
    // DO NOT EXIT - Let the bot continue running
  });

  process.on('uncaughtException', (err) => {
    console.error('\n========== 🔥 UNCAUGHT EXCEPTION ==========');
    console.error('Error:', err);
    console.error('Stack:', err.stack);
    console.error('==========================================\n');

    if (client.isReady()) {
      try {
        const loggerUtils = createLogger({ client, settingsRef: settings });
        const errChannel = loggerUtils.resolveLogChannelId('errors');
        if (errChannel) {
          const ch = client.channels.cache.get(errChannel);
          if (ch && ch.isTextBased()) {
            ch.send(`🔥 **Uncaught Exception**\n\`\`\`js\n${err.stack.substring(0, 1900)}\n\`\`\``).catch(() => { });
          }
        }
      } catch (logErr) {
        console.error('Error logging to Discord:', logErr);
      }
    }

    // CRITICAL: DO NOT EXIT - This prevents the bot from crashing
    // The default behavior of uncaughtException is to exit the process
    // By handling it here, we keep the bot running
    console.log('Bot continues running despite uncaught exception...');
  });

  // Handle Discord client errors
  client.on('error', (error) => {
    const isTimeout = error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message?.includes('Connect Timeout');
    console.error(`\n========== ⚠️ DISCORD CLIENT ERROR (${isTimeout ? 'TIMEOUT' : 'GENERAL'}) ==========`);
    console.error('Error:', error);
    if (error.stack) console.error('Stack:', error.stack);
    console.error('==========================================\n');

    // Si es un error de timeout recurrente, loggeamos una advertencia extra
    if (isTimeout) {
      console.warn('⚠️ Se detectó un tiempo de espera agotado al conectar con Discord. La red podría estar inestable.');
    }
  });

  const express = require('express');
  const cors = require('cors');
  const app = express();
  const PORT = process.env.API_PORT || process.env.PORT || 7011;

  app.use(cors());
  app.use(express.json());

  app.get('/api/status', (req, res) => {
    try {
      const status = {
        uptime: client.uptime,
        ping: client.ws.ping,
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        mongo: mongoose.connection.readyState,
        timestamp: Date.now()
      };
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'Error getting status' });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const totalPlayers = await Player.countDocuments();
      const totalMatches = await MatchHistory.countDocuments();
      const players = await Player.find({}).lean();
      const totalWins = players.reduce((sum, p) => sum + (p.wins || 0), 0);
      const totalMVPs = players.reduce((sum, p) => sum + (p.mvps || 0), 0);
      const totalPoints = players.reduce((sum, p) => sum + (p.currentSeason?.points || 0), 0);

      let totalVoiceSeconds = 0;
      let activeVoiceSeconds = 0;
      const now = Date.now();

      for (const p of players) {
        if (p.voiceTime && typeof p.voiceTime.totalSeconds === 'number') {
          totalVoiceSeconds += p.voiceTime.totalSeconds;
        }
        if (p.voiceTime && p.voiceTime.currentSession) {
          const start = new Date(p.voiceTime.currentSession).getTime();
          if (!Number.isNaN(start) && start <= now) {
            activeVoiceSeconds += Math.floor((now - start) / 1000);
          }
        }
      }

      const seasonSetting = await Setting.findById('currentSeason');
      const currentSeason = seasonSetting?.value || 'Temporada 1';

      const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

      let activePlayers = 0;
      if (settings.busyPlayers && settings.busyPlayers.size > 0) {
        activePlayers = settings.busyPlayers.size;
      } else {
        const activeMatches = await ActiveMatch.find({}).select('team1 team2').lean();
        const activeQueues = await ActiveQueue.find({}).select('team1 team2').lean();

        const activeIds = new Set();
        for (const m of activeMatches) {
          if (Array.isArray(m.team1)) m.team1.forEach(id => activeIds.add(id));
          if (Array.isArray(m.team2)) m.team2.forEach(id => activeIds.add(id));
        }
        for (const q of activeQueues) {
          if (Array.isArray(q.team1)) q.team1.forEach(id => activeIds.add(id));
          if (Array.isArray(q.team2)) q.team2.forEach(id => activeIds.add(id));
        }

        if (activeIds.size > 0) {
          activePlayers = activeIds.size;
        } else {
          activePlayers = players.filter(p => {
            const lastPlayed = p.dailyStats && p.dailyStats.lastPlayed;
            return typeof lastPlayed === 'number' && (now - lastPlayed) <= ACTIVE_WINDOW_MS;
          }).length;
        }
      }

      if (totalVoiceSeconds === 0 && totalMatches > 0) {
        totalVoiceSeconds = totalMatches * 20 * 60;
      }

      res.json({
        totalPlayers,
        totalMatches,
        totalWins,
        totalMVPs,
        totalPoints,
        currentSeason,
        activePlayers,
        totalVoiceSeconds: totalVoiceSeconds + activeVoiceSeconds
      });
    } catch (error) {
      console.error('Error en /api/stats:', error);
      res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
  });

  app.get('/api/rankings', async (req, res) => {
    try {
      const type = req.query.type || 'season';
      const limit = parseInt(req.query.limit) || 10;
      const page = parseInt(req.query.page) || 1;
      const skip = Math.max(0, (page - 1) * limit);

      let players;
      let total;

      if (type === 'season') {
        total = await Player.countDocuments({});
        players = await Player.find({})
          .sort({ 'currentSeason.points': -1, _id: 1 })
          .skip(skip)
          .limit(limit)
          .lean();

        const playersWithNames = await Promise.all(players.map(async (p, index) => {
          let username = p._id;
          try {
            const user = await client.users.fetch(p._id).catch(() => null);
            if (user) {
              username = user.username;
            }
          } catch (e) { }

          return {
            rank: skip + index + 1,
            userId: p._id,
            username,
            points: p.currentSeason?.points || 0,
            wins: p.currentSeason?.wins || 0,
            losses: p.currentSeason?.losses || 0,
            mvps: p.currentSeason?.mvps || 0,
            winRate: p.currentSeason?.wins + p.currentSeason?.losses > 0
              ? ((p.currentSeason?.wins / (p.currentSeason?.wins + p.currentSeason?.losses)) * 100).toFixed(1)
              : 0
          };
        }));

        res.json({ players: playersWithNames, total, page, totalPages: Math.ceil((total || 0) / limit) });
      } else {
        total = await Player.countDocuments({});
        players = await Player.find({})
          .sort({ 'currentSeason.points': -1, _id: 1 })
          .skip(skip)
          .limit(limit)
          .lean();

        const playersWithNames = await Promise.all(players.map(async (p, index) => {
          let username = p.customName || p._id;
          if (!p.customName) {
            try {
              const user = await client.users.fetch(p._id).catch(() => null);
              if (user) {
                username = user.username;
              }
            } catch (e) { }
          }

          return {
            rank: skip + index + 1,
            userId: p._id,
            username,
            points: p.currentSeason?.points || 0,
            wins: p.currentSeason?.wins || 0,
            losses: p.currentSeason?.losses || 0,
            mvps: p.currentSeason?.mvps || 0,
            winRate: (p.currentSeason?.wins || 0) + (p.currentSeason?.losses || 0) > 0
              ? (((p.currentSeason?.wins || 0) / ((p.currentSeason?.wins || 0) + (p.currentSeason?.losses || 0))) * 100).toFixed(1)
              : 0
          };
        }));

        res.json({ players: playersWithNames, total, page, totalPages: Math.ceil((total || 0) / limit) });
      }
    } catch (error) {
      console.error('Error en /api/rankings:', error);
      res.status(500).json({ error: 'Error obteniendo rankings' });
    }
  });

  app.get('/api/players', async (req, res) => {
    try {
      const search = req.query.search || '';
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      let query = {};
      if (search) {
        query._id = new RegExp(search, 'i');
      }

      const players = await Player.find(query)
        .sort({ 'currentSeason.points': -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Player.countDocuments(query);

      const playersWithNames = await Promise.all(players.map(async (p) => {
        let username = p.customName || p._id;
        if (!p.customName) {
          try {
            const user = await client.users.fetch(p._id).catch(() => null);
            if (user) {
              username = user.username;
            }
          } catch (e) { }
        }

        return {
          userId: p._id,
          username,
          points: p.currentSeason?.points || 0,
          wins: p.currentSeason?.wins || 0,
          losses: p.currentSeason?.losses || 0,
          mvps: p.currentSeason?.mvps || 0,
          coins: p.styleCoins || 0
        };
      }));

      res.json({
        players: playersWithNames,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error('Error en /api/players:', error);
      res.status(500).json({ error: 'Error obteniendo jugadores' });
    }
  });

  app.get('/api/matches', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const userId = req.query.userId;
      const season = req.query.season;

      const query = {};
      if (userId) {
        query.$or = [{ team1: userId }, { team2: userId }];
      }
      if (season) {
        query.season = season;
      }

      const total = await MatchHistory.countDocuments(query);
      const matches = await MatchHistory.find(query)
        .sort({ matchNumber: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      res.json({
        matches,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error('Error en /api/matches:', error);
      res.status(500).json({ error: 'Error obteniendo partidas' });
    }
  });

  app.get('/api/matches/:id', async (req, res) => {
    try {
      const matchNumber = parseInt(req.params.id);
      if (isNaN(matchNumber)) {
        return res.status(400).json({ error: 'ID de partida inválido' });
      }

      const match = await MatchHistory.findOne({ matchNumber }).lean();

      if (!match) {
        return res.status(404).json({ error: 'Partida no encontrada' });
      }

      res.json(match);
    } catch (error) {
      console.error('Error en /api/matches/:id:', error);
      res.status(500).json({ error: 'Error obteniendo partida' });
    }
  });

  // RUTA DE TRANSCRIPCIONES WEB
  app.get('/partida/:id', (req, res) => {
    const matchId = req.params.id;
    const transcriptPath = path.join(__dirname, 'logs/transcripts', `${matchId}.json`);

    if (!fs.existsSync(transcriptPath)) {
      return res.status(404).send(`
        <html>
          <head><title>404 - No Encontrado</title><style>body{background:#313338;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;}</style></head>
          <body><h1>404</h1><p>El historial de esta partida no existe o no ha sido procesado aún.</p></body>
        </html>
      `);
    }

    try {
      const data = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
      const formatDate = (ts) => new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Mapa de IDs para resolver menciones locales con nombres reales
      const nameMap = new Map();
      if (data.messages) {
        data.messages.forEach(m => {
          if (m.author?.id) nameMap.set(m.author.id, m.author.name);
        });
      }

      const renderEmbed = (e) => {
        if (!e) return '';
        if (e.type === 'image' || e.type === 'gifv') {
          const imgUrl = e.thumbnail?.url || e.image?.url || e.url;
          if (imgUrl) return `<div class="attachment-container"><img src="${imgUrl}" class="msg-img" /></div>`;
          return '';
        }

        const colorHex = e.color ? '#' + e.color.toString(16).padStart(6, '0') : '#202225';
        let html = `<div class="discord-embed" style="border-left-color: ${colorHex};">`;
        html += `<div class="embed-grid">`;

        let headerContent = '';
        if (e.author) {
          headerContent += `<div class="embed-author">`;
          if (e.author.icon_url || e.author.iconURL) headerContent += `<img src="${e.author.icon_url || e.author.iconURL}" class="embed-author-icon" />`;
          headerContent += `<span>${e.author.name}</span></div>`;
        }
        if (e.title) {
          headerContent += `<div class="embed-title">${e.url ? `<a href="${e.url}" target="_blank">${e.title}</a>` : e.title}</div>`;
        }
        if (e.description) {
          headerContent += `<div class="embed-description">${processContent(e.description)}</div>`;
        }
        if (e.fields && e.fields.length > 0) {
          headerContent += `<div class="embed-fields">`;
          e.fields.forEach(f => {
            headerContent += `<div class="embed-field" style="${f.inline ? 'display: inline-block; min-width: 45%; margin-right: 5%;' : 'display: block; width: 100%;'}">`;
            headerContent += `<div class="embed-field-name">${processContent(f.name)}</div>`;
            headerContent += `<div class="embed-field-value">${processContent(f.value)}</div>`;
            headerContent += `</div>`;
          });
          headerContent += `</div>`;
        }
        if (e.image && e.image.url) {
          headerContent += `<img src="${e.image.url}" class="embed-image" />`;
        }

        html += `<div class="embed-content-inner">${headerContent}</div>`;

        if (e.thumbnail && e.thumbnail.url) {
          html += `<img src="${e.thumbnail.url}" class="embed-thumbnail" />`;
        }

        html += `</div>`; // Close grid

        if (e.footer) {
          html += `<div class="embed-footer">`;
          if (e.footer.icon_url || e.footer.iconURL) html += `<img src="${e.footer.icon_url || e.footer.iconURL}" class="embed-footer-icon" />`;
          html += `<span>${e.footer.text}</span></div>`;
        }
        html += `</div>`;
        return html;
      };

      const processContent = (text) => {
        if (!text) return '';
        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        html = html.replace(/&lt;@!?(\d+)&gt;/g, (match, id) => {
          const name = nameMap.get(id) || 'usuario';
          return `<span class="mention">@${name}</span>`;
        });

        html = html.replace(/&lt;@&amp;(\d+)&gt;/g, (match, id) => {
          if (data.roles && data.roles[id]) {
            const role = data.roles[id];
            const colorHex = role.color !== '#000000' && role.color ? role.color : 'var(--accent)';
            return `<span class="mention role-mention" style="color: ${colorHex}; background-color: ${colorHex}22;">@${role.name}</span>`;
          }
          return '<span class="mention">@rol</span>';
        });

        return html
          .replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#canal</span>')
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code>$1</code>');
      };

      let messagesHtml = data.messages.map(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const fullDate = new Date(msg.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const avatar = msg.author.avatar || 'https://discord.com/assets/7c01052da2834a06cd3cc89551c5fdf1.png';

        let attachmentsHtml = '';
        if (msg.attachments && msg.attachments.length > 0) {
          attachmentsHtml += msg.attachments.map(a => {
            if (a.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || (a.contentType && a.contentType.startsWith('image/'))) {
              return `<div class="attachment-container"><img src="${a.url}" class="msg-img" /></div>`;
            }
            return `<div class="attachment-container"><a href="${a.url}" target="_blank" class="msg-file">📎 ${a.name}</a></div>`;
          }).join('');
        }

        if (msg.stickers && msg.stickers.length > 0) {
          attachmentsHtml += msg.stickers.map(s => `<div class="attachment-container"><img src="${s.url}" class="msg-sticker" title="${s.name}" /></div>`).join('');
        }

        let embedsHtml = '';
        if (msg.embeds && msg.embeds.length > 0) {
          embedsHtml = msg.embeds.map(e => renderEmbed(e)).join('');
        }

        return `
          <div class="message-group">
            <img src="${avatar}" class="avatar" />
            <div class="msg-content">
              <div class="msg-header">
                <span class="username" style="color: ${msg.author.color}">${msg.author.name}</span>
                <span class="bot-tag" style="display: ${msg.author.bot ? 'inline-block' : 'none'};">BOT</span>
                <span class="timestamp">${fullDate} ${time}</span>
              </div>
              <div class="text">${processContent(msg.content)}</div>
              ${attachmentsHtml}
              ${embedsHtml}
            </div>
          </div>
        `;
      }).join('');

      res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcripción Partida #${matchId} - ROYAL RANKED</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-dark: #1e1f22;
            --bg-main: #313338;
            --bg-sidebar: #2b2d31;
            --text-normal: #dbdee1;
            --text-muted: #949ba4;
            --text-header: #ffffff;
            --accent: #5865f2;
            --mention-bg: rgba(88, 101, 242, 0.15);
            --mention-text: #c9cdfb;
        }
        
        * { box-sizing: border-box; }
        
        body {
            background-color: var(--bg-dark);
            color: var(--text-normal);
            font-family: 'Inter', 'gg sans', sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            min-height: 100vh;
        }

        .app-container {
            width: 100%;
            max-width: 1100px;
            background: var(--bg-main);
            display: flex;
            flex-direction: column;
            box-shadow: 0 0 40px rgba(0,0,0,0.4);
        }

        .header {
            background: var(--bg-sidebar);
            padding: 20px 40px;
            border-bottom: 2px solid rgba(0,0,0,0.15);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header-title {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .header-title h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.5px;
            color: var(--text-header);
        }

        .badge {
            background: var(--accent);
            color: #fff;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
        }

        .chat-container {
            padding: 20px 0;
            flex-grow: 1;
        }

        .message-group {
            display: flex;
            padding: 8px 40px;
            transition: background 0.15s ease;
            border-left: 3px solid transparent;
        }

        .message-group:hover {
            background: rgba(255,255,255,0.02);
            border-left-color: var(--accent);
        }

        .avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            margin-right: 20px;
            flex-shrink: 0;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            border: 2px solid rgba(255,255,255,0.05);
        }

        .msg-content {
            flex-grow: 1;
            min-width: 0;
        }

        .msg-header {
            margin-bottom: 5px;
            display: flex;
            align-items: baseline;
            gap: 10px;
        }

        .username {
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
        }

        .username:hover { text-decoration: underline; }
        
        .bot-tag {
            background: var(--accent);
            color: #fff;
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 600;
            margin-left: 5px;
            position: relative;
            top: -2px;
        }

        .timestamp {
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 500;
        }

        .text {
            font-size: 15px;
            line-height: 1.5;
            color: #dcdee1;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .mention {
            background: var(--mention-bg);
            color: var(--mention-text);
            padding: 0 4px;
            border-radius: 3px;
            font-weight: 600;
            transition: all 0.2s;
        }

        .mention:hover {
            background: var(--accent);
            color: #fff;
        }

        .attachment-container {
            margin-top: 10px;
        }

        .msg-img {
            max-width: 100%;
            max-height: 500px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.05);
            cursor: pointer;
            transition: transform 0.2s;
        }

        .msg-img:hover { transform: scale(1.01); }

        .msg-sticker {
            width: 160px;
            height: 160px;
            cursor: pointer;
        }

        .discord-embed {
            margin-top: 5px;
            background: #2b2d31;
            border-left: 4px solid var(--bg-dark);
            border-radius: 4px;
            padding: 12px 16px;
            max-width: 520px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .embed-grid {
            display: flex;
            justify-content: space-between;
            gap: 16px;
        }

        .embed-content-inner {
            flex-grow: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .embed-author {
            display: flex;
            align-items: center;
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
            gap: 8px;
        }

        .embed-author-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
        }

        .embed-title {
            font-size: 16px;
            font-weight: 600;
            color: #ffffff;
        }

        .embed-title a {
            color: #00a8fc;
            text-decoration: none;
        }

        .embed-title a:hover {
            text-decoration: underline;
        }

        .embed-description {
            font-size: 14px;
            color: #dbdee1;
            line-height: 1.375;
            white-space: pre-wrap;
        }

        .embed-fields {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 8px;
        }

        .embed-field-name {
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 2px;
        }

        .embed-field-value {
            font-size: 14px;
            color: #dbdee1;
            white-space: pre-wrap;
        }

        .embed-image {
            max-width: 100%;
            border-radius: 4px;
            margin-top: 8px;
        }

        .embed-thumbnail {
            max-width: 80px;
            max-height: 80px;
            border-radius: 4px;
            object-fit: cover;
        }

        .embed-footer {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #949ba4;
            margin-top: 4px;
        }

        .embed-footer-icon {
            width: 20px;
            height: 20px;
            border-radius: 50%;
        }

        .msg-file {
            display: inline-flex;
            align-items: center;
            background: #2b2d31;
            padding: 12px 20px;
            border-radius: 8px;
            color: var(--accent);
            text-decoration: none;
            font-weight: 600;
            border: 1px solid rgba(255,255,255,0.05);
            gap: 10px;
        }

        .msg-file:hover {
            background: #35373c;
            color: #fff;
        }

        .footer {
            padding: 30px;
            text-align: center;
            background: var(--bg-sidebar);
            color: var(--text-muted);
            font-size: 13px;
            font-weight: 500;
            border-top: 2px solid rgba(0,0,0,0.1);
        }

        code {
            background: #1e1f22;
            padding: 2px 4px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            color: #e3e5e8;
        }

        @media (max-width: 600px) {
            .message-group { padding: 8px 15px; }
            .header { padding: 15px 20px; }
            .header-title h1 { font-size: 16px; }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <header class="header">
            <div class="header-title">
                <span class="badge">Oficial</span>
                <h1>ROYAL RANKED - Partida #${matchId}</h1>
            </div>
            <div class="timestamp">Generado el ${formatDate(data.timestamp)}</div>
        </header>
        
        <main class="chat-container">
            ${messagesHtml}
            © ROYAL RANKED - Todos los derechos reservados.
        </div>
    </div>
</body>
</html>
      `);
    } catch (e) {
      console.error(e);
      res.status(500).send('Error al procesar el historial.');
    }
  });

  app.get('/api/info/:uid', async (req, res) => {
    try {
      const uid = (req.params.uid || '').trim();
      if (!uid) {
        return res.status(400).json({ error: 'UID requerido' });
      }

      if (!/^[0-9]{8,11}$/.test(uid)) {
        return res.status(400).json({ error: 'El UID debe ser numérico y tener entre 8 y 11 dígitos' });
      }

      const lang = (req.query.lang || 'es').toString();
      const baseUrl = (config.pixyApiBaseUrl || 'https://api.pixyteam.com').replace(/\/+$/, '');
      const url = `${baseUrl}/account/info`;

      const response = await axios.get(url, {
        params: { uid, lang },
        timeout: 10000
      });

      const data = response.data;
      if (!data || data.code !== 200) {
        const message = data && data.message ? data.message : 'No se pudo obtener la información de la cuenta.';
        return res.status(502).json({ error: message });
      }

      const basic = data.basicInfo || {};
      const profileInfo = data.profileInfo || {};

      let pets = [];
      if (data.petInfo) {
        if (Array.isArray(data.petInfo)) {
          pets = data.petInfo;
        } else if (Array.isArray(data.petInfo.petList)) {
          pets = data.petInfo.petList;
        } else if (Array.isArray(data.petInfo.pets)) {
          pets = data.petInfo.pets;
        } else if (data.petInfo.selectedPet) {
          pets = [data.petInfo.selectedPet];
        } else if (data.petInfo.name || data.petInfo.petName || data.petInfo.id) {
          pets = [data.petInfo];
        }
      }

      const petInfo = pets;

      const formatBool = (v) => (v ? 'Sí' : 'No');
      const formatNumber = (v) => (v || v === 0 ? String(v) : 'Desconocido');
      const formatDate = (ts) => {
        if (!ts) return 'Desconocida';
        const n = Number(ts);
        if (!Number.isFinite(n) || n <= 0) return 'Desconocida';
        const d = new Date(n * 1000);
        if (Number.isNaN(d.getTime())) return 'Desconocida';
        return d.toLocaleString('es-ES');
      };

      const nickname = basic.nickname || basic.nickName || 'Desconocido';
      const regionCode = basic.region || basic.accountRegion || 'Desconocida';
      const level = formatNumber(basic.level);
      const exp = formatNumber(basic.exp);
      const rank = formatNumber(basic.rank);
      const rankingPoints = formatNumber(basic.rankingPoints);
      const csRank = formatNumber(basic.csRank);
      const csRankingPoints = formatNumber(basic.csRankingPoints);
      const maxRank = formatNumber(basic.maxRank);
      const csMaxRank = formatNumber(basic.csMaxRank);
      const title = basic.title || 'Ninguno';
      const clan = data.clanInfo || {};
      const clanName = clan.clanName || 'Sin Clan';
      const clanLevel = clan.level ? `Nvl. ${clan.level}` : '';
      const clanMembers = clan.memberNum ? `(${clan.memberNum} miem.)` : '';

      const social = data.socialInfo || {};
      const gender = basic.gender || social.gender;
      const genderEmoji = gender === 1 ? '👩' : (gender === 0 ? '👨' : '');

      const badgeCnt = formatNumber(basic.badgeCnt);
      const honor = formatNumber(basic.honor || basic.honorPoint || basic.creditScore);
      const likes = formatNumber(basic.liked);
      const hasElitePass = formatBool(basic.hasElitePass);
      const lastLogin = formatDate(basic.lastLoginAt);
      const createdAt = formatDate(data.createAt || basic.createAt);

      const REGION_MAP = {
        US: { flag: '🇺🇸', name: 'Estados Unidos' },
        BR: { flag: '🇧🇷', name: 'Brasil' },
        IND: { flag: '🇮🇳', name: 'India' },
        SG: { flag: '🇸🇬', name: 'Singapur' },
        RU: { flag: '🇷🇺', name: 'Rusia' },
        ID: { flag: '🇮🇩', name: 'Indonesia' },
        VN: { flag: '🇻🇳', name: 'Vietnam' },
        TH: { flag: '🇹🇭', name: 'Tailandia' },
        ME: { flag: '🌍', name: 'Medio Oriente' },
        PK: { flag: '🇵🇰', name: 'Pakistán' },
        TW: { flag: '🇹🇼', name: 'Taiwán' },
        CIS: { flag: '🌍', name: 'CIS' },
        SAC: { flag: '🌎', name: 'Sudamérica' },
        NA: { flag: '🌎', name: 'Norteamérica' }
      };

      const regionMeta = REGION_MAP[regionCode] || null;
      const regionLabel = regionMeta ? `${regionMeta.flag} ${regionMeta.name} (${regionCode})` : regionCode;

      const pet = petInfo[0] || {};
      const petName = pet.name || pet.petName || 'Sin mascota equipada';
      const petLevel = pet.level != null ? String(pet.level) : '-';
      const petExp = pet.exp != null ? String(pet.exp) : '-';

      const signature =
        profileInfo.signature ||
        profileInfo.signText ||
        (profileInfo.profileSign && profileInfo.profileSign.text) ||
        'Sin firma.';

      const descriptionLines = [];
      descriptionLines.push(`${regionMeta ? regionMeta.flag : '👤'} **${nickname}** ${genderEmoji} (Nivel ${level})`);
      if (clanName !== 'Sin Clan') {
        descriptionLines.push(`🛡️ **${clanName}** ${clanLevel} ${clanMembers}`);
      }
      descriptionLines.push(`📝 *${signature}*`);
      descriptionLines.push('');
      descriptionLines.push('🏆 **COMPETITIVO**');
      descriptionLines.push(`• **BR:** Puntos ${rankingPoints} (Rango ${rank}) | Máx: ${maxRank}`);
      descriptionLines.push(`• **CS:** Puntos ${csRankingPoints} (Rango ${csRank}) | Máx: ${csMaxRank}`);
      descriptionLines.push('');
      descriptionLines.push('👤 **SOCIAL**');
      descriptionLines.push(`• **UID:** \`${basic.accountId || uid}\``);
      descriptionLines.push(`• **Likes:** ${likes} | **Honor:** ${honor}`);
      descriptionLines.push(`• **Título:** ${title}`);
      descriptionLines.push(`• **Insignias:** ${badgeCnt} | **Pase:** ${hasElitePass}`);
      descriptionLines.push('');
      descriptionLines.push('🐾 **MASCOTA**');
      descriptionLines.push(`• **${petName}** (Nvl. ${petLevel} - EXP ${petExp})`);
      descriptionLines.push('');
      descriptionLines.push('📅 **CUENTA**');
      descriptionLines.push(`• **Creada:** ${createdAt}`);
      descriptionLines.push(`• **Último Acceso:** ${lastLogin}`);

      const description = descriptionLines.join('\n');

      const payload = {
        uid: basic.accountId || uid,
        nickname,
        region: {
          code: regionCode,
          label: regionLabel
        },
        level,
        exp,
        rank: {
          br: {
            points: rankingPoints,
            rank,
            maxRank
          },
          cs: {
            points: csRankingPoints,
            rank: csRank,
            maxRank: csMaxRank
          }
        },
        clan: {
          name: clanName,
          level: clanLevel,
          members: clanMembers
        },
        social: {
          gender,
          genderEmoji,
          badgeCnt,
          honor,
          likes,
          hasElitePass
        },
        pet: {
          name: petName,
          level: petLevel,
          exp: petExp
        },
        account: {
          createdAt,
          lastLogin
        },
        signature,
        description,
        descriptionLines,
        raw: data
      };

      res.json({ ok: true, data: payload });
    } catch (error) {
      console.error('Error en /api/info:', error);

      if (error.response) {
        const status = error.response.status;
        const respData = error.response.data;
        const apiMsg =
          (respData && typeof respData.message === 'string' && respData.message.trim()) ||
          (respData && typeof respData.error === 'string' && respData.error.trim()) ||
          null;
        return res.status(502).json({
          error: 'Error al consultar la API externa',
          details: apiMsg ? `HTTP ${status}: ${apiMsg}` : `HTTP ${status}`
        });
      } else if (error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')) {
        return res.status(504).json({
          error: 'La API externa tardó demasiado en responder'
        });
      } else if (error.request) {
        return res.status(503).json({
          error: 'No se pudo conectar con la API externa'
        });
      }

      res.status(500).json({ error: 'Error interno al procesar la solicitud' });
    }
  });

  app.get('/api/checkban/:uid', async (req, res) => {
    try {
      const uid = (req.params.uid || '').trim();
      if (!uid) {
        return res.status(400).json({ error: 'UID requerido' });
      }

      if (!/^[0-9]{8,11}$/.test(uid)) {
        return res.status(400).json({ error: 'El UID debe ser numérico y tener entre 8 y 11 dígitos' });
      }

      const lang = (req.query.lang || 'es').toString();
      const baseUrl = (config.pixyApiBaseUrl || 'https://api.pixyteam.com').replace(/\/+$/, '');
      const checkBanUrl = `${baseUrl}/account/checkban`;
      const infoUrl = `${baseUrl}/account/info`;

      const [banResponse, infoResponse] = await Promise.all([
        axios.get(checkBanUrl, { params: { uid, lang }, timeout: 10000 }),
        axios.get(infoUrl, { params: { uid, lang }, timeout: 10000 }).catch(() => ({ data: {} }))
      ]);

      const banData = banResponse.data;
      if (!banData || banData.code !== 200 || !banData.data) {
        const message = banData && banData.message ? banData.message : 'No se pudo verificar el estado de ban de la cuenta.';
        return res.status(502).json({ error: message });
      }

      const banInfo = banData.data || {};
      const profileData = infoResponse.data || {};

      const mergedData = {
        ...profileData,
        ...banInfo
      };

      const basic = mergedData.basicInfo || mergedData;
      const profileInfo = mergedData.profileInfo || {};

      let pets = [];
      if (mergedData.petInfo) {
        if (Array.isArray(mergedData.petInfo)) {
          pets = mergedData.petInfo;
        } else if (Array.isArray(mergedData.petInfo.petList)) {
          pets = mergedData.petInfo.petList;
        } else if (Array.isArray(mergedData.petInfo.pets)) {
          pets = mergedData.petInfo.pets;
        } else if (mergedData.petInfo.selectedPet) {
          pets = [mergedData.petInfo.selectedPet];
        } else if (mergedData.petInfo.name || mergedData.petInfo.petName || mergedData.petInfo.id) {
          pets = [mergedData.petInfo];
        }
      }
      const petInfo = pets;

      const formatNumber = (v) => (v || v === 0 ? String(v) : 'Desconocido');
      const formatDate = (ts) => {
        if (!ts) return 'Desconocida';
        const n = Number(ts);
        if (!Number.isFinite(n) || n <= 0) return 'Desconocida';
        const d = new Date(n * 1000);
        if (Number.isNaN(d.getTime())) return 'Desconocida';
        return d.toLocaleString('es-ES');
      };

      const isBanned = mergedData.is_banned === true || mergedData.is_banned === 1 || mergedData.is_banned === '1';
      const statusText = isBanned ? 'BANEADA' : 'LIMPIA';
      const statusEmoji = isBanned ? '⛔' : '✅';

      const nickname = basic.nickname || basic.nickName || 'Desconocido';
      const regionCode = basic.region || basic.accountRegion || 'Desconocida';
      const rawLevel = basic.level || mergedData.level || (profileInfo && profileInfo.level);
      const level = formatNumber(rawLevel);

      const clan = mergedData.clanInfo || {};
      const clanName = clan.clanName || 'Sin Clan';
      const clanLevel = clan.level ? `Nvl. ${clan.level}` : '';
      const clanMembers = clan.memberNum ? `(${clan.memberNum} miem.)` : '';

      const social = mergedData.socialInfo || {};
      const gender = basic.gender || social.gender;
      const genderEmoji = gender === 1 ? '👩' : (gender === 0 ? '👨' : '');

      const lastLogin = formatDate(basic.lastLoginAt);
      const createdAt = formatDate(mergedData.createAt || basic.createAt);

      const REGION_MAP = {
        US: { flag: '🇺🇸', name: 'Estados Unidos' },
        BR: { flag: '🇧🇷', name: 'Brasil' },
        IND: { flag: '🇮🇳', name: 'India' },
        SG: { flag: '🇸🇬', name: 'Singapur' },
        RU: { flag: '🇷🇺', name: 'Rusia' },
        ID: { flag: '🇮🇩', name: 'Indonesia' },
        VN: { flag: '🇻🇳', name: 'Vietnam' },
        TH: { flag: '🇹🇭', name: 'Tailandia' },
        ME: { flag: '🌍', name: 'Medio Oriente' },
        PK: { flag: '🇵🇰', name: 'Pakistán' },
        TW: { flag: '🇹🇼', name: 'Taiwán' },
        CIS: { flag: '🌍', name: 'CIS' },
        SAC: { flag: '🌎', name: 'Sudamérica' },
        NA: { flag: '🌎', name: 'Norteamérica' }
      };

      const regionMeta = REGION_MAP[regionCode] || null;
      const regionLabel = regionMeta ? `${regionMeta.flag} ${regionMeta.name} (${regionCode})` : regionCode;

      const pet = petInfo[0] || {};
      const petName = pet.name || pet.petName || 'Sin mascota equipada';
      const petLevel = pet.level != null ? String(pet.level) : '-';
      const petExp = pet.exp != null ? String(pet.exp) : '-';

      const signature =
        profileInfo.signature ||
        profileInfo.signText ||
        (profileInfo.profileSign && profileInfo.profileSign.text) ||
        'Sin firma.';

      const descriptionLines = [];
      descriptionLines.push(`### ${statusEmoji} ESTADO: ${statusText}`);
      if (isBanned) {
        descriptionLines.push(`**Periodo:** ${mergedData.period || 'Desconocido'}`);
      }
      descriptionLines.push('');
      descriptionLines.push(`👤 **Jugador:** ${nickname} ${genderEmoji} (Nivel ${level})`);
      descriptionLines.push(`🔎 **UID:** \`${basic.accountId || uid}\``);
      descriptionLines.push(`🌎 **Región:** ${regionLabel}`);
      descriptionLines.push(`📅 **Último Acceso:** ${lastLogin !== 'Desconocida' ? lastLogin : 'Desconocido'}`);

      const description = descriptionLines.join('\n');

      const payload = {
        uid: basic.accountId || uid,
        status: {
          isBanned,
          text: statusText,
          emoji: statusEmoji,
          period: mergedData.period || null
        },
        nickname,
        region: {
          code: regionCode,
          label: regionLabel
        },
        level,
        clan: {
          name: clanName,
          level: clanLevel,
          members: clanMembers
        },
        social: {
          gender,
          genderEmoji
        },
        pet: {
          name: petName,
          level: petLevel,
          exp: petExp
        },
        account: {
          createdAt,
          lastLogin
        },
        signature,
        description,
        descriptionLines,
        raw: {
          ban: banData,
          info: infoResponse.data || null
        }
      };

      res.json({ ok: true, data: payload });
    } catch (error) {
      console.error('Error en /api/checkban:', error);

      if (error.response) {
        const status = error.response.status;
        const respData = error.response.data;
        const apiMsg =
          (respData && typeof respData.message === 'string' && respData.message.trim()) ||
          (respData && typeof respData.error === 'string' && respData.error.trim()) ||
          null;
        return res.status(502).json({
          error: 'Error al consultar la API externa',
          details: apiMsg ? `HTTP ${status}: ${apiMsg}` : `HTTP ${status}`
        });
      } else if (error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')) {
        return res.status(504).json({
          error: 'La API externa tardó demasiado en responder'
        });
      } else if (error.request) {
        return res.status(503).json({
          error: 'No se pudo conectar con la API externa'
        });
      }

      res.status(500).json({ error: 'Error interno al procesar la solicitud' });
    }
  });

  app.listen(PORT, () => {
    console.log(`API HTTP escuchando en http://localhost:${PORT}`);
  });

  // Start Real-Time API for Website
  try {
    const { startApiServer } = require('./src/api/server');
    startApiServer({ client, matches, settings, config, port: process.env.SERVER_PORT || 7000 });
  } catch (err) {
    console.error('Error starting Real-Time API:', err);
  }

  // Iniciar servidor web del ranking (desactivado - ahora manejado por API REST en puerto 7000)
  // try {
  //   startWebServer(config);
  // } catch (err) {
  //   console.error('Error iniciando servidor web del ranking:', err);
  // }

  await client.login(config.token);
})();
