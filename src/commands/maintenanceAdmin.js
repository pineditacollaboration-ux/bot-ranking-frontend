/**
 * Mantenimiento: utilidades administrativas.
 * Incluye limpieza de partidas/fila y activación del modo mantenimiento global.
 */

function fixMatches(message, args, { hasPermission, cleanupAllOrphanedMatches, loadActiveMatches, matches, config }) {
    const EMOJIS = config?.emojis || {};
    if (!hasPermission(message.member)) {
        return message.reply(`${EMOJIS.ban || '🚫'} Solo el staff puede usar este comando.`);
    }

    return message.channel
        .send(`${EMOJIS.maintenance || '⚙️'} **Iniciando limpieza forzada de partidas huérfanas...**`)
        .then(async (msg) => {
            let cleanedCount = 0;
            try {
                cleanedCount = await cleanupAllOrphanedMatches(message.guild);
                await loadActiveMatches(); // Recargar las partidas activas
                await msg.edit(`${EMOJIS.success || '✅'} **Limpieza completada.** Se eliminaron **${cleanedCount}** partidas huérfanas. Partidas activas ahora: ${matches.size}.`);
            } catch (error) {
                await msg.edit(`${EMOJIS.error || '❌'} **Error durante la limpieza:** ${error.message}`);
            }
        });
}

function cleanQueues(message, args, { hasPermission, queues, creatingQueue, startingMatch, ActiveQueue, sendLog, COLORS, EmbedBuilder, config, settings }) {
    const EMOJIS = config?.emojis || {};
    const { busyPlayers } = settings;

    if (!hasPermission(message.member)) {
        return message.reply(`${EMOJIS.ban || '🚫'} Solo el staff puede usar este comando.`);
    }

    const mode = args[0] ? args[0].toLowerCase() : null;
    const isGlobal = mode === 'all' || mode === 'global' || mode === 'todo';

    if (isGlobal) {
        return message.channel.send(`${EMOJIS.maintenance || '⚙️'} **Iniciando limpieza TOTAL de filas fantasma (GLOBAL)...**`).then(async (msg) => {
            try {
                const queuesInMemory = queues.size;
                const creatingQueues = creatingQueue.size;
                const startingMatches = startingMatch.size;

                queues.clear();
                creatingQueue.clear();
                startingMatch.clear();

                const { deletedCount } = await ActiveQueue.deleteMany({});

                const summary = `${EMOJIS.success || '✅'} **Limpieza GLOBAL completada.**\n` +
                    `> • Filas en memoria eliminadas: **${queuesInMemory}**\n` +
                    `> • Filas en base de datos eliminadas: **${deletedCount}**\n` +
                    `> • Bloqueos de creación de filas eliminados: **${creatingQueues}**\n` +
                    `> • Bloqueos de inicio de partida eliminados: **${startingMatches}**\n\n` +
                    `Se han reseteado TODAS las filas del servidor.`;

                await msg.edit(summary);
                sendLog(message.guild, new EmbedBuilder().setTitle('🧹 Limpieza de Filas (GLOBAL)').setDescription(`Comando ejecutado por <@${message.author.id}>.\n${summary}`).setColor(COLORS.SUCCESS), [], 'queues');
            } catch (error) {
                console.error('Error en !limpiarfilas global:', error);
                await msg.edit(`${EMOJIS.error || '❌'} Ocurrió un error durante la limpieza global: ${error.message}`);
            }
        });
    }

    // Default: Channel specific cleanup
    return message.channel.send(`${EMOJIS.maintenance || '⚙️'} **Limpiando fila de ESTE canal...**`).then(async (msg) => {
        try {
            const channelId = message.channel.id;

            const hadQueue = queues.delete(channelId);
            const hadCreating = creatingQueue.delete(channelId);
            const hadStarting = startingMatch.delete(channelId);

            // Eliminar solo la fila de este canal en DB
            const deletedDoc = await ActiveQueue.findByIdAndDelete(channelId);
            const deletedCount = deletedDoc ? 1 : 0;

            const summary = `${EMOJIS.success || '✅'} **Limpieza del canal completada.**\n` +
                `> • Fila en memoria: **${hadQueue ? 'Eliminada' : 'No encontrada'}**\n` +
                `> • Fila en base de datos: **${deletedCount > 0 ? 'Eliminada' : 'No encontrada'}**\n` +
                `> • Bloqueos locales eliminados: **${(hadCreating || hadStarting) ? 'Sí' : 'No'}**\n\n` +
                `Ahora puedes crear una fila nueva en este canal. (Usa \`!limpiarfilas all\` para borrar todo).`;

            await msg.edit(summary);
            sendLog(message.guild, new EmbedBuilder().setTitle('🧹 Limpieza de Fila (Local)').setDescription(`Comando ejecutado por <@${message.author.id}> en <#${channelId}>.\n${summary}`).setColor(COLORS.SUCCESS), [], 'queues');
        } catch (error) {
            console.error('Error en !limpiarfilas local:', error);
            await msg.edit(`${EMOJIS.error || '❌'} Ocurrió un error durante la limpieza local: ${error.message}`);
        }
    });
}

