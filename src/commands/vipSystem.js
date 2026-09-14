const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const VipKey = require('../models/VipKey');
const { Player } = require('../../models');
const config = require('../../config.json');
const crypto = require('crypto');

// Role IDs - PREDEFINED
const ROYAL_RANKED_ROLE = config.rouletteRoles?.royalRanked || '1489762472675115189';
const PASE_LIBRE_ROLE_ID = '1489754427220037724';

// Role IDs - PENDING USER REPLACEMENT (MUTE is auto-assigned)
const MUTE_ROLE_ID = '1489754585143705631';

// Roles - Auto Assigned to Buyer
const VIP_SANGRIENTO_ROLE = '1490429947133820981';
const VIP_ABSOLUTO_ROLE = '1490436182977417327';
const VIP_FANTASMA_ROLE = '1490430290680746146';
const VIP_SENHOR_ROLE = '1490430760497188955';
const VIP_PRESENCA_ROLE = '1490432920387584190';
const VIP_CAOS_ROLE = '1490431489115160607';
const VIP_CEUS_ROLE = '1490436936773664899';

const RUSH_MASTER_ROLE_ID = '1490456682835218623';
const BORN_TO_WIN_ROLE_ID = '1490452350068981792';
const LENDA_DA_TROPA_ROLE_ID = '1490453596603416658';
const CRAZY_TO_WIN_ROLE_ID = '1490450055906197544';
const KING_ROLE_ID = '1490449395882135632';

const RESTRICTED_CHANNEL_ID = '1489717516170428538';

// Permission Configuration
const ALLOWED_CATEGORY_ID = '1489717335152394392';
const AUTHORIZED_KEYS_ADMINS = [
    '1490575573561643153',
    '1489717134878707713',
    '1490531904007704617',
    '1489717079098654720',
    '1490748724685705347'
];

const ALLOWED_ROLE_IDS = [
    ...(config.manageRole || []),
    ...(config.staffRoleId || []),
    ...AUTHORIZED_KEYS_ADMINS,
    '1407834282042593430',
    '1409311314148327595',
    '1451685064961429666',
    '1421579084986847232',
    '1454910937139118241'
].map(id => String(id));

async function checkVipPermissions(message) {
    if (!message.guild || !message.member) {
        await message.reply('❌ Este comando solo funciona en servidores.').catch(() => { });
        return false;
    }

    const hasRole = ALLOWED_ROLE_IDS.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasRole) {
        await message.reply('❌ No tienes permiso para usar este comando (Roles insuficientes).').catch(() => { });
        return false;
    }

    let categoryId = message.channel.parentId;
    if (message.channel.isThread()) {
        if (message.channel.parent) {
            categoryId = message.channel.parent.parentId;
        } else {
            try {
                const parent = await message.channel.fetchParent();
                categoryId = parent.parentId;
            } catch (e) {
                categoryId = null;
            }
        }
    }

    // Permit if category matches OR if staff role bypasses it
    const isStaff = config.staffRoleId && config.staffRoleId.some(r => message.member.roles.cache.has(r));
    if (categoryId !== ALLOWED_CATEGORY_ID && !isStaff) {
        await message.reply('❌ Este comando solo se puede usar en la categoría de Staff VIP.').catch(() => { });
        return false;
    }

    return true;
}

async function sendVipLog(guild, embed, deps) {
    const { sendLog } = deps;
    if (sendLog) {
        await sendLog(guild, embed, [], 'vips');
    }
}

async function generateVipKey(type, authorId, restrictedTo = null) {
    const suffix = crypto.randomBytes(4).toString('hex');
    let prefix = `royalrankedvip${type}`;
    const keyString = `${prefix}${suffix}`;
    const newKey = new VipKey({
        key: keyString,
        type: type,
        status: 'active',
        createdBy: authorId,
        restrictedTo: restrictedTo
    });
    await newKey.save();
    return keyString;
}

