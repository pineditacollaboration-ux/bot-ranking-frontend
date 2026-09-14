const { EmbedBuilder } = require('discord.js');

// Beneficios por tipo de rol
const ROLE_BENEFITS = {
  'inabalavel': {
    title: '🔱 INABALÁVEL - Beneficios Desbloqueados',
    benefits: `**BENEFICIOS:**
✅ PRIORIDAD EN EVENTOS
✅ ATENCIÓN PRIORITARIA
✅ DERECHO A 3 GIROS DE RULETA
✅ ROL DESTACADO @INABALÁVEL
✅ ACCESO AL COMANDO DE FILAS
✅ RECIBE 3 ROYAL COINS

✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)
✅ DERECHO AL ROL @PASE LIBRE
✅ DERECHO AL ROL @SPIDER
✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)

**BONUS:**
💰 5.000 PUNTOS
⚡ PUNTOS X2 - 2 USOS (1H)
🛡️ PROTECCIÓN DE PUNTOS - 2 USOS (1H)`,
    rewards: {
      points: 5000,
      styleCoins: 3,
      spins: 3,
      x2Hours: 2,
      proteccionHours: 2
    },
    donationRights: {
      bigBoss: 1,
      paseLibre: 1,
      spider: 1
    },
    roleId: '1500592040306806824'
  },
  'espanca_xota': {
    title: '👑 ESPANCA XOTA - Beneficios Desbloqueados',
    benefits: `**BENEFICIOS:**
✅ PRIORIDAD EN EVENTOS
✅ ATENCIÓN PRIORITARIA
✅ DERECHO A 8 GIROS DE RULETA
✅ ROL DESTACADO @ESPANCA XOTA
✅ ACCESO AL COMANDO DE FILAS
✅ RECIBE 13 ROYAL COINS

✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)
✅ DERECHO AL ROL @PASE LIBRE
✅ DERECHO AL ROL @God Ranked
✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)

**BONUS:**
💰 30.000 PUNTOS
⚡ PUNTOS X2 - 10 USOS (1H)
🛡️ PROTECCIÓN DE PUNTOS - 10 USOS (1H)`,
    rewards: {
      points: 30000,
      styleCoins: 13,
      spins: 8,
      x2Hours: 10,
      proteccionHours: 10
    },
    donationRights: {
      bigBoss: 1,
      paseLibre: 1,
      godRanked: 1
    },
    roleId: '1500596344073752668'
  },
  'maceta_ruim': {
    title: '🪴 MACETA RUIM - Beneficios Desbloqueados',
    benefits: `**BENEFICIOS:**
✅ PRIORIDAD EN EVENTOS
✅ ATENCIÓN PRIORITARIA
✅ DERECHO A 6 GIROS DE RULETA
✅ ROL DESTACADO @MACETA RUIM
✅ ACCESO AL COMANDO DE FILAS
✅ RECIBE 10 ROYAL COINS

✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)
✅ DERECHO AL ROL @PASE LIBRE
✅ DERECHO AL ROL @Deus Da Ranqueada
✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)

**BONUS:**
💰 20.000 PUNTOS
⚡ PUNTOS X2 - 5 USOS (1H)
🛡️ PROTECCIÓN DE PUNTOS - 5 USOS (1H)`,
    rewards: {
      points: 20000,
      styleCoins: 10,
      spins: 6,
      x2Hours: 5,
      proteccionHours: 5
    },
    donationRights: {
      bigBoss: 1,
      paseLibre: 1,
      deusDaRanqueada: 1
    },
    roleId: '1500595809987854537'
  },
  'magnata': {
    title: '🎩 MAGNATA - Beneficios Desbloqueados',
    benefits: `**BENEFICIOS:**
✅ PRIORIDAD EN EVENTOS
✅ ATENCIÓN PRIORITARIA
✅ DERECHO A 5 GIROS DE RULETA
✅ ROL DESTACADO @MAGNATA
✅ ACCESO AL COMANDO DE FILAS
✅ RECIBE 8 ROYAL COINS

✅ PERMISO PARA DAR UN ROL @Big Boss (VISUAL)
✅ DERECHO AL ROL @PASE LIBRE
✅ DERECHO AL ROL @SPIDER
✅ DERECHO AL ROL @🚀 (MOVER Y MUTED)

**BONUS:**
💰 10.000 PUNTOS
⚡ PUNTOS X2 - 3 USOS (1H)
🛡️ PROTECCIÓN DE PUNTOS - 3 USOS (1H)`,
    rewards: {
      points: 10000,
      styleCoins: 8,
      spins: 5,
      x2Hours: 3,
      proteccionHours: 3
    },
    donationRights: {
      bigBoss: 1,
      paseLibre: 1,
      spider: 1
    },
    roleId: '1500589829308813454'
  },
  'puntos_x2': {
    title: '⚡ PUNTOS X2 ACTIVADOS',
    benefits: `**RECOMPENSA:**
✅ PUNTOS X2 - 3 USOS (1H)
(Los usos se aplican automáticamente en tus próximas partidas)`,
    rewards: {
      x2Hours: 3
    }
  },
  'proteccion': {
    title: '🛡️ PROTECCIÓN DE PUNTOS ACTIVADA',
    benefits: `**RECOMPENSA:**
✅ PROTECCIÓN DE PUNTOS - 3 USOS (1H)
(Los usos se aplican automáticamente en tus próximas partidas)`,
    rewards: {
      proteccionHours: 3
    }
  }
};