module.exports = { fixMatches, cleanQueues };

// ====== NUEVO: Modo mantenimiento global ======

async function setMaintenance(message, args, { Setting, settings, COLORS, EmbedBuilder, sendLog, client, setMaintenancePresence, BOT_OWNER_ID }) {
    const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
    if (!isOwner) {
        return message.reply('🚫 Solo los IDs autorizados pueden usar este comando.').catch(() => { });
    }

    const mode = (args[0] || '').toLowerCase();
    if (!['on', 'off', 'enable', 'disable'].includes(mode)) {
        return message.channel.send('Uso: `!mantenimiento on` | `!mantenimiento off`').catch(() => { });
    }

    const enabled = mode === 'on' || mode === 'enable';
    await Setting.findByIdAndUpdate('maintenanceEnabled', { value: enabled }, { upsert: true });
    settings.maintenanceEnabled = enabled;
    if (client && setMaintenancePresence) {
        setMaintenancePresence(client, enabled);
    }

    const embed = new EmbedBuilder()
        .setColor(enabled ? 0xFF3333 : 0x00E676)
        .setAuthor({
            name: `Sistema • ROYAL RANKED`,
            iconURL: message.guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle(enabled
            ? '⛔  MODO MANTENIMIENTO ACTIVADO'
            : '✅  SISTEMA OPERATIVO')
        .setDescription(enabled
            ? '> El bot ha sido puesto **fuera de servicio** temporalmente.\n> Ningún comando ni interacción será procesada durante este período.'
            : '> El bot está nuevamente **en línea y operativo**.\n> Todos los comandos e interacciones han sido habilitados.')
        .addFields(
            {
                name: '🔧 Estado del Sistema',
                value: enabled
                    ? '`MANTENIMIENTO` — Fuera de Servicio'
                    : '`ONLINE` — Procesando normalmente',
                inline: true
            },
            {
                name: '👤 Ejecutado por',
                value: `<@${message.author.id}>`,
                inline: true
            },
            {
                name: '🕐 Hora de Activación',
                value: `<t:${Math.floor(Date.now() / 1000)}:T> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
                inline: true
            },
            {
                name: '📋 Instrucciones',
                value: enabled
                    ? 'Usa `!mantenimiento off` para reactivar el bot cuando esté listo.'
                    : 'Usa `!mantenimiento on` para volver a activar el modo mantenimiento.',
                inline: false
            }
        )
        .setFooter({ text: `ROYAL RANKED • Panel de Control` })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] }).catch(() => { });
    sendLog(message.guild, embed, [], 'errors');
}

module.exports.setMaintenance = setMaintenance;

// ====== Modo tienda habilitada/deshabilitada ======

async function setShopEnabled(message, args, { Setting, settings, COLORS, EmbedBuilder, sendLog, BOT_OWNER_ID }) {
    const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
    if (!isOwner) {
        return message.reply('🚫 Solo los IDs autorizados pueden usar este comando.').catch(() => { });
    }

    const mode = (args[0] || '').toLowerCase();
    if (!['on', 'off', 'enable', 'disable'].includes(mode)) {
        return message.channel.send('Uso: `!tienda on` | `!tienda off`').catch(() => { });
    }

    const enabled = mode === 'on' || mode === 'enable';
    await Setting.findByIdAndUpdate('shopEnabled', { value: enabled }, { upsert: true });
    settings.shopEnabled = enabled;

    const embed = new EmbedBuilder()
        .setColor(enabled ? 0x00E676 : 0xFF9500)
        .setAuthor({
            name: `Sistema • ROYAL RANKED`,
            iconURL: message.guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle(enabled
            ? '🛍️  TIENDA HABILITADA'
            : '🔒  TIENDA DESHABILITADA')
        .setDescription(enabled
            ? '> La tienda está nuevamente **disponible** para todos los usuarios.\n> Los Style Coins pueden ser canjeados con normalidad.'
            : '> La tienda ha sido **deshabilitada temporalmente**.\n> Los usuarios no podrán realizar compras hasta nuevo aviso.')
        .addFields(
            {
                name: '🏪 Estado de la Tienda',
                value: enabled ? '`ABIERTA` — Disponible' : '`CERRADA` — No disponible',
                inline: true
            },
            {
                name: '👤 Ejecutado por',
                value: `<@${message.author.id}>`,
                inline: true
            },
            {
                name: '🕐 Hora',
                value: `<t:${Math.floor(Date.now() / 1000)}:T> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
                inline: true
            }
        )
        .setFooter({ text: `ROYAL RANKED • Panel de Control` })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] }).catch(() => { });
    sendLog(message.guild, embed, [], 'shop');
}

