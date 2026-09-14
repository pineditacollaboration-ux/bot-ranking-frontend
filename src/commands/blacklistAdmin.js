const { EmbedBuilder } = require('discord.js');

function extractUserIds(message, args) {
    const ids = new Set();
    message.mentions.users.forEach(user => ids.add(user.id));
    args.forEach(arg => {
        const clean = arg.replace(/[^0-9]/g, '');
        if (clean.length >= 17) ids.add(clean);
    });
    return Array.from(ids);
}

const BLACKLIST_MANAGE_ROLE_IDS = [
    '1489717134878707713',
    '1489743084274323487',
    '1489859649523023913',
    '1490181905315008542',
    '1518832719931637840',
    '1517717411967668325',
    '1489717079098654720',
    '1489729400818765974',
    '1490460049636593874',
];

const ALLOWED_BLACKLIST_CHANNEL_ID = '1548203188002226196';

function hasBlacklistPermission(member) {
    // Permitir siempre a usuarios con permiso de Administrador (evita que el dueño del server se quede fuera)
    if (member.permissions.has('Administrator')) return true;

    // Verificar estrictamente los roles permitidos
    return BLACKLIST_MANAGE_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

async function sendTempError(message, content, delay = 7000) {
    try {
        const errorMsg = await message.channel.send(`<@${message.author.id}> ${content}`);
        setTimeout(() => {
            errorMsg.delete().catch(() => { });
        }, delay);
        message.delete().catch(() => { });
    } catch (_) { }
}

async function blacklistAdd(message, args, { hasPermission, Blacklist, blacklistedUsers, COLORS, sendLog, parseDuration }) {
    const STREAMER_CATEGORY_ID = '1473558364289241253';
    const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

    if (message.channel.id !== ALLOWED_BLACKLIST_CHANNEL_ID && !isInStreamerCategory) {
        return sendTempError(message, `🚫 Este comando solo se puede usar en el canal <#${ALLOWED_BLACKLIST_CHANNEL_ID}>.`);
    }

    if (!hasBlacklistPermission(message.member)) {
        return sendTempError(message, "🚫 Solo administradores o roles específicos de gestión pueden usar este comando.");
    }

    const targetIds = extractUserIds(message, args);

    if (targetIds.length === 0) {
        return sendTempError(message, "⚠️ Uso: `!blacklist @usuario <motivo> [tiempo]`\nEjemplo: `!blacklist @usuario Uso de xit 7d`");
    }

    const maybeTime = args.length > 0 ? args[args.length - 1] : null;
    const durationMs = maybeTime ? parseDuration?.(maybeTime) : null;

    // Filter args to get reason
    let reasonArgs = args.filter(arg => {
        const clean = arg.replace(/[^0-9]/g, '');
        // If it's a target ID, exclude it
        if (targetIds.includes(clean)) return false;
        // If it looks like a mention, exclude it
        if (arg.startsWith('<@') && arg.endsWith('>')) return false;
        return true;
    });

    // If the last arg was duration, pop it.
    if (durationMs && durationMs >= 1000) {
        if (reasonArgs.length > 0 && reasonArgs[reasonArgs.length - 1] === maybeTime) {
            reasonArgs.pop();
        }
    }

    const reason = reasonArgs.join(' ').trim();

    if (!reason) {
        return sendTempError(message, "❌ **Debes indicar un motivo obligatoriamente para sancionar.**\nUso: `!blacklist @usuario <motivo> [tiempo]`\nEjemplo: `!blacklist @usuario Uso de xit 3d`");
    }

    const results = [];
    let expiresAt = undefined;
    if (durationMs && typeof durationMs === 'number' && !isNaN(durationMs) && durationMs >= 1000) {
        const potentialDate = new Date(Date.now() + durationMs);
        if (!isNaN(potentialDate.getTime())) {
            expiresAt = potentialDate;
        }
    }

    for (const targetId of targetIds) {
        if (blacklistedUsers.has(targetId)) {
            results.push(`⚠️ <@${targetId}> ya está en la lista negra.`);
            continue;
        }

        const newBlacklistEntry = new Blacklist({ _id: targetId, reason, date: new Date(), expiresAt });
        await newBlacklistEntry.save();
        blacklistedUsers.set(targetId, { reason, date: new Date(), expiresAt });

        const logEmbed = new EmbedBuilder()
            .setTitle('🚫 Usuario Blacklisteado')
            .setDescription(`**Administrador:** <@${message.author.id}>\n**Usuario:** <@${targetId}>\n**Razón:** ${reason}`)
            .setColor(COLORS.ERROR)
            .setTimestamp();
        sendLog(message.guild, logEmbed, [], 'warnings');

        results.push(`✅ <@${targetId}> ha sido añadido a la lista negra.`);
    }

    // Send summary
    if (results.length === 1) {
        const embed = new EmbedBuilder()
            .setTitle("⛔ Blacklist Aplicada")
            .setDescription(`<@${targetIds[0]}> ha sido añadido a la lista negra del servidor.`)
            .addFields(
                { name: "👤 Usuario", value: `<@${targetIds[0]}>`, inline: true },
                { name: "🛡️ Moderador", value: `<@${message.author.id}>`, inline: true },
                { name: "📝 Razón", value: reason, inline: false },
                ...(expiresAt ? [{ name: "⏰ Expira", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: true }] : [])
            )
            .setColor(COLORS.ERROR)
            .setFooter({ text: `ID: ${targetIds[0]}` })
            .setTimestamp();
        return message.channel.send({ embeds: [embed] });
    } else {
        // Bulk response
        const parts = [];
        let currentChunk = "";
        for (const line of results) {
            if (currentChunk.length + line.length > 1900) {
                parts.push(currentChunk);
                currentChunk = "";
            }
            currentChunk += line + "\n";
        }
        if (currentChunk) parts.push(currentChunk);

        for (const part of parts) {
            await message.channel.send(part);
        }
    }
}

async function blacklistRemove(message, args, { hasPermission, Blacklist, blacklistedUsers, COLORS, sendLog }) {
    const STREAMER_CATEGORY_ID = '1473558364289241253';
    const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

    if (message.channel.id !== ALLOWED_BLACKLIST_CHANNEL_ID && !isInStreamerCategory) {
        return sendTempError(message, `🚫 Este comando solo se puede usar en el canal <#${ALLOWED_BLACKLIST_CHANNEL_ID}>.`);
    }

    if (!hasBlacklistPermission(message.member)) {
        return sendTempError(message, "🚫 Solo el staff autorizado puede usar este comando.");
    }

    const targetIds = extractUserIds(message, args);

    if (targetIds.length === 0) {
        return sendTempError(message, "⚠️ Uso: `!unblacklist @usuario <motivo>`\nEjemplo: `!unblacklist @usuario Apelación aprobada en ticket`");
    }

    let reasonArgs = args.filter(arg => {
        const clean = arg.replace(/[^0-9]/g, '');
        if (targetIds.includes(clean)) return false;
        if (arg.startsWith('<@') && arg.endsWith('>')) return false;
        return true;
    });

    const unblacklistReason = reasonArgs.join(' ').trim();

    if (!unblacklistReason) {
        return sendTempError(message, "❌ **Debes indicar un motivo obligatoriamente para retirar la blacklist.**\nUso: `!unblacklist @usuario <motivo>`\nEjemplo: `!unblacklist @usuario Apelación aceptada en ticket de soporte`");
    }

    const results = [];

    for (const targetId of targetIds) {
        if (!blacklistedUsers.has(targetId)) {
            results.push(`⚠️ <@${targetId}> no se encuentra en la lista negra.`);
            continue;
        }

        await Blacklist.findByIdAndDelete(targetId);
        blacklistedUsers.delete(targetId);

        const logEmbed = new EmbedBuilder()
            .setTitle('✅ Usuario Desblacklisteado')
            .setDescription(`**Administrador:** <@${message.author.id}>\n**Usuario:** <@${targetId}>\n**Motivo del retiro:** ${unblacklistReason}`)
            .setColor(COLORS.SUCCESS)
            .setTimestamp();
        sendLog(message.guild, logEmbed, [], 'warnings');

        results.push(`✅ <@${targetId}> ha sido removido de la lista negra.`);
    }

    if (results.length === 1) {
        const embed = new EmbedBuilder()
            .setTitle("✅ Usuario removido de la Blacklist")
            .setDescription(results[0].replace('✅ ', '').replace('⚠️ ', ''))
            .addFields(
                { name: "👤 Usuario", value: `<@${targetIds[0]}>`, inline: true },
                { name: "🛡️ Moderador", value: `<@${message.author.id}>`, inline: true },
                { name: "📝 Motivo de Retiro", value: unblacklistReason, inline: false }
            )
            .setColor(COLORS.SUCCESS)
            .setTimestamp();
        return message.channel.send({ embeds: [embed] });
    } else {
        const parts = [];
        let currentChunk = "";
        for (const line of results) {
            if (currentChunk.length + line.length > 1900) {
                parts.push(currentChunk);
                currentChunk = "";
            }
            currentChunk += line + "\n";
        }
        if (currentChunk) parts.push(currentChunk);

        for (const part of parts) {
            await message.channel.send(part);
        }
    }
}

async function blacklistInfo(message, args, { hasPermission, blacklistedUsers, COLORS }) {
    const STREAMER_CATEGORY_ID = '1473558364289241253';
    const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

    if (message.channel.id !== ALLOWED_BLACKLIST_CHANNEL_ID && !isInStreamerCategory) {
        return sendTempError(message, `🚫 Este comando solo se puede usar en el canal <#${ALLOWED_BLACKLIST_CHANNEL_ID}>.`);
    }

    if (!hasBlacklistPermission(message.member)) {
        return sendTempError(message, "🚫 Solo el staff autorizado puede usar este comando.");
    }
    const rawId = (args[0] || '').replace(/[^0-9]/g, '');
    const mentionUser = message.mentions.users.first();
    const targetId = mentionUser?.id || (rawId || null);
    if (!targetId) {
        return sendTempError(message, "⚠️ Uso: `!blacklistinfo @usuario|<id>`");
    }

    const info = blacklistedUsers.get(targetId);
    if (!info) {
        return sendTempError(message, `✅ El usuario <@${targetId}> no está en la lista negra.`);
    }

    const fetched = await message.client.users.fetch(targetId).catch(() => null);
    const titleName = fetched?.username || targetId;
    const expTs = info.expiresAt ? Math.floor(new Date(info.expiresAt).getTime() / 1000) : null;
    const embed = new EmbedBuilder()
        .setTitle(`ℹ️ Información de Blacklist: ${titleName}`)
        .addFields(
            { name: "Razón", value: info.reason },
            { name: "Fecha de Inclusión", value: `<t:${Math.floor(new Date(info.date).getTime() / 1000)}:F>` },
            ...(expTs ? [{ name: "Expira", value: `<t:${expTs}:F> (<t:${expTs}:R>)` }] : [])
        )
        .setColor(COLORS.WARNING);
    return message.channel.send({ embeds: [embed] });
}

function blacklistAll(message, args, { hasPermission, blacklistedUsers, COLORS }) {
    const STREAMER_CATEGORY_ID = '1473558364289241253';
    const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

    if (message.channel.id !== ALLOWED_BLACKLIST_CHANNEL_ID && !isInStreamerCategory) {
        return message.channel.send(`🚫 Este comando solo se puede usar en el canal <#${ALLOWED_BLACKLIST_CHANNEL_ID}>.`);
    }

    if (!hasBlacklistPermission(message.member)) {
        return message.channel.send("🚫 Solo el staff autorizado puede usar este comando.");
    }

    const blacklistedIds = Array.from(blacklistedUsers.keys());

    if (blacklistedIds.length === 0) {
        return message.channel.send("✅ No hay ningún usuario en la lista negra.");
    }

    const description = blacklistedIds.map((id, index) => `**${index + 1}.** <@${id}> (\`${id}\`)`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle("🚫 Lista de Usuarios en Blacklist")
        .setDescription(description)
        .setColor(COLORS.ERROR)
        .setTimestamp();

    return message.channel.send({ embeds: [embed] });
}

module.exports = { blacklistAdd, blacklistRemove, blacklistInfo, blacklistAll };
