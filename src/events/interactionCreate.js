// src/events/interactionCreate.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Canvas, loadImage, createCanvas } = require('@napi-rs/canvas');
const { MessageFlags } = require('discord.js');
const { generatePrizeCard } = require('../utils/roulette-generator');
const { generateRouletteGif, generateRouletteStaticImage, PRIZE_EMOJIS } = require('../utils/roulette-gif');
const VipKey = require('../models/VipKey');

const DONATION_ROLES = {
  bigBoss: '1500592330120364174',
  spider: '1499271153674620999',
  paseLibre: '1489754427220037724',
  relikia: '1403172317152018442',
  scream: '1407880036178198639',
  wave: '1407879455954833601',
  blood: '1407882862635782226',
  king: '1490449395882135632',
  bornToWin: '1490452350068981792',
  lendaTropa: '1490453596603416658',
  crazyToWin: '1490450055906197544',
  deusDaRanqueada: '1490461649398661352',
  godRanked: '1490461402748420257'
};

// Roles that grant VIP status for duration calculation
const VIP_TIERS = {
  gengar: '1407163337095250021',
  morvius: '1403437125839618199',
  godspeed: '1403437053051408495',
  tiorico: '1403436952497291417',
  sangriento: '1490429947133820981',
  absoluto: '1490436182977417327',
  fantasma: '1490430290680746146',
  senhor: '1490430760497188955',
  presenca: '1490432920387584190',
  caos: '1490431489115160607',
  ceus: '1490436936773664899',
  royalRanked: '1489762472675115189',
  espanca_xota: '1500596344073752668',
  maceta_ruim: '1500595809987854537',
  magnata: '1500589829308813454',
  inabalavel: '1500592040306806824',
  mute_vip: '1489754585143705631',
  rush_master: '1490456682835218623',
  staff_admin: '1484375565975617595',
  staff_mod: '1484375565975617594'
};

function getRemainingVipMs(player, member) {
  const vipRoleIds = [...Object.values(VIP_TIERS), ...Object.values(DONATION_ROLES)];
  let maxExpiresAt = 0;

  // 1. Check DB temporaryRoles
  if (player.temporaryRoles && Array.isArray(player.temporaryRoles)) {
    for (const role of player.temporaryRoles) {
      if (!role || !role.roleId || !role.expiresAt) continue;
      if (vipRoleIds.includes(role.roleId)) {
        const roleExpiryMs = (role.expiresAt instanceof Date) ? role.expiresAt.getTime() : Number(role.expiresAt || 0);
        if (roleExpiryMs > maxExpiresAt) {
          maxExpiresAt = roleExpiryMs;
        }
      }
    }
  }

  const now = Date.now();

  // 2. Fallback: If user has the role on Discord but not in DB or it's "expired" in DB
  // This handles permanent roles or roles added manually/via shop without tempRole record.
  if (member && member.roles) {
    const hasVipOnDiscord = member.roles.cache.some(r => vipRoleIds.includes(r.id));
    if (hasVipOnDiscord) {
      // Si tiene el rol en Discord pero en la DB dice que expiró o no existe,
      // le damos una duración virtual de 30 días para que pueda usar su cartera.
      if (maxExpiresAt < now) {
        return 30 * 24 * 60 * 60 * 1000;
      }
    }
  }

  if (maxExpiresAt === 0) return 0;
  const remaining = maxExpiresAt - now;
  return remaining > 0 ? remaining : 0;
}

