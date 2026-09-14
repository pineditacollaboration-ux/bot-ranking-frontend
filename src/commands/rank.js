// src/commands/rank.js
// Comando de ranking mejorado con diseño premium y estadísticas avanzadas
const { MessageFlags } = require('discord.js');

async function rankCommand(message, ctx) {
  try {
    const { renderRanking, refreshCache, config } = ctx;
    const EMOJIS = config?.emojis || {};
    
    // Enviar el ranking inicial
    const { embed, components } = await renderRanking(1, "points", message.author.id, message.guild);
    const sent = await message.channel.send({ embeds: [embed], components });

    const collector = sent.createMessageComponentCollector({ time: 300000 });
    
    collector.on("collect", async (i) => {
      try {
        if (!i.customId.startsWith("rank_")) return;

        const authorId = i.customId.split('_').pop();
        if (i.user.id !== authorId && !i.customId.includes('refresh')) {
          return i.reply({
            content: `${EMOJIS.warning || '⚠️'} Solo quien ejecutó el comando puede interactuar con este ranking.`,
            flags: [MessageFlags.Ephemeral]
          }).catch(() => {});
        }

        // Defer inmediatamente para evitar timeout
        await i.deferUpdate().catch(() => {});

        const parts = i.customId.split('_');
        let type, page;

        if (i.isStringSelectMenu() && parts[1] === 'category') {
          type = i.values[0];
          page = 1;
        } else if (i.isButton()) {
          const action = parts[1];
          type = parts[2];
          const currentPage = parseInt(parts[3], 10);

          if (action === 'next') {
            page = currentPage + 1;
          } else if (action === 'prev') {
            page = currentPage - 1;
          } else if (action === 'first') {
            page = 1;
          } else if (action === 'self') {
            page = 'self'; // renderRanking manejará la lógica de búsqueda
          } else if (action === 'last') {
            // Necesitamos calcular la última página
            const ranking = await renderRanking(currentPage, type, authorId, i.guild);
            // Usar el footer para extraer el número de página máximo
            const maxPageMatch = ranking.embed.data?.footer?.text?.match(/Página \d+\/(\d+)/);
            page = maxPageMatch ? parseInt(maxPageMatch[1], 10) : currentPage;
          } else {
            page = currentPage;
          }
          
          if (action === 'refresh' && typeof refreshCache === 'function') {
            try { 
              await refreshCache(i.guild); 
            } catch (err) {
              console.error('[Rank Command] Error refreshing cache:', err);
            }
          }
        }

        // Renderizar el nuevo ranking
        const result = await renderRanking(page, type, authorId, i.guild);
        await i.editReply({ embeds: [result.embed], components: result.components }).catch((err) => {
          console.error('[Rank Command] Error editing reply:', err);
        });
      } catch (error) {
        console.error('[Rank Command] Error in collector:', error);
        // Intentar responder con un mensaje de error
        try {
          if (!i.replied && !i.deferred) {
            await i.reply({ content: `${EMOJIS.error || '❌'} Ocurrió un error al actualizar el ranking.`, flags: [MessageFlags.Ephemeral] });
          }
        } catch (_) {}
      }
    });

    collector.on('end', () => {
      sent.edit({ components: [] }).catch(() => {});
    });
    
  } catch (error) {
    console.error('[Rank Command] Error in rankCommand:', error);
    // Intentar enviar mensaje de error al usuario
    try {
      await message.channel.send({ content: `${EMOJIS.error || '❌'} Ocurrió un error al cargar el ranking. Por favor intenta de nuevo.` });
    } catch (_) {}
  }
}

module.exports = { rankCommand };
