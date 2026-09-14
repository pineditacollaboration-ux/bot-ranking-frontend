const {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');

// Generar key única
function generateVipKey(roleType) {
  const randomNum = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  return `${roleType}-${randomNum}`;
}

module.exports = async function tiendaCommand(message, ctx) {
  const {
    ensurePlayerRecord,
    Player,
    SHOP_ITEMS,
    COLORS,
    sendLog,
    SHOP_CHANNEL_ID: SHOP_CHANNEL_ID_CTX,
    settings,
    VipKey,
    EMOJIS,
  } = ctx;

  const emojis = EMOJIS || { money: '<:dinerito:1444187549563228256>', shop: '🛍️' };
  const SHOP_CHANNEL_ID = SHOP_CHANNEL_ID_CTX || '1420147222821081159';

  // Verificar si la tienda está habilitada
  if (settings && settings.shopEnabled === false) {
    return message.reply(`${emojis.shop} La tienda está temporalmente deshabilitada.`).catch(() => { });
  }

  const STREAMER_CATEGORY_ID = '1473558364289241253';
  const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

  // Restricción de canal para !tienda
  if (message.channel.id !== SHOP_CHANNEL_ID && !isInStreamerCategory) {
    // [DM DESACTIVADO] Aviso de canal correcto para !tienda
    // try {
    //   await message.author.send(`${emojis.warning || '⚠️'} El comando \`!tienda\` solo se puede usar en el canal <#${SHOP_CHANNEL_ID}>.`);
    // } catch (e) {
    //   console.warn(`No se pudo enviar DM a ${message.author.tag} sobre el canal de la tienda.`);
    // }
    if (message.deletable) await message.delete().catch(() => { });
    return;
  }

  const args = (message.content.split(/\s+/).slice(1) || []);

  const playerDoc = await ensurePlayerRecord(message.author.id);
  const styleCoins = Math.floor(playerDoc.styleCoins || 0);

  // Paginación y render
  const itemsPerPage = 5;
  const itemKeys = Object.keys(SHOP_ITEMS);
  const totalPages = Math.max(1, Math.ceil(itemKeys.length / itemsPerPage));
  let page = Math.min(Math.max(parseInt(args[0], 10) || 1, 1), totalPages);

  // Asegurar que itemKeys no esté vacío para evitar errores
  if (itemKeys.length === 0) {
    return message.reply(`${emojis.error || '❌'} No hay ítems en la tienda actualmente.`).catch(() => { });
  }

  // Helper para parsear emojis custom/animados para componentes
  const parseEmoji = (text) => {
    if (!text) return undefined;
    // Si ya es un objeto, devolverlo
    if (typeof text === 'object') return text;
    // Intentar matchear formato <:nombre:id> o <a:nombre:id>
    const match = text.match(/^<(a?):([A-Za-z0-9_]+):(\d+)>$/);
    if (match) {
      return {
        animated: match[1] === 'a',
        name: match[2],
        id: match[3]
      };
    }
    // Si es solo un ID numérico
    if (/^\d+$/.test(text)) return { id: text };
    // De lo contrario, asumir que es un emoji unicode o un nombre simple
    return text;
  };

  const buildPageEmbed = (pageIndex) => {
    const start = (pageIndex - 1) * itemsPerPage;
    const slice = itemKeys.slice(start, start + itemsPerPage);

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.shop || '🛒'} Tienda Royal Ranked`)
      .setDescription(`💰 **Tus Monedas Royal:** ${styleCoins}\n\nSelecciona un ítem del menú para comprar.`)
      .setColor(COLORS.PRIMARY)
      .setThumbnail('https://cdn.discordapp.com/emojis/1444187549563228256.png')
      .setFooter({ text: `Página ${pageIndex}/${totalPages} • ROYAL RANKED` })
      .setTimestamp();

    // Agregar campos para cada item
    slice.forEach((key, i) => {
      const item = SHOP_ITEMS[key];
      const index = start + i + 1;
      const priceTxt = `${item.price} ${emojis.money}`;
      const roleTxt = item.roleId ? ` | <@&${item.roleId}>` : '';
      
      embed.addFields({
        name: `${item.emoji || ''} ${index}. ${item.name}`,
        value: `${priceTxt}${roleTxt}\n${item.description || 'Sin descripción'}`,
        inline: false
      });
    });

    return embed;
  };

  const buildComponents = (pageIndex) => {
    const start = (pageIndex - 1) * itemsPerPage;
    const slice = itemKeys.slice(start, start + itemsPerPage);

    const select = new StringSelectMenuBuilder()
      .setCustomId('shop_select')
      .setPlaceholder('Selecciona un ítem para comprar')
      .addOptions(slice.map((key, i) => {
        const item = SHOP_ITEMS[key];
        const index = start + i + 1;
        // Limitar longitudes para cumplir con Discord
        const label = `${index}. ${item.name}`.substring(0, 100);
        const description = `${item.price} Dineritos`.substring(0, 100);
        
        return {
          label,
          value: key,
          description,
          emoji: parseEmoji(item.emoji) || undefined,
        };
      }));

    const prevBtn = new ButtonBuilder().setCustomId('shop_prev').setLabel(' ').setStyle(ButtonStyle.Secondary).setEmoji(parseEmoji(emojis.back) || '⬅️');
    const nextBtn = new ButtonBuilder().setCustomId('shop_next').setLabel(' ').setStyle(ButtonStyle.Secondary).setEmoji(parseEmoji(emojis.next) || '➡️');

    return [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(prevBtn, nextBtn),
    ];
  };

  const msg = await message.channel.send({ embeds: [buildPageEmbed(page)], components: buildComponents(page) });

  const collector = msg.createMessageComponentCollector({ 
    filter: (i) => i.user.id === message.author.id,
    time: 2 * 60 * 1000 
  });

  collector.on('collect', async (interaction) => {
    // Navegación
    if (interaction.isButton()) {
      let newPage = page;
      if (interaction.customId === 'shop_prev') {
        newPage = (page > 1) ? page - 1 : totalPages;
      } else if (interaction.customId === 'shop_next') {
        newPage = (page < totalPages) ? page + 1 : 1;
      } else {
        return;
      }

      // Seguridad adicional: Asegurar que newPage esté en rango
      newPage = Math.min(Math.max(newPage, 1), totalPages);

      try {
        await interaction.update({ 
          embeds: [buildPageEmbed(newPage)], 
          components: buildComponents(newPage) 
        });
        // Solo actualizamos la variable global 'page' si el update fue exitoso
        page = newPage;
      } catch (error) {
        console.error('Error al actualizar página de tienda:', error);
      }
      return;
    }

    // Compra
    if (interaction.isStringSelectMenu() && interaction.customId === 'shop_select') {
      const selectedKey = interaction.values?.[0];
      const item = SHOP_ITEMS[selectedKey];
      if (!item) {
        return interaction.reply({ content: `${emojis.error || '❌'} Ítem inválido.`, flags: MessageFlags.Ephemeral }).catch(() => { });
      }

      // Confirmación
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_confirm').setLabel('✅ Confirmar').setStyle(ButtonStyle.Success).setEmoji(parseEmoji(emojis.success) || '✅'),
        new ButtonBuilder().setCustomId('shop_cancel').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger).setEmoji(parseEmoji(emojis.error) || '❌'),
      );

      await interaction.reply({
        content: `Vas a comprar **${item.name}** por **${item.price}** ${emojis.money}. ¿Confirmas?`,
        components: [confirmRow],
        flags: MessageFlags.Ephemeral
      }).catch(() => { });

      const reply = await interaction.fetchReply().catch(() => { });

      if (!reply) return;

      const conf = reply.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 60 * 1000,
        componentType: ComponentType.Button,
      });

      conf.on('collect', async (btn) => {
        if (btn.customId === 'shop_cancel') {
          await btn.update({ content: 'Compra cancelada.', components: [] }).catch(() => { });
          conf.stop('cancel');
          return;
        }
        if (btn.customId === 'shop_confirm') {
          await btn.deferUpdate().catch(() => { });
          // Deshabilitar botones inmediatamente para evitar doble click
          await btn.editReply({ components: [] }).catch(() => { });
          if (item.effect === 'remove_warning') {
            // Verificar por roles de advertencia (niveles 1-3)
            const WARNING_ROLE_IDS = {
              1: '1408520883018010714',
              2: '1408520668273840229',
              3: '1408229201559162933'
            };
            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            const hasAnyWarning = member && (member.roles.cache.has(WARNING_ROLE_IDS[1]) || member.roles.cache.has(WARNING_ROLE_IDS[2]) || member.roles.cache.has(WARNING_ROLE_IDS[3]));
            if (!hasAnyWarning) {
              await btn.update({ content: `${emojis.warning || '⚠️'} No tienes advertencias activas para remover.`, components: [] }).catch(() => { });
              conf.stop('no_warnings');
              return;
            }
          }

          // Deducción atómica y entrega
          const updated = await Player.findByIdAndUpdate(
            message.author.id,
            { $inc: { styleCoins: -item.price } },
            { new: true }
          ).catch(() => null);

          if (!updated || (updated.styleCoins || 0) < 0) {
            await Player.findByIdAndUpdate(message.author.id, { $inc: { styleCoins: item.price } }).catch(() => { });
            await btn.update({ content: `${emojis.error || '❌'} No tienes suficientes ${emojis.money} o hubo un error.`, components: [] }).catch(() => { });
            conf.stop('insufficient');
            return;
          }

          // Rol o efecto
          try {
            if (item.roleId) {
              const member = await message.guild.members.fetch(message.author.id).catch(() => null);
              if (member) {
                await member.roles.add(item.roleId).catch(() => { });
              }
            }
            // Efectos especiales
            if (item.effect === 'remove_warning') {
              // Implementar degradación de advertencias 3→2→1→0 usando roles definidos
              const WARNING_ROLE_IDS = {
                1: '1408520883018010714',
                2: '1408520668273840229',
                3: '1408229201559162933'
              };
              const member = await message.guild.members.fetch(message.author.id).catch(() => null);
              if (member) {
                let removedRoleId = null;
                let downgradedToRoleId = null;
                if (member.roles.cache.has(WARNING_ROLE_IDS[3])) {
                  removedRoleId = WARNING_ROLE_IDS[3];
                  downgradedToRoleId = WARNING_ROLE_IDS[2];
                } else if (member.roles.cache.has(WARNING_ROLE_IDS[2])) {
                  removedRoleId = WARNING_ROLE_IDS[2];
                  downgradedToRoleId = WARNING_ROLE_IDS[1];
                } else if (member.roles.cache.has(WARNING_ROLE_IDS[1])) {
                  removedRoleId = WARNING_ROLE_IDS[1];
                  downgradedToRoleId = null; // bajar a 0
                }
                if (removedRoleId) {
                  await member.roles.remove(removedRoleId).catch(() => { });
                  if (downgradedToRoleId) {
                    await member.roles.add(downgradedToRoleId).catch(() => { });
                  }
                  // Sincronizar DB: quitar una advertencia y limpiar registro
                  const player = await ensurePlayerRecord(message.author.id);
                  player.warnings = Math.max(0, (player.warnings || 0) - 1);
                  // Quitar un registro de activeWarnings que coincida con removedRoleId (si existe), o el más antiguo como fallback
                  const aw = (player.activeWarnings || []).slice();
                  let idx = aw.findIndex(w => w.roleId === removedRoleId);
                  if (idx === -1 && aw.length > 0) {
                    aw.sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
                    const oldest = aw[0];
                    idx = player.activeWarnings.findIndex(w => w.roleId === oldest.roleId && w.expiresAt === oldest.expiresAt);
                  }
                  if (idx >= 0) {
                    player.activeWarnings.splice(idx, 1);
                  }
                  await player.save();
                }
              }
            } else if (item.effect === 'puntos_x2_1h') {
              const p = await ensurePlayerRecord(message.author.id);
              const now = Date.now();
              const currentExp = p.x2_until && p.x2_until > now ? p.x2_until : now;
              p.x2_until = currentExp + 3600000; // +1 hora
              await p.save();
              // [DM DESACTIVADO] Aviso de Puntos X2 activado
              // try { await message.author.send(`Has adquirido **Puntos X2** por 1 hora. Expira: <t:${Math.floor(p.x2_until / 1000)}:R>`); } catch (_) { }
            } else if (item.effect === 'proteccion_puntos_1h') {
              const p = await ensurePlayerRecord(message.author.id);
              const now = Date.now();
              const currentExp = p.proteccion_until && p.proteccion_until > now ? p.proteccion_until : now;
              p.proteccion_until = currentExp + 3600000; // +1 hora
              await p.save();
              // [DM DESACTIVADO] Aviso de Protección de Puntos activada
              // try { await message.author.send(`Has adquirido **Protección de Puntos** por 1 hora. Expira: <t:${Math.floor(p.proteccion_until / 1000)}:R>`); } catch (_) { }
            }
          } catch (e) {
            console.warn('Error asignando rol/efecto de tienda:', e.message);
          }

          // Ítems Manuales (Nitro, Diamantes, Custom, Call)
          if (item.manual) {
            try {
              // Generar una key para el registro en la Cartera Tienda
              const manualKey = generateVipKey(selectedKey.substring(0, 5));
              const newKey = new VipKey({
                key: manualKey,
                type: selectedKey,
                status: 'active',
                createdBy: message.author.id,
                restrictedTo: message.author.id,
                expiresAt: null
              });
              await newKey.save();

              // [DM DESACTIVADO] Instrucciones de ítem manual (Nitro, Call, etc.)
              // await message.author.send(
              //   `${emojis.celebration || '🎉'} ¡Felicidades por adquirir **${item.name}**! 🎉\n\n` +
              //   `${emojis.warning || '⚠️'} **IMPORTANTE:** Para recibir tu premio, por favor **abre un ticket** en el canal de soporte del servidor y un miembro del Staff te atenderá para entregártelo.\n\n` +
              //   `Tu compra ha quedado registrada en tu **Cartera Tienda** (\`!p\` -> 🛒 Tienda).\n\n` +
              //   `¡Gracias por tu apoyo!`
              // );
            } catch (_) {
              console.warn(`No se pudo enviar DM manual o crear Key para ${message.author.tag}`);
            }
          }

          // Acreditar giros si el item lo especifica
          if (typeof item.spins === 'number' && item.spins > 0) {
            await Player.findByIdAndUpdate(message.author.id, { $inc: { spins: item.spins } }).catch(() => { });
            // [DM DESACTIVADO] Confirmación de giros de ruleta obtenidos
            // try { await message.author.send(`Has obtenido **${item.spins}** giros de la ruleta ${emojis.spin || '🎰'}.`); } catch (_) { }
          }

          // Beneficios automáticos de tienda (Reemplaza a las Keys)
          const ROLE_BENEFITS = {
            'rol_inabalavel': {
              title: '🔱 INABALÁVEL - Beneficios Desbloqueados',
              benefits: `**BENEFICIOS:**\n✅ PRIORIDAD EN EVENTOS\n✅ ATENCIÓN PRIORITARIA\n✅ DERECHO A 3 GIROS DE RULETA\n✅ ROL DESTACADO @INABALÁVEL\n✅ ACCESO AL COMANDO DE FILAS\n✅ RECIBE 3 ROYAL COINS\n\n✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)\n✅ DERECHO AL ROL @PASE LIBRE\n✅ DERECHO AL ROL @SPIDER\n✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)\n\n**BONUS:**\n💰 5.000 PUNTOS\n⚡ PUNTOS X2 - 2 USOS (1H)\n🛡️ PROTECCIÓN DE PUNTOS - 2 USOS (1H)`,
              rewards: { points: 5000, styleCoins: 3, spins: 3, x2Hours: 2, proteccionHours: 2 },
              donationRights: { bigBoss: 1, paseLibre: 1, spider: 1 },
              roleId: '1500592040306806824'
            },
            'rol_espanca_xota': {
              title: '👑 ESPANCA XOTA - Beneficios Desbloqueados',
              benefits: `**BENEFICIOS:**\n✅ PRIORIDAD EN EVENTOS\n✅ ATENCIÓN PRIORITARIA\n✅ DERECHO A 8 GIROS DE RULETA\n✅ ROL DESTACADO @ESPANCA XOTA\n✅ ACCESO AL COMANDO DE FILAS\n✅ RECIBE 13 ROYAL COINS\n\n✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)\n✅ DERECHO AL ROL @PASE LIBRE\n✅ DERECHO AL ROL @God Ranked\n✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)\n\n**BONUS:**\n💰 30.000 PUNTOS\n⚡ PUNTOS X2 - 10 USOS (1H)\n🛡️ PROTECCIÓN DE PUNTOS - 10 USOS (1H)`,
              rewards: { points: 30000, styleCoins: 13, spins: 8, x2Hours: 10, proteccionHours: 10 },
              donationRights: { bigBoss: 1, paseLibre: 1, godRanked: 1 },
              roleId: '1500596344073752668'
            },
            'rol_maceta_ruim': {
              title: '🪴 MACETA RUIM - Beneficios Desbloqueados',
              benefits: `**BENEFICIOS:**\n✅ PRIORIDAD EN EVENTOS\n✅ ATENCIÓN PRIORITARIA\n✅ DERECHO A 6 GIROS DE RULETA\n✅ ROL DESTACADO @MACETA RUIM\n✅ ACCESO AL COMANDO DE FILAS\n✅ RECIBE 10 ROYAL COINS\n\n✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)\n✅ DERECHO AL ROL @PASE LIBRE\n✅ DERECHO AL ROL @Deus Da Ranqueada\n✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)\n\n**BONUS:**\n💰 20.000 PUNTOS\n⚡ PUNTOS X2 - 5 USOS (1H)\n🛡️ PROTECCIÓN DE PUNTOS - 5 USOS (1H)`,
              rewards: { points: 20000, styleCoins: 10, spins: 6, x2Hours: 5, proteccionHours: 5 },
              donationRights: { bigBoss: 1, paseLibre: 1, deusDaRanqueada: 1 },
              roleId: '1500595809987854537'
            },
            'rol_magnata': {
              title: '🎩 MAGNATA - Beneficios Desbloqueados',
              benefits: `**BENEFICIOS:**\n✅ PRIORIDAD EN EVENTOS\n✅ ATENCIÓN PRIORITARIA\n✅ DERECHO A 5 GIROS DE RULETA\n✅ ROL DESTACADO @MAGNATA\n✅ ACCESO AL COMANDO DE FILAS\n✅ RECIBE 8 ROYAL COINS\n\n✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)\n✅ DERECHO AL ROL @PASE LIBRE\n✅ DERECHO AL ROL @SPIDER\n✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)\n\n**BONUS:**\n💰 10.000 PUNTOS\n⚡ PUNTOS X2 - 3 USOS (1H)\n🛡️ PROTECCIÓN DE PUNTOS - 3 USOS (1H)`,
              rewards: { points: 10000, styleCoins: 8, spins: 5, x2Hours: 3, proteccionHours: 3 },
              donationRights: { bigBoss: 1, paseLibre: 1, spider: 1 },
              roleId: '1500589829308813454'
            },
            'puntos_x2': {
              title: '⚡ PUNTOS X2 ACTIVADOS',
              benefits: `**RECOMPENSA:**\n✅ PUNTOS X2 - 3 USOS (1H)`,
              rewards: { x2Hours: 3 }
            },
            'proteccion_puntos': {
              title: '🛡️ PROTECCIÓN DE PUNTOS ACTIVADA',
              benefits: `**RECOMPENSA:**\n✅ PROTECCIÓN DE PUNTOS - 3 USOS (1H)`,
              rewards: { proteccionHours: 3 }
            }
          };

          const benefitData = ROLE_BENEFITS[selectedKey];
          if (benefitData) {
            // Asignar rol
            if (benefitData.roleId) {
              const member = await message.guild.members.fetch(message.author.id).catch(() => null);
              if (member) {
                await member.roles.add(benefitData.roleId).catch(() => {});
              }
            }

            // Aplicar recompensas a Player
            const incObj = {};
            if (benefitData.rewards?.points) incObj['currentSeason.points'] = benefitData.rewards.points;
            if (benefitData.rewards?.styleCoins) incObj.styleCoins = benefitData.rewards.styleCoins;
            if (benefitData.rewards?.spins) incObj.spins = benefitData.rewards.spins;
            if (benefitData.rewards?.x2Hours) incObj.x2_credit_ms = benefitData.rewards.x2Hours * 3600000;
            if (benefitData.rewards?.proteccionHours) incObj.proteccion_credit_ms = benefitData.rewards.proteccionHours * 3600000;

            if (benefitData.donationRights) {
              for (const [rName, count] of Object.entries(benefitData.donationRights)) {
                incObj[`donationRights.${rName}`] = count;
              }
            }

            if (Object.keys(incObj).length > 0) {
              const updateData = { $inc: incObj };
              if (benefitData.roleId) {
                const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
                updateData.$push = {
                  temporaryRoles: { roleId: benefitData.roleId, expiresAt }
                };
              }
              await Player.findByIdAndUpdate(message.author.id, updateData, { new: true }).catch(() => {});
            }

            // [DM DESACTIVADO] Beneficios VIP por DM al comprar rol
            // try {
            //   const embedBen = new EmbedBuilder()
            //     .setTitle(benefitData.title)
            //     .setDescription(benefitData.benefits)
            //     .setColor(COLORS?.SUCCESS || '#00ff00');
            //   await message.author.send({ 
            //     content: `${emojis.celebration || '🎉'} **¡Compra realizada exitosamente!** Aquí tienes tus beneficios automáticos:`,
            //     embeds: [embedBen] 
            //   });
            // } catch (_) {}
          }


          const logEmbed = new EmbedBuilder()
            .setTitle(`${emojis.shop || '🛒'} Compra Realizada`)
            .setDescription(`**Jugador:** <@${message.author.id}>\n**Item:** ${item.name}\n**Costo:** ${item.price} ${emojis.money}`)
            .setColor(COLORS.PRIMARY)
            .setTimestamp();
          if (typeof sendLog === 'function') {
            try { sendLog(message.guild, logEmbed, [], 'shop'); } catch (_) { }
          }

          let replyMsg = `${emojis.success || '✅'} Compra realizada: **${item.name}**. ¡Disfrútalo!`;
          if (item.manual) {
            replyMsg = `${emojis.success || '✅'} Compra realizada: **${item.name}**.\n📩 **Revisa tus DMs** para saber cómo reclamarlo (Abrir Ticket).`;
          } else if (item.name.includes('CON BENEFICIOS') || ROLE_BENEFITS[selectedKey]) {
            replyMsg = `${emojis.success || '✅'} Compra realizada, revisa tus dm de discord`;
          }
          await btn.editReply({ content: replyMsg, components: [] }).catch(() => { });
          conf.stop('done');
        }
      });

      conf.on('end', async () => {
        // No-op; confirmación terminada
      });
    }
  });

  collector.on('end', async () => {
    const disabled = msg.components.map(row => {
      const newRow = new ActionRowBuilder().addComponents(
        row.components.map(comp => {
          if (comp.data?.custom_id === 'shop_prev' || comp.data?.custom_id === 'shop_next') {
            return ButtonBuilder.from(comp).setDisabled(true);
          }
          if (comp.data?.custom_id === 'shop_select') {
            return StringSelectMenuBuilder.from(comp).setDisabled(true);
          }
          return comp;
        })
      );
      return newRow;
    });
    await msg.edit({ components: disabled }).catch(() => { });
  });
};
