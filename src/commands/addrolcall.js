const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PERMISSIONS_FILE = path.join(__dirname, '../../role_permissions.json');

function loadPermissions() {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading permissions:', error);
  }
  return {};
}

async function addrolcall(message, args, deps) {
  const { sendLog, client } = deps;

  // Verificar si el usuario tiene permisos
  const permissions = loadPermissions();
  const userPermissions = permissions[message.author.id];

  if (!userPermissions || !userPermissions.roles || userPermissions.roles.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Sin Permisos')
      .setDescription('No tienes permisos para usar este comando. Pide a un administrador que use `!addpermiso @rol @tu_usuario`')
      .setTimestamp();
    return message.reply({ embeds: [embed] }).catch(() => {});
  }

  // Obtener el rol
  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply('❌ Debes mencionar un rol. Uso: `!addrolcall @rol @usuario1 @usuario2 ...`').catch(() => {});
  }

  // Verificar que el usuario tiene permisos para este rol específico
  if (!userPermissions.roles.includes(role.id)) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Permiso Denegado para este Rol')
      .setDescription(`No tienes permiso para asignar el rol <@&${role.id}>. Solo puedes asignar los roles que te fueron otorgados.`)
      .setTimestamp();
    return message.reply({ embeds: [embed] }).catch(() => {});
  }

  // Obtener todos los usuarios mencionados (excepto el primer mencionar que es el rol)
  const targetUsers = [];
  
  // Recolectar todas las menciones de usuarios del mensaje
  message.mentions.users.forEach(user => {
    if (user.id !== role.id) { // Evitar contar el rol como usuario
      targetUsers.push(user);
    }
  });

  if (targetUsers.length === 0) {
    return message.reply('❌ Debes mencionar al menos un usuario. Uso: `!addrolcall @rol @usuario1 @usuario2 ...`').catch(() => {});
  }

  const successList = [];
  const errorList = [];

  // Asignar el rol a cada usuario
  for (const user of targetUsers) {
    try {
      const member = await message.guild.members.fetch(user.id);
      
      if (member.roles.cache.has(role.id)) {
        errorList.push(`${user.username} - Ya tiene el rol`);
      } else {
        await member.roles.add(role.id);
        successList.push(`${user.username}`);
      }
    } catch (error) {
      console.error(`Error adding role to ${user.username}:`, error);
      errorList.push(`${user.username} - Error al asignar`);
    }
  }

  // Crear embed de resultado
  const embed = new EmbedBuilder()
    .setColor(errorList.length === 0 ? '#00FF00' : '#FFFF00')
    .setTitle(errorList.length === 0 ? '✅ Rol Asignado' : '⚠️ Asignación Parcial')
    .setDescription(`**Rol:** <@&${role.id}> (${role.name})\n\n`)
    .setTimestamp();

  if (successList.length > 0) {
    embed.addFields({
      name: '✅ Asignados con éxito',
      value: successList.map(name => `• ${name}`).join('\n'),
      inline: false
    });
  }

  if (errorList.length > 0) {
    embed.addFields({
      name: '❌ Errores',
      value: errorList.map(name => `• ${name}`).join('\n'),
      inline: false
    });
  }

  message.reply({ embeds: [embed] }).catch(() => {});

  // Log
  if (sendLog) {
    const successMsg = successList.length > 0 ? `\n✅ Asignados: ${successList.join(', ')}` : '';
    const errorMsg = errorList.length > 0 ? `\n❌ Errores: ${errorList.join(', ')}` : '';
    sendLog(`📋 **Rol Asignado por ${message.author.username}**\nRol: <@&${role.id}>${successMsg}${errorMsg}`);
  }
}

module.exports = addrolcall;