async function baseGenerateVip(message, args, deps, type, title, color) {
    if (!await checkVipPermissions(message)) return;

    try {
        const targetUser = message.mentions.users.first();
        const restrictedTo = targetUser ? targetUser.id : null;
        const key = await generateVipKey(type, message.author.id, restrictedTo);

        let desc = `**Key:** \`${key}\`\n**Tipo:** ${title}\n**Uso:** Un solo uso`;
        if (targetUser) {
            desc += `\n**Asignado a:** <@${targetUser.id}> (Solo esta persona puede canjearla)`;
        }
        
        desc += `\n\n📝 **¿Cómo reclamarla?**\n1. Copia la key de arriba.\n2. Ve al canal <#${RESTRICTED_CHANNEL_ID}>.\n3. Usa el comando: \`!reclamarvip ${key}\``;

        const embed = new EmbedBuilder()
            .setTitle(`🎫 Key VIP ${title} Generada`)
            .setDescription(desc)
            .setColor(color)
            .setFooter({ text: 'Entrega esta key al usuario para que la canjee en el canal de reclamos.' });

        await message.reply({ embeds: [embed] });

        const logEmbed = new EmbedBuilder()
            .setTitle(`🎫 Key VIP ${title} Generada`)
            .setDescription(`**Key:** \`${key}\`\n**Generada por:** <@${message.author.id}>\n**Asignada a:** ${targetUser ? `<@${targetUser.id}>` : 'Nadie'}`)
            .setColor(color)
            .setTimestamp();
        await sendVipLog(message.guild, logEmbed, deps);

    } catch (error) {
        console.error(error);
        message.reply('❌ Error al generar la key.').catch(() => { });
    }
}

async function vipSangrientoCommand(message, args, deps) { return baseGenerateVip(message, args, deps, 'sangriento', 'SANGRIENTO', '#FF0000'); }
async function vipAbsolutoCommand(message, args, deps) { return baseGenerateVip(message, args, deps, 'absoluto', 'ABSOLUTO', '#FFA500'); }
async function vipFantasmaCommand(message, args, deps) { return baseGenerateVip(message, args, deps, 'fantasma', 'FANTASMA SOMBRIO', '#AAAAAA'); }
async function vipSenhorCommand(message, args, deps) { return baseGenerateVip(message, args, deps, 'senhor', 'SENHOR DA NOITE', '#000000'); }
async function vipPresencaCommand(message, args, deps) { return baseGenerateVip(message, args, deps, 'presenca', 'PRESENÇA MALDITA', '#8B0000'); }
async function vipCaosCommand(message, args, deps) { return baseGenerateVip(message, args, deps, 'caos', 'PORTADOR DO CAOS', '#FF4500'); }
async function vipCeusCommand(message, args, deps) { return baseGenerateVip(message, args, deps, 'ceus', 'REI DOS CÉUS', '#00FFFF'); }

