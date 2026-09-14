let createCanvas, loadImage, GlobalFonts;
try {
    ({ createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'));
} catch (e) {
    try {
        ({ createCanvas, loadImage } = require('canvas'));
        GlobalFonts = null;
    } catch (e2) {
        console.error('No se encontró ninguna librería de Canvas (canvas o @napi-rs/canvas)');
    }
}
const path = require('path');
const fs = require('fs');

// Register fonts
const fontPathCoolvetica = path.join(process.cwd(), 'coolvetica-rg.ttf');
if (fs.existsSync(fontPathCoolvetica) && GlobalFonts) {
    try { GlobalFonts.registerFromPath(fontPathCoolvetica, 'Coolvetica'); } catch (e) { }
}
const fontPathPricedown = path.join(process.cwd(), 'pricedown.otf');
if (fs.existsSync(fontPathPricedown) && GlobalFonts) {
    try { GlobalFonts.registerFromPath(fontPathPricedown, 'Pricedown'); } catch (e) { }
}

/**
 * Generates a dynamic prize card for the roulette.
 * @param {Object} data - { username, avatarUrl, prizeName, color }
 */
async function generatePrizeCard({ username, avatarUrl, prizeName, color = '#7289da' }) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Background (Gradient)
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#1a1a1a');
    bgGradient.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Decorative Border/Frame
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 3. Load Avatar
    try {
        let avatarImg;
        if (avatarUrl) {
            avatarImg = await loadImage(avatarUrl);
        } else {
            avatarImg = await loadImage('https://cdn.discordapp.com/embed/avatars/0.png');
        }

        // Draw Avatar (Circular)
        ctx.save();
        ctx.beginPath();
        ctx.arc(120, 200, 70, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, 50, 130, 140, 140);
        ctx.restore();

        // Avatar Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(120, 200, 72, 0, Math.PI * 2);
        ctx.stroke();
    } catch (e) {
        console.warn('Error loading avatar for roulette card:', e);
    }

    // 4. Content Area
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Username
    ctx.font = '32px Sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(username.toUpperCase(), 220, 140);

    // "HAS GANADO" text
    ctx.font = 'bold 24px Sans-serif';
    ctx.fillStyle = color;
    ctx.fillText('¡HAS GANADO!', 220, 180);

    // Prize Name (Main Focus)
    ctx.font = 'bold 40px Sans-serif'; 
    ctx.fillStyle = '#ff0000'; // Color rojo para el premio
    // Add shadow/glow to prize name
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 20;

    const maxWidth = 450; 
    const lineHeight = 45;
    let currentY = 240;

    // Lógica de wrap simple
    const words = prizeName.split(' ');
    let line = '';
    let lines = [];
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);

    // Si hay más de una línea, subimos un poco el inicio para que quede centrado verticalmente respecto a su posición original
    if (lines.length > 1) {
        currentY -= ((lines.length - 1) * lineHeight) / 2;
    }

    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i].trim(), 220, currentY + (i * lineHeight));
    }

    ctx.shadowBlur = 0; // Reset

    // 5. Footer Decoration
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('ROYAL RANKED', width / 2, height - 50);

    return canvas.toBuffer('image/png');
}

module.exports = { generatePrizeCard };
