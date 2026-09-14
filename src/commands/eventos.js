const { EmbedBuilder } = require('discord.js');

async function eventosCommand(message, args, deps) {
  const { Setting, Player, COLORS, EMBED_DEFAULTS } = deps;

  // Obtener evento global
  let globalEventSetting = await Setting.findById('global_event');
  const now = Date.now();
  const activeEvents = [];

  // Verificar si hay evento en Setting
  if (globalEventSetting && globalEventSetting.value) {
    const { type, until, title } = globalEventSetting.value;
    if (until && until > now) {
      let eventName = title || 'Evento Especial';
      if (!title) {
        switch(type) {
          case 'x2': eventName = '💎 Puntos X2'; break;
          case 'x3': eventName = '💎 Puntos X3'; break;
          case 'x4': eventName = '💎 Puntos X4'; break;
          case 'x5': eventName = '💎 Puntos X5'; break;
          case 'proteccion': eventName = '🛡️ Protección contra Derrota'; break;
        }
      }
      activeEvents.push({
        name: eventName,
        until: until
      });
    }
  }

  // Fallback: Si no hay evento en Setting, buscar en Players (Self-Healing)
  if (activeEvents.length === 0 && Player) {
    // Buscar un jugador que tenga algún evento activo
    const playerEvent = await Player.findOne({
      $or: [
        { x5_until: { $gt: now } },
        { x4_until: { $gt: now } },
        { x3_until: { $gt: now } },
        { x2_until: { $gt: now } },
        { proteccion_until: { $gt: now } }
      ]
    }).select('x2_until x3_until x4_until x5_until proteccion_until');

    if (playerEvent) {
      let type = null;
      let until = 0;
      let title = null;

      if (playerEvent.x5_until > now) { type = 'x5'; until = playerEvent.x5_until; }
      else if (playerEvent.x4_until > now) { type = 'x4'; until = playerEvent.x4_until; }
      else if (playerEvent.x3_until > now) { type = 'x3'; until = playerEvent.x3_until; }
      else if (playerEvent.x2_until > now) { type = 'x2'; until = playerEvent.x2_until; }
      else if (playerEvent.proteccion_until > now) { type = 'proteccion'; until = playerEvent.proteccion_until; }

      if (type && until > now) {
        // Recuperar nombre
        let eventName = 'Evento Detectado';
        switch(type) {
          case 'x2': eventName = '💎 Puntos X2'; break;
          case 'x3': eventName = '💎 Puntos X3'; break;
          case 'x4': eventName = '💎 Puntos X4'; break;
          case 'x5': eventName = '💎 Puntos X5'; break;
          case 'proteccion': eventName = '🛡️ Protección contra Derrota'; break;
        }

        activeEvents.push({
          name: eventName,
          until: until
        });

        // Auto-reparar Setting
        try {
          await Setting.findByIdAndUpdate('global_event', {
            $set: {
              value: { type, until, title: eventName }
            }
          }, { upsert: true });
          console.log(`[Auto-Repair] Evento global recuperado de jugadores: ${type}`);
        } catch (err) {
          console.error('Error al auto-reparar evento global:', err);
        }
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🎉 Eventos Activos')
    .setColor(COLORS.GOLD) // Dorado para eventos
    .setFooter(EMBED_DEFAULTS.footer);

  if (activeEvents.length > 0) {
    const description = activeEvents.map(event => {
      const timestamp = Math.floor(event.until / 1000);
      return `**${event.name}**\nTermina: <t:${timestamp}:F> (<t:${timestamp}:R>)`;
    }).join('\n\n');
    embed.setDescription(description);
  } else {
    embed.setDescription('No hay eventos globales activos en este momento.');
    embed.setColor(COLORS.WARNING);
  }

  return message.channel.send({ embeds: [embed] });
}

module.exports = { eventosCommand };