async function reclamarVipCommand(message, args, deps) {
    const { EMOJIS } = deps;
    const emojis = EMOJIS || { error: '❌', success: '✅', vip: '🌟' };

    if (message.channel.id !== RESTRICTED_CHANNEL_ID) {
        const msg = await message.reply(`${emojis.error} Este comando solo se puede usar en <#${RESTRICTED_CHANNEL_ID}>.`).catch(() => { });
        setTimeout(() => { if (msg) msg.delete().catch(() => { }); }, 5000);
        if (message.deletable) message.delete().catch(() => { });
        return;
    }

    const keyInputRaw = args[0];
    if (!keyInputRaw) {
        const msg = await message.reply(`${emojis.error} Debes proporcionar la key. Uso: \`!reclamarvip <key>\``).catch(() => { });
        setTimeout(() => msg?.delete().catch(() => { }), 5000);
        if (message.deletable) message.delete().catch(() => { });
        return;
    }

    const keyInput = keyInputRaw.trim();

    try {
        // Búsqueda insensible a mayúsculas/minúsculas para mayor robustez
        const vipKey = await VipKey.findOne({ 
            key: { $regex: new RegExp(`^${keyInput}$`, 'i') } 
        });

        if (!vipKey) {
            console.log(`[VIPSystem] Intento fallido de canje. Key no encontrada: "${keyInput}"`);
            const msg = await message.reply(`${emojis.error} Key inválida. Asegúrate de haberla copiado correctamente.`).catch(() => { });
            setTimeout(() => msg?.delete().catch(() => { }), 5000);
            if (message.deletable) message.delete().catch(() => { });
            return;
        }

        if (vipKey.status === 'redeemed') {
            const msg = await message.reply(`${emojis.error} Esta key ya ha sido canjeada.`).catch(() => { });
            setTimeout(() => msg?.delete().catch(() => { }), 5000);
            if (message.deletable) message.delete().catch(() => { });
            return;
        }

        if (vipKey.restrictedTo && vipKey.restrictedTo !== message.author.id) {
            const msg = await message.reply(`${emojis.error} Esta key no fue generada para ti.`).catch(() => { });
            setTimeout(() => msg?.delete().catch(() => { }), 5000);
            if (message.deletable) message.delete().catch(() => { });
            return;
        }

        const member = message.member;
        const userId = message.author.id;
        const now = Date.now();
        const oneHourMs = 60 * 60 * 1000;
        const oneDayMs = 24 * 60 * 60 * 1000;

        let benefitsDescription = "";

        let player = await Player.findOne({ _id: userId });
        if (!player) player = new Player({ _id: userId });
        if (!player.donationRights) player.donationRights = {};

        const rolesToAdd = [];
        let doublePointsHours = 0;
        let protectionHours = 0;
        let pointsToAdd = 0;

        // Auto Wallet Variables
        let addKing = 0, addPaseLibre = 0, addLendaTropa = 0, addBornToWin = 0, addCrazyToWin = 0;
        let addTempVoice = 0, addCustomRole = 0, addBlockName = 0, addBlockMove = 0;

        if (vipKey.type === 'sangriento') {
            benefitsDescription = `**Beneficios VIP SANGRIENTO:**\n• Rango VIP SANGRIENTO (30 días)\n• Rango ROYAL\n• Rol Pase Libre\n• Rol MUTE (10 días)\n• 10 Royal Coins\n• 5 Giros de Ruleta\n• Crédito Cartera: 12h Puntos X2, 12h Protección\n• 20,000 Puntos\n• Cartera de Donación: 1 cargo Rey, 1 Call Privada`;
            player.styleCoins = (player.styleCoins || 0) + 10;
            player.spins = (player.spins || 0) + 5;
            pointsToAdd = 20000;
            doublePointsHours = 12; // 3x4h
            protectionHours = 12; // 3x4h
            addKing = 1;
            addTempVoice = 1;
            rolesToAdd.push({ roleId: VIP_SANGRIENTO_ROLE, duration: 30 * oneDayMs });
            rolesToAdd.push({ roleId: ROYAL_RANKED_ROLE, duration: 30 * oneDayMs });
            rolesToAdd.push({ roleId: PASE_LIBRE_ROLE_ID, duration: 30 * oneDayMs });
            rolesToAdd.push({ roleId: MUTE_ROLE_ID, duration: 10 * oneDayMs });

        } else if (vipKey.type === 'absoluto') {
            benefitsDescription = `**Beneficios VIP ABSOLUTO:**\n• Rango VIP ABSOLUTO (30 días)\n• Rol Pase Libre\n• Rol Rush Master\n• 15 Royal Coins\n• 10 Giros de Ruleta\n• Crédito Cartera: 25h Puntos X2, 25h Protección\n• 25,000 Puntos\n• Cartera de Donación: 3 cargos Rey, 1 Call Privada`;
            player.styleCoins = (player.styleCoins || 0) + 15;
            player.spins = (player.spins || 0) + 10;
            pointsToAdd = 25000;
            doublePointsHours = 25; // 5x5h
            protectionHours = 25;
            addKing = 3;
            addTempVoice = 1;
            rolesToAdd.push({ roleId: VIP_ABSOLUTO_ROLE, duration: 30 * oneDayMs });
            rolesToAdd.push({ roleId: PASE_LIBRE_ROLE_ID, duration: 30 * oneDayMs });
            rolesToAdd.push({ roleId: RUSH_MASTER_ROLE_ID, duration: 30 * oneDayMs });

        } else if (vipKey.type === 'fantasma') {
            benefitsDescription = `**Beneficios VIP FANTASMA SOMBRIO:**\n• Rango VIP FANTASMA SOMBRIO (60 días)\n• Rol Pase Libre\n• Rol Born To Win\n• Rol Lenda da Tropa\n• Rol MUTE (20 días)\n• 25 Royal Coins\n• 15 Giros de Ruleta\n• Crédito Cartera: 18h Puntos X2, 25h Protección\n• 50,000 Puntos\n• Cartera de Donación: 3 cargos Rey, 1 Pase Libre, 1 Call Privada`;
            player.styleCoins = (player.styleCoins || 0) + 25;
            player.spins = (player.spins || 0) + 15;
            pointsToAdd = 50000;
            doublePointsHours = 18; // 6*1+6*2
            protectionHours = 25; // 11*1+7*2
            addKing = 3;
            addPaseLibre = 1;
            addTempVoice = 1;
            rolesToAdd.push({ roleId: VIP_FANTASMA_ROLE, duration: 60 * oneDayMs });
            rolesToAdd.push({ roleId: MUTE_ROLE_ID, duration: 20 * oneDayMs });
            rolesToAdd.push({ roleId: PASE_LIBRE_ROLE_ID, duration: 60 * oneDayMs });
            rolesToAdd.push({ roleId: BORN_TO_WIN_ROLE_ID, duration: 60 * oneDayMs });
            rolesToAdd.push({ roleId: LENDA_DA_TROPA_ROLE_ID, duration: 60 * oneDayMs });

        } else if (vipKey.type === 'senhor') {
            benefitsDescription = `**Beneficios VIP SENHOR DA NOITE:**\n• Rango VIP SENHOR DA NOITE (90 días)\n• Rol Pase Libre\n• Rol Crazy To Win\n• Rol Born To Win\n• Rol MUTE (23 días)\n• 30 Royal Coins\n• 20 Giros de Ruleta\n• Crédito Cartera: 307h Puntos X2, 254h Protección\n• 60,000 Puntos\n• Cartera de Donación: 5 Rey, 2 Pase Libre, 1 Lenda da Tropa, 1 Call Privada`;
            player.styleCoins = (player.styleCoins || 0) + 30;
            player.spins = (player.spins || 0) + 20;
            pointsToAdd = 60000;
            doublePointsHours = 307;
            protectionHours = 254;
            addKing = 5;
            addPaseLibre = 2;
            addLendaTropa = 1;
            addTempVoice = 1;
            rolesToAdd.push({ roleId: VIP_SENHOR_ROLE, duration: 90 * oneDayMs });
            rolesToAdd.push({ roleId: MUTE_ROLE_ID, duration: 23 * oneDayMs });
            rolesToAdd.push({ roleId: PASE_LIBRE_ROLE_ID, duration: 90 * oneDayMs });
            rolesToAdd.push({ roleId: CRAZY_TO_WIN_ROLE_ID, duration: 90 * oneDayMs });
            rolesToAdd.push({ roleId: BORN_TO_WIN_ROLE_ID, duration: 90 * oneDayMs });

        } else if (vipKey.type === 'presenca') {
            benefitsDescription = `**Beneficios VIP PRESENÇA MALDITA:**\n• Rango VIP PRESENÇA MALDITA (120 días)\n• Rol Pase Libre\n• Rol Crazy To Win\n• Rol MUTE (30 días)\n• 35 Royal Coins\n• 25 Giros de Ruleta\n• Crédito Cartera: 420h Puntos X2, 350h Protección\n• 80,000 Puntos\n• Cartera de Donación: 10 Rey, 5 Pase Libre, 1 Born To Win, 2 Calls Privadas, 1 Rol Personalizado`;
            player.styleCoins = (player.styleCoins || 0) + 35;
            player.spins = (player.spins || 0) + 25;
            pointsToAdd = 80000;
            doublePointsHours = 420;
            protectionHours = 350;
            addKing = 10;
            addPaseLibre = 5;
            addBornToWin = 1;
            addTempVoice = 2;
            addCustomRole = 1;
            rolesToAdd.push({ roleId: VIP_PRESENCA_ROLE, duration: 120 * oneDayMs });
            rolesToAdd.push({ roleId: PASE_LIBRE_ROLE_ID, duration: 120 * oneDayMs });
            rolesToAdd.push({ roleId: CRAZY_TO_WIN_ROLE_ID, duration: 120 * oneDayMs });
            rolesToAdd.push({ roleId: MUTE_ROLE_ID, duration: 30 * oneDayMs });

        } else if (vipKey.type === 'caos') {
            benefitsDescription = `**Beneficios VIP PORTADOR DO CAOS:**\n• Rango VIP PORTADOR DO CAOS (140 días)\n• Rol Pase Libre\n• Rol Crazy To Win\n• Rol MUTE (38 días)\n• 45 Royal Coins\n• 35 Giros de Ruleta\n• Crédito Cartera: 558h Puntos X2, 480h Protección\n• 95,000 Puntos\n• Cartera de Donación: 10 Rey, 7 Pase Libre, 1 Crazy To Win, 3 Calls Privadas, 1 Rol Personalizado`;
            player.styleCoins = (player.styleCoins || 0) + 45;
            player.spins = (player.spins || 0) + 35;
            pointsToAdd = 95000;
            doublePointsHours = 558;
            protectionHours = 480;
            addKing = 10;
            addPaseLibre = 7;
            addCrazyToWin = 1;
            addTempVoice = 3;
            addCustomRole = 1;
            rolesToAdd.push({ roleId: VIP_CAOS_ROLE, duration: 140 * oneDayMs });
            rolesToAdd.push({ roleId: PASE_LIBRE_ROLE_ID, duration: 140 * oneDayMs });
            rolesToAdd.push({ roleId: CRAZY_TO_WIN_ROLE_ID, duration: 140 * oneDayMs });
            rolesToAdd.push({ roleId: MUTE_ROLE_ID, duration: 38 * oneDayMs });

        } else if (vipKey.type === 'ceus') {
            benefitsDescription = `**Beneficios VIP REI DOS CÉUS:**\n• Rango VIP REI DOS CÉUS (200 días)\n• Rol Pase Libre\n• 55 Royal Coins\n• 45 Giros de Ruleta\n• Crédito Cartera: 564h Puntos X2, 448h Protección\n• 150,000 Puntos\n• Cartera de Donación: 10 Rey, 10 Pase Libre, 3 Crazy To Win, 4 Calls Privadas, 1 Rol Person, Bloqueos Canal/Nombre`;
            player.styleCoins = (player.styleCoins || 0) + 55;
            player.spins = (player.spins || 0) + 45;
            pointsToAdd = 150000;
            doublePointsHours = 564;
            protectionHours = 448;
            addKing = 10;
            addPaseLibre = 10;
            addCrazyToWin = 3;
            addTempVoice = 4;
            addCustomRole = 1;
            addBlockName = 1;
            addBlockMove = 1;
            rolesToAdd.push({ roleId: VIP_CEUS_ROLE, duration: 200 * oneDayMs });
            rolesToAdd.push({ roleId: PASE_LIBRE_ROLE_ID, duration: 200 * oneDayMs });
            rolesToAdd.push({ roleId: KING_ROLE_ID, duration: 200 * oneDayMs });

        } else {
            return message.reply(`${emojis.error} Tipo de VIP desconocido.`).catch(() => { });
        }

        if (pointsToAdd > 0) {
            if (!player.currentSeason) player.currentSeason = {};
            player.currentSeason.points = (player.currentSeason.points || 0) + pointsToAdd;
        }

        if (doublePointsHours > 0) player.x2_credit_ms = (player.x2_credit_ms || 0) + (doublePointsHours * oneHourMs);
        if (protectionHours > 0) player.proteccion_credit_ms = (player.proteccion_credit_ms || 0) + (protectionHours * oneHourMs);

        // Populate donationRights for wallet distribution
        if (!player.donationRights) player.donationRights = {};
        if (addKing > 0) player.donationRights.king = (player.donationRights.king || 0) + addKing;
        if (addPaseLibre > 0) player.donationRights.paseLibre = (player.donationRights.paseLibre || 0) + addPaseLibre;
        if (addLendaTropa > 0) player.donationRights.lendaTropa = (player.donationRights.lendaTropa || 0) + addLendaTropa;
        if (addBornToWin > 0) player.donationRights.bornToWin = (player.donationRights.bornToWin || 0) + addBornToWin;
        if (addCrazyToWin > 0) player.donationRights.crazyToWin = (player.donationRights.crazyToWin || 0) + addCrazyToWin;
        if (addTempVoice > 0) player.donationRights.tempVoice = (player.donationRights.tempVoice || 0) + addTempVoice;
        if (addCustomRole > 0) player.donationRights.customRole = (player.donationRights.customRole || 0) + addCustomRole;
        if (addBlockName > 0) player.donationRights.blockName = (player.donationRights.blockName || 0) + addBlockName;
        if (addBlockMove > 0) player.donationRights.blockMove = (player.donationRights.blockMove || 0) + addBlockMove;

        // Marcar para guardar cambios
        player.markModified('donationRights');

        // Give the automatic roles logic implementation (only those correctly defined)
        if (!player.temporaryRoles) player.temporaryRoles = [];
        const validRoles = rolesToAdd.filter(r => r.roleId && !r.roleId.includes('TODO_ID'));

        for (const item of validRoles) {
            await member.roles.add(item.roleId).catch(e => console.error(`Error adding role ${item.roleId}:`, e));
            const expiresAtMs = now + item.duration;
            const expiresAtDate = new Date(expiresAtMs);
            const existingIndex = player.temporaryRoles.findIndex(r => r.roleId === item.roleId);
            if (existingIndex !== -1) {
                const currentExpiryRaw = player.temporaryRoles[existingIndex].expiresAt;
                const currentExpiryMs = (currentExpiryRaw instanceof Date) ? currentExpiryRaw.getTime() : Number(currentExpiryRaw || 0);
                if (currentExpiryMs > now) {
                    player.temporaryRoles[existingIndex].expiresAt = new Date(currentExpiryMs + item.duration);
                } else {
                    player.temporaryRoles[existingIndex].expiresAt = expiresAtDate;
                }
            } else {
                player.temporaryRoles.push({ roleId: item.roleId, expiresAt: expiresAtDate });
            }
        }

        // Warn internally via logs if placeholders are hit
        if (doublePointsHours > 0) player.x2_credit_ms = (Number(player.x2_credit_ms) || 0) + (doublePointsHours * oneHourMs);
        if (protectionHours > 0) player.proteccion_credit_ms = (Number(player.proteccion_credit_ms) || 0) + (protectionHours * oneHourMs);

        player.markModified('temporaryRoles');
        await player.save();

        vipKey.status = 'redeemed';
        vipKey.redeemedBy = userId;
        vipKey.redeemedAt = new Date();
        await vipKey.save();

        // NUEVO: Actualizar apodo del usuario para reflejar el nuevo rango/puntos
        if (deps && typeof deps.tryUpdateNicknameForMember === 'function') {
            deps.tryUpdateNicknameForMember(member).catch(e =>
                console.warn('[VIPSystem] No se pudo actualizar el apodo tras canjear VIP:', e.message)
            );
        }

        const successEmbed = new EmbedBuilder()
            .setTitle(`${emojis.vip} VIP Canjeado Exitosamente`)
            .setDescription(`¡Felicidades <@${userId}>! Has activado tu membresía.\n\n${benefitsDescription}`)
            .setColor('#00FF00')
            .setTimestamp();

        await message.reply({ embeds: [successEmbed] });

        const logEmbed = new EmbedBuilder()
            .setTitle(`${emojis.vip} VIP Canjeado`)
            .setDescription(`**Usuario:** <@${userId}>\n**Tipo:** ${vipKey.type.toUpperCase()}\n**Key:** \`${keyInput}\``)
            .setColor('#00FF00')
            .setTimestamp();
        await sendVipLog(message.guild, logEmbed, deps);

    } catch (error) {
        console.error('Error reclaiming VIP:', error);
        message.reply(`${emojis.error} Ocurrió un error al canjear el VIP.`).catch(() => { });
    }
}

