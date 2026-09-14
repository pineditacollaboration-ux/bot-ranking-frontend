const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');

/**
 * Genera una imagen del ranking diario sobre la imagen de fondo
 */
async function generateDailyRankingImage(type, rankingData, guild) {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  // Cargar imagen de fondo
  const bgPath = type === 'points' 
    ? path.join(__dirname, '../../imagenes wins y puntos/puntos.png')
    : path.join(__dirname, '../../imagenes wins y puntos/WINS.png');
  
  try {
    const bgImage = await loadImage(bgPath);
    ctx.drawImage(bgImage, 0, 0, 800, 600);
  } catch (error) {
    console.error('Error cargando imagen de fondo:', error);
    // Fondo negro si falla la carga
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 800, 600);
  }

  // Configurar texto
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'left';

  // Dibujar título (arriba de la imagen)
  const title = type === 'points' ? 'TOP 10 - PUNTOS DIARIOS' : 'TOP 10 - VICTORIAS DIARIAS';
  ctx.fillText(title, 50, 40);

  // Dibujar ranking (alineado con los cuadros de la imagen)
  // Coordenadas ajustadas para centrar en cuadros visibles
  ctx.font = 'bold 16px Arial';
  rankingData.forEach((player, index) => {
    const y = 275 + (index * 32); // Ajustado para cuadros horizontales más abajo
    const value = type === 'points' ? player.pointsGained : player.wins;
    
    // Número (primer cuadro)
    ctx.fillStyle = index < 3 ? '#FFD700' : '#ffffff';
    ctx.fillText(`${index + 1}`, 135, y);
    
    // Nombre (segundo cuadro)
    ctx.fillStyle = '#ffffff';
    let displayName = `ID: ${player.id.slice(0, 8)}`;
    if (guild) {
      const member = guild.members.cache.get(player.id);
      if (member) {
        displayName = member.displayName;
        // No truncar el nombre para que se vea completo
      }
    }
    ctx.fillText(displayName, 285, y);
    
    // Valor (tercer cuadro)
    ctx.fillStyle = '#00ff00';
    ctx.fillText(`${value}`, 600, y);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { generateDailyRankingImage };
