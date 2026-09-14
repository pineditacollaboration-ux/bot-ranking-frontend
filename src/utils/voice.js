// src/utils/voice.js

const { PermissionsBitField, ChannelType } = require('discord.js');

function checkVoiceChannelPermissions(channel, botMember) {
  const permissions = channel.permissionsFor(botMember);
  const requiredPermissions = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.MoveMembers,
    PermissionsBitField.Flags.ManageRoles, // Necesario para editar permisos del canal
    PermissionsBitField.Flags.ManageChannels, // También útil para editar permisos
  ];

  const missing = requiredPermissions.filter(p => !permissions.has(p));

  return {
    hasPermission: missing.length === 0,
    missing: missing.map(p => Object.keys(PermissionsBitField.Flags).find(key => PermissionsBitField.Flags[key] === p)),
  };
}

async function movePlayerToOriginalVoiceChannel(guild, userId, originalChannelId, expectedCurrentChannelIds = null, excludedSet = null) {
  try {
    if (excludedSet && excludedSet.has(userId)) return;
    if (!originalChannelId) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member?.voice?.channel) {
      return;
    }

    // OPTIMIZACIÓN: Si se provee una lista de canales esperados, verificar que el usuario esté en uno de ellos
    // Esto evita mover a usuarios que ya se han unido a otra partida o canal manualmente.
    if (expectedCurrentChannelIds) {
      const currentId = member.voice.channel.id;
      const allowed = Array.isArray(expectedCurrentChannelIds) ? expectedCurrentChannelIds : [expectedCurrentChannelIds];
      if (!allowed.includes(currentId)) {
        return;
      }
    }

    if (member.voice.channel.id === originalChannelId) {
      return;
    }

    const targetChannel = await guild.channels.fetch(originalChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== ChannelType.GuildVoice) {
      console.warn(`El canal de voz original ${originalChannelId} para ${member?.user?.tag || userId} ya no existe o no es un canal de voz.`);
      return;
    }

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 400;
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        await member.voice.setChannel(targetChannel, 'Finalización de partida.');
        break;
      } catch (err) {
        const isTimeout = err?.code === 'UND_ERR_CONNECT_TIMEOUT' || /Connect Timeout/i.test(err?.message || '');
        const isTransient =
          isTimeout ||
          err?.status === 500 ||
          err?.status === 504 ||
          err?.status === 502 ||
          err?.code === 50013 || // Missing permissions (puede ser transitorio por cache; reintentar una vez)
          err?.code === 50001 || // Missing access (permisos momentáneos)
          err?.code === 10003;   // Unknown channel (resolución tardía)
        attempt++;
        if (!isTransient || attempt >= MAX_RETRIES) {
          throw err;
        }
        const delay = BASE_DELAY_MS * attempt;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  } catch (error) {
    if (error.code !== 40032 && error.code !== 10003) {
      console.error(`Error al mover a ${userId} a su canal original:`, error);
    }
  }
}

module.exports = { checkVoiceChannelPermissions, movePlayerToOriginalVoiceChannel };
