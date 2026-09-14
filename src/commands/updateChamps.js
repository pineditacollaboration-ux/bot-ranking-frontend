/**
 * updateChamps.js
 * Comando !updatechamps — Fuerza la actualización de los roles de campeones.
 * Requiere permisos de staff.
 */

async function updateChamps(message, args, { hasPermission, updateChampionRoles, CHAMPION_ROLES }) {
  if (!hasPermission(message.member)) {
    return message.channel.send('🚫 Solo el staff puede usar este comando.').catch(() => {});
  }

  const championRoles = CHAMPION_ROLES || {};

  const loadingMsg = await message.channel.send('⏳ Actualizando roles de campeones...').catch(() => null);

  try {
    await updateChampionRoles(championRoles);
    if (loadingMsg) {
      await loadingMsg.edit('✅ Roles de campeones actualizados correctamente.').catch(() => {});
    } else {
      await message.channel.send('✅ Roles de campeones actualizados correctamente.').catch(() => {});
    }
  } catch (err) {
    console.error('[updateChamps] Error al actualizar roles de campeones:', err);
    if (loadingMsg) {
      await loadingMsg.edit('❌ Ocurrió un error al actualizar los roles de campeones. Revisa la consola.').catch(() => {});
    } else {
      await message.channel.send('❌ Ocurrió un error al actualizar los roles de campeones. Revisa la consola.').catch(() => {});
    }
  }
}

module.exports = updateChamps;
