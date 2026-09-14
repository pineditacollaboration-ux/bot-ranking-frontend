const GIFEncoder = require('gif-encoder-2');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');

const PRIZE_EMOJI_URLS = {
    "0": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f504.png",
    "1": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4b8.png",
    "2": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4b0.png",
    "3": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4de.png",
    "4": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f680.png",
    "5": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f31f.png",
    "6": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6e1.png",
    "7": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f525.png",
    "8": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3c6.png",
    "9": "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f451.png"
};

const PREMIUM_COLORS = {
    dark: '#1a0000',
    darkAlt: '#330000',
    gold: '#ff0000',
    goldLight: '#ff6666',
    crimson: '#cc0000',
    crimsonDark: '#990000',
    accent: '#ff3333'
};

let emojiCache = {};
let royalLogo = null;

async function loadRoyalLogo() {
    if (!royalLogo) {
        try {
            royalLogo = await loadImage('./imagenes wins y puntos/royal.png');
        } catch (e) {
            console.error('Error loading royal.png:', e);
        }
    }
}

async function loadEmojiImages() {
    for (const [id, url] of Object.entries(PRIZE_EMOJI_URLS)) {
        if (!emojiCache[id]) {
            try {
                const response = await Promise.race([
                    axios.get(url, { responseType: 'arraybuffer' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Emoji loading timeout')), 10000))
                ]);
                emojiCache[id] = await loadImage(Buffer.from(response.data));
            } catch (e) {
                console.error(`Error loading emoji ${id}:`, e);
            }
        }
    }
}

function adjustColor(hex, amount) {
    const value = parseInt(hex.replace('#', ''), 16);
    let r = (value >> 16) + amount;
    let g = ((value >> 8) & 0xff) + amount;
    let b = (value & 0xff) + amount;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

async function generateRouletteGif(prizes, winningIndex) {
    await loadEmojiImages();
    await loadRoyalLogo();

    const size = 760;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 330;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    const encoder = new GIFEncoder(size, size);
    encoder.setDelay(33);
    encoder.setRepeat(-1);
    encoder.start();

    const numPrizes = prizes.length;
    const segmentAngle = (2 * Math.PI) / numPrizes;

    const segmentCenterAngle = winningIndex * segmentAngle + (segmentAngle / 2) - Math.PI / 2;
    const rotationNeeded = (3 * Math.PI / 2) - segmentCenterAngle;
    const totalRotation = rotationNeeded + (2 * Math.PI * 6);

    const numFrames = 180;
    const particleCount = 12;
    const particleOffsets = Array.from({ length: particleCount }, (_, index) => {
        const angle = (index / particleCount) * Math.PI * 2;
        return {
            angle,
            radius: radius * 1.25 + 24,
            size: 4 + (index % 3) * 2,
            color: index % 2 === 0 ? 'rgba(255, 215, 130, 0.75)' : 'rgba(255, 255, 255, 0.6)'
        };
    });

    for (let frame = 0; frame < numFrames; frame++) {
        const progress = frame / (numFrames - 1);
        let easedProgress;
        if (progress < 0.2) {
            easedProgress = Math.pow(progress / 0.2, 1.7) * 0.2;
        } else {
            const remaining = (progress - 0.2) / 0.8;
            easedProgress = 0.2 + Math.pow(remaining, 3) * 0.8;
        }
        const currentRotation = totalRotation * easedProgress;

        ctx.clearRect(0, 0, size, size);

        const bgGradient = ctx.createLinearGradient(0, 0, size, size);
        bgGradient.addColorStop(0, PREMIUM_COLORS.dark);
        bgGradient.addColorStop(0.35, PREMIUM_COLORS.darkAlt);
        bgGradient.addColorStop(1, PREMIUM_COLORS.dark);
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, size, size);

        const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.3);
        glow.addColorStop(0, 'rgba(255, 215, 130, 0.16)');
        glow.addColorStop(0.35, 'rgba(209, 31, 47, 0.08)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 1.25, 0, 2 * Math.PI);
        ctx.fill();

        ctx.save();
        for (const particle of particleOffsets) {
            const offset = particle.angle + frame * 0.025;
            const px = centerX + Math.cos(offset) * particle.radius;
            const py = centerY + Math.sin(offset) * particle.radius;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(px, py, particle.size * (0.8 + 0.2 * Math.sin(frame * 0.15 + particle.angle)), 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(currentRotation);

        ctx.save();
        ctx.strokeStyle = '#311210';
        ctx.lineWidth = 26;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 18, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();

        for (let i = 0; i < numPrizes; i++) {
            const startAngle = i * segmentAngle - Math.PI / 2;
            const endAngle = startAngle + segmentAngle;
            const baseColor = i % 2 === 0 ? PREMIUM_COLORS.crimson : PREMIUM_COLORS.crimsonDark;

            const segmentGradient = ctx.createRadialGradient(0, 0, radius * 0.16, 0, 0, radius);
            segmentGradient.addColorStop(0, adjustColor(baseColor, 18));
            segmentGradient.addColorStop(0.65, baseColor);
            segmentGradient.addColorStop(1, adjustColor(baseColor, -22));

            ctx.fillStyle = segmentGradient;
            ctx.strokeStyle = '#220306';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(startAngle) * (radius - 16), Math.sin(startAngle) * (radius - 16));
            ctx.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
            ctx.stroke();

            ctx.save();
            let displayName = prizes[i].name.toUpperCase();
            if (displayName.length > 18) {
                displayName = displayName.substring(0, 18) + '...';
            }
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const textRadius = radius * 0.82;
            const textAngle = startAngle + segmentAngle / 2;
            const textX = Math.cos(textAngle) * textRadius;
            const textY = Math.sin(textAngle) * textRadius;
            ctx.translate(textX, textY);
            ctx.rotate(textAngle + Math.PI / 2);

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText(displayName, 0, 0);
            ctx.fillText(displayName, 0, 0);
            ctx.restore();
        }

        const centerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 110);
        centerGradient.addColorStop(0, PREMIUM_COLORS.goldLight);
        centerGradient.addColorStop(0.45, PREMIUM_COLORS.gold);
        centerGradient.addColorStop(1, PREMIUM_COLORS.accent);
        ctx.fillStyle = centerGradient;
        ctx.beginPath();
        ctx.arc(0, 0, 110, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.stroke();

        ctx.strokeStyle = PREMIUM_COLORS.crimsonDark;
        ctx.lineWidth = 4;
        ctx.stroke();

        if (royalLogo) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, 75, 0, 2 * Math.PI);
            ctx.clip();
            ctx.drawImage(royalLogo, -75, -75, 150, 150);
            ctx.restore();
        }

        ctx.restore();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.fillStyle = PREMIUM_COLORS.gold;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 50);
        ctx.lineTo(-48, -44);
        ctx.lineTo(48, -44);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
}

async function generateRouletteStaticImage(prizes, winningIndex) {
    await loadEmojiImages();
    await loadRoyalLogo();

    const size = 760;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 330;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    const numPrizes = prizes.length;
    const segmentAngle = (2 * Math.PI) / numPrizes;

    const segmentCenterAngle = winningIndex * segmentAngle + (segmentAngle / 2) - Math.PI / 2;
    const rotationNeeded = (3 * Math.PI / 2) - segmentCenterAngle;
    const finalRotation = rotationNeeded + (2 * Math.PI * 6);

    ctx.clearRect(0, 0, size, size);

    const bgGradient = ctx.createLinearGradient(0, 0, size, size);
    bgGradient.addColorStop(0, PREMIUM_COLORS.dark);
    bgGradient.addColorStop(0.35, PREMIUM_COLORS.darkAlt);
    bgGradient.addColorStop(1, PREMIUM_COLORS.dark);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, size, size);

    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.25);
    glow.addColorStop(0, 'rgba(255, 215, 130, 0.18)');
    glow.addColorStop(0.4, 'rgba(209, 31, 47, 0.08)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 1.2, 0, 2 * Math.PI);
    ctx.fill();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(finalRotation);

    ctx.save();
    ctx.strokeStyle = '#311210';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 18, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < numPrizes; i++) {
        const startAngle = i * segmentAngle - Math.PI / 2;
        const endAngle = startAngle + segmentAngle;
        const baseColor = i % 2 === 0 ? PREMIUM_COLORS.crimson : PREMIUM_COLORS.crimsonDark;

        const segmentGradient = ctx.createRadialGradient(0, 0, radius * 0.16, 0, 0, radius);
        segmentGradient.addColorStop(0, adjustColor(baseColor, 18));
        segmentGradient.addColorStop(0.65, baseColor);
        segmentGradient.addColorStop(1, adjustColor(baseColor, -22));

        ctx.fillStyle = segmentGradient;
        ctx.strokeStyle = '#220306';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(startAngle) * (radius - 16), Math.sin(startAngle) * (radius - 16));
        ctx.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
        ctx.stroke();

        ctx.save();
        let displayName = prizes[i].name.toUpperCase();
        if (displayName.length > 18) {
            displayName = displayName.substring(0, 18) + '...';
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textRadius = radius * 0.82;
        const textAngle = startAngle + segmentAngle / 2;
        const textX = Math.cos(textAngle) * textRadius;
        const textY = Math.sin(textAngle) * textRadius;
        ctx.translate(textX, textY);
        ctx.rotate(textAngle + Math.PI / 2);

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 4;
        ctx.strokeText(displayName, 0, 0);
        ctx.fillText(displayName, 0, 0);
        ctx.restore();
    }

    const centerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 110);
    centerGradient.addColorStop(0, PREMIUM_COLORS.goldLight);
    centerGradient.addColorStop(0.45, PREMIUM_COLORS.gold);
    centerGradient.addColorStop(1, PREMIUM_COLORS.accent);
    ctx.fillStyle = centerGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.strokeStyle = PREMIUM_COLORS.crimsonDark;
    ctx.lineWidth = 4;
    ctx.stroke();

    if (royalLogo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, 75, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(royalLogo, -75, -75, 150, 150);
        ctx.restore();
    }

    ctx.restore();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = PREMIUM_COLORS.gold;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(-48, -44);
    ctx.lineTo(48, -44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('¡GANASTE!', centerX, 24);

    return canvas.toBuffer('image/png');
}

const PRIZE_EMOJIS = {
    "0": "🔄", "1": "💸", "2": "💰", "3": "📞", "4": "🚀", "5": "🌟", "6": "🛡️", "7": "🔥", "8": "🏆", "9": "👑"
};

module.exports = { generateRouletteGif, generateRouletteStaticImage, PRIZE_EMOJIS };