module.exports = async function reclamartiendaCommand(message, ctx) {
  const {
    VipKey,
    COLORS,
    Player,
    sendLog,
    config
  } = ctx;
  const EMOJIS = config?.emojis || {};

  // Verificar canal de reivindicación (roles-tienda)
  const CLAIM_CHANNEL_ID = '1464424983269740809'; // Canal de roles-tienda VIP

  const STREAMER_CATEGORY_ID = '1473558364289241253';
  const isInStreamerCategory = message.channel.parentId === STREAMER_CATEGORY_ID;

  if (message.channel.id !== CLAIM_CHANNEL_ID && !isInStreamerCategory) {
    // [DM DESACTIVADO] Aviso de canal correcto para !reclamartienda
    // try {
    //   await message.author.send(`${EMOJIS.warning || '⚠️'} El comando \`!reclamartienda\` solo se puede usar en el canal <#${CLAIM_CHANNEL_ID}>.`);
    // } catch (e) {
    //   console.warn(`No se pudo enviar DM a ${message.author.tag} sobre el canal de reclamar tienda.`);
    // }
    return;
  }

  // Obtener la key del comando
  const args = message.content.split(/\s+/).slice(1) || [];
  const key = args[0];

  if (!key) {
    await message.reply({
      content: `${EMOJIS.error || '❌'} Debes proporcionar una key. Uso: \`!reclamartienda <key>\``,
      ephemeral: false
    }).catch(() => { });
    return;
  }

  try {
    const keyToSearch = (key || '').trim();
    // Buscar la key (insensible a mayúsculas/minúsculas)
    const vipKeyDoc = await VipKey.findOne({ 
        key: { $regex: new RegExp(`^${keyToSearch}$`, 'i') } 
    }).catch(() => null);

    if (!vipKeyDoc) {
      console.log(`[Shop] Intento fallido de canje en tienda. Key no encontrada: "${keyToSearch}"`);
      await message.reply({
        content: `${EMOJIS.error || '❌'} La key no existe o es inválida.`,
        ephemeral: true
      }).catch(() => { });
      return;
    }

    // Verificar si ya fue canjeada
    if (vipKeyDoc.status === 'redeemed') {
      await message.reply({
        content: `${EMOJIS.error || '❌'} Esta key ya ha sido canjeada.`,
        ephemeral: true
      }).catch(() => { });
      return;
    }

    // Verificar si la key está restringida a este usuario
    if (vipKeyDoc.restrictedTo && vipKeyDoc.restrictedTo !== message.author.id) {
      await message.reply({
        content: `${EMOJIS.error || '❌'} Esta key no está autorizada para ti.`,
        ephemeral: true
      }).catch(() => { });
      return;
    }

    // Marcar la key como canjeada
    vipKeyDoc.status = 'redeemed';
    vipKeyDoc.redeemedBy = message.author.id;
    vipKeyDoc.redeemedAt = new Date();
    await vipKeyDoc.save();

    // Obtener el rol a asignar basado en el tipo
    const roleMap = {
      'espanca_xota': '1500596344073752668',
      'maceta_ruim': '1500595809987854537',
      'magnata': '1500589829308813454',
      'inabalavel': '1500592040306806824'
    };

    const roleId = roleMap[vipKeyDoc.type.toLowerCase()];

    // Asignar el rol al usuario (solo si existe)
    if (roleId) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member) {
        await member.roles.add(roleId).catch((e) => {
          console.warn('Error asignando rol:', e.message);
        });
      }
    }

    // Obtener los rewards del rol
    const roleBenefit = ROLE_BENEFITS[vipKeyDoc.type.toLowerCase()];
    const rewards = roleBenefit?.rewards || {};
    const donationRights = roleBenefit?.donationRights || {};

    // Otorgar todos los premios automáticamente
    if (Player) {
      try {
        const incObj = {};

        // Agregar puntos a currentSeason
        if (rewards.points) {
          incObj['currentSeason.points'] = rewards.points;
        }

        // Agregar royal coins

        if (rewards.styleCoins) {
          incObj.styleCoins = rewards.styleCoins;
        }

        // Agregar giros de ruleta
        if (rewards.spins) {
          incObj.spins = rewards.spins;
        }

        // Agregar créditos a la cartera (X2)
        if (rewards.x2Hours) {
          incObj.x2_credit_ms = rewards.x2Hours * 3600000;
        }

        // Agregar créditos a la cartera (Protección)
        if (rewards.proteccionHours) {
          incObj.proteccion_credit_ms = rewards.proteccionHours * 3600000;
        }

        // Agregar derechos de donación a la cartera
        for (const [right, count] of Object.entries(donationRights)) {
          if (count > 0) {
            incObj[`donationRights.${right}`] = count;
          }
        }

        if (Object.keys(incObj).length > 0) {
          const updateData = { $inc: incObj };

          await Player.findByIdAndUpdate(
            message.author.id,
            updateData,
            { new: true }
          ).catch((e) => {
            console.warn('Error actualizando premios:', e.message);
          });
        }
      } catch (e) {
        console.warn('Error otorgando premios:', e.message);
      }
    }

    // Respuesta de éxito
    const successEmbed = new EmbedBuilder()
      .setTitle(roleBenefit?.title || `${EMOJIS.success || '✅'} Ítem Canjeado Exitosamente`)
      .setDescription(roleBenefit?.benefits || `¡Felicidades! Has canjeado tu key exitosamente.\n\nTipo: **${vipKeyDoc.type.toUpperCase()}**`)
      .setColor(COLORS.SUCCESS || '#00ff00')
      .setTimestamp();

    await message.reply({
      embeds: [successEmbed],
      ephemeral: true
    }).catch(() => { });

    const logEmbed = new EmbedBuilder()
      .setTitle('🔑 Key Canjeada')
      .setDescription(`**Usuario:** <@${message.author.id}>\n**Tipo:** ${vipKeyDoc.type.toUpperCase()}\n**Key:** \`${key}\``)
      .setColor(COLORS.PRIMARY || '#0099ff')
      .setTimestamp();
    if (typeof sendLog === 'function') {
      sendLog(message.guild, logEmbed, [], 'shop');
    }

  } catch (e) {
    console.error('Error en comando reclamartienda:', e);
    await message.reply({
      content: `${EMOJIS.error || '❌'} Ocurrió un error al procesar tu key. Por favor contacta a un administrador.`,
      ephemeral: true
    }).catch(() => { });
  }
};
