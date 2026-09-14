// src/interactions/reqCargos.js
const { EmbedBuilder, MessageFlags } = require('discord.js');

const PACKS = {
  roubadao: {
    name: 'ROUBADÃO',
    cost: 100000,
    backPoints: 40000,
    coins: 40,
    roleIds: ['1499293726856712232', '1499269694656610335'],
    emoji: '👑',
    hasPrivateCall: true
  },
  exclusive: {
    name: 'EXCLUSIVE',
    cost: 70000,
    backPoints: 30000,
    coins: 35,
    roleIds: ['1499292933642391653', '1499270095782809630'],
    emoji: '🛡️',
    hasPrivateCall: true
  },
  blood_oath: {
    name: 'BLOOD OATH',
    cost: 50000,
    backPoints: 20000,
    coins: 30,
    roleIds: ['1499293080392568852', '1499270198513897542'],
    emoji: '💣',
    hasPrivateCall: true
  },
  banca_alta: {
    name: 'BANCA ALTA',
    cost: 40000,
    backPoints: 15000,
    coins: 25,
    roleIds: ['1499293289034285118', '1499270322606833664'],
    emoji: '❄️',
    hasPrivateCall: true
  },
  banca_facil: {
    name: 'BANCA FACIL',
    cost: 20000,
    backPoints: 10000,
    coins: 20,
    roleIds: ['1499293167428567091'],
    emoji: '🕷️',
    hasPrivateCall: false
  },
  sem_medo: {
    name: 'SEM MEDO',
    cost: 10000,
    backPoints: 8000,
    coins: 15,
    roleIds: ['1499293574968250379'],
    emoji: '🌙',
    hasPrivateCall: false
  },
  vengeance: {
    name: 'VENGEANCE',
    cost: 8000,
    backPoints: 5000,
    coins: 10,
    roleIds: ['1499292762946670704'],
    emoji: '⚡',
    hasPrivateCall: false
  }
};


async function handleReqCargosSelection(interaction, { Player, ensurePlayerRecord, COLORS, sendLog }) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'buy_req_cargo') return;

  const packKey = interaction.values[0];
  const pack = PACKS[packKey];
  if (!pack) return;

  const player = await ensurePlayerRecord(interaction.user.id);
  if (!player.currentSeason) player.currentSeason = { points: 0 };

  // Usar puntos de temporada (los que se ven en el perfil)
  if ((player.currentSeason.points || 0) < pack.cost) {
    return interaction.reply({
      content: `❌ No tienes suficientes puntos. Necesitas **${pack.cost.toLocaleString()}** y tienes **${(player.currentSeason.points || 0).toLocaleString()}**.`,
      flags: [MessageFlags.Ephemeral]
    });
  }

  // Confirmación procesada
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // 1. Cobrar puntos y dar beneficios numéricos
    player.currentSeason.points -= pack.cost;
    player.currentSeason.points += pack.backPoints;

    player.styleCoins = (player.styleCoins || 0) + pack.coins;

    // 2. Dar beneficios de cartera (Call Privada Permanente / permanentVoice)
    if (pack.hasPrivateCall) {
      if (!player.donationRights) player.donationRights = {};
      player.donationRights.permanentVoice = (player.donationRights.permanentVoice || 0) + 1;
    }

    // 3. Dar Roles automáticos
    const member = interaction.member;
    const rolesAdded = [];
    const rolesFailed = [];

    if (member) {
      for (const roleId of pack.roleIds) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          rolesFailed.push(`Rol inexistente (${roleId})`);
          continue;
        }

        if (role.position >= interaction.guild.members.me.roles.highest.position) {
          rolesFailed.push(`<@&${roleId}> (Jerarquía baja)`);
          continue;
        }

        try {
          await member.roles.add(role.id);
          rolesAdded.push(`<@&${roleId}>`);
        } catch (err) {
          console.error(`[ReqCargos] Error adding role ${roleId}:`, err);
          rolesFailed.push(`<@&${roleId}> (Error interno)`);
        }
      }
    }

    await player.save();

    // 4. Notificar al usuario
    const embed = new EmbedBuilder()
      .setTitle(`✅ Compra Exitosa: ${pack.emoji} ${pack.name}`)
      .setDescription(`Has adquirido el paquete **${pack.name}** correctamente.`)
      .addFields(
        { name: '💰 Coste Neto', value: `\`${(pack.cost - pack.backPoints).toLocaleString()}\` puntos`, inline: true },
        { name: '🪙 Coins Recibidas', value: `\`${pack.coins}\``, inline: true }
      )
      .setColor(COLORS.SUCCESS)
      .setTimestamp();

    if (rolesAdded.length > 0) {
      embed.addFields({ name: '🎭 Roles Asignados', value: rolesAdded.join(', '), inline: false });
    }
    if (rolesFailed.length > 0) {
      embed.addFields({ name: '⚠️ Roles no asignados (Staff)', value: rolesFailed.join(', '), inline: false });
    }

    if (pack.hasPrivateCall) {
      embed.addFields({ name: '📞 Call Privada Puntos', value: 'Se ha añadido 1 Call Privada Permanente a tu cartera. Usa `!p` -> Botón Cartera.', inline: false });
    }

    await interaction.editReply({ embeds: [embed] });

    // 5. Log para el staff
    if (sendLog) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🛒 Compra de Paquete de Cargos')
        .setDescription(`**Usuario:** <@${interaction.user.id}>\n**Paquete:** ${pack.emoji} ${pack.name}`)
        .addFields(
          { name: 'Puntos Gastados', value: `\`${pack.cost.toLocaleString()}\``, inline: true },
          { name: 'Puntos Devueltos', value: `\`${pack.backPoints.toLocaleString()}\``, inline: true },
          { name: 'Coins Entregadas', value: `\`${pack.coins}\``, inline: true }
        )
        .setColor(COLORS.PRIMARY)
        .setTimestamp();

      await sendLog(interaction.guild, logEmbed, [], 'shop');
    }

  } catch (error) {
    console.error('[ReqCargos] Error en la compra:', error);
    await interaction.editReply({ content: '❌ Ocurrió un error al procesar tu compra. Por favor, contacta con un administrador.' });
  }
}

module.exports = { handleReqCargosSelection };