async function logsVipsCommand(message, args, deps) {
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        (config.staffRoleId && config.staffRoleId.some(roleId => message.member.roles.cache.has(roleId)));
    if (!isAdmin) return message.reply('❌ No tienes permiso.').catch(() => { });

    try {
        const keys = await VipKey.find().sort({ createdAt: -1 }).limit(20);
        if (keys.length === 0) return message.reply('No hay logs de VIPs.').catch(() => { });

        const description = keys.map(k => {
            const statusIcon = k.status === 'active' ? '🟢' : '🔴';
            const redeemedInfo = k.redeemedBy ? `| Canjeado por <@${k.redeemedBy}>` : '';
            const restrictedInfo = k.restrictedTo ? `| 🔒 Para <@${k.restrictedTo}>` : '';
            return `${statusIcon} **${k.type.toUpperCase()}** \`${k.key}\` ${restrictedInfo} | Creado por <@${k.createdBy}> ${redeemedInfo}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('📜 Logs de Keys VIP')
            .setDescription(description)
            .setColor('#3498DB')
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        message.reply('Error al obtener logs.').catch(() => { });
    }
}

async function keysCommand(message, args, deps) {
    const targetUser = message.mentions.users.first();
    const isStaff = AUTHORIZED_KEYS_ADMINS.some(roleId => message.member.roles.cache.has(roleId));

    // Si se menciona a alguien pero no es staff autorizado
    if (targetUser && !isStaff) {
        return message.reply('❌ No tienes permiso para consultar las keys de otros usuarios.').catch(() => { });
    }

    const userId = targetUser ? targetUser.id : message.author.id;

    try {
        const keys = await VipKey.find({ status: 'active', $or: [{ restrictedTo: userId }, { createdBy: userId }] }).sort({ createdAt: -1 });

        if (keys.length === 0) {
            const noKeysMsg = userId === message.author.id 
                ? '❌ No tienes keys VIP activas (ni creadas por ti ni asignadas a ti).' 
                : `❌ <@${userId}> no tiene keys VIP activas.`;
            const msg = await message.reply(noKeysMsg).catch(() => { });
            setTimeout(() => msg?.delete().catch(() => { }), 5000);
            if (message.deletable) message.delete().catch(() => { });
            return;
        }

        const displayKeys = keys.slice(0, 25);
        const overflow = keys.length - displayKeys.length;

        const myKeys = [];
        const otherKeys = [];

        displayKeys.forEach(k => {
            if (k.restrictedTo === userId) {
                myKeys.push(k);
            } else if (k.createdBy === userId) {
                if (k.restrictedTo && k.restrictedTo !== userId) {
                    otherKeys.push(k);
                } else {
                    myKeys.push(k);
                }
            }
        });

        let description = '';

        if (myKeys.length > 0) {
            description += `**[Tus Keys / Libres]**\n`;
            description += myKeys.map(k => {
                const roleInfo = k.restrictedTo === userId ? '🔒 Asignada a esta cuenta' : '🔓 Libre (Creada por ti)';
                return `**${k.type.toUpperCase()}**\nKey: \`${k.key}\`\n${roleInfo}`;
            }).join('\n\n');
            description += '\n\n';
        }

        if (otherKeys.length > 0) {
            description += `**[Keys asignadas a otros usuarios]**\n`;
            description += otherKeys.map(k => {
                return `**${k.type.toUpperCase()}**\nKey: \`${k.key}\`\n➡️ Asignada a <@${k.restrictedTo}>`;
            }).join('\n\n');
        }

        if (overflow > 0) {
            description += `\n\n*...y ${overflow} más.*`;
        }

        const embed = new EmbedBuilder()
            .setTitle(targetUser ? `🔑 Keys VIP de ${targetUser.username}` : '🔑 Tus Keys VIP Activas')
            .setDescription(description || 'No se encontraron keys para mostrar.')
            .setColor('#3498DB')
            .setFooter({ text: 'Usa !reclamarvip <key> para canjearlas. | Un solo uso por key.' })
            .setTimestamp();

        if (targetUser && isStaff) {
            // Si es staff y menciona a alguien, enviar al canal
            await message.channel.send({ embeds: [embed] });
        } else {
            // Mandar un botón en el canal para ver de forma efímera
            const btn = new ButtonBuilder()
                .setCustomId(`view_keys:${userId}`)
                .setLabel('Ver mis Keys VIP (Privado)')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔑');
            
            const row = new ActionRowBuilder().addComponents(btn);
            
            await message.reply({ 
                content: `Haz clic en el botón de abajo para ver tus keys de forma segura (solo tú las verás).`,
                components: [row] 
            });
        }

        if (message.deletable) message.delete().catch(() => { });

    } catch (error) {
        console.error(error);
        message.reply('❌ Error al buscar keys.').catch(() => { });
    }
}

