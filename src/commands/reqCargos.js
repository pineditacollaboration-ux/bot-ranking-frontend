// src/commands/reqCargos.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

async function reqCargos(message, args, { COLORS, EMBED_DEFAULTS, config }) {
  const embed = new EmbedBuilder()
    .setTitle('💎 TIENDA DE CARGOS Y BENEFICIOS')
    .setDescription('Selecciona un paquete del menú inferior para comprarlo usando tus puntos acumulados.\n\n' +
      '**PAQUETES DISPONIBLES:**\n' +
      '👑 **ROUBADÃO** - 100k Puntos\n' +
      '🛡️ **EXCLUSIVE** - 70k Puntos\n' +
      '💣 **BLOOD OATH** - 50k Puntos\n' +
      '❄️ **BANCA ALTA** - 40k Puntos\n' +
      '🕷️ **BANCA FACIL** - 20k Puntos\n' +
      '🌙 **SEM MEDO** - 10k Puntos\n' +
      '⚡ **VENGEANCE** - 8k Puntos')

    .addFields(
      { name: 'ℹ️ Información', value: 'Al comprar un paquete, recibirás beneficios automáticos como coins, devolución de puntos y roles especiales.' }
    )
    .setColor(COLORS.PRIMARY || 0x800080)
    .setImage(EMBED_DEFAULTS.thumbnail)
    .setFooter(EMBED_DEFAULTS.footer)
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('buy_req_cargo')
    .setPlaceholder('Selecciona un paquete para comprar...')
    .addOptions([
      {
        label: 'ROUBADÃO',
        description: 'Cuesta 100k. Da 40k pts, 40 coins, Rol 👑 y Call Privada.',
        value: 'roubadao',
        emoji: '👑'
      },
      {
        label: 'EXCLUSIVE',
        description: 'Cuesta 70k. Da 30k pts, 35 coins, Rol 🛡️ y Call Privada.',
        value: 'exclusive',
        emoji: '🛡️'
      },
      {
        label: 'BLOOD OATH',
        description: 'Cuesta 50k. Da 20k pts, 30 coins, Rol 💣 y Call Privada.',
        value: 'blood_oath',
        emoji: '💣'
      },
      {
        label: 'BANCA ALTA',
        description: 'Cuesta 40k. Da 15k pts, 25 coins, Rol ❄️ y Call Privada.',
        value: 'banca_alta',
        emoji: '❄️'
      },
      {
        label: 'BANCA FACIL',
        description: 'Cuesta 20k. Da 10k pts, 20 coins y Rol 🕷️.',
        value: 'banca_facil',
        emoji: '🕷️'
      },
      {
        label: 'SEM MEDO',
        description: 'Cuesta 10k. Da 8k pts, 15 coins y Rol 🌙.',
        value: 'sem_medo',
        emoji: '🌙'
      },
      {
        label: 'VENGEANCE',
        description: 'Cuesta 8k. Da 5k pts, 10 coins y Rol ⚡.',
        value: 'vengeance',
        emoji: '⚡'
      }
    ]);


  const row = new ActionRowBuilder().addComponents(menu);

  return message.channel.send({ embeds: [embed], components: [row] });
}

module.exports = reqCargos;
