// src/constants/shop.js
// Construye los items de la tienda usando config dinámica

module.exports = function buildShopItems(config) {
  return {
    'nitro_3m': { name: "Discord Nitro 3 Meses ( Aplica Termino Y Condiciones )", price: 2500, emoji: "🎮", description: "3 meses de suscripción a Discord Nitro.", manual: true },
    'nitro_1m': { name: "Discord Nitro 1 Mes", price: 1500, emoji: "🎮", description: "1 mes de suscripción a Discord Nitro.", manual: true },
    'diamantes_512': { name: "Diamantes 512", price: 1200, emoji: "💎", description: "Paquete de 512 diamantes para el juego.", manual: true },
    'diamantes_300': { name: "Diamantes 300", price: 800, emoji: "💎", description: "Paquete de 300 diamantes para el juego.", manual: true },
    'diamantes_100': { name: "Diamantes 100", price: 500, emoji: "💎", description: "Paquete de 100 diamantes para el juego.", manual: true },
    'rol_espanca_xota': { name: "Rol ESPANCA XOTA ( CON BENEFICIOS )", price: 1000, emoji: "👑", description: "Obtén el exclusivo rol ESPANCA XOTA.", roleId: "1500596344073752668" },
    'rol_maceta_ruim': { name: "Rol MACETA RUIM ( CON BENEFICIOS )", price: 800, emoji: "🪴", description: "Obtén el exclusivo rol MACETA RUIM.", roleId: "1500595809987854537" },
    'rol_personalizado': { name: "Rol Personalizado", price: 750, emoji: "❔", description: "Crea tu propio rol con nombre y color. (Contactar a Staff tras comprar)", manual: true },
    'giros_ruleta_5': { name: "Giros Ruleta 5", price: 500, emoji: "🎰", description: "Obtén 5 giros para la ruleta de premios.", spins: 5 },
    'call_privada': { name: "Call Privada", price: 500, emoji: "📞", description: "Un canal de voz y texto privado para ti y tus amigos. (Contactar a Staff tras comprar)", manual: true },
    'rol_2v2': { name: "Rol 2v2", price: 450, emoji: "⚔️", description: "Acceso a las filas y torneos 2v2.", roleId: Array.isArray(config.role2v2) ? config.role2v2[0] : config.role2v2 },
    'rol_1v1': { name: "Rol 1v1", price: 400, emoji: "🤺", description: "Acceso a las filas y torneos 1v1.", roleId: Array.isArray(config.role1v1) ? config.role1v1[0] : config.role1v1 },
    'rol_magnata': { name: "Rol MAGNATA ( CON BENEFICIOS )", price: 350, emoji: "🎩", description: "Adquiere el exclusivo Rol MAGNATA.", roleId: "1500589829308813454" },
    'rol_inabalavel': { name: "Rol INABALÁVEL ( CON BENEFICIOS )", price: 350, emoji: "🔱", description: "Conviértete en un INABALÁVEL del servidor.", roleId: "1500592040306806824" },
    'rol_mute': { name: "Rol Mute", price: 250, emoji: "🔇", description: "Ilumina el chat con el Rol Mute.", roleId: "1489754585143705631" },
    'puntos_x2': { name: "PUNTOS X2 - 3 USOS (1H)", price: 200, emoji: "⚡", description: "Gana el doble de puntos por 1 hora por cada uso (3 usos).", manual: true },
    'proteccion_puntos': { name: "PROTECCIÓN DE PUNTOS - 3 USOS (1H)", price: 100, emoji: "🛡️", description: "No pierdes puntos por 1 hora por cada uso (3 usos).", manual: true },
  };
};