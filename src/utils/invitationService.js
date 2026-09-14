/**
 * src/utils/invitationService.js
 * Servicio de invitaciones para el sistema semanal
 */

const crypto = require('crypto');

function createInvitationService(Invitation, Player) {

  /**
   * Generar código único para un usuario
   */
  async function generateInvitationCode(userId) {
    try {
      // Verificar si ya tiene código activo y válido
      const existing = await Invitation.findOne({
        inviterId: userId,
        expiresAt: { $gt: new Date() }
      });

      if (existing) {
        return existing.code;
      }

      // Generar código único de 8 caracteres
      let code;
      let exists = true;
      while (exists) {
        code = crypto.randomBytes(4).toString('hex').toUpperCase();
        exists = await Invitation.findOne({ code });
      }

      // Crear nueva invitación
      const invitation = new Invitation({
        inviterId: userId,
        code,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      await invitation.save();

      return code;
    } catch (error) {
      console.error('[InvitationService] Error generating code:', error);
      return null;
    }
  }

  /**
   * Procesar cuando nuevo usuario usa código
   */
  async function useInvitationCode(newUserId, code) {
    try {
      const invitation = await Invitation.findOne({ code });

      if (!invitation) {
        return { success: false, error: 'Código inválido' };
      }

      // Validar expiración
      if (new Date() > invitation.expiresAt) {
        return { success: false, error: 'Código expirado' };
      }

      // Validar que no lo use dos veces
      if (invitation.usedBy.includes(newUserId)) {
        return { success: false, error: 'Ya usaste este código' };
      }

      // Agregar usuario a lista
      invitation.usedBy.push(newUserId);
      invitation.usedCount += 1;

      // Verificar si alcanzó 5 usuarios para reward
      if (invitation.usedCount === 5 && !invitation.rewardClaimed) {
        invitation.rewardClaimed = true;

        // Dar 5000 puntos al inviter
        await Player.findByIdAndUpdate(
          invitation.inviterId,
          { $inc: { 'currentSeason.points': 5000 } }
        );
      }

      await invitation.save();

      return {
        success: true,
        rewardGiven: invitation.rewardClaimed
      };
    } catch (error) {
      console.error('[InvitationService] Error using code:', error);
      return { success: false, error: 'Error procesando código' };
    }
  }

  /**
   * Obtener estadísticas de invitación del usuario
   */
  async function getInvitationStats(userId) {
    try {
      const invitation = await Invitation.findOne({
        inviterId: userId,
        expiresAt: { $gt: new Date() }
      });

      if (!invitation) {
        return null;
      }

      return {
        code: invitation.code,
        usedCount: invitation.usedCount,
        remaining: Math.max(0, 5 - invitation.usedCount),
        rewardClaimed: invitation.rewardClaimed,
        expiresAt: invitation.expiresAt
      };
    } catch (error) {
      console.error('[InvitationService] Error getting stats:', error);
      return null;
    }
  }

  return {
    generateInvitationCode,
    useInvitationCode,
    getInvitationStats
  };
}

module.exports = createInvitationService;
