/**
 * src/utils/invitationScheduler.js
 * Envía mensaje cada lunes a los canales especificados
/**
 * src/utils/invitationScheduler.js
 * Envía mensaje cada lunes a los canales especificados
 */

const cron = require('node-cron');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class InvitationScheduler {
  constructor(client) {
    this.client = client;
    const config = require('../../config.json');
    // Usar IDs de configuración o array vacío por defecto
    this.channelIds = config.invitationChannelIds || [];
  }

  /**
   * Iniciar scheduler
   */
  start() {
    console.log('[InvitationScheduler] ✅ Iniciando...');

    // Ejecutar cada lunes a las 12:00 AM (medianoche - America/Bogota)
    cron.schedule('0 0 * * 1', () => {
      this.sendWeeklyMessage();
    }, {
      timezone: 'America/Bogota'
    });

    // Enviar mensaje inmediatamente para testing (comentar después)
    // this.sendWeeklyMessage();

    console.log('[InvitationScheduler] 📅 Programado para cada lunes a las 10:00 AM (Bogotá)');
  }

  /**
   * Enviar mensaje semanal a todos los canales
   */
  async sendWeeklyMessage() {
    console.log('[InvitationScheduler] 📢 Enviando mensajes semanales...');

    // Crear embed
    const embed = new EmbedBuilder()
      .setTitle('🎁 GANA PUNTOS INVITANDO AMIGOS')
      .setDescription(
        '**¡Esta semana es tu oportunidad de ganar puntos gratis!**\n\n' +
        'Genera tu link de invitación único y comparte con tus amigos.\n\n' +
        '**Si 5 usuarios entran con tu link, ¡recibes 5000 puntos! 💰**\n\n' +
        '📩 Cuando un amigo entre al servidor, el bot le mandará un mensaje privado.\n' +
        'Para registrar la invitación debe responderle escribiendo: `INV TU_CODIGO` (ejemplo: `INV ABCD1234`).'
      )
      .addFields(
        {
          name: '📊 Cómo Funciona',
          value: '1️⃣ Presiona "Generar Link"\n' +
                 '2️⃣ Copia tu link único\n' +
                 '3️⃣ Comparte con amigos\n' +
                 '4️⃣ Ellos responden al bot por MD con `INV TU_CODIGO`\n' +
                 '5️⃣ Cuando 5 entren → ¡5000 puntos! 🎉'
        },
        {
          name: '⏱️ Vigencia',
          value: '30 días desde que generes el link'
        },
        {
          name: '💡 Requisitos',
          value: 'Los usuarios que usen tu link deben ser nuevos en el servidor'
        }
      )
      .setColor(0x6366f1)
      .setFooter({ text: 'ROYAL RANKED - Sistema de Invitaciones Semanal' })
      .setTimestamp();

    // Crear botones
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('inv_generate')
          .setLabel('Generar Link')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setCustomId('inv_stats')
          .setLabel('Ver Progreso')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📊')
      );

    // Enviar a cada canal
    for (const channelId of this.channelIds) {
      try {
        const channel = await this.client.channels.fetch(channelId);
        
        if (!channel || !channel.isTextBased()) {
          console.warn(`[InvitationScheduler] ⚠️ Canal ${channelId} no encontrado o no es texto`);
          continue;
        }

        await channel.send({
          embeds: [embed],
          components: [row]
        });

        console.log(`[InvitationScheduler] ✅ Mensaje enviado a ${channelId}`);
      } catch (error) {
        // Formatear el error para evitar spam de pila
        const errorMsg = error.code ? `DiscordAPIError[${error.code}]: ${error.message}` : error.message;
        console.error(`[InvitationScheduler] ❌ Error enviando a ${channelId}: ${errorMsg}`);
      }
    }
  }
}

module.exports = InvitationScheduler;
