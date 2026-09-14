const fs = require('fs');
const path = require('path');

function createLogger({ client, settingsRef, ChannelType, AttachmentBuilder, EmbedBuilder, COLORS, config }) {
  function resolveLogChannelId(category) {
    if (!settingsRef) {
      console.warn('[Logger] settingsRef is undefined. Cannot resolve log channel.');
      return null;
    }
    const map = {
      errors: settingsRef.logChannelErrorsId,
      queues: settingsRef.logChannelQueuesId,
      matches: settingsRef.logChannelMatchesId,
      autorole: settingsRef.logChannelAutoroleId,
      warnings: settingsRef.logChannelWarningsId,
      points: settingsRef.logChannelPointsId,
      coins: settingsRef.logChannelCoinsId,
      stats: settingsRef.logChannelStatsId,
      shop: settingsRef.logChannelShopId,
      roulette: settingsRef.logChannelRouletteId,
      penalty10k: settingsRef.logChannelPenalty10kId,
      bets: settingsRef.logChannelBetsId,
      spins: settingsRef.logChannelSpinsId,
      reset: settingsRef.logChannelResetId,
      voiceTemp: settingsRef.logChannelVoiceTempId,
      raid: settingsRef.logChannelRaidId,
      terminos: settingsRef.logChannelTerminosId,
      vips: settingsRef.logChannelVipsId,
      exclusivo: settingsRef.logChannelExclusivoId,
      rolesCall: settingsRef.logChannelRolesCallId,
      history: settingsRef.historyChannel,

      admin: settingsRef.logChannelId,
      settings: settingsRef.logChannelId,
    };
    const selected = (category && map[category]) || settingsRef.logChannelId;
    return selected;
  }

  async function sendLog(guild, embed, attachments = [], category = null) {
    if (!guild || typeof guild.channels === 'undefined') {
        console.error('[Logger] ❌ Invalid Guild object in sendLog. (Received:', typeof guild, ')');
        return null;
    }

    let channelId = resolveLogChannelId(category);
    let channel = null;

    // --- RESOLUCIÓN DE CANAL ---
    const tryFetch = async (id) => {
        if (!id) return null;
        let chan = client.channels.cache.get(id);
        if (chan) return chan;
        try {
            return await Promise.race([
                guild.channels.fetch(id),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 8000))
            ]);
        } catch (err) {
            console.warn(`[Logger] ⚠️ Failed fetch for ${id}: ${err.message}`);
            return null;
        }
    };

    // 1. Canal Primario
    channel = await tryFetch(channelId);

    // 2. Fallback: Settings default
    if (!channel && settingsRef.logChannelId && channelId !== settingsRef.logChannelId) {
        console.warn(`[Logger] 🔄 Falling back to settings.logChannelId for category ${category}`);
        channelId = settingsRef.logChannelId;
        channel = await tryFetch(channelId);
    }

    // 3. Fallback: Config default
    if (!channel && config?.logChannelId && channelId !== config.logChannelId) {
        console.warn(`[Logger] 🔄 Falling back to config.logChannelId for category ${category}`);
        channelId = config.logChannelId;
        channel = await tryFetch(channelId);
    }

    if (!channel) {
        console.error(`[Logger] 💀 CRITICAL: No valid channel found for category '${category}'.`);
        return null;
    }

    // --- VERIFICACIÓN DE PERMISOS ---
    try {
        const me = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
        if (me) {
            const perms = channel.permissionsFor(me);
            if (!perms || !perms.has('SendMessages')) {
                console.error(`[Logger] ❌ Missing 'SendMessages' permission in ${channel.name} (${channel.id})`);
                return null;
            }
            if (embed && !perms.has('EmbedLinks')) {
                console.error(`[Logger] ❌ Missing 'EmbedLinks' permission in ${channel.name} (${channel.id})`);
                // Fallback: Si no puede enviar embeds, intentar enviar solo el texto del título/descripción
                const fallbackText = `⚠️ **FALTA PERMISO 'EMBED_LINKS' en ${channel.name}**\n\n**${embed.data?.title || 'Log'}**\n${embed.data?.description || ''}`;
                return channel.send({ content: fallbackText.substring(0, 2000) }).catch(() => null);
            }
        }
    } catch (permErr) {
        console.warn(`[Logger] ⚠️ Error checking permissions: ${permErr.message}`);
    }

    // --- ENVÍO CON REINTENTOS ---
    const payload = { embeds: [embed] };
    if (Array.isArray(attachments) && attachments.length > 0) {
        payload.files = attachments;
    }

    let attempt = 0;
    while (attempt < 3) {
      try {
        const msg = await channel.send(payload);
        // console.log(`[Logger] ✅ Log delivered to <#${channel.id}> (Msg: ${msg.id})`);
        return msg;
      } catch (err) {
        attempt++;
        console.warn(`[Logger] ⚠️ Send attempt ${attempt} failed for category ${category}: ${err.message}`);
        if (attempt >= 3) {
          console.error(`[Logger] ❌ Final send failure for category ${category}: ${err.message}`);
          break;
        }
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    return null;
  }

  async function logMatchChatHistory(guild, textChannelId, matchNumber, matchId) {
    if (!textChannelId) return;
    // Fix: check for any valid log channel (default or specific category) instead of returning early incorrectly
    const hasLogConfig = settingsRef.logChannelId || settingsRef.logChannelMatchesId || settingsRef.historyChannel;
    if (!hasLogConfig) return;
    try {
      const matchChannel = guild.channels.cache.get(textChannelId) || await guild.channels.fetch(textChannelId).catch(() => null);
      if (!matchChannel) return;
      if (typeof matchChannel.isThread === 'function' && matchChannel.isThread() && matchChannel.archived) return;
      const messages = await matchChannel.messages.fetch({ limit: 100 }).catch(err => {
        const msg = String(err?.message || '');
        if (err?.code === 10003 || err?.status === 404 || /Unknown Channel/i.test(msg)) return null;
        if (err?.code === 50001 || err?.code === 50013 || /Missing Access|Missing Permissions/i.test(msg)) return null;
        throw err;
      });
      if (!messages || messages.size === 0) return;
      const sortedMessages = Array.from(messages.values()).reverse();
      
      const rolesMap = {};
      guild.roles.cache.forEach(r => {
          rolesMap[r.id] = { name: r.name, color: r.hexColor };
      });

      // Full JSON data for web transcript
      const transcriptData = {
        matchNumber,
        matchId: matchId || null,
        timestamp: Date.now(),
        roles: rolesMap,
        messages: sortedMessages.map(msg => ({
          author: {
            name: msg.author.username,
            avatar: msg.author.displayAvatarURL({ extension: 'png', size: 128 }),
            bot: msg.author.bot,
            id: msg.author.id,
            color: msg.member?.displayHexColor || '#ffffff'
          },
          content: msg.content,
          timestamp: msg.createdTimestamp,
          attachments: Array.from(msg.attachments.values()).map(a => ({ url: a.url, name: a.name, contentType: a.contentType })),
          stickers: Array.from(msg.stickers.values()).map(s => ({ url: s.url, name: s.name })),
          embeds: msg.embeds.map(e => e.toJSON())
        }))
      };

      // Save JSON
      const transcriptsDir = path.join(__dirname, '../../logs/transcripts');
      if (!fs.existsSync(transcriptsDir)) fs.mkdirSync(transcriptsDir, { recursive: true });
      const fileName = matchId ? `${matchId}.json` : `${guild.id}-${matchNumber}.json`;
      fs.writeFileSync(path.join(transcriptsDir, fileName), JSON.stringify(transcriptData, null, 2));

      // DISABLED: Legacy .txt for fallback/attachment (now using web transcript exclusively)
      /*
      const logContent = sortedMessages.map(msg => {
        const timestamp = new Date(msg.createdTimestamp).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `[${timestamp}] ${msg.author.tag}: ${msg.content}`;
      }).join('\n');
      
      const attachment = new AttachmentBuilder(Buffer.from(logContent, 'utf-8'), { name: `chat-log-partida-${matchNumber}.txt` });
      const logEmbed = new EmbedBuilder()
        .setTitle(`📜 Log de Chat - Partida #${matchNumber}`)
        .setDescription('Se adjunta el historial de conversación del canal de texto de la partida.')
        .setColor(COLORS.PRIMARY)
        .setTimestamp();
      await sendLog(guild, logEmbed, [attachment], 'matches');
      
      if (settingsRef.historyChannel && settingsRef.historyChannel !== resolveLogChannelId('matches')) {
          await sendLog(guild, logEmbed, [attachment], 'history');
      }
      */
    } catch (error) {
      console.warn(`Log de chat omitido para partida #${matchNumber}: ${error?.message || error}`);
    }
  }

  return { sendLog, logMatchChatHistory, resolveLogChannelId };
}

module.exports = createLogger;
