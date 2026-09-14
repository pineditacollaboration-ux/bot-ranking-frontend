const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');

async function panelStreamerCommand(message, args, ctx) {
    const { COLORS, BOT_OWNER_ID, config } = ctx;

    // Check permissions (Admin or Staff)
    const isOwner = Array.isArray(BOT_OWNER_ID)
        ? BOT_OWNER_ID.includes(message.author.id)
        : message.author.id === BOT_OWNER_ID;

    const staffRoles = config.staffRoleId || [];
    const isStaff = staffRoles.some(id => message.member.roles.cache.has(id));

    if (!isOwner && !isStaff && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply('❌ No tienes permisos para usar este comando.').catch(() => { });
    }

    const embed = new EmbedBuilder()
        .setTitle('Filas Privadas Streamers')
        .setDescription('En el menú de abajo, podrás crear tu fila privada de forma fácil y rápida.')
        .setColor(COLORS.PRIMARY || '#800080')
        .setImage('https://cdn.discordapp.com/attachments/1496304992355745992/1497457193639743608/Gemini_Generated_Image_bg7j7nbg7j7nbg7j-ezremove.png?ex=69ed9730&is=69ec45b0&hm=55055b6bcc54e6fc6ad27b14045d38572ea1b7d062a92f82d604640fc67b1ab7&');

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('streamer_panel_menu')
        .setPlaceholder('Selecciona una opción...')
        .addOptions([
            {
                label: 'Crear Fila Privada',
                description: 'Crea una nueva fila para tus seguidores.',
                value: 'create_queue',
                emoji: '➕'
            },
            {
                label: 'Eliminar Fila',
                description: 'Elimina tu fila actual del servidor.',
                value: 'delete_queue',
                emoji: '🗑️'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await message.channel.send({ embeds: [embed], components: [row] }).catch(console.error);
    if (message.deletable) await message.delete().catch(() => { });
}

async function pasoAPasoCommand(message, args, ctx) {
    const { COLORS } = ctx;

    const embed = new EmbedBuilder()
        .setTitle('PASO A PASO DE CÓMO CREAR TU FILA')
        .setColor('#800080')
        .addFields(
            { name: '1. CLICK EN CREAR FILA EN EL PANEL', value: 'Ve al panel de "Filas Privadas Streamers" y selecciona "Crear Fila Privada" en el menú desplegable.' },
            { name: '2. COMPLETA LA INFORMACIÓN Y ENVÍA', value: 'Se abrirá una ventana. Pon tu nombre nombre de tu Fila y la cantidad de personas.' },
            { name: '3. VERIFICA TUS CANALES', value: '¡Listo! Se crearán automáticamente tu canal de Texto en la categoría de STREAMERS.' },
            { name: '⚠️ REGLAS DE USO', value: '• No abuses de la creación de filas.\n• Elimina tu fila cuando termines tu directo.\n• El mal uso del sistema resultará en la pérdida del acceso.' }
        );

    await message.channel.send({ embeds: [embed] }).catch(console.error);
    if (message.deletable) await message.delete().catch(() => { });
}

module.exports = { panelStreamerCommand, pasoAPasoCommand };
