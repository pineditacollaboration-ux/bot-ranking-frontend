const { AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
let createCanvas, loadImage, registerFont, Path2D;

try {
    ({ createCanvas, loadImage, registerFont, Path2D } = require('canvas'));
} catch (e) {
    try {
        ({ createCanvas, loadImage, registerFont, Path2D } = require('@napi-rs/canvas'));
    } catch (e2) {
        console.error('No se pudo cargar canvas ni @napi-rs/canvas');
    }
}

// Intentar registrar la fuente Coolvetica
try {
    const fontPath = path.join(__dirname, '../../coolvetica-rg.ttf');
    if (registerFont) {
        registerFont(fontPath, { family: 'Coolvetica' });
    }
} catch (e) {
    console.warn('No se pudo cargar la fuente Coolvetica, usando sans-serif por defecto.');
}

const loadImageWithTimeout = async (url, timeout = 3000) => {
    return new Promise((resolve, reject) => {
        // Verificar existencia de archivo local para evitar bloqueos
        if (typeof url === 'string' && !url.startsWith('http')) {
            try {
                if (!fs.existsSync(url)) {
                    console.warn(`[ImageLoad] Archivo local no encontrado: ${url}`);
                    return resolve(null);
                }
            } catch (e) {
                console.warn(`[ImageLoad] Error verificando archivo: ${e.message}`);
                return resolve(null);
            }
        }

        // Reducir timeout a 3s para fallar rápido
        const timer = setTimeout(() => reject(new Error(`Image load timeout for ${url}`)), timeout);

        loadImage(url).then(img => {
            clearTimeout(timer);
            resolve(img);
        }).catch(err => {
            clearTimeout(timer);
            // Fallo silencioso: resolver null en lugar de reject para no romper Promise.all
            console.warn(`Error cargando imagen ${url}:`, err.message);
            resolve(null);
        });
    });
};

// --- CONFIGURACIÓN ESTÉTICA (V50: APEX PREDATOR) ---
const THEME = {
    bg: '#000000',
    text: '#ffffff',
    accent: '#ff0055', // Apex Red/Pink
    secondary: '#00e5ff', // Cyber Cyan

    // Rank Colors
    ranks: {
        top1: '#ffd700', // Gold
        top2: '#e2e2e2', // Silver
        top3: '#cd7f32', // Bronze
        list: '#ffffff'
    },

    glass: 'rgba(255, 255, 255, 0.05)',
    glassBorder: 'rgba(255, 255, 255, 0.15)',
};

// --- UTILS ---
function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(255, 255, 255, ${alpha})`;
    let r = 0, g = 0, b = 0;
    if (hex.startsWith('#')) {
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function manualRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawHexagonPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = 2 * Math.PI / 6 * i;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

// --- ICONS ---
const ICONS = {
    crown: 'M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11h-14zm14 2H5v2h14v-2z'
};

// --- DRAWING FUNCTIONS ---

async function generateDailyLeaderboard(pointsRanking, winsRanking, bgImageSrc = null) {
    if (!createCanvas) {
        console.error('[Leaderboard] Canvas no está instalado o falló al cargar.');
        return null;
    }

    console.log('[Leaderboard] Generando imágenes de ranking diario...');

    const winsBgPath = path.join(__dirname, '../../rank/royalvictorias.png');
    const pointsBgPath = path.join(__dirname, '../../rank/royalpuntos.png');

    // Generar secuencialmente para evitar problemas de memoria/concurrencia con Canvas
    let winsImage = null;
    let pointsImage = null;

    try {
        winsImage = await drawApexRanking('VICTORIAS', winsRanking, 'wins', '#00e5ff', winsBgPath);
    } catch (e) {
        console.error('Error generando wins ranking:', e);
    }

    try {
        pointsImage = await drawApexRanking('PUNTOS', pointsRanking, 'pointsGained', '#bd00ff', pointsBgPath);
    } catch (e) {
        console.error('Error generando points ranking:', e);
    }

    // Si tenemos ambas imágenes, las unimos en una sola (lado a lado)
    if (winsImage && pointsImage) {
        try {
            console.log('[Leaderboard] Uniendo imágenes de victorias y puntos...');
            const winsImg = await loadImageWithTimeout(winsImage);
            const pointsImg = await loadImageWithTimeout(pointsImage);

            if (winsImg && pointsImg) {
                const combinedWidth = winsImg.width + pointsImg.width;
                const combinedHeight = Math.max(winsImg.height, pointsImg.height);

                const combinedCanvas = createCanvas(combinedWidth, combinedHeight);
                const combinedCtx = combinedCanvas.getContext('2d');

                // Dibujar wins a la izquierda
                combinedCtx.drawImage(winsImg, 0, 0);

                // Dibujar points a la derecha
                combinedCtx.drawImage(pointsImg, winsImg.width, 0);

                console.log('[Leaderboard] Imágenes unidas correctamente.');
                return [new AttachmentBuilder(combinedCanvas.toBuffer('image/png'), { name: 'combined_ranking.png' })];
            }
        } catch (mergeError) {
            console.error('[Leaderboard] Error al unir imágenes:', mergeError);
            // Si falla la unión, enviamos las imágenes por separado como fallback
        }
    }

    // Fallback: enviar imágenes separadas si no se pudieron unir o falta alguna
    const results = [];
    if (winsImage) results.push(new AttachmentBuilder(winsImage, { name: 'wins_ranking.png' }));
    if (pointsImage) results.push(new AttachmentBuilder(pointsImage, { name: 'points_ranking.png' }));

    console.log(`[Leaderboard] Imágenes generadas: ${results.length}`);
    return results;
}

function drawSVGIcon(ctx, pathString, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    const scale = size / 24; // Assuming 24x24 viewBox standard
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    const path = new Path2D(pathString);
    ctx.fill(path);
    ctx.restore();
}

async function drawApexRanking(title, data, statKey, accentColor, bgImageSrc) {
    if (!bgImageSrc) {
        console.error('[Leaderboard] No se proporcionó imagen de fondo');
        return null;
    }

    try {
        console.log(`[Leaderboard] Cargando fondo: ${bgImageSrc}`);
        const bgImage = await loadImageWithTimeout(bgImageSrc, 10000);

        if (!bgImage) {
            console.error('[Leaderboard] No se pudo cargar la imagen de fondo');
            return null;
        }

        // Usar las dimensiones ORIGINALES de la imagen (no forzar 1200x1600)
        const width = bgImage.width;
        const height = bgImage.height;

        console.log(`[Leaderboard] Dimensiones de imagen: ${width}x${height}`);

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. Dibujar la imagen de fondo TAL CUAL (sin redimensionar)
        ctx.drawImage(bgImage, 0, 0);

        // 2. Configuración de posicionamiento para Top 10
        // Calibrado para imágenes 819x1024 (resolución vertical estándar)
        // Las imágenes tienen dimensiones 819x1024

        // Posición inicial de la primera fila (después del header)
        // Valores en PIXELES para imagen de 819x1024
        const REF_WIDTH = 819;
        const REF_HEIGHT = 1024;
        const ROW_CENTERS = [
            160, 245, 330, 415, 500,
            585, 670, 755, 840, 925
        ];

        // Escalar posiciones según tamaño real de la imagen (para soporte multi-resolución)
        const scaleW = width / REF_WIDTH;
        const scaleH = height / REF_HEIGHT;
        const scaleAvg = (scaleW + scaleH) / 2;
        const SCALED_ROW_CENTERS = ROW_CENTERS.map(v => Math.round(v * scaleH));

        // Ajuste vertical global (sin necesidad de offset adicional para 819x1024)
        const VERTICAL_OFFSET_REF = 0;
        const scaledVerticalOffset = Math.round(VERTICAL_OFFSET_REF * scaleH);
        // const listStartY = 2295; // YA NO SE USA
        // const rowH = 265;        // YA NO SE USA
        // const gap = 100;         // YA NO SE USA

        // 3. Dibujar Top 10 jugadores
        for (let i = 0; i < 10; i++) {
            const player = data[i];

            // Usar centro Y exacto predefinido para esta fila
            // Si i >= 10 (por seguridad), extrapolamos
            const baseRankY = (i < SCALED_ROW_CENTERS.length) ? SCALED_ROW_CENTERS[i] : (SCALED_ROW_CENTERS[9] + (i - 9) * Math.round(380 * scaleH));
            const rankY = baseRankY + scaledVerticalOffset;

            // Posiciones X para cada columna (Centros detectados) - escaladas por ancho
            const rankX = Math.round(50 * scaleW);        // Centro del espacio TOP (números 1-10)
            const nameX = Math.round(400 * scaleW);       // Centro del espacio NOMBRE
            const scoreX = Math.round(750 * scaleW);      // Centro del espacio PUNTOS (derecha)

            // Corona DORADA para el Top 1 (FUERA DEL CUADRO)
            if (i === 0) {
                drawSVGIcon(ctx, ICONS.crown, rankX - Math.round(80 * scaleW), rankY - Math.round(20 * scaleH), Math.max(12, Math.round(40 * scaleAvg)), '#FFD700');
            }

            // Dibujar número de ranking (1-10) en la columna TOP
            drawGraffitiText(ctx, `${i + 1}`, rankX, rankY, Math.max(8, Math.round(32 * scaleAvg)), '#ffffff');

            if (player) {
                // Nombre del jugador EN MAYÚSCULAS
                let rawName = player.username || player.customName || player.displayName || 'Unknown';
                rawName = rawName.toUpperCase();

                // Ajustar tamaño de fuente si el nombre es muy largo
                const maxNameWidth = Math.max(150, Math.round(300 * scaleW));  // Ancho máximo para nombres
                const nameFontSize = getFittedFontSize(ctx, rawName, Math.max(8, Math.round(32 * scaleAvg)), maxNameWidth);

                // Alineación CENTRADA
                drawGraffitiText(ctx, rawName, nameX, rankY, nameFontSize, '#ffffff', 'center');

                // Puntos o victorias en la columna PUNTOS (Color BLANCO '#ffffff')
                let rawScore = (player[statKey] !== undefined && player[statKey] !== null) ? player[statKey] : 0;
                // Formatear con puntos (mil) para legibilidad: 318400 -> 318.400
                const scoreVal = Number(rawScore).toLocaleString('es-ES');

                // Ajustar tamaño para que quepa en la caja
                const maxScoreWidth = Math.max(40, Math.round(60 * scaleW));
                const scoreFontSize = getFittedFontSize(ctx, scoreVal, Math.max(8, Math.round(32 * scaleAvg)), maxScoreWidth);

                drawGraffitiText(ctx, scoreVal, scoreX, rankY, scoreFontSize, '#ffffff');
            } else {
                // Slot vacío
                drawGraffitiText(ctx, '---', nameX, rankY, Math.round(28 * scaleAvg), 'rgba(255,255,255,0.3)', 'left');
                drawGraffitiText(ctx, '-', scoreX, rankY, Math.round(28 * scaleAvg), 'rgba(255,255,255,0.3)');
            }
        }

        // Footer
        drawGraffitiText(ctx, 'Actualizado automáticamente', width / 2, height - Math.round(15 * scaleH) + scaledVerticalOffset, Math.max(8, Math.round(12 * scaleAvg)), 'rgba(255,255,255,0.6)');

        return canvas.toBuffer('image/png');
    } catch (error) {
        console.error('[Leaderboard] Error en drawApexRanking:', error);
        return null;
    }
}

function drawGraffitiText(ctx, text, x, y, size, color, align = 'center') {
    ctx.save();
    ctx.font = `900 ${size}px "Coolvetica", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    // Sombra profunda para efecto 3D (múltiples capas)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(text, x + 6, y + 6);
    ctx.fillText(text, x + 5, y + 5);
    ctx.fillText(text, x + 4, y + 4);

    // Contorno grueso negro para máximo contraste
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = size / 6; // Contorno más grueso
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);

    // Segundo contorno más fino para suavizar
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = size / 10;
    ctx.strokeText(text, x, y);

    // Color principal
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    // Brillo interno para efecto graffiti
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(text, x - 1, y - 1);

    ctx.restore();
}

function getFittedFontSize(ctx, text, initialSize, maxWidth) {
    let size = initialSize;
    ctx.font = `900 ${size}px "Coolvetica", sans-serif`;
    while (ctx.measureText(text).width > maxWidth && size > 20) {
        size -= 2;
        ctx.font = `900 ${size}px "Coolvetica", sans-serif`;
    }
    return size;
}

module.exports = { generateDailyLeaderboard, drawApexRanking };
