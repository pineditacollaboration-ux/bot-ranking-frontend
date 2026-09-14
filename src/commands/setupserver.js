const { ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');

/**
 * Command to setup server stats channels.
 */
async function setupServerCommand(message, args, ctx) {
    const { Setting, COLORS, BOT_OWNER_ID, hasPermission } = ctx;
    const guild = message.guild;
    if (!guild || !Setting) return;

    // Permissions check
    const isOwner = Array.isArray(BOT_OWNER_ID)
        ? BOT_OWNER_ID.includes(message.author.id)
        : message.author.id === BOT_OWNER_ID;
    
    if (!isOwner && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.channel.send('🚫 Solo administradores pueden usar este comando.').catch(() => { });
    }

    try {
        const loadingMsg = await message.channel.send('⏳ Configurando canal de estadísticas...').catch(() => null);

        // 1. Create Category
        const category = await guild.channels.create({
            name: '📊 SERVER STATS 📊',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.Connect],
                },
            ],
        });

        // 2. Count members in voice channels
        await guild.members.fetch().catch(() => {});
        const membersInVoice = guild.members.cache.filter(m => m.voice.channel).size;

        // 3. Create Channel
        const voiceChan = await guild.channels.create({
            name: `Miembros en call: ${membersInVoice}`,
            type: ChannelType.GuildVoice,
            parent: category.id,
        });

        // 4. Save to DB
        await Setting.findByIdAndUpdate('serverStatsCategoryId', { value: category.id }, { upsert: true });
        await Setting.findByIdAndUpdate('serverStatsMembersInVoiceId', { value: voiceChan.id }, { upsert: true });

        if (loadingMsg) await loadingMsg.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('✅ Configuración Completada')
            .setDescription('Se ha creado el canal de estadísticas del servidor.')
            .addFields(
                { name: 'Categoría', value: `${category.name}`, inline: false },
                { name: 'Canal', value: `${voiceChan.name}`, inline: false }
            )
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
        console.error('[Setup Command] Error setting up server stats:', error);
        await message.channel.send('❌ Ocurrió un error al configurar los canales de estadísticas.').catch(() => {});
    }
}

module.exports = setupServerCommand;
