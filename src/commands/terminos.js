const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors } = require('discord.js');

module.exports = async function terminosCommand(message, args, deps) {
  const { hasPermission, config } = deps;
  console.log(`[CMD Terminos] Ejecutado por ${message.author.id} en canal ${message.channel.id} (Parent: ${message.channel.parentId})`);

  // Verificar roles de staff/manager
  const isStaff = hasPermission ? hasPermission(message.member) : false;

  if (!isStaff) {
    return message.reply({ content: '⛔ No tienes los roles necesarios (Manager/Staff) para ejecutar este comando.', allowedMentions: { repliedUser: false } })
      .then(m => setTimeout(() => m.delete().catch(() => { }), 5000));
  }

  const allowedCategory = '1489717335152394392';

  // Verificar categoría
  let channel = message.channel;
  let categoryId = channel.parentId;

  // Manejar hilos
  if (channel.isThread()) {
    if (channel.parent) {
      categoryId = channel.parent.parentId;
    }
  }

  if (categoryId !== allowedCategory) {
    console.log(`[CMD Terminos] Fallo de categoría. Esperada: ${allowedCategory}, Recibida: ${categoryId}`);
    return message.reply({ content: `❌ Este comando solo se puede usar en canales dentro de la categoría permitida (ID: ${allowedCategory}).`, allowedMentions: { repliedUser: false } }).then(m => setTimeout(() => m.delete().catch(() => { }), 10000));
  }

  const EMOJIS = config?.emojis || {};
  const embed = new EmbedBuilder()
    .setTitle('📜 TÉRMINOS Y CONDICIONES')
    .setDescription('Por favor revisa los terminos de compra en el canal <#1489717493651214590> y si estas de acuerdo con lo dicho, pulsa el boton "ACEPTO TERMINOS" y se te indicara lo demás')
    .setColor(Colors.Blue)
    .setThumbnail(message.guild.iconURL({ dynamic: true, size: 512 }))
    .setImage('https://cdn.discordapp.com/attachments/1489717601419530260/1490777448164495492/f89533e3-2661-4012-a574-aa8995ae7b01.png?ex=69d54a30&is=69d3f8b0&hm=19e1edb616547cca986d408ac84ae81054ab76cde89f87d7f5b293faddf0065d&')
    .setFooter({ text: 'ROYAL RANKED', iconURL: message.guild.iconURL({ dynamic: true }) })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('acepto_terminos')
      .setLabel('ACEPTO TERMINOS')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(EMOJIS.success || '✅')
  );

  await message.channel.send({
    embeds: [embed],
    components: [row]
  });

  // Borrar el mensaje del comando original para limpieza
  message.delete().catch(() => { });
};
