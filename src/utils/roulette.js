// src/utils/roulette.js
// Lógica y constantes de ruleta

const parseDuration = require('parse-duration');

const ROULETTE_PRIZES = [
  { id: 0, name: "+2 GIROS", type: 'spins', amount: 2, image: '1.png' },
  { id: 1, name: "1000 PUNTOS", type: 'points', amount: 1000, image: '2.png' },
  { id: 2, name: "3000 PUNTOS", type: 'points', amount: 3000, image: '3.png' },
  { id: 3, name: "CALL PRIVADA 30 DÍAS", type: 'manual_dm', message: "¡Felicidades! Ganaste una **Call Privada por 30 días**. Por favor, abre un ticket en el servidor para reclamarla.", image: '4.png' },
  { id: 4, name: "DISCORD NITRO 1 MES", type: 'manual_dm', message: "¡Felicidades! Ganaste **Discord Nitro 1 Mes**. Por favor, abre un ticket en el servidor para reclamarlo.", image: '5.png' },
  { id: 5, name: "DISCORD NITRO 3 MESES", type: 'manual_dm', message: "¡Felicidades! Ganaste **Discord Nitro 3 Meses**. Por favor, abre un ticket en el servidor para reclamarlo.", image: '6.png' },
  { id: 6, name: "PROTECCIÓN DE PUNTOS 2H", type: 'role', duration: '2h', roleId: '1489763803250819284', image: '7.png', cumulative: true },
  { id: 7, name: "PUNTOS X2 POR 2H", type: 'role', duration: '2h', roleId: '1489763749878566912', image: '8.png', cumulative: true },
  { id: 8, name: "VIP ROYAL RANKED 30 DÍAS (VISUAL)", type: 'role', duration: '30d', roleId: '1497028208644591646', image: '9.png', cumulative: true },
  { id: 9, name: "ROL KING", type: 'role', duration: '30d', roleId: '1490449395882135632', image: '10.png', cumulative: true }
];

const ROULETTE_PROBABILITIES = [
  2,       // +2 GIROS
  4,       // 1000 PUNTOS
  2,       // 3000 PUNTOS
  1,       // CALL PRIVADA
  0.00001,  // NITRO 1 MES
  0.000001, // NITRO 3 MESES
  10,      // PROTECCIÓN
  7,       // PUNTOS X2
  1,       // VIP ROYAL RANKED 
  0.8      // ROL KING
];

function createRouletteUtils({ Player, config, EmbedBuilder, sendLog, COLORS, updateNicknamesEfficiently, updateAffectedNicknames }) {
  async function deliverPrize(member, prize) {
    const user = member.user;
    let updateQuery = {};
    let notificationText = '';

    switch (prize.type) {
      case 'points':
        updateQuery = { $inc: { 'currentSeason.points': prize.amount } };
        await Promise.race([
          Player.findByIdAndUpdate(user.id, updateQuery),
          new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 10000))
        ]);
        notificationText = `¡Has ganado **${prize.amount} puntos**!`;
        break;

      case 'spins':
        updateQuery = { $inc: { spins: prize.amount } };
        await Promise.race([
          Player.findByIdAndUpdate(user.id, updateQuery),
          new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 10000))
        ]);
        notificationText = `¡Has ganado **${prize.amount} giros extra**!`;
        break;

      case 'manual_dm':
        notificationText = prize.message;

        // Log para el staff
        const manualEmbed = new EmbedBuilder()
          .setTitle("🎁 Premio Manual Ganado")
          .setDescription(`**Usuario:** <@${user.id}>\n**Premio:** ${prize.name}\n**Acción:** Reclamar via ticket.`)
          .setColor(COLORS.GOLD)
          .setTimestamp();
        sendLog(member.guild, manualEmbed, [], 'roulette');
        break;

      case 'role':
        {
          let roleId = prize.roleId || config.rouletteRoles?.[prize.roleKey];
          if (!roleId) {
            notificationText = `⚠️ Ganaste **${prize.name}**, pero el rol no está configurado. El staff lo revisará.`;
            break;
          }

          const guild = member.guild;
          const roleObj = guild.roles.cache.get(roleId) || await Promise.race([
            guild.roles.fetch(roleId).catch(() => null),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Role fetch timeout')), 5000))
          ]).catch(() => null);
          if (!roleObj) {
            notificationText = `⚠️ Ganaste **${prize.name}**, pero el rol no existe. El staff lo revisará.`;
            break;
          }

          const durationMs = parseDuration(prize.duration);
          const now = Date.now();
          const player = await Promise.race([
            Player.findById(user.id).lean(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 10000))
          ]);
          const existing = (player?.temporaryRoles || []).find(r => r.roleId === roleId);

          let newExpiresAtMs;
          let extended = false;
          const existingExpiryRaw = existing?.expiresAt;
          const existingExpiryMs = (existingExpiryRaw instanceof Date) ? existingExpiryRaw.getTime() : Number(existingExpiryRaw || 0);
          if (existing && existingExpiryMs > now) {
            newExpiresAtMs = existingExpiryMs + durationMs;
            extended = true;
          } else {
            newExpiresAtMs = now + durationMs;
          }
          const newExpiresAt = new Date(newExpiresAtMs);

          let addedSuccessfully = member.roles.cache.has(roleId);
          if (!addedSuccessfully) {
            try {
              await Promise.race([
                member.roles.add(roleId),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Role add timeout')), 5000))
              ]);
              addedSuccessfully = true;
            } catch (e) {
              addedSuccessfully = false;
            }
          }

          if (!addedSuccessfully) {
            notificationText = `⚠️ Ganaste **${prize.name}**, pero no pudimos asignarte el rol. El staff te lo asignará.`;
            break;
          }

          if (extended) {
            await Promise.race([
              Player.updateOne(
                { _id: user.id, 'temporaryRoles.roleId': roleId },
                { $set: { 'temporaryRoles.$.expiresAt': newExpiresAt } }
              ),
              new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 10000))
            ]);
          } else {
            updateQuery = { $push: { temporaryRoles: { roleId, expiresAt: newExpiresAt } } };
            await Promise.race([
              Player.findByIdAndUpdate(user.id, updateQuery),
              new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 10000))
            ]);
          }

          notificationText = extended
            ? `¡Tu premio **${prize.name}** se extendió! Expira <t:${Math.floor(newExpiresAt / 1000)}:R>.`
            : `¡Has ganado el rol **${prize.name}** por **${prize.duration}**!`;
        }
        break;

      case 'manual':
        {
          notificationText = `¡Has ganado **${prize.name}**! Un administrador se pondrá en contacto contigo.`;
        }
        break;
    }

    const prizeLogEmbed = new EmbedBuilder()
      .setTitle("🎰 Premio de Ruleta Entregado")
      .setDescription(`**Jugador:** <@${user.id}>\n**Premio:** ${prize.name}`)
      .setColor(COLORS.PRIMARY)
      .setTimestamp();
    sendLog(member.guild, prizeLogEmbed, [], 'roulette');

    if (typeof updateAffectedNicknames === 'function') {
      updateAffectedNicknames(member.guild, [user.id]);
    }
    return notificationText;
  }

  return { deliverPrize };
}

module.exports = { ROULETTE_PRIZES, ROULETTE_PROBABILITIES, createRouletteUtils };
