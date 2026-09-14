// src/utils/permissions.js
// Centraliza verificación de permisos de staff/admin

module.exports = function createPermissionsUtils({ BOT_OWNER_ID, PermissionsBitField, MANAGE_ROLE, STAFF_ROLE_IDS }) {
  function hasPermission(member) {
    if (!member) return false;
    return (
      (Array.isArray(BOT_OWNER_ID) ? BOT_OWNER_ID.includes(member.id) : member.id === BOT_OWNER_ID) ||
      member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
      (Array.isArray(MANAGE_ROLE) && MANAGE_ROLE.some(roleId => member.roles?.cache?.has(roleId))) ||
      (Array.isArray(STAFF_ROLE_IDS) && STAFF_ROLE_IDS.some(roleId => member.roles?.cache?.has(roleId))) ||
      member.roles?.cache?.has('1489729736925249717') ||
      member.roles?.cache?.has('1490579398980538419')
    );
  }

  function hasStrictStaff(member) {
    if (!member) return false;
    return (Array.isArray(STAFF_ROLE_IDS) && STAFF_ROLE_IDS.some(roleId => member.roles?.cache?.has(roleId))) ||
      member.roles?.cache?.has('1489729736925249717') ||
      member.roles?.cache?.has('1490579398980538419');
  }

  return { hasPermission, hasStrictStaff };
};
