const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = async function checkBanCommand(message, args, ctx) {
  const { config, COLORS, EMBED_DEFAULTS } = ctx;

  const uid = (args[0] || '').trim();
  if (!uid) {
    return message.reply('Uso: `!checkban <UID>`');
  }

  if (!/^[0-9]{8,11}$/.test(uid)) {
    return message.reply('❌ El UID debe ser numérico y tener entre 8 y 11 dígitos.');
  }

  const baseUrl = (config.pixyApiBaseUrl || 'https://api.pixyteam.com').replace(/\/+$/, '');
  const checkBanUrl = `${baseUrl}/account/checkban`;
  const infoUrl = `${baseUrl}/account/info`;

  let loadingMessage;
  try {
    loadingMessage = await message.channel.send(`🔎 Verificando estado de ban y datos de la cuenta \`${uid}\`...`);
  } catch (e) {
    loadingMessage = null;
  }

  try {
    // Realizamos ambas peticiones en paralelo para asegurar tener toda la info
    // Si info falla, seguimos con checkban
    const [banResponse, infoResponse] = await Promise.all([
        axios.get(checkBanUrl, { params: { uid, lang: 'es' }, timeout: 10000 }),
        axios.get(infoUrl, { params: { uid, lang: 'es' }, timeout: 10000 }).catch(() => ({ data: {} }))
    ]);

    const banData = banResponse.data;
    if (!banData || banData.code !== 200 || !banData.data) {
      const errorMessage = banData && banData.message ? banData.message : 'No se pudo verificar el estado de ban de la cuenta.';
      if (loadingMessage) {
        await loadingMessage.edit(errorMessage).catch(() => {});
        return;
      }
      return message.reply(errorMessage);
    }

    // Combinamos la información de ban con la información de perfil (si existe)
    const banInfo = banData.data || {};
    const profileData = infoResponse.data || {};
    
    // mergedData contendrá is_banned, period, y todos los datos de perfil (basicInfo, etc)
    const mergedData = {
        ...profileData,
        ...banInfo
    };

    const basic = mergedData.basicInfo || mergedData; // Fallback if structure varies
    const profileInfo = mergedData.profileInfo || {};
    
    // Robust Pet Info Extraction
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

    const isBanned = mergedData.is_banned === true || mergedData.is_banned === 1 || mergedData.is_banned === '1';
    const statusText = isBanned ? 'BANEADA' : 'LIMPIA';
    const statusEmoji = isBanned ? '⛔' : '✅';
    
    const nickname = basic.nickname || basic.nickName || 'Desconocido';
    const regionCode = basic.region || basic.accountRegion || 'Desconocida';
    // Intentar obtener nivel de múltiples fuentes por si acaso
    const rawLevel = basic.level || mergedData.level || (profileInfo && profileInfo.level);
    const level = formatNumber(rawLevel);
    const exp = formatNumber(basic.exp);
    const rank = formatNumber(basic.rank);
    const rankingPoints = formatNumber(basic.rankingPoints);
    const csRank = formatNumber(basic.csRank);
    const csRankingPoints = formatNumber(basic.csRankingPoints);
    const maxRank = formatNumber(basic.maxRank);
    const csMaxRank = formatNumber(basic.csMaxRank);
    const title = basic.title || 'Ninguno';
    
    const clan = mergedData.clanInfo || {};
    const clanName = clan.clanName || 'Sin Clan';
    const clanLevel = clan.level ? `Nvl. ${clan.level}` : '';
    const clanMembers = clan.memberNum ? `(${clan.memberNum} miem.)` : '';

    const social = mergedData.socialInfo || {};
    const gender = basic.gender || social.gender;
    const genderEmoji = gender === 1 ? '👩' : (gender === 0 ? '👨' : '');

    const badgeCnt = formatNumber(basic.badgeCnt);
    const honor = formatNumber(basic.honor || basic.honorPoint || basic.creditScore);
    const likes = formatNumber(basic.liked);
    const hasElitePass = formatBool(basic.hasElitePass);
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

    // BAN STATUS HEADER
    descriptionLines.push(`### ${statusEmoji} ESTADO: ${statusText}`);
    if (isBanned) {
        descriptionLines.push(`**Periodo:** ${mergedData.period || 'Desconocido'}`);
    }
    descriptionLines.push('');

    // Profile Header (Solo lo esencial)
    descriptionLines.push(`👤 **Jugador:** ${nickname} ${genderEmoji} (Nivel ${level})`);
    descriptionLines.push(`🔎 **UID:** \`${basic.accountId || uid}\``);
    descriptionLines.push(`🌎 **Región:** ${regionLabel}`);
    descriptionLines.push(`📅 **Último Acceso:** ${lastLogin !== 'Desconocida' ? lastLogin : 'Desconocido'}`);

    const description = descriptionLines.join('\n');

    const embed = new EmbedBuilder()
      .setTitle('Verificación de Ban Free Fire')
      .setColor(isBanned ? ((COLORS && COLORS.ERROR) || 0xed4245) : ((COLORS && COLORS.SUCCESS) || 0x57f287))
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
    console.error('[CheckBan Command] Error consultando Pixy API:', error);

    let userMessage = '❌ Ocurrió un error al consultar la API externa para el estado de ban.';

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
