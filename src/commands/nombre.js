// src/commands/nombre.js
// Comando para establecer un nombre personalizado para el perfil

async function nombreCommand(message, args, { Player, updateAffectedNicknames, EmbedBuilder, COLORS, tryUpdateNicknameForMember, EMOJIS }) {
  const emojis = EMOJIS || { success: '✅', error: '❌', warning: '⚠️' };
  try {
    if (args.length === 0) {
      return message.reply(`${emojis.error} Debes proporcionar un nombre. Uso: \`!nombre TuNombre\``);
    }

    const customName = args.join(' ').trim();

    // Validaciones
    if (customName.length > 20) {
      return message.reply(`${emojis.error} El nombre no puede tener más de 20 caracteres.`);
    }

    if (customName.length < 2) {
      return message.reply(`${emojis.error} El nombre debe tener al menos 2 caracteres.`);
    }

    // Obtener nombre anterior
    const oldPlayer = await Player.findOne({ _id: message.author.id });
    const oldName = oldPlayer?.customName || message.member?.displayName || message.author.username;

    // Actualizar en la base de datos y obtener documento actualizado
    const updatedPlayer = await Player.findOneAndUpdate(
      { _id: message.author.id },
      { customName: customName },
      { upsert: true, new: true }
    );

    // Verificar permisos de gestión del usuario
    const canManage = message.guild ? message.member.manageable : false;

    // Actualizar nickname en Discord inmediatamente (Background Sync)
    if (updateAffectedNicknames && message.guild) {
        updateAffectedNicknames(message.guild, [message.author.id]);
    }
    
    // Forzar actualización inmediata respetando el rank (Instant Update)
    if (tryUpdateNicknameForMember && message.guild && updatedPlayer && canManage) {
        const rank = updatedPlayer.lastKnownRank;
        const rankTag = rank ? `RANK ${rank}` : '';
        // Intentamos actualizar inmediatamente usando el rank conocido
        try {
            await tryUpdateNicknameForMember(message.guild, message.author.id, rankTag, message.member);
        } catch (e) {
            console.error('[Nombre Command] Error updating nickname immediately:', e);
        }
    }

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.success} ÉXITO`)
      .setColor(COLORS?.SUCCESS || 0x57F287)
      .setDescription(`El nombre de <@${message.author.id}> ha sido actualizado con éxito.`)
      .addFields({
        name: 'Cambio:',
        value: `\`${oldName}\` → \`${customName}\`` + (oldName === customName ? ' (Sin cambios)' : ''),
        inline: false
      })
      .setFooter({ 
        text: `Solicitado por ${message.author.username}`, 
        iconURL: message.author.displayAvatarURL() 
      })
      .setTimestamp();

    if (message.guild && !canManage) {
      embed.setColor(COLORS?.WARNING || 0xFEE75C);
      embed.addFields({
        name: `${emojis.warning} Aviso de Permisos`,
        value: 'El nombre se guardó en la base de datos, pero **no pude actualizar tu apodo en Discord** porque tienes un rol superior al mío o eres el dueño del servidor.',
        inline: false
      });
    }

    return message.reply({ embeds: [embed] });

  } catch (error) {
    console.error('[Nombre Command] Error:', error);
    return message.reply(`${emojis.error} Ocurrió un error al establecer tu nombre personalizado.`);
  }
}

module.exports = { nombreCommand };
