const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = async function infoCommand(message, args, ctx) {
  const { config, COLORS, EMBED_DEFAULTS } = ctx;

  const uid = (args[0] || '').trim();
  if (!uid) {
    return message.reply('Uso: `!info <UID>`');
  }

  if (!/^[0-9]{8,11}$/.test(uid)) {
    return message.reply('❌ El UID debe ser numérico y tener entre 8 y 11 dígitos.');
  }

  const baseUrl = (config.pixyApiBaseUrl || 'https://api.pixyteam.com').replace(/\/+$/, '');
  const url = `${baseUrl}/account/info`;

  let loadingMessage;
  try {
    loadingMessage = await message.channel.send(`🔎 Consultando información de la cuenta \`${uid}\`...`);
  } catch (e) {
    loadingMessage = null;
  }

  try {
    const response = await axios.get(url, {
      params: { uid, lang: 'es' },
      timeout: 10000
    });

    const data = response.data;
    if (!data || data.code !== 200) {
      const errorMessage = data && data.message ? data.message : 'No se pudo obtener la información de la cuenta.';
      if (loadingMessage) {
        await loadingMessage.edit(errorMessage).catch(() => {});
        return;
      }
      return message.reply(errorMessage);
    }

    const basic = data.basicInfo || {};
    const profileInfo = data.profileInfo || {};
    
    // Robust Pet Info Extraction
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
    const clan = data.clanBasicInfo || data.clanInfo || {};
    const clanName = clan.clanName || 'Sin Clan';
    const clanLevel = clan.clanLevel || clan.level ? `Nvl. ${clan.clanLevel || clan.level}` : '';
    const clanCapacity = clan.capacity ? `/${clan.capacity}` : '';
    const clanMembers = clan.memberNum ? `(${clan.memberNum}${clanCapacity} miem.)` : '';

    const social = data.socialInfo || {};
    const gender = basic.gender || social.gender;
    const genderEmoji = (gender === 1 || gender === 'Gender_FEMALE') ? '👩' : ((gender === 0 || gender === 'Gender_MALE') ? '👨' : '');

    const langMap = {
      'Language_PORTUGUESE': 'Portugués',
      'Language_SPANISH': 'Español',
      'Language_ENGLISH': 'Inglés',
      'Language_INDONESIAN': 'Indonesio'
    };
    const modeMap = {
      'ModePrefer_BR': 'Battle Royale (BR)',
      'ModePrefer_CS': 'Clash Squad (CS)'
    };
    const timeActiveMap = {
      'TimeActive_NIGHT': 'Noche ⚡',
      'TimeActive_DAY': 'Día ☀️',
      'TimeActive_MORNING': 'Mañana 🌅',
      'TimeActive_AFTERNOON': 'Tarde 🌇',
      'TimeActive_NONE': 'Variable'
    };
    const language = langMap[social.language] || (social.language ? social.language.replace('Language_', '') : 'Desconocido');
    const modePrefer = modeMap[social.modePrefer] || (social.modePrefer ? social.modePrefer.replace('ModePrefer_', '') : 'Desconocido');
    const timeActive = timeActiveMap[social.timeActive] || (social.timeActive ? social.timeActive.replace('TimeActive_', '') : 'Variable');
    const seasonId = basic.seasonId ? `(Temporada ${basic.seasonId})` : '';

    const badgeCnt = formatNumber(basic.badgeCnt);
    const honorRaw = (data.creditScoreInfo && data.creditScoreInfo.creditScore) || basic.honor || basic.honorPoint || basic.creditScore;
    const honor = formatNumber(honorRaw);
    const likes = formatNumber(basic.liked);
    const hasElitePass = formatBool(basic.hasElitePass);
    const lastLogin = formatDate(basic.lastLoginAt);
    const createdAt = formatDate(data.createAt || basic.createAt);
    const releaseVersion = basic.releaseVersion || 'Desconocida';
    
    const isLobbyHidden = basic.accountPrefers && basic.accountPrefers.hideMyLobby;
    const privacyTag = isLobbyHidden ? ' 🔒 (Historial Oculto)' : '';
    const champTeamName = basic.championshipTeamName || '';

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
      social.signature ||
      profileInfo.signature ||
      profileInfo.signText ||
      (profileInfo.profileSign && profileInfo.profileSign.text) ||
      'Sin firma.';

    const descriptionLines = [];

    // Header: Flag Name (Level)
    descriptionLines.push(`${regionMeta ? regionMeta.flag : '👤'} **${nickname}** ${genderEmoji} (Nivel ${level})`);
    
    if (clanName !== 'Sin Clan') {
      const clanHonor = formatNumber(clan.honorPoint);
      descriptionLines.push(`🛡️ **${clanName}** ${clanLevel} ${clanMembers} | Honor: ${clanHonor}`);
      
      const captain = data.captainBasicInfo || {};
      if (captain.accountId) {
        const capName = captain.nickname || captain.nickName || 'Desconocido';
        descriptionLines.push(`👑 **Líder:** ${capName} (\`${captain.accountId}\`)`);
      }
    }
    
    descriptionLines.push(`📝 *${signature}*`);
    descriptionLines.push('');

    // Competitivo
    descriptionLines.push(`🏆 **COMPETITIVO ${seasonId}**`);
    if (champTeamName) {
      descriptionLines.push(`⚔️ **Torneo Oficial:** ${champTeamName}`);
    }
    descriptionLines.push(`• **BR:** Puntos ${rankingPoints} (Rango ${rank}) | Máx: ${maxRank}`);
    descriptionLines.push(`• **CS:** Puntos ${csRankingPoints} (Rango ${csRank}) | Máx: ${csMaxRank}`);
    descriptionLines.push('');

    // Social
    descriptionLines.push('👤 **SOCIAL**');
    descriptionLines.push(`• **UID:** \`${basic.accountId || uid}\`${privacyTag}`);
    descriptionLines.push(`• **Likes:** ${likes} | **Honor:** ${honor}`);
    descriptionLines.push(`• **Idioma:** ${language}`);
    descriptionLines.push(`• **Modo Fav:** ${modePrefer} | **Activo:** ${timeActive}`);
    descriptionLines.push(`• **Título:** ${title}`);
    descriptionLines.push(`• **Insignias:** ${badgeCnt} | **Pase:** ${hasElitePass}`);
    descriptionLines.push('');

    const isCsBan = basic.isCsRankingBan;
    const illegalCount = data.creditScoreInfo ? data.creditScoreInfo.periodicSummaryIllegalCnt : 0;
    
    // Mascota & Cuenta
    descriptionLines.push('🐾 **MASCOTA**');
    descriptionLines.push(`• **${petName}** (Nvl. ${petLevel} - EXP ${petExp})`);
    descriptionLines.push('');
    descriptionLines.push('📅 **CUENTA**');
    descriptionLines.push(`• **Creada:** ${createdAt}`);
    descriptionLines.push(`• **Último Acceso:** ${lastLogin}`);
    descriptionLines.push(`• **Versión:** ${releaseVersion}`);
    descriptionLines.push('');
    
    // Datos Internos Extra
    const diamondCost = data.diamondCostRes && data.diamondCostRes.diamondCost ? data.diamondCostRes.diamondCost : 'Desconocido';
    const avatarId = profileInfo.avatarId || 'Desconocido';
    const bannerId = basic.bannerId || 'Desconocido';
    const skills = profileInfo.equipedSkills && profileInfo.equipedSkills.length ? profileInfo.equipedSkills.join(', ') : 'Ninguna';
    
    descriptionLines.push('⚙️ **DATOS EXTRA (SISTEMA)**');
    descriptionLines.push(`• **Costo Renombre:** 💎 ${diamondCost} diamantes`);
    descriptionLines.push(`• **Avatar ID:** ${avatarId} | **Banner ID:** ${bannerId}`);
    descriptionLines.push(`• **IDs Habilidades:** \`${skills}\``);

    if (isCsBan || illegalCount > 0) {
      descriptionLines.push('');
      descriptionLines.push('⚠️ **PENALIZACIONES**');
      if (isCsBan) descriptionLines.push('• Suspendido de Duelo de Escuadras (CS Ban)');
      if (illegalCount > 0) descriptionLines.push(`• Infracciones recientes: ${illegalCount}`);
    }

    const description = descriptionLines.join('\n');

    const embed = new EmbedBuilder()
      .setTitle('Información de Cuenta Free Fire')
      .setColor((COLORS && COLORS.PRIMARY) || 0x5865f2)
      .setDescription(description)
      .setTimestamp();

    if (EMBED_DEFAULTS && EMBED_DEFAULTS.footer) {
      embed.setFooter(EMBED_DEFAULTS.footer);
    }

    if (loadingMessage) {
      await loadingMessage.edit({ content: '', embeds: [embed] }).catch(() => {});
      return;
    }

    await message.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[Info Command] Error consultando Pixy API:', error);

    let userMessage = '❌ Ocurrió un error al consultar la API externa.';

    if (error.response) {
      const status = error.response.status;
      const respData = error.response.data;
      const apiMsg =
        (respData && typeof respData.message === 'string' && respData.message.trim()) ||
        (respData && typeof respData.error === 'string' && respData.error.trim()) ||
        null;
      userMessage += ` (HTTP ${status}${apiMsg ? `: ${apiMsg}` : ''})`;
    } else if (error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')) {
      userMessage += ' (se agotó el tiempo de espera, la API tardó demasiado en responder)';
    } else if (error.request) {
      userMessage += ' (no se pudo conectar con la API, revisa la URL o tu conexión)';
    }

    if (loadingMessage) {
      await loadingMessage.edit(userMessage).catch(() => {});
      return;
    }
    await message.reply(userMessage);
  }
};
