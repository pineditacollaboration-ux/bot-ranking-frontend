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

function savePermissions(permissions) {
  try {
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(permissions, null, 2));
  } catch (error) {
    console.error('Error saving permissions:', error);
  }
}

async function addpermisoRol(message, args, deps) {
  const { hasPermission, sendLog } = deps;

  // Roles autorizados que pueden usar este comando
  const AUTHORIZED_ROLE_IDS = [
    '1409311314148327595',
    '1407834282042593430',
    '1451685064961429666',
    '1421579084986847232',
    '1407168763953938532',
    '1400896089342742538',
    '1407166548271173653'
  ];

  // Verificar si el usuario tiene uno de los roles autorizados
  const hasAuthorizedRole = AUTHORIZED_ROLE_IDS.some(roleId => 
    message.member.roles?.cache?.has(roleId)
  );

  if (!hasAuthorizedRole) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Acceso Denegado')
      .setDescription('Solo los administradores pueden usar este comando.')
      .setTimestamp();
    return message.reply({ embeds: [embed] }).catch(() => {});
  }

  // Obtener el rol y el usuario
  const role = message.mentions.roles.first();
  const targetUser = message.mentions.users.first();

  if (!role) {
    return message.reply('❌ Debes mencionar un rol. Uso: `!addpermiso @rol @usuario`').catch(() => {});
  }

  if (!targetUser) {
    return message.reply('❌ Debes mencionar un usuario. Uso: `!addpermiso @rol @usuario`').catch(() => {});
  }

  // Cargar permisos
  const permissions = loadPermissions();

  // Crear estructura si no existe
  if (!permissions[targetUser.id]) {
    permissions[targetUser.id] = {
      userId: targetUser.id,
      username: targetUser.username,
      roles: [],
      grantedAt: new Date().toISOString(),
      grantedBy: message.author.id
    };
  }

  // Agregar el rol si no está ya
  if (!permissions[targetUser.id].roles.includes(role.id)) {
    permissions[targetUser.id].roles.push(role.id);
  }

  // Guardar permisos
  savePermissions(permissions);

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('✅ Permiso Otorgado')
    .setDescription(`**Usuario:** <@${targetUser.id}> (${targetUser.username})\n**Rol:** <@&${role.id}> (${role.name})\n\nAhora puede usar \`!addrolcall @${role.name} @usuario\` para asignar ese rol.`)
    .setTimestamp();

  message.reply({ embeds: [embed] }).catch(() => {});

  // Log
  if (sendLog) {
    const logEmbed = new EmbedBuilder()
      .setTitle('✅ Permiso de Rol Otorgado')
      .setDescription(`**Usuario:** <@${targetUser.id}>\n**Rol:** <@&${role.id}>\n**Otorgado por:** <@${message.author.id}>`)
      .setColor('#00FF00')
      .setTimestamp();
    sendLog(message.guild, logEmbed, [], 'admin');
  }
}

module.exports = addpermisoRol;
