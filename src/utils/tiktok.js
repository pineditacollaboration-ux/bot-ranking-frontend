const { WebcastPushConnection } = require('tiktok-live-connector');
const { Player, StreamerChannel } = require('../../models');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
// const puppeteer = require('puppeteer'); // Desactivado para compatibilidad con Host
const axios = require('axios');
const PQueue = require('p-queue').default;

// Cooldown de 4 horas (en milisegundos)
const ANNOUNCEMENT_COOLDOWN = 4 * 60 * 60 * 1000;

// --- RATE LIMITING Y QUEUE SYSTEM ---
// Queue global para limitar conexiones simultáneas a TikTok
// concurrency: 3  → 3 checks en paralelo (suficiente para 20+ players sin rate-limit)
// interval / intervalCap: máximo 10 checks por minuto (ventana deslizante)
const tiktokQueue = new PQueue({
  concurrency: 3,
  interval: 60000,
  intervalCap: 10
});

// Lock para evitar que el cron lance una segunda ronda antes de terminar la anterior
let tiktokCronRunning = false;
function isTiktokCronRunning() { return tiktokCronRunning; }
function setTiktokCronRunning(val) { tiktokCronRunning = val; }

// Sistema de reintentos con backoff exponencial
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY = 2000; // 2 segundos
const RATE_LIMIT_RETRY_DELAY = 30000; // 30 segundos para rate limiting

// Mapa para trackear intentos de reintentos
const retryMap = new Map();

// --- Helper to manage streamer queue channels automatically ---
const STREAMER_CATEGORY_ID = '1473558364289241253';
const READ_ONLY_ROLE_ID = '1403172539588546621';
// Duration of a streamer channel before expiry (used when created/updated)
const STREAMER_CHANNEL_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

async function ensureStreamerChannel(guild, userId) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    // Determine channel name
    const channelName = `fila-${member.user.username}`.toLowerCase();
    let existingChannel = guild.channels.cache.find(c => c.name.toLowerCase() === channelName && c.parentId === STREAMER_CATEGORY_ID);

    if (!existingChannel && StreamerChannel) {
        const doc = await StreamerChannel.findOne({ ownerId: userId, guildId: guild.id }).catch(() => null);
        if (doc) {
            existingChannel = await guild.channels.fetch(doc._id).catch(() => null);
        }
    }

    // If exists, just update expiration
    if (existingChannel) {
        if (StreamerChannel) {
            await StreamerChannel.findByIdAndUpdate(existingChannel.id, {
                guildId: guild.id,
                ownerId: userId,
                ownerUsername: member.user.username,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + STREAMER_CHANNEL_TTL_MS)
            }, { upsert: true }).catch(() => { });
        }
        return;
    }

    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: STREAMER_CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: userId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.ManageChannels
                    ],
                },
                {
                    id: READ_ONLY_ROLE_ID,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
                    deny: [PermissionsBitField.Flags.SendMessages]
                }
            ],
        });

        if (StreamerChannel) {
            await StreamerChannel.findByIdAndUpdate(channel.id, {
                guildId: guild.id,
                ownerId: userId,
                ownerUsername: member.user.username,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + STREAMER_CHANNEL_TTL_MS)
            }, { upsert: true }).catch(e => console.error('Error guardando StreamerChannel en DB:', e));
        }
        console.log(`[TikTok] Canal streamer auto-creado: ${channel.id} para ${member.user.tag}`);
    } catch (err) {
        console.error('Error creando canal de streamer automático:', err);
    }
}

async function closeStreamerChannel(guild, userId) {
    if (!StreamerChannel) return;
    const doc = await StreamerChannel.findOne({ ownerId: userId, guildId: guild.id }).catch(() => null);
    if (!doc) return;

    try {
        const channel = await guild.channels.fetch(doc._id).catch(() => null);
        if (channel) {
            await channel.delete('Streamer offline, cerrando canal automáticamente').catch(() => { });
            console.log(`[TikTok] Canal streamer auto-cerrado: ${doc._id} (due to offline)`);
        }
    } catch (e) {
        console.error('Error cerrando canal de streamer automático:', e);
    }

    try {
        await StreamerChannel.deleteOne({ _id: doc._id }).catch(() => { });
    } catch (_) { }
}

