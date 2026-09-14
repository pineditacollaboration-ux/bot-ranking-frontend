const { createCanvas } = require('@napi-rs/canvas');

/**
 * Genera una gráfica de línea simple para mostrar la evolución de puntos.
 * @param {string} username - Nombre del jugador.
 * @param {number[]} dataPoints - Array de puntos (historial).
 * @param {string} color - Color de la línea y puntos (hex).
 * @returns {Promise<Buffer>} - Buffer de la imagen PNG.
 */
async function generateEloGraph(username, dataPoints, color = '#5865F2') {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fondo oscuro
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(0, 0, width, height);

    if (!dataPoints || dataPoints.length < 2) {
         ctx.fillStyle = '#ffffff';
         ctx.font = '30px sans-serif';
         ctx.textAlign = 'center';
         ctx.fillText('Insuficientes datos para generar gráfica', width / 2, height / 2);
         return canvas.toBuffer('image/png');
    }

    const padding = 60;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    const minVal = Math.min(...dataPoints);
    const maxVal = Math.max(...dataPoints);
    const range = maxVal - minVal || 100;

    // Líneas de cuadrícula (Grid)
    ctx.strokeStyle = '#40444b';
    ctx.lineWidth = 1;
    
    // 5 líneas horizontales
    for (let i = 0; i <= 4; i++) {
        const y = padding + (graphHeight * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();

        // Etiqueta de valor
        const val = maxVal - (range * i) / 4;
        ctx.fillStyle = '#b9bbbe';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(val), padding - 10, y + 5);
    }

    // Dibujar Línea de Datos
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const stepX = graphWidth / (dataPoints.length - 1);

    dataPoints.forEach((val, i) => {
        const x = padding + i * stepX;
        // Invertir Y (canvas 0 es arriba)
        const normalizedVal = (val - minVal) / range;
        const y = (height - padding) - (normalizedVal * graphHeight);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dibujar Puntos (Dots)
    ctx.fillStyle = color;
    dataPoints.forEach((val, i) => {
        const x = padding + i * stepX;
        const normalizedVal = (val - minVal) / range;
        const y = (height - padding) - (normalizedVal * graphHeight);
        
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        // Borde blanco al punto para resaltar
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    // Título
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Progreso de ELO: ${username}`, width / 2, 40);

    return canvas.toBuffer('image/png');
}

module.exports = { generateEloGraph };
