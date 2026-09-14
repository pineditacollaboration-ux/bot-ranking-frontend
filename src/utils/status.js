const { ActivityType } = require('discord.js');

let maintenanceActive = false;
let maintenanceText = '🛠️ Mantenimiento';
let tickerInterval = null;

async function setBotNickname(client, guildId, nickname) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;
    const me = guild.members.me || await guild.members.fetch(client.user.id);
    await me.setNickname(nickname);
    console.log(`Apodo del bot establecido a "${nickname}" en el servidor ${guild.name}.`);
  } catch (error) {
    console.error('No se pudo establecer el apodo del bot:', error.message);
  }
}

function startStatusTicker(client, statuses, intervalMs = 10000) {
  if (!Array.isArray(statuses) || statuses.length === 0) return;
  if (tickerInterval) clearInterval(tickerInterval);
  let i = 0;
  tickerInterval = setInterval(async () => {
    try {
      if (maintenanceActive) {
        client.user.setActivity(maintenanceText, { type: ActivityType.Playing });
        return; // No avanzar el índice mientras mantenimiento esté activo
      }
      const status = statuses[i];
      // Soporte para nombres dinámicos (funciones)
      const name = typeof status.name === 'function' ? await status.name() : status.name;
      
      client.user.setActivity(name, { type: status.type || ActivityType.Playing });
      i = (i + 1) % statuses.length;
    } catch (err) {
      console.warn('Error al establecer la actividad del bot:', err.message);
    }
  }, intervalMs);
}

function setMaintenancePresence(client, enabled, text = '🛠️ Mantenimiento') {
  maintenanceActive = Boolean(enabled);
  maintenanceText = text || maintenanceText;
  try {
    if (maintenanceActive) {
      client.user.setActivity(maintenanceText, { type: ActivityType.Playing });
    }
  } catch (err) {
    console.warn('No se pudo actualizar la presencia de mantenimiento:', err.message);
  }
}

module.exports = { setBotNickname, startStatusTicker, setMaintenancePresence };