// Bandera para desactivar Puppeteer (Siempre true en modo Host Friendly)
let puppeteerBroken = true;

async function checkLiveAxios(username) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.tiktok.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };

        // 0. Intentar API interna (Más fiable y rápida para status)
        try {
            const apiUrl = `https://www.tiktok.com/api-live/user/room/?aid=1988&uniqueId=${username}&sourceType=54`;
            const apiRes = await axios.get(apiUrl, { 
                headers: { ...headers, "Cookie": "tt_webid_v2=1234567890;" },
                timeout: 5000,
                validateStatus: status => status < 500
            });
            
            if (apiRes.data && apiRes.data.data && apiRes.data.data.liveRoom) {
                const room = apiRes.data.data.liveRoom;
                // status 2 = LIVE, 4 = FINISHED
                if (room.status === 2) {
                     console.log(`[TikTok] Axios detected LIVE via API for ${username}`);
                     return { isLive: true, roomId: room.roomId };
                }
            }
        } catch (apiErr) {
            // Continuar con scraping si falla la API
        }

        // 1. Intentar endpoint de perfil (a veces más accesible)
        const response = await axios.get(`https://www.tiktok.com/@${username}`, {
            headers,
            timeout: 8000,
            validateStatus: status => status < 500
        });

        const html = response.data;
        if (typeof html !== 'string') return { isLive: false };

        // 2. Buscar SIGI_STATE (Datos universales de TikTok)
        const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s);
        if (sigiMatch && sigiMatch[1]) {
            try {
                const json = JSON.parse(sigiMatch[1]);
                // Buscar en UserModule (información del perfil)
                const userModule = json.UserModule;
                if (userModule && userModule.users && userModule.users[username]) {
                    const user = userModule.users[username];
                    // roomId suele ser "" o "0" si no está en vivo
                    if (user.roomId && user.roomId !== "" && user.roomId !== "0") {
                         console.log(`[TikTok] Axios detected LIVE via SIGI_STATE (Profile) for ${username}`);
                         return { isLive: true, roomId: user.roomId };
                    }
                }
            } catch (e) {
                console.error('[TikTok] Error parsing SIGI_STATE:', e.message);
            }
        }

        // 3. Buscar __UNIVERSAL_DATA_FOR_REHYDRATION__ (Nuevo formato)
        const universalMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
        if (universalMatch && universalMatch[1]) {
             try {
                const json = JSON.parse(universalMatch[1]);
                const defaultScope = json.__DEFAULT_SCOPE__;
                
                // 3a. Buscar directamente en webapp.user-detail (Desktop)
                const userDetail = defaultScope?.['webapp.user-detail'];
                if (userDetail && userDetail.userInfo && userDetail.userInfo.user) {
                     const user = userDetail.userInfo.user;
                     if (user.roomId && user.roomId !== "" && user.roomId !== "0") {
                         console.log(`[TikTok] Axios detected LIVE via UNIVERSAL_DATA (Profile) for ${username}`);
                         return { isLive: true, roomId: user.roomId };
                     }
                }
                
                // 3b. Buscar dinámicamente cualquier llave que parezca user-detail
                const userDetailKey = Object.keys(defaultScope || {}).find(k => k.includes('webapp.user-detail'));
                if (userDetailKey && defaultScope[userDetailKey]) {
                     const user = defaultScope[userDetailKey].userInfo?.user;
                     if (user && user.roomId && user.roomId !== "" && user.roomId !== "0") {
                         console.log(`[TikTok] Axios detected LIVE via UNIVERSAL_DATA (Dynamic Key) for ${username}`);
                         return { isLive: true, roomId: user.roomId };
                     }
                }
             } catch (e) {
                 console.error('[TikTok] Error parsing UNIVERSAL_DATA:', e.message);
             }
        }

        // 4. Fallback: Buscar cadena "room_id" cruda en el HTML (menos fiable pero útil)
        // Solo si encontramos indicadores fuertes de LIVE y no "room_id":""
        if (html.includes('"status":2') && !html.includes('"status":4')) {
             console.log(`[TikTok] Axios detected LIVE via raw string match for ${username}`);
             return { isLive: true };
        }

        return { isLive: false };
    } catch (e) {
        // Si falla el perfil, intentamos la URL /live como último recurso de Axios
        if (!e.message.includes('404')) {
             console.log(`[TikTok] Axios profile check failed, trying /live url...`);
        }
        return { isLive: false, error: e.message };
    }
}