async function borrarKeysCommand(message, args, deps) {
    const isStaff = AUTHORIZED_KEYS_ADMINS.some(roleId => message.member.roles.cache.has(roleId));
    if (!isStaff) return message.reply('❌ No tienes permiso para borrar keys (Solo Roles STAFF autorizados).').catch(() => { });
    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply('❌ Debes mencionar a un usuario. Uso: `!borrarkeys @usuario`').catch(() => { });

    try {
        const result = await VipKey.deleteMany({ status: 'active', $or: [{ restrictedTo: targetUser.id }, { createdBy: targetUser.id }] });
        if (result.deletedCount === 0) return message.reply(`⚠️ No se encontraron keys activas asociadas a <@${targetUser.id}>.`).catch(() => { });

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Keys Eliminadas')
            .setDescription(`Se han eliminado **${result.deletedCount}** keys activas asociadas a <@${targetUser.id}>.`)
            .setColor('#FF0000')
            .setTimestamp();
        await message.reply({ embeds: [embed] });

        const logEmbed = new EmbedBuilder()
            .setTitle('🗑️ Keys Eliminadas')
            .setDescription(`**Cantidad:** ${result.deletedCount}\n**Usuario Afectado:** <@${targetUser.id}>\n**Ejecutado por:** <@${message.author.id}>`)
            .setColor('#FF0000')
            .setTimestamp();
        await sendVipLog(message.guild, logEmbed, deps);

    } catch (error) {
        console.error(error);
        message.reply('❌ Error al eliminar las keys.').catch(() => { });
    }
}

