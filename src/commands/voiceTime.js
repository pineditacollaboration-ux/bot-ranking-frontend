// src/commands/voiceTime.js

const { EmbedBuilder } = require('discord.js');
const { checkVoiceRewards } = require('../utils/rewardUtils');


function extractUserIds(message, args) {
  const ids = new Set();
  message.mentions.users.forEach(user => ids.add(user.id));
  args.forEach(arg => {
    const clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 17) ids.add(clean);
  });
  return Array.from(ids);
}

/**
 * Comando para mostrar el tiempo que un jugador ha estado conectado en canales de voz de partida o espera.
 * @param {import('discord.js').Message} message El mensaje que activó el comando
 * @param {string[]} args Los argumentos del comando
 * @param {Object} deps Las dependencias inyectadas
 */
async function voiceTime(message, args, { Player, COLORS, matches, ALLOWED_VOICE_CATEGORIES, WAITING_ROOM_VOICE_CHANNEL_ID, sendLog, excludedFromQueueRestriction, excludedFromVoiceMove, excludedFromNickUpdate }) {
  try {
    // Obtener usuarios objetivo (menciones o argumentos ID)
    let targetIds = extractUserIds(message, args);

    // Si no se especifican usuarios, usar el autor del mensaje
    if (targetIds.length === 0) {
      targetIds = [message.author.id];
    }

    const embeds = [];

    for (const targetId of targetIds) {
      // Buscar el jugador en la base de datos
      const playerDoc = await Player.findById(targetId).lean().exec();

      // Obtener el tiempo de voz acumulado (o inicializarlo si no existe)
      const voiceTimeData = (playerDoc && playerDoc.voiceTime) ? playerDoc.voiceTime : {
        totalSeconds: 0,
        lastUpdated: null,
        currentSession: null
      };

      // Calcular tiempo actual si el jugador está en un canal de voz de partida, espera o categorías permitidas
      let currentSessionTime = 0;
      let isInRelevantVoice = false;
      const member = await message.guild.members.fetch(targetId).catch(() => null);

      if (member && member.voice.channelId) {
        const currentVoiceChannel = member.voice.channel;

        // Verificar si el canal actual es de partida, espera o categorías permitidas
        const isMatchChannel = isMatchOrWaitingVoiceChannel(currentVoiceChannel, matches, ALLOWED_VOICE_CATEGORIES, WAITING_ROOM_VOICE_CHANNEL_ID);
        isInRelevantVoice = !!isMatchChannel;

        if (isMatchChannel && voiceTimeData.currentSession) {
          const now = Date.now();
          const sessionStart = new Date(voiceTimeData.currentSession).getTime();
          currentSessionTime = Math.floor((now - sessionStart) / 1000);
        }
      }

      // Calcular tiempo total en segundos
      const totalSeconds = voiceTimeData.totalSeconds + currentSessionTime;

      // Convertir segundos a formato legible
      const { hours, minutes, seconds } = secondsToHMS(totalSeconds);
      const currentSessionHMS = secondsToHMS(currentSessionTime);

      // Verificar y otorgar recompensas si corresponde (especialmente si están en sesión activa)
      if (member) {
        await checkVoiceRewards(member, totalSeconds, { config: require('../../config.json'), sendLog, COLORS, excludedFromQueueRestriction, excludedFromVoiceMove, excludedFromNickUpdate });
      }

      // Crear embed con la información

      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`⏱️ Tiempo en Canales de Voz`)
        .setDescription(`Tiempo que <@${targetId}> ha estado en canales de partida, espera o categorías permitidas.`)
        .addFields(
          { name: 'Tiempo Total', value: `${hours} horas, ${minutes} minutos y ${seconds} segundos`, inline: false },
          {
            name: 'Estado Actual', value: isInRelevantVoice ?
              (voiceTimeData.currentSession ? `En canal de voz (sesión actual: ${currentSessionHMS.hours}h ${currentSessionHMS.minutes}m)` : 'En canal de voz (sesión aún no iniciada)') :
              'No está en un canal de voz permitido', inline: false
          }
        )
        .setTimestamp();

      embeds.push(embed);
    }

    if (embeds.length === 0) {
      return message.reply('❌ No se encontraron datos para los usuarios especificados.');
    }

    // Enviar embeds (máximo 10 por mensaje)
    const chunks = [];
    for (let i = 0; i < embeds.length; i += 10) {
      chunks.push(embeds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      // Solo el primer mensaje es reply, los siguientes son send normal en el canal
      if (chunks.indexOf(chunk) === 0) {
        await message.reply({ embeds: chunk, allowedMentions: { repliedUser: false } });
      } else {
        await message.channel.send({ embeds: chunk });
      }
    }

  } catch (error) {
    console.error('Error al obtener tiempo de voz:', error);
    return message.reply('❌ Ocurrió un error al procesar el comando.');
  }
}

/**
 * Convierte segundos a horas, minutos y segundos
 * @param {number} totalSeconds Segundos totales
 * @returns {Object} Objeto con horas, minutos y segundos
 */
function secondsToHMS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}

/**
 * Verifica si un canal de voz es de partida o espera
 * @param {string} channelId ID del canal de voz
 * @param {Map} matches Mapa de partidas activas
 * @returns {boolean} true si es canal de partida o espera
 */
function isMatchOrWaitingVoiceChannel(channel, matches, ALLOWED_VOICE_CATEGORIES = [], WAITING_ROOM_VOICE_CHANNEL_ID = null) {
  // Ahora cuenta tiempo en cualquier canal de voz del servidor
  return true;
}

module.exports = voiceTime;