// src/utils/rewardUtils.js

const { EmbedBuilder } = require('discord.js');

/**
 * Verifica y asigna roles de recompensa por tiempo en voz.
 * @param {import('discord.js').GuildMember} member El miembro a verificar
 * @param {number} totalSeconds Segundos totales acumulados
 * @param {Object} deps Dependencias (config, sendLog, COLORS)
 */
async function checkVoiceRewards(member, totalSeconds, { config, sendLog, COLORS, excludedFromQueueRestriction, excludedFromVoiceMove, excludedFromNickUpdate }) {
  if (!member || !config.voiceTimeRewards || !Array.isArray(config.voiceTimeRewards)) return;

  // Si el usuario está en el comando !exclusivo, no asignarle los roles automáticos por horas en call
  const isExclusive = (excludedFromQueueRestriction && excludedFromQueueRestriction.has(member.id)) ||
                      (excludedFromVoiceMove && excludedFromVoiceMove.has(member.id)) ||
                      (excludedFromNickUpdate && excludedFromNickUpdate.has(member.id));
  if (isExclusive) return;

  const totalDays = totalSeconds / 86400;
  const rolesToAdd = [];
  const rewardsEarned = [];

  // Recorrer las recompensas de mayor a menor días para detectar cuáles le corresponden
  for (const reward of config.voiceTimeRewards) {
    if (totalDays >= reward.days) {
      if (!member.roles.cache.has(reward.roleId)) {
        rolesToAdd.push(reward.roleId);
        rewardsEarned.push(reward);
      }
    }
  }

  if (rolesToAdd.length > 0) {
    try {
      // Filtrar solo roles que existen en el servidor para evitar errores
      const validRolesToAdd = rolesToAdd.filter(id => member.guild.roles.cache.has(id));
      
      if (validRolesToAdd.length > 0) {
        await member.roles.add(validRolesToAdd);
        
        // Enviar log si hay un canal configurado
        if (typeof sendLog === 'function') {
          const embed = new EmbedBuilder()
            .setTitle('🎖️ Nuevas Recompensas de Voz')
            .setDescription(`¡<@${member.id}> ha desbloqueado nuevos roles por su tiempo en voz!`)
            .addFields(
              { name: 'Tiempo Total', value: `\`${totalDays.toFixed(2)}\` días`, inline: true },
              { name: 'Roles Obtenidos', value: rewardsEarned.filter(r => validRolesToAdd.includes(r.roleId)).map(r => `${r.emoji} <@&${r.roleId}>`).join('\n'), inline: false }
            )
            .setColor(COLORS?.SUCCESS || 0x00FF00)
            .setTimestamp();
            
          await sendLog(member.guild, embed, [], 'rolesCall');
        }
        
        console.log(`[VoiceRewards] Roles asignados a ${member.user.tag}: ${validRolesToAdd.join(', ')}`);
      }
    } catch (error) {
      console.error(`[VoiceRewards] Error al asignar roles a ${member.user.id}:`, error.message);
    }
  }

}

module.exports = {
  checkVoiceRewards
};