async function checkLiveAxiosMobile(username) {
    try {
        const mobileHeaders = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Referer': 'https://www.tiktok.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        };

        const response = await axios.get(`https://www.tiktok.com/@${username}`, {
            headers: mobileHeaders,
            timeout: 8000,
            validateStatus: status => status < 500
        });

        const html = response.data;
        if (typeof html !== 'string') return { isLive: false };

        // Buscar __UNIVERSAL_DATA_FOR_REHYDRATION__
        const universalMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
        if (universalMatch && universalMatch[1]) {
             try {
                const json = JSON.parse(universalMatch[1]);
                const defaultScope = json.__DEFAULT_SCOPE__;
                
                // Buscar dinámicamente user-detail
                const userDetailKey = Object.keys(defaultScope || {}).find(k => k.includes('webapp.user-detail'));
                if (userDetailKey && defaultScope[userDetailKey]) {
                     const user = defaultScope[userDetailKey].userInfo?.user;
                     if (user && user.roomId && user.roomId !== "" && user.roomId !== "0") {
                         console.log(`[TikTok] Axios (Mobile) detected LIVE via UNIVERSAL_DATA for ${username}`);
                         return { isLive: true, roomId: user.roomId };
                     }
                }
             } catch (e) {
                 console.error('[TikTok] Error parsing UNIVERSAL_DATA (Mobile):', e.message);
             }
        }
        
        return { isLive: false };
    } catch (e) {
        console.error(`[TikTok] Mobile check failed for ${username}:`, e.message);
        return { isLive: false, error: e.message };
    }
}

// Versión simplificada para Host (Sin dependencias pesadas)
async function checkLivePuppeteer(username) {
    // Puppeteer está deshabilitado permanentemente para asegurar estabilidad en el host
    return { isLive: false, error: 'Puppeteer disabled for host compatibility' };
}

async function sendTikTokNotification(userId, tiktokUsername, guild, settings) {
    // 1. Obtener canal de anuncios
    let announcementChannelId = '1462900231677935717';
    if (settings && settings.tiktokChannelId) {
        announcementChannelId = settings.tiktokChannelId;
    }

    const channel = await guild.channels.fetch(announcementChannelId).catch(err => {
        console.error(`[TikTok] Error fetching announcement channel ${announcementChannelId}:`, err.message);
        return null;
    });
    
    if (channel) {
            const embed = new EmbedBuilder()
            .setTitle('🔴 ¡Jugador en Directo!')
            .setDescription(`**${tiktokUsername}** está transmitiendo en vivo en TikTok mientras juega una Ranked.`)
            .setColor('#ff0050')
            .setImage("https://cdn.discordapp.com/attachments/1403834492468334814/1420918712239915151/LIVE_ON.jpg?ex=696f6a6c&is=696e18ec&hm=cc110a1c0a5521fa25821772cc8a1acb4460adf70935a63cee5c91cf43f1bce8&")
            .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Ver Stream')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://www.tiktok.com/@${tiktokUsername}/live`)
                );
            
            await channel.send({ content: `<@&1403172539588546621> ¡<@${userId}> está en vivo!`, embeds: [embed], components: [row] })
            .then(async msg => {
                console.log(`[TikTok] Notification sent for ${tiktokUsername} to channel #${channel.name} (${channel.id}) (Msg ID: ${msg.id})`);
                // 2. Actualizar timestamp de último anuncio SOLO si se envió correctamente
                await Player.updateOne({ _id: userId }, { $set: { lastStreamAnnouncement: Date.now() } });
            })
            .catch(err => console.error(`[TikTok] Error sending notification to #${channel.name} (${channel.id}):`, err));
    } else {
        console.error(`[TikTok] Announcement channel not found.`);
    }
}