async function borrarKeyCommand(message, args, deps) {
    const isStaff = AUTHORIZED_KEYS_ADMINS.some(roleId => message.member.roles.cache.has(roleId));
    if (!isStaff) return message.reply('❌ No tienes permiso para borrar keys (Solo Roles STAFF autorizados).').catch(() => { });
    
    if (args.length === 0) return message.reply('❌ Debes especificar la key que deseas borrar. Uso: `!borrarkey <key>`').catch(() => { });

    const keyToSearch = args[0].trim();

    try {
        const keyDoc = await VipKey.findOne({ key: keyToSearch });
        if (!keyDoc) {
            return message.reply(`❌ No se encontró ninguna key con el código \`${keyToSearch}\`.`).catch(() => { });
        }

        await VipKey.deleteOne({ _id: keyDoc._id });

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Key Eliminada')
            .setDescription(`Se ha eliminado la key \`${keyToSearch}\` correctamente.`)
            .setColor('#FF0000')
            .setTimestamp();
        await message.reply({ embeds: [embed] });

        const logEmbed = new EmbedBuilder()
            .setTitle('🗑️ Key Eliminada (Individual)')
            .setDescription(`**Key:** ${keyToSearch}\n**Tipo:** ${keyDoc.type.toUpperCase()}\n**Ejecutado por:** <@${message.author.id}>`)
            .setColor('#FF0000')
            .setTimestamp();
        await sendVipLog(message.guild, logEmbed, deps);

    } catch (error) {
        console.error(error);
        message.reply('❌ Error al eliminar la key.').catch(() => { });
    }
}

module.exports = {
    vipSangrientoCommand,
    vipAbsolutoCommand,
    vipFantasmaCommand,
    vipSenhorCommand,
    vipPresencaCommand,
    vipCaosCommand,
    vipCeusCommand,
    reclamarVipCommand,
    logsVipsCommand,
    keysCommand,
    borrarKeysCommand,
    borrarKeyCommand
};