module.exports = async function onInteractionCreate(interaction, ctx) {
  const {
    blacklistedUsers,
    BOT_OWNER_ID,
    settings,
    safeReplyEphemeral,
    client,
    buildPlayerCard,
    buildSeasonStatsCard,
    handleMatchHistoryCommand,
    MatchHistory,
    EmbedBuilder,
    AttachmentBuilder,
    COLORS,
    EMBED_DEFAULTS,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    queues,
    ActiveQueue,
    Queue,
    resetQueueTimeout,
    getOrRestoreQueue,
    getQueueDeps,
    handleQueueJoinButton,
    handleQueueWagerAccept,
    handleQueueWagerCancel,
    handleQueueLeaveButton,
    MANAGE_ROLE,
    PermissionsBitField,
    matches,
    handleMatchClosure,
    handleMatchManagementSelection,
    ActiveMatch,
    handleMatchResponseSelection,
    handleQueueKickSelect,
    handleQueueMenuSelection,
    handleWagerModalSubmit,
    sendLog,
    handleAutoroleSelection,
    Player,
    ensurePlayerRecord,
    invalidatePlayerCache,
    removeTemporaryRole,
    CLOSE_APPLY_ROLE_IDS,
    getMatchDeps,
    invitationService,
    checkTikTokLive,
    Clip,
    ActiveTempVoice,
    ChannelType,
    config,
    StreamerChannel,
    deliverPrize,
    ROULETTE_PRIZES,
    ROULETTE_PROBABILITIES,
    Setting,
  } = ctx;

  const EMOJIS = config.emojis || {};

  try {
    if (!interaction.inGuild()) return;

    // Blacklist para interacciones
    const blEntry = blacklistedUsers.get(interaction.user.id);
    if (blEntry && !(Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(interaction.user.id) : interaction.user.id === BOT_OWNER_ID)) {
      const exp = blEntry.expiresAt ? new Date(blEntry.expiresAt).getTime() : null;
      if (exp && Date.now() > exp) {
        blacklistedUsers.delete(interaction.user.id);
      } else {
        await safeReplyEphemeral(interaction, '❌ Estás en la lista negra y no puedes interactuar con el bot.');
        return;
      }
    }

    // ====== Restricción por antigüedad de cuenta (mínimo 48 horas) ======
    const MIN_ACCOUNT_AGE_MS = 48 * 60 * 60 * 1000;
    const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(interaction.user.id) : interaction.user.id === BOT_OWNER_ID;
    if (Date.now() - interaction.user.createdTimestamp < MIN_ACCOUNT_AGE_MS && !isOwner) {
      await safeReplyEphemeral(interaction, '❌ Tu cuenta de Discord es demasiado reciente (menos de 48 horas de creada). No puedes interactuar con el bot.');
      return;
    }

    // ====== Modo mantenimiento: bloquear todas las interacciones para usuarios no autorizados ======
    if (settings && settings.maintenanceEnabled) {
      const isOwner = Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(interaction.user.id) : interaction.user.id === BOT_OWNER_ID;
      if (!isOwner) {
        await safeReplyEphemeral(interaction, '🛠️ El bot está en mantenimiento. Inténtalo más tarde.');
        return;
      }
    }

    const parts = interaction.customId ? interaction.customId.split(':') : [];

    if (interaction.isButton() && interaction.customId === 'live_announcement_start') {
      const modal = new ModalBuilder()
        .setCustomId('live_announcement_modal')
        .setTitle('Anunciar Directo');

      const linkInput = new TextInputBuilder()
        .setCustomId('live_link')
        .setLabel('Link de tu directo')
        .setPlaceholder('https://www.tiktok.com/@tu_usuario/live')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const firstActionRow = new ActionRowBuilder().addComponents(linkInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal).catch(() => {});
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'live_announcement_modal') {
      // Diferir para evitar timeouts, pero responderemos rápido
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => {});

      const liveLink = interaction.fields.getTextInputValue('live_link');

      // Validar URL
      try {
        new URL(liveLink);
      } catch (e) {
        return interaction.editReply({ content: '❌ URL inválida.' }).catch(() => { });
      }
      
      let announcementChannelId = settings?.tiktokChannelId || '1462900231677935717';
      
      // Intentar obtener el canal de la caché para máxima velocidad
      const channel = interaction.guild.channels.cache.get(announcementChannelId) || 
                      await interaction.guild.channels.fetch(announcementChannelId).catch(() => null);

      if (!channel) {
        return interaction.editReply({ content: '❌ Canal de anuncios no encontrado.' });
      }

      // Responder al usuario de inmediato para que no espere
      interaction.editReply({ content: '✅ ¡Tu directo ha sido anunciado con éxito!' }).catch(() => {});

      // Borrar el panel en segundo plano
      if (interaction.message?.deletable) {
        interaction.message.delete().catch(() => {});
      }

      // Enviar el anuncio en segundo plano
      const announcementEmbed = new EmbedBuilder()
        .setTitle('🔴 ¡Jugador en Directo!')
        .setDescription(`**${interaction.user.username}** está en directo jugando en la Ranked.\n\n🔗 **Enlace:** ${liveLink}`)
        .setColor('#FF0050')
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Ver Directo').setStyle(ButtonStyle.Link).setURL(liveLink)
      );

      await channel.send({ 
        content: `@everyone ¡<@${interaction.user.id}> está en vivo!`, 
        embeds: [announcementEmbed], 
        components: [row] 
      }).catch(err => console.error('Error enviando anuncio live:', err));

      return;
    }

    // --- NUEVO: SISTEMA DE FILAS PARA STREAMERS (Panel) ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'streamer_panel_menu') {
      if (typeof ctx.handleStreamerMenuSelection === 'function') {
        return ctx.handleStreamerMenuSelection(interaction, ctx);
      }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'streamer_create_queue_modal') {
      if (typeof ctx.handleStreamerModalSubmit === 'function') {
        return ctx.handleStreamerModalSubmit(interaction, ctx);
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'buy_req_cargo') {
      if (typeof ctx.handleReqCargosSelection === 'function') {
        return ctx.handleReqCargosSelection(interaction, ctx);
      }
    }


    if (interaction.isStringSelectMenu() && interaction.customId === 'panel:streamer:create_menu') {
      console.log(`[StreamerAction] Usuario ${interaction.user.tag} seleccionó una opción. Valor: ${interaction.values[0]}`);
      if (interaction.values[0] === 'create_streamer_channel') {
        const STREAMER_CATEGORY_ID = '1473558364289241253';
        const READ_ONLY_ROLE_ID = '1403172539588546621';
        const guild = interaction.guild;
        const member = interaction.member;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });

        const channelName = `fila-${member.user.username}`.toLowerCase();
        console.log(`[StreamerAction] Intentando buscar canal: ${channelName}`);

        // Verificar si las dependencias críticas existen
        if (!ChannelType || !PermissionsBitField) {
          console.error('[StreamerAction] ERROR: ChannelType o PermissionsBitField no están definidos en el contexto.');
          return interaction.editReply({ content: '❌ Error interno: Faltan constantes de Discord.js.' }).catch(() => { });
        }

        let existingChannel = guild.channels.cache.find(c => c.name.toLowerCase() === channelName && c.parentId === STREAMER_CATEGORY_ID);

        // Si no se encuentra por nombre, buscar en la DB por ID de usuario
        if (!existingChannel && StreamerChannel) {
          console.log(`[StreamerAction] No encontrado en caché, buscando en DB para ${member.id}`);
          const channelDoc = await StreamerChannel.findOne({ ownerId: member.id, guildId: guild.id }).catch(() => null);
          if (channelDoc) {
            console.log(`[StreamerAction] Documento encontrado en DB: ${channelDoc._id}, intentando fetch...`);
            existingChannel = await guild.channels.fetch(channelDoc._id).catch(() => null);
          }
        }

        if (existingChannel) {
          console.log(`[StreamerAction] Canal ya existe: ${existingChannel.id}`);
          if (StreamerChannel) {
            await StreamerChannel.findByIdAndUpdate(
              existingChannel.id,
              {
                guildId: guild.id,
                ownerId: member.id,
                ownerUsername: member.user.username,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000)
              },
              { upsert: true }
            ).catch(e => console.error('Error guardando StreamerChannel en DB:', e));
          }

          return interaction.editReply({ content: `❌ Ya tienes un canal de streamer creado: ${existingChannel}` }).catch(() => { });
        }

        try {
          const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: STREAMER_CATEGORY_ID,
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel],
              },
              {
                id: member.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels],
              },
              {
                id: READ_ONLY_ROLE_ID,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
                deny: [PermissionsBitField.Flags.SendMessages]
              }
            ],
          });

          // Guardar en base de datos
          if (StreamerChannel) {
            try {
              await StreamerChannel.findByIdAndUpdate(
                channel.id,
                {
                  guildId: guild.id,
                  ownerId: member.id,
                  ownerUsername: member.user.username,
                  createdAt: new Date(),
                  expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000)
                },
                { upsert: true }
              );
              console.log(`[StreamerChannel] Guardado exitoso: Canal ${channel.id} para ${member.user.tag} (expira en 3h)`);
            } catch (dbErr) {
              console.error(`[StreamerChannel] ERROR crítico al guardar en DB para ${member.user.tag}:`, dbErr);
            }
          }

          await interaction.editReply({ content: `✅ Canal creado con éxito: ${channel}. ¡Ya puedes empezar tu fila!` }).catch(() => { });

          const logEmbed = new EmbedBuilder()
            .setTitle('🎥 Canal de Streamer Creado')
            .setDescription(`**Streamer:** <@${member.id}>\n**Canal:** ${channel}`)
            .setColor(COLORS.PRIMARY)
            .setTimestamp();
          sendLog(guild, logEmbed, [], 'staff');
        } catch (err) {
          console.error('Error al crear canal de streamer:', err);
          if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: '❌ Error al crear el canal. Asegúrate de que el bot tenga permisos para gestionar canales.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
          } else {
            return interaction.editReply({ content: '❌ Error al crear el canal. Asegúrate de que el bot tenga permisos para gestionar canales.' }).catch(() => { });
          }
        }
      }
      return;
    }

    // Botones
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('copy_room_id:')) {
        const roomId = interaction.customId.replace('copy_room_id:', '');
        return interaction.reply({ content: `${roomId}`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }

      if (interaction.customId.startsWith('view_keys:')) {
        const targetUserId = interaction.customId.split(':')[1];
        if (interaction.user.id !== targetUserId) {
          return interaction.reply({ content: '❌ Solo el dueño de estas keys puede verlas.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }

        try {
          const keys = await VipKey.find({ status: 'active', $or: [{ restrictedTo: targetUserId }, { createdBy: targetUserId }] }).sort({ createdAt: -1 });

          if (keys.length === 0) {
            return interaction.reply({ content: '❌ No tienes keys VIP activas en este momento.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
          }

          const displayKeys = keys.slice(0, 25);
          const overflow = keys.length - displayKeys.length;

          const description = displayKeys.map(k => {
            let roleInfo = '';
            if (k.restrictedTo === targetUserId) roleInfo = '🔒 **Asignada a esta cuenta**';
            else if (k.createdBy === targetUserId) {
              if (k.restrictedTo) roleInfo = `➡️ Asignada a <@${k.restrictedTo}>`;
              else roleInfo = '🔓 Libre (Creada por esta cuenta)';
            }
            return `**${k.type.toUpperCase()}**\nKey: \`${k.key}\`\n${roleInfo}`;
          }).join('\n\n');

          const embed = new EmbedBuilder()
            .setTitle('🔑 Tus Keys VIP Activas')
            .setDescription(description + (overflow > 0 ? `\n\n*...y ${overflow} más.*` : ''))
            .setColor('#3498DB')
            .setFooter({ text: 'Usa !reclamarvip <key> dentro del canal configurado.' })
            .setTimestamp();

          return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] }).catch(() => { });
        } catch (error) {
          console.error('Error fetching keys for button:', error);
          return interaction.reply({ content: '❌ Ha ocurrido un error al buscar tus keys.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }
      }

      // Panel TikTok: abrir modal para vincular cuenta
      if (interaction.customId === 'panel:tiktok:open') {
        const ALLOWED_CHANNEL = '1477048755525255302';
        if (interaction.channelId !== ALLOWED_CHANNEL) {
          try {
            await interaction.reply({ content: `⚠️ Este panel solo funciona en <#${ALLOWED_CHANNEL}>.`, flags: [MessageFlags.Ephemeral] });
          } catch (_) { }
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal:tiktok:link:${interaction.user.id}`)
          .setTitle('Vincular TikTok');

        const input = new TextInputBuilder()
          .setCustomId('tiktok_username')
          .setLabel('Usuario de TikTok (sin @)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('ej: usuario');

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal).catch(() => { });
        return;
      }
      if (parts[0] === 'ruleta' && parts[1] === 'spin') {
        const ROULETTE_CHANNEL_ID = '1489717421576294401';
        if (interaction.channelId !== ROULETTE_CHANNEL_ID) {
          await interaction.reply({ content: `⚠️ El comando \`!girar\` solo funciona en <#${ROULETTE_CHANNEL_ID}>.`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
          return;
        }
        const player = await Player.findOneAndUpdate(
          { _id: interaction.user.id, spins: { $gt: 0 } },
          { $inc: { spins: -1 } },
          { new: true }
        );
        if (!player) {
          await interaction.reply({ content: '❌ No tienes giros para la ruleta. Puedes conseguir más en <#1489717372628504700>, en <#1489717449791242392> o comprando algún VIP en <#1490444924674507043>.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
          return;
        }
        await interaction.deferUpdate().catch(() => { });

        console.log(`[Roulette Interaction] Triggered by ${interaction.user.tag}`);

        const total = ROULETTE_PROBABILITIES.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let prizeIndex = -1;
        for (let i = 0; i < ROULETTE_PROBABILITIES.length; i++) {
          r -= ROULETTE_PROBABILITIES[i];
          if (r < 0) { prizeIndex = i; break; }
        }
        const prize = ROULETTE_PRIZES[prizeIndex];

        // Entregar el premio
        let notificationText = '';
        try {
          if (typeof deliverPrize === 'function') {
            notificationText = await deliverPrize(interaction.member, prize);
          }
          const logEmbed = new EmbedBuilder()
            .setTitle('🎰 Ruleta Girada')
            .setDescription(`**Jugador:** <@${interaction.user.id}>\n**Premio:** ${prize.name}`)
            .setColor('#800080')
            .setTimestamp();
          sendLog(interaction.guild, logEmbed, [], 'roulette');
        } catch (e) {
          console.error('Error en entrega de premio ruleta:', e);
          notificationText = '⚠️ Hubo un error al entregar tu premio. Contacta al staff.';
        }

        // Colores por tipo de premio
        const prizeColors = {
          points: '#FFD700',
          spins: '#00BFFF',
          role: '#9B59B6',
          manual_dm: '#FF69B4',
          manual: '#FF69B4'
        };
        
        const embedColor = prizeColors[prize.type] || '#FFD700';
        
        const finalEmbed = new EmbedBuilder()
          .setTitle(`${PRIZE_EMOJIS[prize.id] || '🎁'} ¡PREMIO OBTENIDO! ${PRIZE_EMOJIS[prize.id] || '🎁'}`)
          .setColor(embedColor)
          .setDescription(`**¡Felicidades, <@${interaction.user.id}>!**\n\n🎁 **Ganaste:** ${prize.name}\n${notificationText || ''}`)
          .addFields(
            { name: '📊 Tipo', value: prize.type.toUpperCase(), inline: true },
            { name: '🎲 Giros restantes', value: `${player.spins}`, inline: true }
          )
          .setFooter({ text: '🎰 Ruleta de Premios' });

        const btn = new ButtonBuilder()
          .setCustomId('ruleta:spin')
          .setLabel('GIRAR')
          .setStyle(ButtonStyle.Success)
          .setEmoji(EMOJIS.spin || '🎰');
        
        const row = new ActionRowBuilder().addComponents(btn);
        const finalOptions = { embeds: [finalEmbed], components: [row] };

        await interaction.editReply(finalOptions).catch(() => { });
        return;
      }
      if (interaction.customId === 'vote_clip') {
        if (!Clip) return interaction.reply({ content: '❌ Sistema de clips no disponible.', flags: [MessageFlags.Ephemeral] });

        const messageId = interaction.message.id;
        const userId = interaction.user.id;

        let clip = await Clip.findById(messageId);
        if (!clip) {
          // Si no existe en DB, lo creamos (retroactividad para clips viejos si es necesario, o manejo de errores)
          // Asumimos que si está el botón, debería existir. Si no, lo creamos al vuelo.
          clip = await Clip.create({
            _id: messageId,
            userId: "unknown", // No podemos saber quién lo subió si no está en DB
            contentUrl: interaction.message.content || "",
            votes: 0,
            voters: []
          });
        }

        const alreadyVoted = clip.voters.includes(userId);

        if (alreadyVoted) {
          clip.voters = clip.voters.filter(id => id !== userId);
          clip.votes = Math.max(0, clip.votes - 1);
          await clip.save();
          await interaction.reply({ content: '💔 Quitaste tu voto.', flags: [MessageFlags.Ephemeral] });
        } else {
          clip.voters.push(userId);
          clip.votes += 1;
          await clip.save();
          await interaction.reply({ content: '❤️ Voto registrado.', flags: [MessageFlags.Ephemeral] });
        }

        // Actualizar botón
        try {
          const oldRow = interaction.message.components[0];
          if (oldRow) {
            const row = ActionRowBuilder.from(oldRow);
            const buttonIndex = row.components.findIndex(c => c.data.custom_id === 'vote_clip' || c.customId === 'vote_clip');

            if (buttonIndex !== -1) {
              row.components[buttonIndex].setLabel(`❤️ Votar (${clip.votes})`);
              await interaction.message.edit({ components: [row] });
            }
          }
        } catch (err) {
          console.error("Error updating vote button:", err);
        }
        return;
      }

      if (interaction.customId === 'acepto_terminos') {
        const logEmbed = new EmbedBuilder()
          .setTitle('📜 Términos Aceptados')
          .setDescription(`**Usuario:** <@${interaction.user.id}>\n**ID:** ${interaction.user.id}\n**Aceptado en el canal o hilo:** <#${interaction.channelId}>\n**Fecha:** <t:${Math.floor(Date.now() / 1000)}:F>`)
          .setColor(COLORS.SUCCESS)
          .setTimestamp();

        sendLog(interaction.guild, logEmbed, [], 'terminos').catch(console.error);

        return interaction.reply({ content: `✅ <@${interaction.user.id}> ha aceptado los términos.` }).catch(() => { });
      }

      if (interaction.customId.startsWith('perfil_')) {
        const action = interaction.customId.split('_')[1];
        const userId = interaction.customId.split('_').pop();
        const user = await client.users.fetch(userId, { force: false, cache: true }).catch(() => null);
        if (!user) {
          return interaction.reply({ content: 'Usuario no encontrado.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }
        if (action === 'season') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const seasonEmbed = await buildSeasonStatsCard(user).catch(() => null);
          if (!seasonEmbed) {
            return interaction.editReply({ content: '⚠️ No hay una temporada activa en este momento o el jugador no tiene estadísticas de temporada.' }).catch(() => { });
          }
          return interaction.editReply({ embeds: [seasonEmbed] }).catch(() => { });
        }
        if (action === 'history') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          interaction.isInteraction = true;
          interaction.author = interaction.user;
          interaction.isDeferred = true;
          await handleMatchHistoryCommand(interaction, user, { MatchHistory, EmbedBuilder, COLORS, ActionRowBuilder, ButtonBuilder, ButtonStyle }).catch(() => { });
          return;
        }
        if (action === 'refresh') {
          return;
        }
        if (action === 'reset') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          if (interaction.user.id !== user.id) {
            return interaction.editReply({ content: '🚫 Solo puedes resetear tu propio perfil.', components: [] }).catch(() => { });
          }
          await Player.updateOne(
            { _id: user.id },
            {
              $unset: {
                profileBannerUrl: '',
                profileBackgroundUrl: '',
                profileBackgroundColor: '',
                profileColor: '',
                profileTheme: '',
              },
            }
          );
          try {
            const embed = new EmbedBuilder()
              .setTitle('♻️ Perfil reseteado')
              .setDescription(`Usuario: <@${user.id}>\nAcción realizada por: <@${interaction.user.id}>`)
              .setColor(COLORS.WARNING)
              .setTimestamp();
            await sendLog(interaction.guild, embed, [], 'profile');
          } catch (_) { }
          try { invalidatePlayerCache(user.id); } catch (_) { }
          return interaction.editReply({ content: '♻️ Perfil reseteado a valores predeterminados. Abre `!p` para ver tu tarjeta.', components: [] }).catch(() => { });
        }
        if (action === 'custom') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const allowedCustomize = new Set([
            '1407834282042593430', '1409311314148327595', '1421579084986847232',
            '1403436952497291417', '1403437053051408495', '1433313596347121776',
            '1403437125839618199', '1407163337095250021', '1407877474318159892',
            '1415130150856687759', '1415131101432647700', '1415131212523110493',
            // Nuevos rangos VIP
            '1490429947133820981', '1490436182977417327', '1490430290680746146',
            '1490430760497188955', '1490432920387584190', '1490431489115160607',
            '1490436936773664899', '1489762472675115189'
          ]);
          const ok = interaction.member.roles.cache.some(r => allowedCustomize.has(r.id));
          if (!ok) {
            return interaction.editReply({ content: '🚫 No tienes permisos para personalizar tu tarjeta.', components: [] }).catch(() => { });
          }
          const colorOptions = [
            { label: 'Morado', value: '#5865F2' },
            { label: 'Rojo', value: '#e74c3c' },
            { label: 'Azul', value: '#3498db' },
            { label: 'Verde', value: '#2ecc71' },
            { label: 'Amarillo', value: '#f1c40f' },
            { label: 'Rosa', value: '#ff6bcb' },
            { label: 'Gris', value: '#95a5a6' },
            { label: 'Negro', value: '#000000' },
          ];
          const row1 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`profile_color:${user.id}`)
              .setPlaceholder('Color de acento')
              .addOptions(colorOptions.map(o => ({ label: o.label, value: o.value })))
          );
          const bgColorOptions = [
            { label: 'Predeterminado', value: 'default' },
            { label: 'Oscuro', value: '#0f1011' },
            { label: 'Gris', value: '#181a1d' },
            { label: 'Morado', value: '#2f2a48' },
            { label: 'Azul', value: '#0e2a47' },
            { label: 'Rojo', value: '#e74c3c' },
            { label: 'Neón', value: '#00131a' },
            { label: 'Verde', value: '#0f3d2e' },
          ];
          const row3 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`profile_bgcolor:${user.id}`)
              .setPlaceholder('Color de fondo')
              .addOptions(bgColorOptions.map(o => ({ label: o.label, value: o.value })))
          );
          // Combinar botones en una sola fila para respetar el límite de 5 filas
          const rowButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`profile_banner_set:${user.id}`)
              .setLabel('Establecer Banner')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`profile_background_set:${user.id}`)
              .setLabel('Establecer Fondo')
              .setStyle(ButtonStyle.Secondary)
          );
          const elementOptions = [
            { label: 'Texto principal', value: 'textColor' },
            { label: 'Texto secundario', value: 'subtextColor' },
            { label: 'Etiquetas de stats', value: 'statLabelColor' },
            { label: 'Valores de stats', value: 'statValueColor' },
            { label: 'Fondo del contenedor', value: 'containerColor' },
            { label: 'Borde del contenedor', value: 'containerStrokeColor' },
            { label: 'Borde de foto de perfil', value: 'avatarBorderColor' },
            { label: 'Líneas/Separadores', value: 'gridLineColor' },
            { label: 'Color de Rango', value: 'rankTextColor' },
            { label: 'Forma del Avatar (Redondo/Cuadrado)', value: 'avatarRadius' },
            { label: 'Radio del Borde de Tarjeta', value: 'cardRadius' },
            { label: 'Tipografía (Fuente)', value: 'fontFamily' },
            { label: 'Intensidad de Sombra', value: 'shadowIntensity' },
            { label: 'Opacidad de la Tarjeta', value: 'cardOpacity' },
          ];
          const presetOptions = [
            { label: 'Tema: Minimal Oscuro', value: 'minimal_dark' },
            { label: 'Tema: Neón', value: 'neon' },
            { label: 'Tema: Neón Rosita', value: 'neon_pink' },
            { label: 'Tema: Neón Rosita Clarito', value: 'neon_pink_light' },
            { label: 'Tema: Ocean', value: 'ocean' },
            { label: 'Tema: Forest', value: 'forest' },
            { label: 'Tema: Sunset', value: 'sunset' },
            { label: 'Tema: Discord Style', value: 'discord_style' },
            { label: 'Resetear Tema', value: 'reset_theme' },
          ];
          const row5 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`profile_theme_element:${user.id}`)
              .setPlaceholder('Elige elemento a colorear')
              .addOptions(elementOptions)
          );
          const row6 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`profile_theme_preset:${user.id}`)
              .setPlaceholder('Aplicar un tema')
              .addOptions(presetOptions)
          );
          // Máximo 5 filas: color, botones, fondo, elemento, preset
          return interaction.editReply({ content: '🎨 Personaliza tu tarjeta', components: [row1, rowButtons, row3, row5, row6] }).catch(() => { });
        }
        if (action === 'wallet') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const player = await ensurePlayerRecord(user.id);
          const now = Date.now();
          const x2CreditHrs = Math.floor((player.x2_credit_ms || 0) / 3600000);
          const shieldCreditHrs = Math.floor((player.proteccion_credit_ms || 0) / 3600000);

          // Calculate VIP Expiry for display
          const vipMs = getRemainingVipMs(player, interaction.member);
          const vipDays = Math.ceil(vipMs / (1000 * 60 * 60 * 24));
          const vipExpiryText = vipMs > 0 ? ` (Vence en ${vipDays} días)` : '';

          // 1. Build Wallet Summary Embed
          const walletEmbed = new EmbedBuilder()
            .setTitle(`💼 Cartera de ${user.username}`)
            .setColor('#FFD700')
            .setThumbnail(user.displayAvatarURL());

          // --- Currencies ---
          let currencyText = `**Style Coins:** ${player.styleCoins || 0}\n` +
            `**Y-Coins:** ${player.yCoins || 0}\n` +
            `**Giros Ruleta:** ${player.spins || 0}\n` +
            `**Puntos:** ${(player.currentSeason?.points || 0).toLocaleString()}`;
          walletEmbed.addFields({ name: '💰 Divisas', value: currencyText, inline: true });

          // --- Credits (Boosters) ---
          let creditsText = `**Puntos X2:** ${x2CreditHrs} horas\n` +
            `**Protección:** ${shieldCreditHrs} horas`;
          walletEmbed.addFields({ name: '🛡️ Créditos', value: creditsText, inline: true });

          // --- Donation Rights ---
          const dr = player.donationRights || {};
          const rightsList = [];
          if (dr.spider > 0) rightsList.push(`• **Spider:** ${dr.spider}`);
          if (dr.bigBoss > 0) rightsList.push(`• **Big Boss:** ${dr.bigBoss}`);
          if (dr.paseLibre > 0) rightsList.push(`• **Pase Libre:** ${dr.paseLibre}`);
          if (dr.deusDaRanqueada > 0) rightsList.push(`• **Deus Da Ranqueada:** ${dr.deusDaRanqueada}`);
          if (dr.godRanked > 0) rightsList.push(`• **God Ranked:** ${dr.godRanked}`);
          if (dr.relikia > 0) rightsList.push(`• **Relikia:** ${dr.relikia}`);
          if (dr.blood > 0) rightsList.push(`• **Blood:** ${dr.blood}`);
          if (dr.wave > 0) rightsList.push(`• **Wave:** ${dr.wave}`);
          if (dr.scream > 0) rightsList.push(`• **Scream:** ${dr.scream}`);
          if (dr.king > 0) rightsList.push(`• **Rey:** ${dr.king}`);
          if (dr.bornToWin > 0) rightsList.push(`• **Born To Win:** ${dr.bornToWin}`);
          if (dr.lendaTropa > 0) rightsList.push(`• **Lenda da Tropa:** ${dr.lendaTropa}`);
          if (dr.crazyToWin > 0) rightsList.push(`• **Crazy To Win:** ${dr.crazyToWin}`);
          if (dr.tempVoice > 0) rightsList.push(`• **Call Privada Temporales:** ${dr.tempVoice}`);
          if (dr.permanentVoice > 0) rightsList.push(`• **Call Privada Puntos (Permanente):** ${dr.permanentVoice}`);
          if (dr.customRole > 0) rightsList.push(`• **Rol Personalizado:** ${dr.customRole}`);
          if (dr.blockName > 0) rightsList.push(`• **Bloqueo Nombre:** ${dr.blockName}`);
          if (dr.blockMove > 0) rightsList.push(`• **Bloqueo Canal:** ${dr.blockMove}`);

          if (rightsList.length > 0) {
            walletEmbed.addFields({ name: `🎁 Derechos de Donación${vipExpiryText}`, value: rightsList.join('\n'), inline: false });
          } else {
            walletEmbed.addFields({ name: `🎁 Derechos de Donación${vipExpiryText}`, value: 'No tienes derechos disponibles.', inline: false });
          }

          // --- Active Temporary Roles ---
          const tempRoles = player.temporaryRoles || [];
          const activeRoles = tempRoles.filter(r => {
            if (!r || !r.roleId || !r.expiresAt) return false;
            const expiresAtMs = (r.expiresAt instanceof Date) ? r.expiresAt.getTime() : Number(r.expiresAt || 0);
            return expiresAtMs > now;
          });

          if (activeRoles.length > 0) {
            const roleLines = activeRoles.map(r => {
              const expiresAtMs = (r.expiresAt instanceof Date) ? r.expiresAt.getTime() : Number(r.expiresAt || 0);
              const daysLeft = Math.ceil((expiresAtMs - now) / (1000 * 60 * 60 * 24));
              return `• <@&${r.roleId}>: **${daysLeft} días** restantes`;
            });
            walletEmbed.addFields({ name: '⏳ Roles Temporales Activos', value: roleLines.join('\n'), inline: false });
          } else {
            walletEmbed.addFields({ name: '⏳ Roles Temporales', value: 'No tienes roles temporales activos.', inline: false });
          }


          // 2. Build Management Menu (Existing Logic)
          const options = [];
          if ((player.donationRights?.tempVoice || 0) > 0) {
            options.push({
              label: `Crear Call Privada (${player.donationRights.tempVoice} disponibles)`,
              value: `wallet:manage:tempvoice:${user.id}`,
              description: 'Crea una sala de voz temporal donable.'
            });
          }
          if ((player.x2_credit_ms || 0) > 0) {
            options.push({
              label: `Gestionar Puntos X2 (${x2CreditHrs}h disponibles)`,
              value: `wallet:manage:x2:${user.id}`,
              description: 'Elige cuánto tiempo de X2 quieres activar.'
            });
          }
          if ((player.proteccion_credit_ms || 0) > 0) {
            options.push({
              label: `Gestionar Protección (${shieldCreditHrs}h disponibles)`,
              value: `wallet:manage:shield:${user.id}`,
              description: 'Elige cuánto tiempo de Protección quieres activar.'
            });
          }

          // New Donation Options
          if ((player.donationRights?.customRole || 0) > 0) {
            options.push({
              label: `Donar Rol Personalizado (${player.donationRights.customRole} disponibles)`,
              value: `wallet:manage:customrole:${user.id}`,
              description: 'Crea y dona un rol personalizado con icono.'
            });
          }

          for (const [key, roleId] of Object.entries(DONATION_ROLES)) {
            if ((player.donationRights?.[key] || 0) > 0) {
              const labelName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              options.push({
                label: `Donar ${labelName} (${player.donationRights[key]} disponibles)`,
                value: `wallet:manage:${key}:${user.id}`,
                description: `Dona el beneficio ${labelName} a otro usuario.`
              });
            }
          }


          const components = [];
          if (options.length > 0) {
            const row = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`wallet_menu:${user.id}`)
                .setPlaceholder('Selecciona un beneficio para activar')
                .addOptions(options)
            );
            components.push(row);
          }

          return interaction.editReply({ embeds: [walletEmbed], components: components }).catch(() => { });
        }

        if (action === 'store') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });

          try {
            const VipKey = require('../models/VipKey');
            const keys = await VipKey.find({ status: 'active', $or: [{ restrictedTo: user.id }, { createdBy: user.id }] }).sort({ createdAt: -1 });

            const storeEmbed = new EmbedBuilder()
              .setTitle(`🛒 Cartera Tienda de ${user.username}`)
              .setColor('#3498DB')
              .setThumbnail(user.displayAvatarURL());

            if (keys.length === 0) {
              storeEmbed.setDescription('❌ No tienes items de tienda activos en este momento.');
            } else {
              const displayKeys = keys.slice(0, 25);
              const overflow = keys.length - displayKeys.length;

              const description = displayKeys.map(k => {
                let roleInfo = '';
                if (k.restrictedTo === user.id) roleInfo = '🔒 **Asignada a esta cuenta**';
                else if (k.createdBy === user.id) {
                  if (k.restrictedTo) roleInfo = `➡️ Asignada a <@${k.restrictedTo}>`;
                  else roleInfo = '🔓 Libre (Creada por esta cuenta)';
                }
                const isVip = k.key.startsWith('royalrankedvip');
                const manualItems = ['nitro_3m', 'nitro_1m', 'diamantes_512', 'diamantes_300', 'diamantes_100', 'rol_personalizado', 'call_privada', 'puntos_x2', 'proteccion_puntos'];
                const isManual = manualItems.includes(k.type.toLowerCase());
                
                if (isManual) {
                  return `**${k.type.toUpperCase()}** (MANUAL)\nKey: \`${k.key}\`\n${roleInfo}\n*Estado: ⏳ Pendiente (Abre ticket para recibir)*`;
                }

                const commandToUse = isVip ? '!reclamarvip' : '!reclamartienda';
                return `**${k.type.toUpperCase()}**\nKey: \`${k.key}\`\n${roleInfo}\n*Canjea con: \`${commandToUse} ${k.key}\`*`;
              }).join('\n\n');

              storeEmbed.setDescription(description + (overflow > 0 ? `\n\n*...y ${overflow} más.*` : ''))
                .setFooter({ text: 'Usa !p para volver al menú principal. Para manuales, contacta al Staff.' });
            }

            return interaction.editReply({ embeds: [storeEmbed] }).catch(() => { });
          } catch (error) {
            console.error('Error fetching keys for store wallet:', error);
            return interaction.editReply({ content: '❌ Ha ocurrido un error al buscar tus compras.' }).catch(() => { });
          }
        }

      }

      // Botones de personalización fuera del prefijo 'perfil_'
      if (interaction.isButton() && interaction.customId.startsWith('profile_banner_set:')) {
        const usrId = interaction.customId.split(':')[1];
        const modal = new ModalBuilder()
          .setCustomId(`modal:profile:banner:${usrId}`)
          .setTitle('Establecer Banner');
        const input = new TextInputBuilder()
          .setCustomId('banner_url')
          .setLabel('URL de la imagen (PNG/JPG)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('https://ejemplo.com/banner.png');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal).catch(() => { });
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith('profile_background_set:')) {
        const usrId = interaction.customId.split(':')[1];
        const modal = new ModalBuilder()
          .setCustomId(`modal:profile:background:${usrId}`)
          .setTitle('Establecer Fondo');
        const input = new TextInputBuilder()
          .setCustomId('background_url')
          .setLabel('URL de la imagen')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('https://...');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal).catch(() => { });
        return;
      }

      if (parts[0] === 'fila') {
        // Defer inmediatamente para evitar "Interacción fallida"
        // EXCEPTO si es el menú, ya que algunas opciones del menú (modal) requieren no haber respondido.
        if (parts[2] !== 'menu') {
          await interaction.deferUpdate().catch(() => { });
        }

        const channelId = parts[1];
        let queue = queues.get(channelId);
        if (!queue) {
          const queueDoc = await ActiveQueue.findById(channelId).lean();
          if (queueDoc) {
            console.log(`[Fila Recovery] La fila del canal ${channelId} no estaba en memoria. Recuperando desde la DB...`);
            queue = new Queue(
              queueDoc.mode,
              queueDoc.creatorId,
              { username: queueDoc.creatorUsername, displayAvatarURL: () => queueDoc.creatorAvatarURL },
              { guild: { id: queueDoc.guildId }, channel: { parentId: queueDoc.filaCategoryId } },
              queueDoc.customName
            );
            Object.assign(queue, { ...queueDoc, channelId: channelId, prevVoice: new Map(Object.entries(queueDoc.prevVoice || {})), kicked: new Set(queueDoc.kicked || []) });
            if (!queue.wager) queue.wager = { amount: 0, proposerId: null, accepted: new Set() };
            const docWager = queueDoc.wager || {};
            queue.wager.amount = docWager.amount || 0;
            queue.wager.accepted = new Set(Array.isArray(docWager.accepted) ? docWager.accepted : []);
            queues.set(channelId, queue);
          }
        }
        if (!queue) {
          await interaction.editReply({ content: 'La fila ya no existe.', components: [] }).catch(() => { });
          return;
        }
        const action = parts[2];
        resetQueueTimeout(channelId);
        const queueDeps = getQueueDeps();
        if (action === 'join') {
          return await handleQueueJoinButton(interaction, queueDeps);
        }
        if (action === 'wager' && parts[3] === 'accept') {
          return await handleQueueWagerAccept(interaction, queueDeps);
        }
        if (action === 'wager' && parts[3] === 'cancel') {
          return await handleQueueWagerCancel(interaction, queueDeps);
        }
        if (action === 'leave') {
          return await handleQueueLeaveButton(interaction, queueDeps);
        }
      }

      if (parts[0] === 'match' && parts[3] === 'close') {
        await interaction.deferUpdate().catch(() => { });

        const matchNumber = parseInt(parts[2], 10);
        const matchKey = `${interaction.guild.id}:${matchNumber}`;
        let matchObj = matches.get(matchKey);
        if (!matchObj) {
          matchObj = [...matches.values()].find(m => m.textChannelId === interaction.channelId && m.matchNumber === matchNumber);
        }
        if (!matchObj) {
          await safeReplyEphemeral(interaction, '❌ Partida no encontrada o ya cerrada.');
          return;
        }
        if (matchObj.closed) {
          await safeReplyEphemeral(interaction, '⚙️ ¡Ya estamos en ello! La partida está siendo cerrada.');
          return;
        }

        const hasCloseRole = Array.isArray(CLOSE_APPLY_ROLE_IDS) && interaction.member.roles.cache.some(r => CLOSE_APPLY_ROLE_IDS.includes(r.id));
        if (interaction.user.id !== matchObj.creatorId && !hasCloseRole) {
          matchObj.closed = false;
          await safeReplyEphemeral(interaction, '❌ Solo el creador o roles autorizados pueden cerrar y aplicar puntos.');
          return;
        }
        if (!matchObj.selectedWinner || !matchObj.selectedCreator || !matchObj.selectedMVP) {
          await safeReplyEphemeral(interaction, '⚠️ No puedes cerrar la partida hasta que se elijan **Creador de sala**, **MVP** y **Ganador**.');
          return;
        }
        if (!matchObj.idAndPasswordSet) {
          await safeReplyEphemeral(interaction, '⚠️ No puedes cerrar la partida hasta que se ingrese el **ID** y la **contraseña** de la sala (dos mensajes numéricos en este hilo).');
          return;
        }
        const createdAt = new Date(matchObj.createdAt);
        const minMs = 10 * 60 * 1000;
        const isBotOwner = Array.isArray(BOT_OWNER_ID)
          ? BOT_OWNER_ID.includes(interaction.user.id)
          : interaction.user.id === BOT_OWNER_ID;
        if ((Date.now() - createdAt.getTime() < minMs) && !isBotOwner) {
          await safeReplyEphemeral(interaction, '⚠️ No puedes cerrar la partida hasta que hayan transcurrido al menos 10 minutos.');
          return;
        }
        Promise.resolve().then(() => ActiveMatch.updateOne({ _id: matchObj._id, closed: false }, { $set: { closed: true } })).catch(() => { });
        matchObj.closed = true;

        await safeReplyEphemeral(interaction, '✅ Cierre iniciado. Aplicando resultados y limpiando canales...');

        setImmediate(() => {
          handleMatchClosure(interaction.guild, matchObj, false, null, ctx.getMatchDeps()).catch(e => console.error(`[Cierre Asíncrono] Error en partida #${matchObj.matchNumber}:`, e));
        });
      }



      // --- MANEJO DE APUESTAS DE ESPECTADORES ---
      if (interaction.customId.startsWith('match_bet_')) {
        const parts = interaction.customId.split(':');
        const team = parts[0] === 'match_bet_t1' ? 'team1' : 'team2';
        const matchId = parts.slice(1).join(':');

        // Mostrar el modal lo más rápido posible.
        const modal = new ModalBuilder()
          .setCustomId(`modal:bet:${matchId}:${team}`)
          .setTitle(`Apostar al Equipo ${team === 'team1' ? '1' : '2'}`);

        const amountInput = new TextInputBuilder()
          .setCustomId('bet_amount')
          .setLabel('Cantidad de puntos (Max 500)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 100')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(amountInput);
        modal.addComponents(row);

        try {
          await interaction.showModal(modal);
        } catch (e) {
          console.error('Error mostrando modal de apuesta de espectador:', e);
        }
        return;
      }

      // Botones de invitación
      if (interaction.customId === 'inv_generate') {
        try {
          const userId = interaction.user.id;
          const invitationService = ctx.invitationService;

          if (!invitationService) {
            return interaction.reply({
              content: '❌ Sistema de invitaciones no disponible',
              flags: [MessageFlags.Ephemeral]
            });
          }

          // Generar código
          const code = await invitationService.generateInvitationCode(userId);

          if (!code) {
            return interaction.reply({
              content: '❌ Error generando código',
              flags: [MessageFlags.Ephemeral]
            });
          }

          // Link personalizado (cambiar tu-servidor por tu servidor)
          const inviteLink = `https://discord.gg/UCf7YqMqbm`;
          const referralLink = `${inviteLink}?ref=${code}`;

          const embed = new EmbedBuilder()
            .setTitle('✅ Tu Link de Invitación Generado')
            .setDescription('Este link es único para ti. Comparte con tus amigos.')
            .addFields(
              {
                name: '🔗 Tu Link',
                value: `\`${referralLink}\``
              },
              {
                name: '📝 Código',
                value: `\`${code}\``
              },
              {
                name: '💰 Recompensa',
                value: '5 usuarios = **5000 puntos**'
              },
              {
                name: '⏱️ Válido por',
                value: '30 días'
              }
            )
            .setColor(COLORS.SUCCESS)
            .setFooter({ text: 'Solo tú puedes ver este mensaje' });

          // Enviar de forma efímera (solo el usuario lo ve)
          await interaction.reply({
            embeds: [embed],
            flags: [MessageFlags.Ephemeral]
          });

        } catch (error) {
          console.error('[InvitationButton] Error:', error);
          interaction.reply({
            content: '❌ Error generando link',
            flags: [MessageFlags.Ephemeral]
          });
        }
        return;
      }

      // Ver progreso de invitación
      if (interaction.customId === 'inv_stats') {
        try {
          const userId = interaction.user.id;
          const invitationService = ctx.invitationService;

          if (!invitationService) {
            return interaction.reply({
              content: '❌ Sistema de invitaciones no disponible',
              flags: [MessageFlags.Ephemeral]
            });
          }

          const stats = await invitationService.getInvitationStats(userId);

          if (!stats) {
            return interaction.reply({
              content: '❌ No tienes código activo. Presiona "Generar Link" primero.',
              flags: [MessageFlags.Ephemeral]
            });
          }

          // Crear barra de progreso
          const progressBar = '█'.repeat(stats.usedCount) + '░'.repeat(stats.remaining);

          const embed = new EmbedBuilder()
            .setTitle('📊 Tu Progreso de Invitación')
            .setDescription(`Código: \`${stats.code}\``)
            .addFields(
              {
                name: '👥 Usuarios que entraron',
                value: `${stats.usedCount}/5`,
                inline: true
              },
              {
                name: '⏳ Faltan',
                value: `${stats.remaining} usuarios`,
                inline: true
              },
              {
                name: '📈 Progreso',
                value: `${progressBar}`
              },
              {
                name: '💰 Estado',
                value: stats.rewardClaimed
                  ? '✅ **¡Reward Reclamado!** (5000 puntos)'
                  : stats.remaining === 0
                    ? '🔔 **¡Listo para reclamar!** (5000 puntos)'
                    : '⏳ Esperando...'
              },
              {
                name: '⏰ Vence',
                value: `<t:${Math.floor(stats.expiresAt.getTime() / 1000)}:R>`
              }
            )
            .setColor(stats.rewardClaimed ? COLORS.SUCCESS : COLORS.PRIMARY)
            .setFooter({ text: 'Solo tú puedes ver este mensaje' });

          await interaction.reply({
            embeds: [embed],
            flags: [MessageFlags.Ephemeral]
          });

        } catch (error) {
          console.error('[InvitationStats] Error:', error);
          interaction.reply({
            content: '❌ Error obteniendo estadísticas',
            flags: [MessageFlags.Ephemeral]
          });
        }
        return;
      }

      // Botones de reset global (resetAdmin.js)
      if (interaction.customId.startsWith('reset_all_')) {
        const { Player, MatchHistory, COLORS, sendLog, tryUpdateNicknameForMember, config } = ctx;
        const EMOJIS = config?.emojis || {};
        const parts = interaction.customId.split('_');
        const action = parts[2];
        const userId = parts[3];

        if (interaction.user.id !== userId) {
          return interaction.reply({ content: '🚫 Solo el usuario que inició la acción puede interactuar.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }

        if (action === 'confirm') {
          await interaction.deferUpdate().catch(() => { });
          await Player.updateMany({}, {
            $set: {
              points: 0,
              wins: 0,
              losses: 0,
              mvps: 0,
              streak: 0,
              maxStreak: 0,
              creations: 0,
              'currentSeason.points': 0,
              'currentSeason.wins': 0,
              'currentSeason.losses': 0,
              'currentSeason.mvps': 0,
              'currentSeason.streak': 0,
              'currentSeason.maxStreak': 0,
              'currentSeason.creations': 0,
            },
          });
          await MatchHistory.deleteMany({});

          // Optimización: Usar caché primero y hacer fetch solo de los IDs necesarios
          const allPlayerIds = await Player.distinct('_id');
          const cachedMembers = interaction.guild.members.cache;
          const idsToFetch = allPlayerIds.filter(id => !cachedMembers.has(id));

          if (idsToFetch.length > 0) {
            try {
              const fetched = await interaction.guild.members.fetch({ user: idsToFetch }).catch(() => new Map());
              fetched.forEach(member => tryUpdateNicknameForMember(interaction.guild, member.id, '', member));
            } catch (e) {
              console.warn('Error fetching members for nickname update:', e.message);
            }
          }

          // Actualizar miembros en caché
          cachedMembers.forEach(member => {
            if (allPlayerIds.includes(member.id)) {
              tryUpdateNicknameForMember(interaction.guild, member.id, '', member);
            }
          });

          const logEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.alert || '🚨'} Todas las Estadísticas Reseteadas`)
            .setDescription(`**Administrador:** <@${interaction.user.id}>\n**¡Todas las estadísticas de todos los jugadores han sido reseteadas!** Se creó un backup.`)
            .setColor(COLORS.ERROR)
            .setTimestamp();
          sendLog(interaction.guild, logEmbed, [], 'reset');

          await interaction.editReply({ content: `${EMOJIS.success || '✅'} **Todas las estadísticas han sido reseteadas.**`, embeds: [], components: [] }).catch(() => { });
        } else if (action === 'cancel') {
          await interaction.update({ content: `${EMOJIS.success || '✅'} Acción cancelada.`, embeds: [], components: [] }).catch(() => { });
        }
        return;
      }
    }

    // Select menus
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('profile_color:')) {
        await interaction.deferUpdate().catch(() => { });
        const userId = interaction.customId.split(':')[1];
        const hex = interaction.values[0];
        // Al cambiar el color de acento, reflejarlo también en el trazo del contenedor del tema
        await Player.updateOne(
          { _id: userId },
          { $set: { profileColor: hex, 'profileTheme.containerStrokeColor': hex } }
        );
        try { invalidatePlayerCache(userId); } catch (_) { }
        return interaction.followUp({ content: '✅ Color actualizado. Abre `!p` para ver tu tarjeta.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
      if (interaction.customId.startsWith('wallet_menu')) {
        const selected = interaction.values[0];
        const partsSel = selected.split(':');
        // wallet:manage:x2:userId OR wallet:activate:x2:duration:userId
        const actionType = partsSel[1];

        if (actionType === 'manage') {
          const benefitType = partsSel[2]; // x2 or shield or tempvoice
          const userId = partsSel[3];

          if (benefitType === 'tempvoice') {
            const modal = new ModalBuilder()
              .setCustomId(`modal:wallet:tempvoice:${userId}`)
              .setTitle('Crear Call Privada');

            const userInput = new TextInputBuilder()
              .setCustomId('target_user_id')
              .setLabel('ID del Usuario a donar (o mención)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ej: 123456789012345678')
              .setRequired(true);

            const nameInput = new TextInputBuilder()
              .setCustomId('channel_name')
              .setLabel('Nombre de la Call')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ej: Sala VIP de Juan')
              .setMaxLength(30)
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder().addComponents(userInput),
              new ActionRowBuilder().addComponents(nameInput)
            );

            await interaction.showModal(modal).catch(() => { });
            return;
          }

          if (benefitType === 'permanentvoice') {
            const modal = new ModalBuilder()
              .setCustomId(`modal:wallet:permanentvoice:${userId}`)
              .setTitle('Crear Call Privada Puntos (Perm)');

            const userInput = new TextInputBuilder()
              .setCustomId('target_user_id')
              .setLabel('ID del Usuario a donar (o mención)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ej: 123456789012345678')
              .setRequired(true);

            const nameInput = new TextInputBuilder()
              .setCustomId('channel_name')
              .setLabel('Nombre de la Call')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ej: Sala VIP')
              .setMaxLength(30)
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder().addComponents(userInput),
              new ActionRowBuilder().addComponents(nameInput)
            );

            await interaction.showModal(modal).catch(() => { });
            return;
          }

          if (benefitType === 'customrole') {
            const modal = new ModalBuilder()
              .setCustomId(`modal:wallet:customrole:${userId}`)
              .setTitle('Donar Rol Personalizado');

            const userInput = new TextInputBuilder()
              .setCustomId('target_user_id')
              .setLabel('ID del Usuario a donar')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ej: 123456789012345678')
              .setRequired(true);

            const roleNameInput = new TextInputBuilder()
              .setCustomId('role_name')
              .setLabel('Nombre del Rol')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(30)
              .setRequired(true);

            const roleColorInput = new TextInputBuilder()
              .setCustomId('role_color')
              .setLabel('Color del Rol (Hex)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('#FF0000')
              .setRequired(false);

            const iconInput = new TextInputBuilder()
              .setCustomId('role_icon')
              .setLabel('URL del Icono (PNG/JPG)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('https://...')
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder().addComponents(userInput),
              new ActionRowBuilder().addComponents(roleNameInput),
              new ActionRowBuilder().addComponents(roleColorInput),
              new ActionRowBuilder().addComponents(iconInput)
            );

            await interaction.showModal(modal).catch(() => { });
            return;
          }

          if (DONATION_ROLES[benefitType]) {
            const modal = new ModalBuilder()
              .setCustomId(`modal:wallet:benefit:${benefitType}:${userId}`)
              .setTitle(`Donar ${benefitType}`);

            const userInput = new TextInputBuilder()
              .setCustomId('target_user_id')
              .setLabel('ID del Usuario a donar')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ej: 123456789012345678')
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder().addComponents(userInput)
            );

            await interaction.showModal(modal).catch(() => { });
            return;
          }

          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const player = await ensurePlayerRecord(userId);

          let creditMs = 0;
          let labelType = '';
          if (benefitType === 'x2') {
            creditMs = player.x2_credit_ms || 0;
            labelType = 'Puntos X2';
          } else {
            creditMs = player.proteccion_credit_ms || 0;
            labelType = 'Protección';
          }

          if (creditMs <= 0) {
            return interaction.followUp({ content: `⚠️ Ya no tienes crédito de ${labelType} disponible.`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
          }

          const creditHours = Math.floor(creditMs / 3600000);

          // Build duration options
          const durationOptions = [];
          const durations = [
            { label: '1 Hora', ms: 3600000 },
            { label: '3 Horas', ms: 3 * 3600000 },
            { label: '6 Horas', ms: 6 * 3600000 },
            { label: '12 Horas', ms: 12 * 3600000 },
            { label: '24 Horas', ms: 24 * 3600000 },
          ];

          for (const d of durations) {
            if (creditMs >= d.ms) {
              durationOptions.push({
                label: `Activar ${d.label}`,
                value: `wallet:activate:${benefitType}:${d.ms}:${userId}`,
                description: `Consume ${d.label} de tu crédito.`
              });
            }
          }

          // Always add "Activate All" / "Max Available"
          durationOptions.push({
            label: `Activar Todo (${creditHours}h ${Math.floor((creditMs % 3600000) / 60000)}m)`,
            value: `wallet:activate:${benefitType}:all:${userId}`,
            description: 'Activa todo el crédito disponible de una vez.'
          });

          const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`wallet_activate:${userId}`)
              .setPlaceholder(`Elige duración para ${labelType}`)
              .addOptions(durationOptions)
          );

          return interaction.editReply({ content: `⏱️ **${labelType}**: ¿Cuánto tiempo quieres activar?`, components: [row] }).catch(() => { });
        }

        if (actionType === 'activate') {
          // This block might not be reached if customId changes to wallet_activate, handled below
          return;
        }
        return;
      }

      if (interaction.customId.startsWith('wallet_activate')) {
        await interaction.deferUpdate().catch(() => { });
        const selected = interaction.values[0];
        const partsSel = selected.split(':');
        // wallet:activate:x2:3600000:userId
        const benefitType = partsSel[2];
        const durationRaw = partsSel[3];
        const userId = partsSel[4];

        const player = await ensurePlayerRecord(userId);
        const fieldCredit = benefitType === 'x2' ? 'x2_credit_ms' : 'proteccion_credit_ms';
        const fieldUntil = benefitType === 'x2' ? 'x2_until' : 'proteccion_until';
        const labelType = benefitType === 'x2' ? 'Puntos X2' : 'Protección';

        let currentCredit = player[fieldCredit] || 0;
        let durationToActivate = 0;

        if (durationRaw === 'all') {
          durationToActivate = currentCredit;
        } else {
          durationToActivate = parseInt(durationRaw, 10);
        }

        if (currentCredit < durationToActivate || durationToActivate <= 0) {
          return interaction.followUp({ content: `⚠️ No tienes suficiente crédito de ${labelType} para esa duración.`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }

        const now = Date.now();
        const currentUntil = player[fieldUntil] || 0;
        const base = (currentUntil > now) ? currentUntil : now;
        const newUntil = base + durationToActivate;
        const newCredit = currentCredit - durationToActivate;

        const update = { $set: {} };
        update.$set[fieldUntil] = newUntil;
        update.$set[fieldCredit] = newCredit;

        await Player.updateOne({ _id: userId }, update);

        try {
          const embed = new EmbedBuilder()
            .setTitle(`⚡ ${labelType} Activado`)
            .setDescription(`Usuario: <@${userId}>\nDuración: +${Math.floor(durationToActivate / 3600000)}h\nExpira: <t:${Math.floor(newUntil / 1000)}:R>\nCrédito restante: ${Math.floor(newCredit / 3600000)}h`)
            .setColor(COLORS.SUCCESS)
            .setTimestamp();
          await sendLog(interaction.guild, embed, [], 'points');
        } catch (_) { }

        return interaction.followUp({ content: `✅ **${labelType}** activado por ${Math.floor(durationToActivate / 3600000)}h.\nTu beneficio expira <t:${Math.floor(newUntil / 1000)}:R>.`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }

      if (interaction.customId === 'autorole:main') {
        await handleAutoroleSelection(interaction, { Player, ensurePlayerRecord, safeReplyEphemeral, removeTemporaryRole, sendLog, EmbedBuilder, COLORS });
        return;
      }
      if (interaction.customId.startsWith('profile_bgcolor:')) {
        await interaction.deferUpdate().catch(() => { });
        const userId = interaction.customId.split(':')[1];
        const val = interaction.values[0];
        const update =
          val === 'default'
            ? { $set: { profileBackgroundColor: '' } }
            : {
              $set: {
                profileBackgroundColor: val,
              },
              $unset: {
                'profileTheme.backgroundGradientFrom': '',
                'profileTheme.backgroundGradientTo': '',
              },
            };
        await Player.updateOne({ _id: userId }, update);
        try { invalidatePlayerCache(userId); } catch (_) { }
        return interaction.followUp({ content: '✅ Fondo actualizado. Abre `!p` para ver tu tarjeta.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
      if (interaction.customId.startsWith('profile_theme_element:')) {
        await interaction.deferUpdate().catch(() => { });
        const userId = interaction.customId.split(':')[1];
        const key = interaction.values[0];
        const palette = [
          { label: 'Predeterminado', value: 'default' },
          { label: 'Blanco', value: '#FFFFFF' },
          { label: 'Secundario', value: '#B9BBBE' },
          { label: 'Gris', value: '#8e9297' },
          { label: 'Morado', value: '#5865F2' },
          { label: 'Rojo', value: '#e74c3c' },
          { label: 'Azul', value: '#3498db' },
          { label: 'Azul clarito', value: '#ADD8E6' },
          { label: 'Verde', value: '#2ecc71' },
          { label: 'Amarillo', value: '#f1c40f' },
          { label: 'Rosa', value: '#ff6bcb' },
          { label: 'Rosita clarito', value: '#FFB6C1' },
          { label: 'Negro', value: '#000000' },
        ];
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`profile_theme_color:${key}:${userId}`)
            .setPlaceholder('Selecciona opción')
            .addOptions(palette)
        );

        if (key === 'avatarRadius' || key === 'cardRadius') {
          const radiusOptions = [
            { label: 'Redondo (50%)', value: '50%' },
            { label: 'Cuadrado (0px)', value: '0px' },
            { label: 'Redondeado (10px)', value: '10px' },
            { label: 'Muy Redondeado (25px)', value: '25px' },
            { label: 'Casi Redondo (40px)', value: '40px' },
          ];
          row.components[0].setOptions(radiusOptions);
        } else if (key === 'fontFamily') {
          const fontOptions = [
            { label: 'Inter (Predeterminada)', value: '"Inter", sans-serif' },
            { label: 'Roboto', value: '"Roboto", sans-serif' },
            { label: 'Open Sans', value: '"Open Sans", sans-serif' },
            { label: 'Lato', value: '"Lato", sans-serif' },
            { label: 'Montserrat', value: '"Montserrat", sans-serif' },
            { label: 'Oswald', value: '"Oswald", sans-serif' },
            { label: 'Poppins', value: '"Poppins", sans-serif' },
            { label: 'Courier New (Monospace)', value: '"Courier New", monospace' },
          ];
          row.components[0].setOptions(fontOptions);
        } else if (key === 'shadowIntensity') {
          const shadowOptions = [
            { label: 'Sin Sombra', value: '0' },
            { label: 'Suave', value: '0.3' },
            { label: 'Media (Predeterminada)', value: '0.5' },
            { label: 'Fuerte', value: '0.8' },
            { label: 'Muy Fuerte', value: '1' },
          ];
          row.components[0].setOptions(shadowOptions);
        } else if (key === 'cardOpacity') {
          const opacityOptions = [
            { label: '100% (Sólido)', value: '1' },
            { label: '95%', value: '0.95' },
            { label: '90%', value: '0.9' },
            { label: '80%', value: '0.8' },
            { label: '70%', value: '0.7' },
            { label: '50% (Semitransparente)', value: '0.5' },
          ];
          row.components[0].setOptions(opacityOptions);
        }

        return interaction.followUp({ content: `Elige opción para ${key}`, components: [row], flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
      if (interaction.customId.startsWith('profile_theme_preset:')) {
        await interaction.deferUpdate().catch(() => { });
        const userId = interaction.customId.split(':')[1];
        const presetKey = interaction.values[0];
        if (presetKey === 'reset_theme') {
          await Player.updateOne({ _id: userId }, { $unset: { profileTheme: '' } });
          try { invalidatePlayerCache(userId); } catch (_) { }
          return interaction.followUp({ content: '✅ Tema reseteado a valores predeterminados.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }
        const presets = {
          minimal_dark: {
            accent: '#5865F2',
            containerColor: '#181a1d',
            containerStrokeColor: '#2a2c31',
            textColor: '#FFFFFF',
            subtextColor: '#B9BBBE',
            statLabelColor: '#8e9297',
            statValueColor: '#FFFFFF',
            gridLineColor: 'rgba(255,255,255,0.12)',
            perkColor: '#808387',
            backgroundColor: '#0f1011',
            bannerGradientFrom: '#0b0c0d',
            bannerGradientTo: '#2a2c31',
            backgroundGradientFrom: '#0f1011',
            backgroundGradientTo: '#181a1d'
          },
          neon: {
            accent: '#00E5FF',
            containerColor: '#0a0f16',
            containerStrokeColor: '#00E5FF',
            textColor: '#EFFFFF',
            subtextColor: '#A8F8FF',
            statLabelColor: '#00E5FF',
            statValueColor: '#EFFFFF',
            gridLineColor: 'rgba(0,229,255,0.25)',
            perkColor: '#00E5FF',
            backgroundColor: '#00131a',
            bannerGradientFrom: '#00131a',
            bannerGradientTo: '#00E5FF',
            backgroundGradientFrom: '#00131a',
            backgroundGradientTo: '#003545'
          },
          neon_pink: {
            accent: '#ff6bcb',
            containerColor: '#120314',
            containerStrokeColor: '#ff6bcb',
            textColor: '#FFEAF7',
            subtextColor: '#FFB8DF',
            statLabelColor: '#ff6bcb',
            statValueColor: '#FFEAF7',
            gridLineColor: 'rgba(255,107,203,0.25)',
            perkColor: '#ff6bcb',
            backgroundColor: '#140016',
            bannerGradientFrom: '#140016',
            bannerGradientTo: '#ff6bcb',
            backgroundGradientFrom: '#140016',
            backgroundGradientTo: '#3a002b'
          },
          neon_pink_light: {
            accent: '#FF9AD6',
            containerColor: '#2a0a2e',
            containerStrokeColor: '#FF9AD6',
            textColor: '#FFF5FA',
            subtextColor: '#FFCBE6',
            statLabelColor: '#FF9AD6',
            statValueColor: '#FFF5FA',
            gridLineColor: 'rgba(255,154,214,0.35)',
            perkColor: '#FF9AD6',
            backgroundColor: '#240018',
            bannerGradientFrom: '#240018',
            bannerGradientTo: '#FF9AD6',
            backgroundGradientFrom: '#240018',
            backgroundGradientTo: '#5a134a'
          },
          ocean: {
            accent: '#3498db',
            containerColor: '#0e2a47',
            containerStrokeColor: '#3498db',
            textColor: '#E9F7FE',
            subtextColor: '#B9DDF2',
            statLabelColor: '#8EC6E6',
            statValueColor: '#E9F7FE',
            gridLineColor: 'rgba(136,196,230,0.25)',
            perkColor: '#8EC6E6',
            backgroundColor: '#05213b',
            bannerGradientFrom: '#05213b',
            bannerGradientTo: '#3498db',
            backgroundGradientFrom: '#05213b',
            backgroundGradientTo: '#0e2a47'
          },
          forest: {
            accent: '#2ecc71',
            containerColor: '#0f3d2e',
            containerStrokeColor: '#2ecc71',
            textColor: '#E8FFF3',
            subtextColor: '#B9EBD1',
            statLabelColor: '#8fdab9',
            statValueColor: '#E8FFF3',
            gridLineColor: 'rgba(143,218,185,0.25)',
            perkColor: '#8fdab9',
            backgroundColor: '#06271d',
            bannerGradientFrom: '#06271d',
            bannerGradientTo: '#2ecc71',
            backgroundGradientFrom: '#06271d',
            backgroundGradientTo: '#0f3d2e'
          },
          sunset: {
            accent: '#e67e22',
            containerColor: '#2b1a0f',
            containerStrokeColor: '#e67e22',
            textColor: '#FFF2E6',
            subtextColor: '#FFD4B3',
            statLabelColor: '#FFB374',
            statValueColor: '#FFF2E6',
            gridLineColor: 'rgba(255,179,116,0.25)',
            perkColor: '#FFB374',
            backgroundColor: '#1f120a',
            bannerGradientFrom: '#1f120a',
            bannerGradientTo: '#e67e22',
            backgroundGradientFrom: '#1f120a',
            backgroundGradientTo: '#2b1a0f'
          },
          discord_style: {
            accent: '#5865F2',
            containerColor: '#181a1d',
            containerStrokeColor: '#5865F2',
            textColor: '#FFFFFF',
            subtextColor: '#B9BBBE',
            statLabelColor: '#8e9297',
            statValueColor: '#FFFFFF',
            gridLineColor: 'rgba(255,255,255,0.12)',
            perkColor: '#808387',
            backgroundColor: '#0b0c0d',
            bannerGradientFrom: '#0b0c0d',
            bannerGradientTo: '#5865F2',
            backgroundGradientFrom: '#0f1011',
            backgroundGradientTo: '#181a1d'
          }
        };
        const theme = presets[presetKey];
        if (!theme) {
          return interaction.followUp({ content: '⚠️ Tema no válido.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }
        const update = {
          $set: {
            profileTheme: {
              containerColor: theme.containerColor,
              containerStrokeColor: theme.containerStrokeColor,
              textColor: theme.textColor,
              subtextColor: theme.subtextColor,
              statLabelColor: theme.statLabelColor,
              statValueColor: theme.statValueColor,
              gridLineColor: theme.gridLineColor,
              perkColor: theme.perkColor,
              bannerGradientFrom: theme.bannerGradientFrom,
              bannerGradientTo: theme.bannerGradientTo,
              backgroundGradientFrom: theme.backgroundGradientFrom,
              backgroundGradientTo: theme.backgroundGradientTo,
            },
            profileColor: theme.accent,
            profileBackgroundColor: theme.backgroundColor,
          }
        };
        await Player.updateOne({ _id: userId }, update);
        try { invalidatePlayerCache(userId); } catch (_) { }
        return interaction.followUp({ content: '✅ Tema aplicado. Abre `!p` para ver tu tarjeta.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
      if (interaction.customId.startsWith('profile_theme_color:')) {
        await interaction.deferUpdate().catch(() => { });
        const partsC = interaction.customId.split(':');
        const key = partsC[1];
        const userId = partsC[2];
        const color = interaction.values[0];
        const update = color === 'default' ? { $unset: { [`profileTheme.${key}`]: '' } } : { $set: { [`profileTheme.${key}`]: color } };
        await Player.updateOne({ _id: userId }, update);
        try { invalidatePlayerCache(userId); } catch (_) { }
        return interaction.followUp({ content: '✅ Color actualizado. Abre `!p` para ver tu tarjeta.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
      if (interaction.customId.startsWith('profile_bgcolor:')) {
        await interaction.deferUpdate().catch(() => { });
        const userId = interaction.customId.split(':')[1];
        const val = interaction.values[0];
        const update = val === 'default' ? { $set: { profileBackgroundColor: '' } } : { $set: { profileBackgroundColor: val } };
        await Player.updateOne({ _id: userId }, update);
        try { invalidatePlayerCache(userId); } catch (_) { }
        return interaction.followUp({ content: '✅ Fondo actualizado. Abre `!p` para ver tu tarjeta.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }

      if (parts[0] === 'match') {
        const matchNumber = parseInt(parts[2], 10);
        const matchKey = `${interaction.guild.id}:${matchNumber}`;
        let matchObj = matches.get(matchKey);
        if (!matchObj) {
          matchObj = [...matches.values()].find(m => m.textChannelId === interaction.channelId && m.matchNumber === matchNumber);
        }
        if (!matchObj) {
          const fetched = await ActiveMatch.findById(matchKey).lean();
          if (fetched) {
            matches.set(matchKey, fetched);
            matchObj = fetched;
          }
        }
        await interaction.deferUpdate().catch(() => { });
        await handleMatchManagementSelection(interaction, matchObj, ctx.getMatchDeps());
        return;
      }

      if (interaction.customId.startsWith('match_response_')) {
        await handleMatchResponseSelection(interaction, ctx.getMatchDeps());
        return;
      }


      if (parts[0] === 'fila' && parts[2] === 'kick' && parts[3] === 'select') {
        await handleQueueKickSelect(interaction, ctx.getQueueDeps());
        return;
      }
      if (parts[0] === 'fila' && parts[2] === 'menu') {
        if (interaction.replied || interaction.deferred) {
          console.warn(`[DEBUG-IC] Fila Menu Interaction already processed before handler! PID: ${process.pid}`);
        }
        await handleQueueMenuSelection(interaction, ctx.getQueueDeps());
        return;
      }
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const modalParts = interaction.customId.split(':');

      // Manejo de modal para vincular TikTok desde el panel
      if (modalParts[0] === 'modal' && modalParts[1] === 'tiktok' && modalParts[2] === 'link') {
        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (_) { }
        const userId = modalParts[3];
        if (interaction.user.id !== userId) return interaction.editReply({ content: '🚫 No puedes usar este formulario.' });

        const usernameRaw = interaction.fields.getTextInputValue('tiktok_username') || '';
        const username = usernameRaw.replace(/^@/, '').trim();
        if (!username) return interaction.editReply({ content: '⚠️ Usuario inválido.' });

        try {
          // check existing username to inform user if it was replaced
          const existing = await Player.findById(interaction.user.id).lean();
          const oldUsername = existing ? existing.tiktokUsername : null;

          const doc = await Player.findOneAndUpdate(
            { _id: interaction.user.id },
            { $set: { tiktokUsername: username } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          let desc = `La cuenta de Discord de **${doc?.customName || interaction.user.username}** ha sido vinculada con el usuario de TikTok: **${username}**.`;
          if (oldUsername && oldUsername !== username) {
            desc += `\n
⚠️ Se reemplazó la cuenta anterior **${oldUsername}**.`;
          }
          desc += `\n\nCuando entres a una fila y estés en directo, el bot lo anunciará automáticamente (máximo una vez cada 4 horas).`;

          const successEmbed = new EmbedBuilder()
            .setTitle('✅ TikTok Vinculado')
            .setDescription(desc)
            .setColor(COLORS.SUCCESS);
          if (EMBED_DEFAULTS && EMBED_DEFAULTS.footer) {
            successEmbed.setFooter(EMBED_DEFAULTS.footer);
          }

          return interaction.editReply({ embeds: [successEmbed] });
        } catch (e) {
          console.error('[TikTok Modal] Error al guardar usuario:', e);
          return interaction.editReply({ content: '❌ Ocurrió un error al vincular tu cuenta. Intenta nuevamente más tarde.' });
        }
      }

      // --- MANEJO DE SUBMIT DE APUESTA ---
      if (modalParts[0] === 'modal' && modalParts[1] === 'bet') {
        let deferredBet = false;
        try {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
          deferredBet = true;
        } catch (_) { }

        const respondBet = async (data) => {
          try {
            if (interaction.deferred || interaction.replied || deferredBet) {
              return await interaction.editReply(data);
            }
            return await interaction.reply({ ...data, flags: [MessageFlags.Ephemeral] });
          } catch (e) {
            if (e.code === 40060 || e.code === 10062 || e.code === 'InteractionNotReplied') {
              console.warn('[Bet Modal] Ignorando error al responder:', e.message);
              return null;
            }
            throw e;
          }
        };

        const team = modalParts.pop();
        const matchId = modalParts.slice(2).join(':');
        const amountStr = interaction.fields.getTextInputValue('bet_amount');
        const amount = parseInt(amountStr, 10);

        if (isNaN(amount) || amount <= 0) {
          return await respondBet({ content: '❌ Cantidad inválida.' });
        }
        if (amount > 500) {
          return await respondBet({ content: '❌ El límite máximo de apuesta para espectadores es de 500 puntos.' });
        }

        const match = await ActiveMatch.findById(matchId);
        if (!match || match.closed) {
          return await respondBet({ content: '❌ La partida ya terminó o no existe.' });
        }

        const isPlayer = match.team1.includes(interaction.user.id) || match.team2.includes(interaction.user.id);
        if (isPlayer) {
          return await respondBet({ content: '❌ No puedes apostar en tu propia partida.' });
        }

        // Verificar si ya apostó al otro equipo
        const otherTeam = team === 'team1' ? 'team2' : 'team1';
        const hasBetOnOtherTeam = match.bets && match.bets[otherTeam] && match.bets[otherTeam].some(b => b.userId === interaction.user.id);

        if (hasBetOnOtherTeam) {
          return await respondBet({ content: `❌ Ya has apostado al **Equipo ${otherTeam === 'team1' ? '1' : '2'}**. No puedes apostar a ambos equipos.` });
        }

        // Verificar si ya apostó al MISMO equipo
        const hasBetOnSameTeam = match.bets && match.bets[team] && match.bets[team].some(b => b.userId === interaction.user.id);
        if (hasBetOnSameTeam) {
          return await respondBet({ content: `❌ Ya has apostado al **Equipo ${team === 'team1' ? '1' : '2'}**. No se permiten múltiples apuestas en la misma partida.` });
        }

        // Verificar saldo del usuario
        const player = await Player.findById(interaction.user.id);
        if (!player || (player.currentSeason.points || 0) < amount) {
          return await respondBet({ content: `❌ No tienes suficientes puntos. Tienes: ${player?.currentSeason?.points || 0}` });
        }

        // Descontar puntos y registrar apuesta
        await Player.updateOne({ _id: interaction.user.id }, { $inc: { 'currentSeason.points': -amount } });

        const betObj = {
          userId: interaction.user.id,
          amount: amount,
          username: interaction.user.username
        };

        const updateQuery = {};
        updateQuery[`bets.${team}`] = betObj;

        // Actualizar DB y obtener el documento actualizado para refrescar el embed
        const updatedMatch = await ActiveMatch.findByIdAndUpdate(matchId, { $push: updateQuery }, { new: true });

        await respondBet({ content: `✅ Has apostado **${amount}** puntos al **Equipo ${team === 'team1' ? '1' : '2'}**. ¡Buena suerte!` });

        // Actualizar el embed de la fila con las nuevas apuestas
        try {
          if (updatedMatch && updatedMatch.queueChannelId && updatedMatch.messageId) {
            const queueChannel = await interaction.guild.channels.fetch(updatedMatch.queueChannelId).catch(() => null);
            if (queueChannel) {
              const queueMsg = await queueChannel.messages.fetch(updatedMatch.messageId).catch(() => null);
              if (queueMsg) {
                const currentEmbed = queueMsg.embeds[0];
                if (currentEmbed) {
                  const newEmbed = EmbedBuilder.from(currentEmbed);

                  // Helper para formatear lista de apuestas
                  const formatBets = (bets) => {
                    if (!bets || bets.length === 0) return '—';
                    return bets.map(b => `<@${b.userId}>: ${b.amount}`).join('\n');
                  };

                  const betsT1 = formatBets(updatedMatch.bets?.team1);
                  const betsT2 = formatBets(updatedMatch.bets?.team2);

                  // Buscar si ya existen los campos de apuestas y actualizarlos, o agregarlos
                  const fields = newEmbed.data.fields || [];
                  const betFieldT1Index = fields.findIndex(f => f.name.includes('Apuestas Equipo 1'));
                  const betFieldT2Index = fields.findIndex(f => f.name.includes('Apuestas Equipo 2'));

                  if (betFieldT1Index !== -1) {
                    fields[betFieldT1Index].value = betsT1;
                  } else {
                    newEmbed.addFields({ name: '💸 Apuestas Equipo 1', value: betsT1, inline: true });
                  }

                  if (betFieldT2Index !== -1) {
                    fields[betFieldT2Index].value = betsT2;
                  } else {
                    newEmbed.addFields({ name: '💸 Apuestas Equipo 2', value: betsT2, inline: true });
                  }

                  await queueMsg.edit({ embeds: [newEmbed] }).catch(e => console.warn('Error editando embed de apuestas:', e));
                }
              }
            }
          }
        } catch (err) {
          console.error('Error actualizando embed de fila con apuestas:', err);
        }

        return;
      }

      if (modalParts[0] === 'modal' && modalParts[1] === 'wager') {
        await handleWagerModalSubmit(interaction, ctx.getQueueDeps());
        return;
      }
      if (modalParts[0] === 'modal' && modalParts[1] === 'wallet') {

        if (modalParts[2] === 'customrole') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const userId = modalParts[3];
          if (interaction.user.id !== userId) return interaction.editReply('🚫 No puedes usar este modal.');

          const player = await ensurePlayerRecord(userId);
          if ((player.donationRights?.customRole || 0) <= 0) return interaction.editReply('🚫 No tienes "Rol Personalizado" disponible.');

          // Check VIP Duration
          const remainingMs = getRemainingVipMs(player, interaction.member);
          if (remainingMs <= 0) return interaction.editReply('🚫 Tu VIP ha expirado o no tienes tiempo restante para donar.');

          const targetInput = interaction.fields.getTextInputValue('target_user_id');
          const roleName = interaction.fields.getTextInputValue('role_name');
          const roleColor = interaction.fields.getTextInputValue('role_color') || '#FFFFFF';
          let iconUrl = '';
          try { iconUrl = interaction.fields.getTextInputValue('role_icon'); } catch (e) {}

          const targetIdMatch = targetInput.match(/\d{17,19}/);
          const targetId = targetIdMatch ? targetIdMatch[0] : null;
          if (!targetId) return interaction.editReply('🚫 ID de usuario inválido.');
          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!member) return interaction.editReply('🚫 Usuario no encontrado.');

          try {
            let buffer = undefined;
            if (iconUrl && iconUrl.trim().length > 0) {
              try {
                const canvas = createCanvas(64, 64);
                const ctxC = canvas.getContext('2d');
                const img = await loadImage(iconUrl.trim());
                ctxC.drawImage(img, 0, 0, 64, 64);
                buffer = await canvas.encode('png');
              } catch (imgErr) {
                console.log('Error loading icon for custom role:', imgErr.message);
              }
            }

            const roleOptions = {
              name: roleName,
              color: (roleColor && roleColor.startsWith('#')) ? roleColor : '#FFFFFF',
              reason: `Donación de Rol Personalizado por ${interaction.user.tag}`
            };

            if (buffer && interaction.guild.features.includes('ROLE_ICONS')) {
              roleOptions.icon = buffer;
            }

            // Create Role
            const newRole = await interaction.guild.roles.create(roleOptions);

            // Assign Role
            await member.roles.add(newRole);

            // Update Donor
            await Player.updateOne({ _id: userId }, { $inc: { 'donationRights.customRole': -1 } });

            // Update Target (Temporary Role)
            await Player.updateOne({ _id: targetId }, {
              $push: {
                temporaryRoles: {
                  roleId: newRole.id,
                  expiresAt: new Date(Date.now() + remainingMs),
                  type: 'custom_donation',
                  donorId: userId
                }
              }
            });

            const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            return interaction.editReply(`✅ Rol **${roleName}** creado y asignado a <@${targetId}> por ${days} días y ${hours} horas (Tiempo restante de tu VIP).`);
          } catch (e) {
            console.error(e);
            return interaction.editReply('❌ Error creando el rol. Verifica la URL de la imagen y el formato del color (Hex). Es posible que el bot no tenga boost suficiente para iconos de rol.');
          }
        }

        if (modalParts[2] === 'benefit') {
          const benefitType = modalParts[3];
          const userId = modalParts[4];

          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          if (interaction.user.id !== userId) return interaction.editReply('🚫 No puedes usar este modal.');

          const player = await ensurePlayerRecord(userId);
          if ((player.donationRights?.[benefitType] || 0) <= 0) return interaction.editReply(`🚫 No tienes "${benefitType}" disponible.`);

          // Check VIP Duration
          const remainingMs = getRemainingVipMs(player, interaction.member);
          if (remainingMs <= 0) return interaction.editReply('🚫 Tu VIP ha expirado o no tienes tiempo restante para donar.');

          const targetInput = interaction.fields.getTextInputValue('target_user_id');
          const targetIdMatch = targetInput.match(/\d{17,19}/);
          const targetId = targetIdMatch ? targetIdMatch[0] : null;
          if (!targetId) return interaction.editReply('🚫 ID de usuario inválido.');
          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!member) return interaction.editReply('🚫 Usuario no encontrado.');

          const roleId = DONATION_ROLES[benefitType];
          if (!roleId) return interaction.editReply('❌ Error de configuración: ID de rol no encontrado.');

          try {
            await member.roles.add(roleId);

            await Player.updateOne({ _id: userId }, { $inc: { [`donationRights.${benefitType}`]: -1 } });

            await Player.updateOne({ _id: targetId }, {
              $push: {
                temporaryRoles: {
                  roleId: roleId,
                  expiresAt: new Date(Date.now() + remainingMs),
                  donorId: userId
                }
              }
            });

            const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            return interaction.editReply(`✅ Beneficio **${benefitType}** asignado a <@${targetId}> por ${days} días y ${hours} horas (Tiempo restante de tu VIP).`);
          } catch (e) {
            console.error(e);
            return interaction.editReply('❌ Error asignando el rol.');
          }
        }

        if (modalParts[2] === 'tempvoice') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const userId = modalParts[3];

          const player = await ensurePlayerRecord(userId);
          if ((player.donationRights?.tempVoice || 0) <= 0) {
            return interaction.editReply({ content: '🚫 No tienes "Call Privada" disponible.' });
          }

          const remainingMs = getRemainingVipMs(player, interaction.member);
          if (remainingMs <= 0) return interaction.editReply('🚫 Tu VIP ha expirado o no tienes tiempo restante para donar.');

          const targetInput = interaction.fields.getTextInputValue('target_user_id');
          const channelName = interaction.fields.getTextInputValue('channel_name');

          const targetIdMatch = targetInput.match(/\d{17,19}/);
          const targetId = targetIdMatch ? targetIdMatch[0] : null;

          if (!targetId) {
            return interaction.editReply({ content: '🚫 ID de usuario inválido. Asegúrate de poner el ID o mencionar al usuario.' });
          }

          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!member) {
            return interaction.editReply({ content: '🚫 Usuario no encontrado en el servidor.' });
          }

          const categoryId = (config && config.tempVoiceCategoryId) ? String(config.tempVoiceCategoryId) : '1461883678878732379';
          const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

          if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.editReply({ content: '❌ No se encontró la categoría configurada para canales de voz temporales.' });
          }

          const durationMs = remainingMs; // Duración igual al tiempo restante del VIP del donador
          const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const expiresAt = new Date(Date.now() + durationMs);

          const voiceChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: category.id
          }).catch(() => null);

          if (!voiceChannel) {
            return interaction.editReply({ content: '❌ No se pudo crear el canal de voz temporal.' });
          }

          await voiceChannel.permissionOverwrites.edit(targetId, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            MoveMembers: true,
            MuteMembers: true,
            ManageChannels: true,
            ManageRoles: true
          }).catch(() => { });

          if (ActiveTempVoice) {
            try {
              await ActiveTempVoice.findByIdAndUpdate(voiceChannel.id, {
                _id: voiceChannel.id,
                guildId: interaction.guild.id,
                ownerId: targetId,
                channelName,
                expiresAt,
              }, { upsert: true });
            } catch (_) { }
          }

          await Player.updateOne({ _id: userId }, { $inc: { 'donationRights.tempVoice': -1 } });

          if (typeof sendLog === 'function') {
            try {
              const logEmbed = new EmbedBuilder()
                .setTitle('📓 Canal de Voz Temporal (Donación)')
                .setDescription(
                  `**Donador:** <@${userId}>\n` +
                  `**Beneficiario:** <@${targetId}>\n` +
                  `**Canal:** ${voiceChannel} \`(${voiceChannel.id})\`\n` +
                  `**Tiempo:** ${days} días y ${hours} horas\n` +
                  `**Nombre:** ${channelName}`
                )
                .setColor(COLORS.PRIMARY)
                .setTimestamp();
              await sendLog(interaction.guild, logEmbed, [], 'voiceTemp');
            } catch (_) { }
          }

          const MAX_TIMEOUT_MS = 2147000000;
          const deleteAndCleanup = async () => {
            try {
              const ch = await interaction.guild.channels.fetch(voiceChannel.id).catch(() => null);
              if (ch) {
                await ch.delete('Canal de voz temporal expirado.').catch(() => { });
              }
            } finally {
              if (ActiveTempVoice) {
                await ActiveTempVoice.deleteOne({ _id: voiceChannel.id }).catch(() => { });
              }
            }
          };
          const scheduleDeletion = (remaining) => {
            if (remaining <= 0) {
              deleteAndCleanup().catch(() => { });
              return;
            }
            const chunk = Math.min(remaining, MAX_TIMEOUT_MS);
            setTimeout(() => {
              if (remaining <= chunk) {
                deleteAndCleanup().catch(() => { });
              } else {
                scheduleDeletion(remaining - chunk);
              }
            }, chunk);
          };
          scheduleDeletion(durationMs);

          return interaction.editReply({ content: `✅ Canal de voz temporal creado para <@${targetId}>: ${voiceChannel}\nDuración: ${days} días y ${hours} horas (Tiempo restante de tu VIP).` });
        }

        if (modalParts[2] === 'permanentvoice') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const userId = modalParts[3];

          const player = await ensurePlayerRecord(userId);
          if ((player.donationRights?.permanentVoice || 0) <= 0) {
            return interaction.editReply({ content: '🚫 No tienes "Call Privada Puntos" disponible.' });
          }

          const targetInput = interaction.fields.getTextInputValue('target_user_id');
          const channelName = interaction.fields.getTextInputValue('channel_name');

          const targetIdMatch = targetInput.match(/\d{17,19}/);
          const targetId = targetIdMatch ? targetIdMatch[0] : null;

          if (!targetId) {
            return interaction.editReply({ content: '🚫 ID de usuario inválido. Asegúrate de poner el ID o mencionar al usuario.' });
          }

          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!member) {
            return interaction.editReply({ content: '🚫 Usuario no encontrado en el servidor.' });
          }

          const categoryId = (config && config.tempVoiceCategoryId) ? String(config.tempVoiceCategoryId) : '1461883678878732379';
          const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

          if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.editReply({ content: '❌ No se encontró la categoría configurada para canales de voz privados.' });
          }

          const voiceChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: category.id
          }).catch(() => null);

          if (!voiceChannel) {
            return interaction.editReply({ content: '❌ No se pudo crear el canal de voz permanente.' });
          }

          await voiceChannel.permissionOverwrites.edit(targetId, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            MoveMembers: true,
            MuteMembers: true,
            ManageChannels: true,
            ManageRoles: true
          }).catch(() => { });

          await Player.updateOne({ _id: userId }, { $inc: { 'donationRights.permanentVoice': -1 } });

          if (typeof sendLog === 'function') {
            try {
              const logEmbed = new EmbedBuilder()
                .setTitle('📓 Canal de Voz Permanente (Puntos)')
                .setDescription(
                  `**Donador:** <@${userId}>\n` +
                  `**Beneficiario:** <@${targetId}>\n` +
                  `**Canal:** ${voiceChannel} \`(${voiceChannel.id})\`\n` +
                  `**Nombre:** ${channelName}\n` +
                  `**Duración:** Permanente (No expirará)`
                )
                .setColor(COLORS.PRIMARY)
                .setTimestamp();
              await sendLog(interaction.guild, logEmbed, [], 'voiceTemp');
            } catch (_) { }
          }

          return interaction.editReply({ content: `✅ Canal de voz permanente (Call Privada Puntos) creado exitosamente para <@${targetId}>: ${voiceChannel}` });
        }

        if (modalParts[2] === 'permanentvoice') {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(() => { });
          const userId = modalParts[3];

          const player = await ensurePlayerRecord(userId);
          if ((player.donationRights?.permanentVoice || 0) <= 0) {
            return interaction.editReply({ content: '🚫 No tienes "Call Privada Puntos" disponible.' });
          }

          const targetInput = interaction.fields.getTextInputValue('target_user_id');
          const channelName = interaction.fields.getTextInputValue('channel_name');

          const targetIdMatch = targetInput.match(/\d{17,19}/);
          const targetId = targetIdMatch ? targetIdMatch[0] : null;

          if (!targetId) {
            return interaction.editReply({ content: '🚫 ID de usuario inválido. Asegúrate de poner el ID o mencionar al usuario.' });
          }

          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!member) {
            return interaction.editReply({ content: '🚫 Usuario no encontrado en el servidor.' });
          }

          const categoryId = (config && config.tempVoiceCategoryId) ? String(config.tempVoiceCategoryId) : '1461883678878732379';
          const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

          if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.editReply({ content: '❌ No se encontró la categoría configurada para canales de voz privados.' });
          }

          const voiceChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: category.id
          }).catch(() => null);

          if (!voiceChannel) {
            return interaction.editReply({ content: '❌ No se pudo crear el canal de voz permanente.' });
          }

          await voiceChannel.permissionOverwrites.edit(targetId, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            MoveMembers: true,
            MuteMembers: true,
            ManageChannels: true,
            ManageRoles: true
          }).catch(() => { });

          await Player.updateOne({ _id: userId }, { $inc: { 'donationRights.permanentVoice': -1 } });

          if (typeof sendLog === 'function') {
            try {
              const logEmbed = new EmbedBuilder()
                .setTitle('📓 Canal de Voz Permanente (Puntos)')
                .setDescription(
                  `**Donador:** <@${userId}>\n` +
                  `**Beneficiario:** <@${targetId}>\n` +
                  `**Canal:** ${voiceChannel} \`(${voiceChannel.id})\`\n` +
                  `**Nombre:** ${channelName}\n` +
                  `**Duración:** Permanente (No expirará)`
                )
                .setColor(COLORS.PRIMARY)
                .setTimestamp();
              await sendLog(interaction.guild, logEmbed, [], 'voiceTemp');
            } catch (_) { }
          }

          return interaction.editReply({ content: `✅ Canal de voz permanente (Call Privada Puntos) creado exitosamente para <@${targetId}>: ${voiceChannel}` });
        }
      }

      if (modalParts[0] === 'modal' && modalParts[1] === 'profile' && modalParts[2] === 'banner') {
        let deferredBanner = false;
        try {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
          deferredBanner = true;
        } catch (_) { }

        const respondBanner = (data) => {
          if (interaction.deferred || interaction.replied || deferredBanner) {
            return interaction.editReply(data).catch(() => { });
          }
          return interaction.reply({ ...data, flags: [MessageFlags.Ephemeral] }).catch(() => { });
        };
        const userId = modalParts[3];
        const url = (interaction.fields.getTextInputValue('banner_url') || '').trim();
        if (!/^https?:\/\//i.test(url)) {
          return respondBanner({ content: 'URL inválida. Debe empezar por http(s).' });
        }
        if (url.includes('google.com/search') || (url.includes('google.com') && url.includes('&q='))) {
          return respondBanner({ content: '⚠️ No puedes usar enlaces de búsqueda de Google. Usa una URL directa a una imagen.' });
        }
        if (/\.gif(\?|#|$)/i.test(url)) {
          return respondBanner({ content: '⚠️ Actualmente los banners GIF animados no se soportan. Usa una imagen PNG o JPG.' });
        }
        let parsed = null;
        try { parsed = new URL(url); } catch (_) { }
        const host = (parsed?.hostname || '').toLowerCase();
        const pathname = (parsed?.pathname || '').toLowerCase();
        const extOk = /\.(png|jpg|jpeg)(\?|$)/.test(pathname);

        const isTempDiscord = /(^|\.)media\.discordapp\.net$|(^|\.)images-ext-\d+\.discordapp\.net$/.test(host);
        const isTenorGiphy = /(^|\.)tenor\.com$|(^|\.)giphy\.com$/.test(host);

        if (!extOk) {
          return respondBanner({ content: '⚠️ La URL debe terminar en .png, .jpg o .jpeg' });
        }
        if (isTempDiscord) {
          return respondBanner({ content: '⚠️ Usa cdn.discordapp.com (permanente), no media.discordapp.net o images-ext (temporales). Sube la imagen a Discord y copia el enlace con botón derecho → Copiar enlace.' });
        }
        if (isTenorGiphy) {
          const msg = '⚠️ Los enlaces de Tenor y Giphy no son estables. Descarga la imagen y súbela a Discord, luego copia el enlace.';
          return respondBanner({ content: msg });
        }

        // Usar ruta absoluta basada en __dirname para consistencia
        const rootDir = path.resolve(__dirname, '../../');
        const relativeDir = path.join('uploads', 'profiles', userId);
        const absoluteDir = path.join(rootDir, relativeDir);

        try { fs.mkdirSync(absoluteDir, { recursive: true }); } catch (_) { }

        // Show progress message
        await respondBanner({ content: '⏳ Descargando imagen del banner...' });

        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 }).catch(() => null);
        if (!resp || !(resp.data && resp.data.byteLength > 0)) {
          return respondBanner({ content: '⚠️ No se pudo descargar la imagen del banner. Verifica que la URL sea correcta y accesible.' });
        }
        const ct = String(resp.headers['content-type'] || '').toLowerCase();
        const ext = /png/.test(ct) ? 'png' : 'jpg';

        const fileName = `banner.${ext}`;
        const absoluteFilePath = path.join(absoluteDir, fileName);
        const relativeFilePath = path.join(relativeDir, fileName);

        try { fs.writeFileSync(absoluteFilePath, resp.data); } catch (writeErr) {
          console.error('[Banner Upload] Error writing file:', writeErr);
          return respondBanner({ content: '⚠️ Error guardando el banner en el servidor.' });
        }

        await Player.updateOne({ _id: userId }, { $set: { profileBannerUrl: relativeFilePath } });
        console.log(`[Banner Upload] Saved for user ${userId}: ${relativeFilePath}`);
        try { invalidatePlayerCache(userId); } catch (_) { }
        return respondBanner({ content: '✅ Banner actualizado correctamente. Abre `!p` para ver tu tarjeta.' });
      }
      if (modalParts[0] === 'modal' && modalParts[1] === 'profile' && modalParts[2] === 'background') {
        let deferredBg = false;
        try {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
          deferredBg = true;
        } catch (_) { }

        const respondBg = (data) => {
          if (interaction.deferred || interaction.replied || deferredBg) {
            return interaction.editReply(data).catch(() => { });
          }
          return interaction.reply({ ...data, flags: [MessageFlags.Ephemeral] }).catch(() => { });
        };
        const userId = modalParts[3];
        const url = (interaction.fields.getTextInputValue('background_url') || '').trim();
        if (!/^https?:\/\//i.test(url)) {
          return respondBg({ content: 'URL inválida. Debe empezar por http(s).' });
        }
        if (url.includes('google.com/search') || (url.includes('google.com') && url.includes('&q='))) {
          return respondBg({ content: '⚠️ No puedes usar enlaces de búsqueda de Google. Usa una URL directa a una imagen.' });
        }
        let parsedBg = null;
        try { parsedBg = new URL(url); } catch (_) { }
        const hostBg = (parsedBg?.hostname || '').toLowerCase();
        const pathBg = (parsedBg?.pathname || '').toLowerCase();
        const extOkBg = /\.(png|jpg|jpeg)(\?|$)/.test(pathBg);

        const isTempDiscordBg = /(^|\.)media\.discordapp\.net$|(^|\.)images-ext-\d+\.discordapp\.net$/.test(hostBg);
        const isTenorGiphyBg = /(^|\.)tenor\.com$|(^|\.)giphy\.com$/.test(hostBg);

        if (!extOkBg) {
          return respondBg({ content: '⚠️ La URL debe terminar en .png, .jpg o .jpeg' });
        }
        if (isTempDiscordBg) {
          return respondBg({ content: '⚠️ Usa cdn.discordapp.com (permanente), no media.discordapp.net o images-ext (temporales). Sube la imagen a Discord y copia el enlace con botón derecho → Copiar enlace.' });
        }
        if (isTenorGiphyBg) {
          const msg = '⚠️ Los enlaces de Tenor y Giphy no son estables. Descarga la imagen y súbela a Discord, luego copia el enlace.';
          return respondBg({ content: msg });
        }

        // Usar ruta absoluta basada en __dirname para consistencia
        const rootDir = path.resolve(__dirname, '../../');
        const relativeDir = path.join('uploads', 'profiles', userId);
        const absoluteDir = path.join(rootDir, relativeDir);

        try { fs.mkdirSync(absoluteDir, { recursive: true }); } catch (_) { }

        await respondBg({ content: '⏳ Descargando imagen de fondo...' });

        const respBg = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 }).catch(() => null);
        if (!respBg || !(respBg.data && respBg.data.byteLength > 0)) {
          return respondBg({ content: '⚠️ No se pudo descargar la imagen de fondo. Verifica que la URL sea correcta y accesible.' });
        }
        const ctBg = String(respBg.headers['content-type'] || '').toLowerCase();
        const extBg = /png/.test(ctBg) ? 'png' : 'jpg';

        const fileName = `background.${extBg}`;
        const absoluteFilePath = path.join(absoluteDir, fileName);
        const relativeFilePath = path.join(relativeDir, fileName);

        try { fs.writeFileSync(absoluteFilePath, respBg.data); } catch (writeErr) {
          console.error('[Background Upload] Error writing file:', writeErr);
          return respondBg({ content: '⚠️ Error guardando el fondo en el servidor.' });
        }
        await Player.updateOne(
          { _id: userId },
          {
            $set: { profileBackgroundUrl: relativeFilePath },
            $unset: {
              profileBackgroundColor: '',
              'profileTheme.backgroundGradientFrom': '',
              'profileTheme.backgroundGradientTo': '',
            },
          }
        );
        try { invalidatePlayerCache(userId); } catch (_) { }
        return respondBg({ content: '✅ Fondo actualizado. Abre `!p` para ver tu tarjeta.' });
      }
    }
  } catch (err) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('⚠️ Error en Interacción')
      .setDescription('Ocurrió un error al procesar una interacción.')
      .addFields(
        { name: 'Usuario', value: interaction.user ? `<@${interaction.user.id}>` : 'Desconocido', inline: true },
        { name: 'Comando/ID', value: interaction.customId || interaction.commandName || 'Desconocido', inline: true },
        { name: 'Error', value: `\`\`\`${err.message}\`\`\`` }
      )
      .setColor(COLORS.ERROR)
      .setTimestamp();
    sendLog(interaction.guild, errorEmbed, [], 'errors');

    console.error('Error en interactionCreate:', err);
    try {
      if (interaction && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Ocurrió un error interno al procesar tu solicitud.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
      }
    } catch (e) {
      console.error('No se pudo ni siquiera intentar responder a la interacción fallida:', e);
    }
  }
};