// Función auxiliar para hacer reintentos con backoff exponencial
async function checkTikTokLiveWithRetry(userId, tiktokUsername, guild, settings, inAnnouncementCooldown) {
    let lastError = null;
    let isRateLimited = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                // Calcular delay con backoff exponencial
                const isRateLimitedPrev = lastError?.message?.includes('[Rate Limited]');
                const delay = isRateLimitedPrev ? RATE_LIMIT_RETRY_DELAY : RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
                console.log(`[TikTok] Reintento #${attempt} para ${tiktokUsername} en ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }

            // Intentar conexión WebSocket
            const tiktokLiveConnection = new WebcastPushConnection(tiktokUsername, {
                processInitialData: true,
                enableWebsocketUpgrade: true,
                requestPollingIntervalMs: 2000,
                clientParams: {
                    disableEulerFallbacks: true
                },
                webClientHeaders: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://www.tiktok.com/',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    "Cookie": "tt_webid_v2=1234567890;"
                }
            });

            tiktokLiveConnection.on('error', () => {});

            const connectPromise = tiktokLiveConnection.connect();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('ConnectTimeoutError')), 10000)
            );

            const state = await Promise.race([connectPromise, timeoutPromise]);
            
            if (state && state.roomId) {
                tiktokLiveConnection.disconnect();
                return { isLive: true };
            }
            tiktokLiveConnection.disconnect();
        } catch (err) {
            lastError = err;
            const errMsg = err.message || err.toString();
            const isOfflineError = errMsg.includes('is offline') || errMsg.includes("isn't online");
            const isTimeout = errMsg.includes('ConnectTimeoutError') || errMsg.includes('timeout') || err.code === 'UND_ERR_CONNECT_TIMEOUT';
            const isRateLimitError = errMsg.includes('[Rate Limited]') || errMsg.includes('rate_limit');

            if (isRateLimitError) {
                isRateLimited = true;
            }

            if (isOfflineError) {
                return { isLive: false };
            }

            // Si es el último intento o es un timeout, salir del loop
            if (attempt === MAX_RETRIES || isTimeout) {
                break;
            }
        }
    }

    // Fallbacks: Axios y Puppeteer
    try {
        const axiosResult = await checkLiveAxios(tiktokUsername);
        if (axiosResult.isLive) {
            return { isLive: true };
        }

        const mobileResult = await checkLiveAxiosMobile(tiktokUsername);
        if (mobileResult.isLive) {
            return { isLive: true };
        }

        if (!puppeteerBroken) {
            const puppeteerResult = await checkLivePuppeteer(tiktokUsername);
            if (puppeteerResult.isLive) {
                return { isLive: true };
            }
        }
    } catch (fallbackErr) {
        console.log(`[TikTok] Fallback methods also failed for ${tiktokUsername}:`, fallbackErr.message);
    }

    return { isLive: false, error: lastError?.message };
}

async function checkTikTokLive(userId, guild, settings, force = false) {
  try {
    // Usar la cola para limitar concurrencia
    await tiktokQueue.add(async () => {
        const player = await Player.findById(userId);
        if (!player) return;
        if (!player.tiktokUsername) {
            try { await closeStreamerChannel(guild, userId); } catch (_) {}
            return;
        }

        const lastAnnounced = player.lastStreamAnnouncement || 0;
        const inAnnouncementCooldown = (!force && Date.now() - lastAnnounced < ANNOUNCEMENT_COOLDOWN);
        if (inAnnouncementCooldown) {
            console.log(`[TikTok] User ${userId} (${player.tiktokUsername}) is in announcement cooldown; will still check live status.`);
        }

        const tiktokUsername = player.tiktokUsername;
        console.log(`[TikTok] Checking live status for ${tiktokUsername} (${userId})... [Queue size: ${tiktokQueue.size}]`);
        
        // Usar reintentos con backoff
        const result = await checkTikTokLiveWithRetry(userId, tiktokUsername, guild, settings, inAnnouncementCooldown);

        if (result.isLive) {
            console.log(`[TikTok] ${tiktokUsername} is LIVE!`);
            if (!inAnnouncementCooldown) {
                console.log(`[TikTok] Sending notification for ${tiktokUsername}...`);
                await sendTikTokNotification(userId, tiktokUsername, guild, settings);
                try {
                  await Player.updateOne({ _id: userId }, { $set: { lastStreamAnnouncement: Date.now() } });
                } catch (_) { }
            } else {
                console.log(`[TikTok] Skipping announcement for ${tiktokUsername} due to cooldown.`);
            }

            try {
                await ensureStreamerChannel(guild, userId);
            } catch (e) {
                console.error('[TikTok] Error creando canal de streamer automático:', e);
            }
        } else {
            try {
                await closeStreamerChannel(guild, userId);
            } catch (e) {
                console.error('[TikTok] Error cerrando canal de streamer automático:', e);
            }
        }
    });

  } catch (error) {
    console.error(`Error checking TikTok live for user ${userId}:`, error);
  }
}

/**
 * Verifica si un usuario de TikTok está en vivo sin enviar notificación.
 * @param {string} tiktokUsername 
 * @returns {Promise<{isLive: boolean, roomId?: string, error?: string}>}
 */
async function getTikTokLiveStatus(tiktokUsername) {
    try {
        const connection = new WebcastPushConnection(tiktokUsername, {
            processInitialData: true,
            enableWebsocketUpgrade: true,
            requestPollingIntervalMs: 2000,
            clientParams: {
                disableEulerFallbacks: true
            },
            webClientHeaders: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.tiktok.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                "Cookie": "tt_webid_v2=1234567890;"
            }
        });

        // Suppress unhandled error events
        connection.on('error', () => {});

        const connectPromise = connection.connect();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('ConnectTimeoutError')), 10000)
        );

        const state = await Promise.race([connectPromise, timeoutPromise]);
        
        connection.disconnect();
        if (state && state.roomId) {
            return { isLive: true, roomId: state.roomId };
        }
        return { isLive: false };
    } catch (err) {
        const errMsg = err.message || err.toString();
        const isOfflineError = errMsg.includes('is offline') || errMsg.includes("isn't online");
        const isTimeout = errMsg.includes('ConnectTimeoutError') || errMsg.includes('timeout') || err.code === 'UND_ERR_CONNECT_TIMEOUT';

        // Fallback Puppeteer
        if (!isOfflineError) {
             if (isTimeout) console.log(`[TikTok] Timeout checking status for ${tiktokUsername}. Moving to fallbacks...`);
             
             // Fallback 1: Axios
             const axiosResult = await checkLiveAxios(tiktokUsername);
             if (axiosResult.isLive) {
                 return { isLive: true, roomId: 'axios-detected' };
             }

             // Fallback 1.5: Axios Mobile
             const mobileResult = await checkLiveAxiosMobile(tiktokUsername);
             if (mobileResult.isLive) {
                 return { isLive: true, roomId: mobileResult.roomId || 'mobile-detected' };
             }

             // Fallback 2: Puppeteer
             const puppeteerResult = await checkLivePuppeteer(tiktokUsername);
             if (puppeteerResult.isLive) {
                 return { isLive: true, roomId: puppeteerResult.roomId || 'puppeteer-detected' };
             }
             return { isLive: false, error: errMsg + ' (Axios: not live, Mobile: ' + (mobileResult.error || 'not live') + ', Puppeteer: ' + (puppeteerResult.error || 'not live') + ')' };
        }
        return { isLive: false, error: errMsg };
    }
}

module.exports = {
  checkTikTokLive,
  getTikTokLiveStatus,
  ensureStreamerChannel,
  closeStreamerChannel,
  // Expuestos para que el scheduler pueda gestionar el ciclo sin solapamientos
  isTiktokCronRunning,
  setTiktokCronRunning,
  getTiktokQueueSize: () => tiktokQueue.size + tiktokQueue.pending,
};
