const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = async function clipCommand(message, args, ctx) {
    console.log('[DEBUG] clipCommand called');
    const { Clip, COLORS, Player, sendLog, client } = ctx;

    // Verificar que sea DM, no servidor
    if (message.guild) {
        console.log('[DEBUG] Message is from guild, blocking');
        return message.reply("⚠️ Este comando solo funciona por mensaje directo al bot. Envíale un DM con !clip y tu video.").catch(() => {});
    }

    console.log('[DEBUG] Message is from DM');
    const attachment = message.attachments.first();
    console.log('[DEBUG] Attachment:', attachment ? 'Found' : 'Not found');
    let url = attachment ? attachment.url : args[0];
    let userMessage = '';

    // Si hay attachment, el mensaje opcional sería args[0], si no, sería args[1] en adelante
    if (attachment) {
        userMessage = args.join(' ');
    } else if (args.length > 1) {
        url = args[0];
        userMessage = args.slice(1).join(' ');
    }

    console.log('[DEBUG] URL:', url);
    console.log('[DEBUG] User message:', userMessage);

    if (!url) {
        console.log('[DEBUG] No URL provided');
        return message.reply("⚠️ Debes adjuntar un video o proporcionar un enlace.").catch(() => {});
    }

    // Validar si es video (básico)
    const isVideo = attachment ? attachment.contentType?.startsWith('video/') : true; 
    
    if (attachment && !isVideo) {
         return message.reply("⚠️ El archivo adjunto debe ser un video.").catch(() => {});
    }

    // Obtener rango del usuario
    let rankDisplay = message.author.username;
    
    // Intentar obtener datos del jugador (si existe en DB)
    if (Player) {
        const playerDoc = await Player.findById(message.author.id);
        if (playerDoc) {
             rankDisplay = `@RANK ${playerDoc.points || 0} | ${playerDoc.customName || message.author.username}`;
        }
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('vote_clip')
                .setLabel('❤️ Votar (0)')
                .setStyle(ButtonStyle.Secondary)
        );

    // Obtener guild principal (asumiendo bot de un solo servidor o primer servidor común)
    const guild = client.guilds.cache.first();
    if (!guild) {
        return message.reply("❌ No estoy en ningún servidor.").catch(() => {});
    }

    // Usar canal específico por ID
    const targetChannel = guild.channels.cache.get('1489717412298493963');

    if (!targetChannel) {
        return message.reply("⚠️ No encontré el canal de clips configurado.").catch(() => {});
    }

    // Construir contenido del mensaje
    let content = `**Clip de <@${message.author.id}>**`;
    if (userMessage) {
        content += `\n📝 El usuario dijo: ${userMessage}`;
    }
    if (!attachment) {
        content += `\n${url}`;
    }

    const msgPayload = {
        content: content,
        components: [row],
        files: attachment ? [attachment.url] : []
    };

    try {
        const sentMsg = await targetChannel.send(msgPayload);

        // Guardar en DB
        await Clip.create({
            _id: sentMsg.id,
            userId: message.author.id,
            contentUrl: url,
            votes: 0,
            voters: []
        });

        // Confirmar al usuario
        await message.reply({ content: `✅ Tu clip ha sido publicado en ${targetChannel}.` }).catch(() => {});

        // Borrar mensaje original solo si es en servidor
        if (message.guild && message.deletable) {
            await message.delete().catch(() => {});
        }

    } catch (error) {
        console.error("Error posting clip:", error);
        return message.reply("❌ Hubo un error al publicar el clip.").catch(() => {});
    }
};
