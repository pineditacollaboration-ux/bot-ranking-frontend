const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');

async function handleStreamerMenuSelection(interaction, deps) {
    const { StreamerChannel, config, COLORS } = deps;
    const userId = interaction.user.id;
    const selection = interaction.values[0];

    if (selection === 'create_queue') {
        // Check if already has a queue
        const existing = await StreamerChannel.findOne({ ownerId: userId, guildId: interaction.guildId });
        if (existing) {
            return interaction.reply({ content: '❌ Ya tienes una fila activa. Debes eliminarla antes de crear una nueva.', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId('streamer_create_queue_modal')
            .setTitle('✅ | Fila Verificada');

        const nickInput = new TextInputBuilder()
            .setCustomId('queue_nick')
            .setLabel('Nick:')
            .setPlaceholder('Ej: Pineda y Dark')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const rulesInput = new TextInputBuilder()
            .setCustomId('queue_rules')
            .setLabel('Reglas:')
            .setPlaceholder('Ej: Full ump y xm8\nSin tela parada')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const playingInput = new TextInputBuilder()
            .setCustomId('queue_playing')
            .setLabel('Estoy jugando...:')
            .setPlaceholder('Ej: X2 emu +1000 puntos')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nickInput),
            new ActionRowBuilder().addComponents(rulesInput),
            new ActionRowBuilder().addComponents(playingInput)
        );

        return interaction.showModal(modal);
    }

    if (selection === 'delete_queue') {
        const queueDoc = await StreamerChannel.findOne({ ownerId: userId, guildId: interaction.guildId });
        if (!queueDoc) {
            return interaction.reply({ content: '❌ No tienes ninguna fila activa para eliminar.', ephemeral: true });
        }

        try {
            const textChannel = interaction.guild.channels.cache.get(queueDoc._id);
            if (textChannel) await textChannel.delete().catch(() => { });

            await StreamerChannel.deleteOne({ _id: queueDoc._id });
            return interaction.reply({ content: '🗑️ Tu fila y su canal han sido eliminados.', ephemeral: true });
        } catch (e) {
            console.error('[StreamerPanel] Error deleting queue:', e);
            return interaction.reply({ content: '❌ Hubo un error al eliminar tu fila.', ephemeral: true });
        }
    }
}

async function handleStreamerModalSubmit(interaction, deps) {
    const { StreamerChannel, config, COLORS } = deps;
    const userId = interaction.user.id;
    const guild = interaction.guild;
    const queueNick = interaction.fields.getTextInputValue('queue_nick');
    const queueRules = interaction.fields.getTextInputValue('queue_rules');
    const queuePlaying = interaction.fields.getTextInputValue('queue_playing');

    const STREAMER_CATEGORY_ID = '1497041126987792536'; // Usando el ID dado por el usuario
    const SPECIAL_ROLE_ID = '1489744493677641789'; // Role specified by user

    try {
        await interaction.deferReply({ ephemeral: true });

        // Create Text Channel
        const textChannel = await guild.channels.create({
            name: `💬-${queueNick}`.toLowerCase().replace(/\s+/g, '-').substring(0, 32),
            type: ChannelType.GuildText,
            parent: STREAMER_CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel] // Private by default
                },
                {
                    id: userId, // Streamer
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels]
                },
                {
                    id: SPECIAL_ROLE_ID, // Role 1489744493677641789
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                }
            ]
        });

        // Save to DB
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await StreamerChannel.create({
            _id: textChannel.id,
            guildId: guild.id,
            ownerId: userId,
            ownerUsername: interaction.user.username,
            expiresAt: expiresAt
        });

        // Send embed with info to the channel
        const infoEmbed = new EmbedBuilder()
            .setTitle('✅ | Fila Verificada')
            .setColor('#2ECC71')
            .addFields(
                { name: 'Nick:', value: queueNick },
                { name: 'Reglas:', value: queueRules },
                { name: 'Estoy jugando...:', value: queuePlaying }
            )
            .setFooter({ text: 'No compartas contraseñas u otra información confidencial.' });
        await textChannel.send({ content: `<@${userId}>`, embeds: [infoEmbed] });

        // Inform the user
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Fila Creada')
            .setDescription(`Tu canal privado ha sido creado: <#${textChannel.id}>\n\n⚠️ **Importante:** Ve a ese canal y usa el comando de fila (ej: \`!fila 2v2 ${queueNick}\`) para empezar.`);
        // .setColor(COLORS.SUCCESS || '#00FF00'); // Optional: check if COLORS is available

        return interaction.editReply({ embeds: [successEmbed] });

    } catch (e) {
        console.error('[StreamerPanel] Error creating queue:', e);
        return interaction.editReply({ content: '❌ Hubo un error al crear los canales de tu fila.' });
    }
}

module.exports = {
    handleStreamerMenuSelection,
    handleStreamerModalSubmit
};
