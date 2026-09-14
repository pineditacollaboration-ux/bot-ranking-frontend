const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

async function topVoice(message, args, { Player, COLORS, EMBED_DEFAULTS }) {
  // Restricción de canal: Solo permitido en #comandos (1401035609417715775)
  // Excepción: Administradores pueden usarlo donde quieran si tienen permisos de staff
  const ALLOWED_CHANNEL_ID = '1489717459026968736';
  
  if (message.channel.id !== ALLOWED_CHANNEL_ID) {
    // Opcional: Borrar el mensaje del usuario para mantener limpio el chat
    // message.delete().catch(() => {});
    
    // Enviar aviso temporal y borrarlo a los 5 segundos
    const warn = await message.reply(`❌ Este comando solo se puede usar en <#${ALLOWED_CHANNEL_ID}>`);
    setTimeout(() => {
        warn.delete().catch(() => {});
        message.delete().catch(() => {});
    }, 5000);
    return;
  }

  try {
    // 1. Obtener todos los usuarios con tiempo de voz registrado > 0
    const topPlayers = await Player.find({ 
        'voiceTime.totalSeconds': { $gt: 0 } 
    })
    .lean();

    if (!topPlayers || topPlayers.length === 0) {
      return message.channel.send('❌ No hay datos de actividad de voz registrados.');
    }

    // 2. Calcular tiempo real (sumando sesión actual si existe)
    const now = Date.now();
    const processedPlayers = topPlayers.map(player => {
        let totalSeconds = player.voiceTime.totalSeconds;
        
        // Verificar si el usuario está realmente en un canal de voz ahora mismo
        // Esto evita sumar sesiones "fantasma" que quedaron abiertas por reinicios o errores
        const isInVoice = message.guild.voiceStates.cache.has(player._id);

        if (player.voiceTime.currentSession && isInVoice) {
            const sessionStart = new Date(player.voiceTime.currentSession).getTime();
            const currentSessionSeconds = Math.floor((now - sessionStart) / 1000);
            if (currentSessionSeconds > 0) {
                totalSeconds += currentSessionSeconds;
            }
        }

        return {
            id: player._id,
            totalSeconds
        };
    });

    // 3. Ordenar de mayor a menor tiempo
    processedPlayers.sort((a, b) => b.totalSeconds - a.totalSeconds);

    // 4. Configuración de paginación
    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(processedPlayers.length / ITEMS_PER_PAGE);
    let currentPage = 0;

    // Helper para formatear tiempo: "1h 31m 25s"
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        // Formato compacto tipo "0h 59m 39s" o "1h 12m 37s"
        return `${h}h ${m}m ${s}s`;
    };

    // Función auxiliar para resolver nombres de forma segura
    const resolveUserDisplay = async (userId) => {
        try {
            // 1. Intentar obtener miembro del servidor (Forzando actualización de caché)
            // Usamos force: true para intentar que Discord reconozca al usuario y la mención funcione
            const member = await message.guild.members.fetch({ user: userId, force: true }).catch(() => null);
            
            // Si el miembro ESTÁ en el servidor, usamos su NOMBRE (displayName) en negrita.
            // IMPORTANTE: No usamos mención <@ID> porque Discord falla al renderizarla para ciertos usuarios
            // y muestra los números crudos (ej: <@1348...>), lo cual se ve "roto".
            // Con displayName aseguramos que SIEMPRE se vea el nombre legible.
            if (member) return `**${member.displayName}**`; 

            // 2. Si no está en el servidor, obtener datos de usuario de Discord
            const user = await message.client.users.fetch(userId).catch(() => null);
            
            // Si encontramos el usuario pero NO está en el servidor
            if (user) return `**${user.username}** (No está en el DC)`; 

            // 3. Fallback final
            return `\`Usuario (${userId})\` (No está en el DC)`;
        } catch (e) {
            return `\`Usuario (${userId})\` (No está en el DC)`;
        }
    };

    // Función para generar el embed de una página específica
    const generateEmbed = async (page) => {
        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = processedPlayers.slice(start, end);
        
        // Resolver nombres en paralelo para esta página
        const displays = await Promise.all(pageItems.map(p => resolveUserDisplay(p.id)));

        let description = '';
        for (let i = 0; i < pageItems.length; i++) {
            const p = pageItems[i];
            const rank = start + i + 1;
            const timeStr = formatTime(p.totalSeconds);
            const userDisplay = displays[i];
            
            // Formato: #1 | @usuario — ⏱️ 1h 31m 25s
            // Usamos una barra vertical | como separador visual
            description += `**#${rank}** | ${userDisplay} — ⏱️ ${timeStr}\n`;
        }

        return new EmbedBuilder()
            .setTitle('🎙️ Top Actividad de Voz')
            .setDescription(description || 'No hay datos.')
            .setColor(COLORS.SUCCESS || '#57F287')
            .setFooter({ 
                text: `Ranking de actividad en canales de voz • Página ${page + 1}/${totalPages}`, 
                iconURL: EMBED_DEFAULTS?.footer?.iconURL || null 
            })
            .setTimestamp();
    };

    // Función para generar los botones
    const generateButtons = (page) => {
        const row = new ActionRowBuilder();
        
        const prevButton = new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('⬅️ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0);
        
        // Botón "Mi Posición" (nuevo)
        const meButton = new ButtonBuilder()
            .setCustomId('me')
            .setLabel('📍 Mi Posición')
            .setStyle(ButtonStyle.Secondary);
            
        const nextButton = new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Siguiente ➡️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === totalPages - 1);

        row.addComponents(prevButton, meButton, nextButton);
        return row;
    };

    // 5. Enviar mensaje inicial
    const embed = await generateEmbed(currentPage);
    const msgPayload = { embeds: [embed] };
    
    // Siempre añadir botones (aunque sea solo para "Mi Posición")
    if (totalPages >= 1) {
        msgPayload.components = [generateButtons(currentPage)];
    }

    const sentMessage = await message.channel.send(msgPayload);

    // Si no hay datos, no hacemos nada más
    if (processedPlayers.length === 0) return;

    // 6. Collector para manejar botones
    const collector = sentMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000 // 2 minutos
    });

    collector.on('collect', async (interaction) => {
      try {
        // Solo quien ejecutó el comando puede usar la paginación normal
        // PERO "Mi Posición" debería poder usarla cualquiera para buscarse a sí mismo (opcional, pero el usuario pidió "el usuario que ejecuto el comando")
        // Siguiendo la lógica estricta: "mi posicion y lo lleve a la pagina donde esta el usuario que ejecuto el comando"
        
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ 
                content: '❌ Solo quien ejecutó el comando puede usar los botones.', 
                ephemeral: true 
            });
        }

        if (interaction.customId === 'prev') {
            currentPage = Math.max(0, currentPage - 1);
        } else if (interaction.customId === 'next') {
            currentPage = Math.min(totalPages - 1, currentPage + 1);
        } else if (interaction.customId === 'me') {
            // Buscar índice del usuario
            const index = processedPlayers.findIndex(p => p.id === interaction.user.id);
            
            if (index === -1) {
                return interaction.reply({
                    content: '❌ No apareces en el ranking (0 segundos registrados).',
                    ephemeral: true
                });
            }
            
            // Calcular página
            const newPage = Math.floor(index / ITEMS_PER_PAGE);
            
            if (newPage === currentPage) {
                return interaction.reply({
                    content: '📍 Ya estás viendo tu página.',
                    ephemeral: true
                });
            }
            
            currentPage = newPage;
        }

        // Diferir la actualización para evitar timeouts (DiscordAPIError[10062])
        // ya que generateEmbed hace llamadas a la API de Discord que pueden tardar.
        await interaction.deferUpdate();

        await interaction.editReply({
            embeds: [await generateEmbed(currentPage)],
            components: [generateButtons(currentPage)]
        });
      } catch (err) {
        console.error('Error handling topVoice interaction:', err);
        if (!interaction.replied && !interaction.deferred) {
            interaction.reply({ content: '❌ Ocurrió un error al procesar la interacción.', ephemeral: true }).catch(() => {});
        }
      }
    });

    collector.on('end', () => {
        // Desactivar botones al finalizar
        const disabledRow = generateButtons(currentPage);
        disabledRow.components.forEach(btn => btn.setDisabled(true));
        sentMessage.edit({ components: [disabledRow] }).catch(() => {});
    });

  } catch (error) {
    console.error('Error en topVoice:', error);
    return message.channel.send('❌ Ocurrió un error al obtener el top de voz.');
  }
}

module.exports = topVoice;
