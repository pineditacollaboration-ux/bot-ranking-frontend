const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

const KEEP_IDS = new Set([
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randCode(n = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function borrarServidor(message, args, ctx) {
  const { COLORS, BOT_OWNER_ID } = ctx;
  const guild = message.guild;
  if (!guild) return;

  const isOwner = Array.isArray(BOT_OWNER_ID)
    ? BOT_OWNER_ID.includes(message.author.id)
    : message.author.id === BOT_OWNER_ID;

  if (!isOwner) {
    return message.channel.send('🚫 **Solo el OWNER del bot puede usar este comando.**').catch(() => { });
  }

  if (!guild.members.me?.permissions?.has([
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ViewChannel,
  ])) {
    return message.channel.send('❌ El bot requiere el permiso `ManageChannels` para borrar canales.').catch(() => { });
  }

  await guild.channels.fetch().catch(() => {});
  const all = [...guild.channels.cache.values()];
  const deletable = all.filter(c => c.deletable && !KEEP_IDS.has(c.id));
  const categories = deletable.filter(c => c.type === ChannelType.GuildCategory);
  const texts = deletable.filter(c => c.type === ChannelType.GuildText);
  const voices = deletable.filter(c => c.type === ChannelType.GuildVoice);
  const others = deletable.filter(c =>
    c.type !== ChannelType.GuildCategory &&
    c.type !== ChannelType.GuildText &&
    c.type !== ChannelType.GuildVoice
  );

  if (deletable.length === 0) {
    return message.channel.send('ℹ️ No hay canales para borrar (o el bot no tiene permisos).').catch(() => { });
  }

  const code = randCode(6);

  const previewEmbed = new EmbedBuilder()
    .setTitle('☢️  COMANDO DESTRUCTIVO — CONFIRMACIÓN 1/2')
    .setColor(0xff0000)
    .setDescription(
      '**ESTE COMANDO BORRA TODO LO BORRABLE DEL SERVIDOR.**\n\n' +
      `• Categorías: **${categories.length}**\n` +
      `• Canales de texto: **${texts.length}**\n` +
      `• Canales de voz: **${voices.length}**\n` +
      `• Otros (anuncios, stages, foros, etc): **${others.length}**\n` +
      `• TOTAL A BORRAR: **${deletable.length}**\n` +
      (KEEP_IDS.size > 0 ? `• Protegidos en KEEP_IDS: **${KEEP_IDS.size}**\n` : '') +
      '\n🚨 **NO HAY VUELTA ATRÁS. UNA VEZ BORRADO NO SE RECUPERA NADA.**\n' +
      'Si estás 100% seguro tocá el botón rojo de abajo, y luego vas a tener que escribir un código.'
    )
    .setFooter({ text: 'Cancelación automática en 90 segundos.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('del_confirm').setLabel('☢️  ESTOY SEGURO — BORRAR TODO').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('del_cancel').setLabel('❌ CANCELAR').setStyle(ButtonStyle.Secondary),
  );

  const previewMsg = await message.channel.send({ embeds: [previewEmbed], components: [row] }).catch(() => null);
  if (!previewMsg) return;

  const collector = previewMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
    max: 1,
    filter: (btn) => btn.user.id === message.author.id,
  });

  collector.on('end', async (collected, reason) => {
    if (reason !== 'ok' && previewMsg?.editable) {
      try {
        await previewMsg.edit({
          components: [],
          embeds: [new EmbedBuilder(previewEmbed.data).setTitle('⏹️  CANCELADO / TIMEOUT').setColor(COLORS?.WARNING || 0xffff00).setDescription('No se borró nada.')],
        }).catch(() => {});
      } catch {}
    }
  });

  collector.on('collect', async (btn) => {
    await btn.deferUpdate().catch(() => {});
    if (btn.customId === 'del_cancel') {
      collector.stop('ok');
      try {
        await previewMsg.edit({
          components: [],
          embeds: [new EmbedBuilder(previewEmbed.data).setTitle('⏹️  CANCELADO').setColor(COLORS?.WARNING || 0xffff00).setDescription('No se borró nada.')],
        }).catch(() => {});
      } catch {}
      return;
    }

    if (btn.customId !== 'del_confirm') return;
    collector.stop('ok');

    const confirmEmbed = new EmbedBuilder()
      .setTitle('⚠️  CONFIRMACIÓN FINAL 2/2 — ESCRIBÍ EL CÓDIGO')
      .setColor(0xff3300)
      .setDescription(
        `**Última oportunidad.**\n\n` +
        `Copí y pegá (o escribí en MAYÚSCULAS) este código en el canal:\n\n` +
        `# **\`${code}\`**\n\n` +
        `Escribí **${code}** y lo envío. Si escribís cualquier otra cosa (o no escribís nada en 60s) se cancela.`
      )
      .setFooter({ text: 'Cancelación automática en 60 segundos.' });

    try {
      await previewMsg.edit({ components: [], embeds: [confirmEmbed] }).catch(() => {});
    } catch {}

    const msgCollector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === message.author.id,
      time: 60_000,
      max: 1,
    });

    msgCollector.on('end', async (msgs, rsn) => {
      if (rsn !== 'confirmed') {
        try {
          await previewMsg.edit({
            embeds: [new EmbedBuilder(confirmEmbed.data).setTitle('⏹️  CANCELADO / TIMEOUT').setColor(COLORS?.WARNING || 0xffff00).setDescription('No se borró nada.')],
          }).catch(() => {});
        } catch {}
      }
    });

    msgCollector.on('collect', async (msg) => {
      const typed = (msg.content || '').trim().toUpperCase();
      if (typed !== code) {
        msgCollector.stop('wrong');
        try { msg.delete().catch(() => {}); } catch {}
        try {
          await previewMsg.edit({
            embeds: [new EmbedBuilder(confirmEmbed.data).setTitle('❌ CÓDIGO INCORRECTO — CANCELADO').setColor(COLORS?.ERROR || 0xff0000).setDescription('No se borró nada. Volvé a correr `!borrarservidor` si querés reintentar.')],
          }).catch(() => {});
        } catch {}
        return;
      }

      msgCollector.stop('confirmed');
      try { msg.delete().catch(() => {}); } catch {}

      const runningEmbed = new EmbedBuilder()
        .setTitle('🔥 BORRANDO CANALES — NO CIERRES DISCORD')
        .setColor(0xff0000)
        .setDescription(`Progreso: **0 / ${deletable.length}**`);

      try {
        await previewMsg.edit({ embeds: [runningEmbed] }).catch(() => {});
      } catch {}

      let done = 0;
      let failed = 0;
      const failedNames = [];

      const byOrder = [
        ...deletable.filter(c => c.type !== ChannelType.GuildCategory),
        ...deletable.filter(c => c.type === ChannelType.GuildCategory),
      ];

      for (const ch of byOrder) {
        try {
          await ch.delete('!borrarservidor — owner confirmation').catch(() => {});
          done++;
          await sleep(80);
        } catch (e) {
          failed++;
          failedNames.push(`${ch.name} (id:${ch.id}) — ${e.message}`);
        }
        if (previewMsg?.editable && (done + failed) % 10 === 0) {
          try {
            runningEmbed.setDescription(`Progreso: **${done + failed} / ${deletable.length}**\n✅ Borrados: ${done}  ❌ Fallaron: ${failed}`);
            await previewMsg.edit({ embeds: [runningEmbed] }).catch(() => {});
          } catch {}
        }
      }

      const finalEmbed = new EmbedBuilder()
        .setTitle('🧹 BORRADO FINALIZADO')
        .setColor(done > 0 ? (COLORS?.SUCCESS || 0x00ff00) : (COLORS?.ERROR || 0xff0000))
        .setDescription(
          `✅ Borrados: **${done}**\n` +
          `❌ Fallaron: **${failed}**\n\n` +
          (failed > 0 ? `Fallaron:\n${failedNames.slice(0, 20).join('\n')}${failedNames.length > 20 ? `\n... y ${failedNames.length - 20} más.` : ''}` : '')
        )
        .setFooter({ text: `Terminado a las ${new Date().toLocaleString()}` });

      try {
        const sent = await message.channel.send({ embeds: [finalEmbed] }).catch(() => null);
        if (!sent) {
          await message.guild.channels.create({
            name: 'borrado-finalizado',
            type: ChannelType.GuildText,
            reason: '!borrarservidor canal de reporte',
          }).then(async (ch) => {
            await ch.send({ embeds: [finalEmbed] }).catch(() => {});
          }).catch(() => {});
        }
      } catch {}
      try {
        if (previewMsg?.deletable) await previewMsg.delete().catch(() => {});
      } catch {}
    });
  });
}

module.exports = borrarServidor;
