// src/events/guildMemberRemove.js
module.exports = async function onGuildMemberRemove(member, ctx) {
  const { Player } = ctx;

  try {
    await Player.updateOne({ _id: member.id }, { $set: { lastKnownRank: null } });
    console.log(`[Nick Sync] El miembro ${member.user.tag} ha abandonado el servidor. Su rango conocido ha sido reseteado.`);
  } catch (error) {
    console.error(`Error en onGuildMemberRemove para ${member?.user?.tag || member?.id}:`, error);
  }
};