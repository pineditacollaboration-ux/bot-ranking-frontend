const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = async function enviarLiveCommand(message, ctx) {
    const { EMOJIS, hasPermission, BOT_OWNER_ID } = ctx;

    // 1. Restricción de canal
    const ENVIAR_LIVE_CHANNEL_ID = '1489717436961001725';
    if (message.channel.id !== ENVIAR_LIVE_CHANNEL_ID) {
        const warn = await message.reply(`⚠️ Este comando solo se puede usar en el canal <#${ENVIAR_LIVE_CHANNEL_ID}>.`).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => { }), 5000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
    }

    // 2. Restricción de roles
    const ALLOWED_LIVE_ROLES = ['1490955410813882478', '1490955448516481055', '1490955629576065135'];
    const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(message.author.id) : message.author.id === BOT_OWNER_ID;
    const isStaff = hasPermission(message.member) || isOwner;
    const hasLiveRole = message.member.roles.cache.some(r => ALLOWED_LIVE_ROLES.includes(r.id));

    if (!hasLiveRole && !isStaff) {
        const warn = await message.reply(`❌ No tienes los permisos necesarios para usar este comando.`).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => { }), 5000);
        if (message.deletable) await message.delete().catch(() => { });
        return;
    }

    // Crear el botón inicial
    const embed = new EmbedBuilder()
        .setTitle('📢 Anunciar Directo')
        .setDescription('Haz clic en el botón de abajo para anunciar que estás en directo jugando en la Ranked.')
        .setColor('#FF0050');

    const btn = new ButtonBuilder()
        .setCustomId('live_announcement_start')
        .setLabel('ANUNCIAR DIRECTO')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔴');

    const row = new ActionRowBuilder().addComponents(btn);

    // Borrar el mensaje del comando original para limpieza
    if (message.deletable) await message.delete().catch(() => { });

    await message.channel.send({
        embeds: [embed],
        components: [row]
    }).catch(() => { });
};