module.exports.setShopEnabled = setShopEnabled;

async function relogMatches(message, args, { hasPermission, MatchHistory, EmbedBuilder, COLORS, sendLog, settings }) {
    if (!hasPermission(message.member)) {
        return message.reply('🚫 Solo el staff puede usar este comando.');
    }
    const nums = args.map(a => parseInt(a, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (nums.length === 0) {
        return message.channel.send('Uso: `!relogmatch <num1> <num2> ...`');
    }
    let ok = 0;
    let fail = 0;
    for (const num of nums) {
        const doc = await MatchHistory.findOne({ guildId: message.guild.id, matchNumber: num }).lean();
        if (!doc) {
            fail++;
            continue;
        }
        const winners = (doc.winner === 'team1' ? doc.team1 : doc.team2) || [];
        const losers = (doc.winner === 'team1' ? doc.team2 : doc.team1) || [];
        const winnersField = winners.length > 0 ? winners.map(id => `<@${id}>`).join('\n') : '—';
        const losersField = losers.length > 0 ? losers.map(id => `<@${id}>`).join('\n') : '—';
        const extras = [];
        if (doc.mvp) extras.push(`⭐ MVP: <@${doc.mvp}>`);
        if (doc.creator) extras.push(`👑 Creador: <@${doc.creator}>`);
        const extrasField = extras.length > 0 ? extras.join('\n') : '—';
        const embed = new EmbedBuilder()
            .setTitle(`✅ Resultados Aplicados - Partida #${doc.matchNumber}`)
            .addFields(
                { name: '🏆 Ganadores', value: winnersField, inline: true },
                { name: '💔 Perdedores', value: losersField, inline: true },
                { name: '🎖️ Extras', value: extrasField, inline: false }
            )
            .setColor(COLORS.SUCCESS)
            .setTimestamp();
        if (doc.wager && doc.wager > 0) {
            embed.addFields({ name: '💰 Apuesta', value: `\`${doc.wager}\` puntos por jugador`, inline: false });
        }
        await sendLog(message.guild, embed, [], 'matches');
        if (settings && settings.historyChannel) {
            const historyChannel = await message.guild.channels.fetch(settings.historyChannel).catch(() => null);
            if (historyChannel) {
                await historyChannel.send({ embeds: [embed] }).catch(() => { });
            }
        }
        ok++;
    }
    return message.channel.send(`🔁 Re-log completado. Éxitos: **${ok}**, no encontrados: **${fail}**.`);
}

module.exports.relogMatches = relogMatches;
