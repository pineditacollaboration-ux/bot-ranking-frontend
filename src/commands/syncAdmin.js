const config = require('../../config.json');
/**
 * Sincronización de apodos para todos los miembros.
 * Replica la lógica del bloque inline `syncnicks` de index.js
 */

function syncNicks(message, args, { hasPermission, nicknameUpdateQueue, updateNicknamesEfficiently }) {
    const AUTHORIZED_ROLES = [
      ...(config?.manageRole || []),
      ...(config?.staffRoleId || []),
      "1484375565975617595", // Admin (fallback)
      "1484375565975617594", // Moderador (fallback)
    ];
    const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles?.cache?.has(roleId));
    if (!hasRole) {
        return message.channel.send('🚫 Solo el staff puede usar este comando.');
    }

    // Enviar mensaje de confirmación y usarlo para la interacción.
    return message.channel
        .send('⚙️ Iniciando sincronización completa de apodos... Esto puede tardar varios minutos.')
        .then((reply) => {
            const interactionMock = {
                editReply: (opts) => reply.edit(opts),
                followUp: (opts) => message.channel.send(opts),
            };

            // Añadir la sincronización a la cola de tareas para asegurar que solo una se ejecute a la vez.
            nicknameUpdateQueue.add(async () => {
                await updateNicknamesEfficiently(message.guild, interactionMock, true).catch((err) =>
                    reply
                        .edit(`❌ Ocurrió un error durante la sincronización: ${err.message}`)
                        .catch((e) => console.warn('No se pudo editar respuesta de syncnicks:', e.message))
                );
            });
        });
}

module.exports = { syncNicks };