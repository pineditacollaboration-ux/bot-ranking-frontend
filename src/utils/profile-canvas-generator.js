let CanvasLib = null;
try { CanvasLib = require('@napi-rs/canvas'); } catch (_) {
    try { CanvasLib = require('canvas'); } catch (__) { CanvasLib = null; }
}
if (!CanvasLib) throw new Error('No Canvas library available');

const { createCanvas, loadImage, GlobalFonts, Path2D } = CanvasLib;
const path = require('path');
const fs = require('fs');

const fonts = [
    [path.join(process.cwd(), 'coolvetica-rg.ttf'), 'Coolvetica'],
    [path.join(process.cwd(), 'Inter-Bold.ttf'), 'Inter'],
    [path.join(process.cwd(), 'Inter-Regular.ttf'), 'InterReg'],
];
for (const [fp, name] of fonts) {
    if (fs.existsSync(fp)) { try { GlobalFonts.registerFromPath(fp, name); } catch (_) {} }
}

// Switched entirely to Inter for cleaner numbers and letters
const FONT_ALL = 'Inter, Arial, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

function drawStatIcon(ctx, type, cx, cy, size) {
    const s = size / 24;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(s, s);
    ctx.beginPath();
    
    // High-quality SVG paths
    let p = null;
    switch (type) {
        case 'bolt': // Points (Target/Bullseye)
            p = new Path2D('M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2Zm0 18A8 8 0 1 1 20 12 8 8 0 0 1 12 20Zm0-12A4 4 0 1 0 16 12 4 4 0 0 0 12 8Zm0 6A2 2 0 1 1 14 12 2 2 0 0 1 12 14Z');
            break;
        case 'shield': // Wins (Crown)
            p = new Path2D('M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z');
            break;
        case 'skull': // Losses (X/Cross)
            p = new Path2D('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z');
            break;
        case 'star': // MVPs (Star)
            p = new Path2D('M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z');
            break;
        case 'gamepad': // Matches (Gamepad)
            p = new Path2D('M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z');
            break;
        case 'trend': // Win Rate (Bar chart)
            p = new Path2D('M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z');
            break;
        case 'fire': // Streak (Lightning)
            p = new Path2D('M7 2v11h3v9l7-12h-4l4-8z');
            break;
        case 'brush': // Creations (Palette)
            p = new Path2D('M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z');
            break;
        default:
            p = new Path2D('M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2Zm0 18A8 8 0 1 1 20 12 8 8 0 0 1 12 20Zm0-12A4 4 0 1 0 16 12 4 4 0 0 0 12 8Zm0 6A2 2 0 1 1 14 12 2 2 0 0 1 12 14Z');
            break;
    }
    
    if (p) {
        ctx.fill(p);
    }
    ctx.restore();
}

// ── Coin icon: gold circle with inner ring ─────────────────────────────────
function drawCoinIcon(ctx, cx, cy, r) {
    ctx.save();
    // Outer gold circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const gCoin = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    gCoin.addColorStop(0, '#ffe066');
    gCoin.addColorStop(0.5, '#f0b90b');
    gCoin.addColorStop(1, '#a07800');
    ctx.fillStyle = gCoin;
    ctx.fill();
    // Rim highlight
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,240,140,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,220,80,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Center $ mark
    ctx.fillStyle = 'rgba(120,80,0,0.7)';
    ctx.font = `800 ${Math.round(r * 1.1)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', cx, cy + 0.5);
    ctx.restore();
}

// ── Roulette wheel icon (Simplified for small sizes) ────────────────────────
function drawRouletteIcon(ctx, cx, cy, r) {
    ctx.save();
    // Outer rim
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1c1c';
    ctx.fill();
    ctx.strokeStyle = '#e6b800';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 4 sections (Red / Black)
    const sections = 4;
    for (let i = 0; i < sections; i++) {
        const start = (i / sections) * Math.PI * 2;
        const end = ((i + 1) / sections) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r - 1.2, start, end);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? '#cc2900' : '#111';
        ctx.fill();
    }

    // Inner hub
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#e6b800';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.restore();
}

async function generateProfileCard(data) {
    const W = 800, H = 740;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── 1. BACKGROUND ──────────────────────────────────────────────────────
    ctx.fillStyle = '#07070b';
    ctx.fillRect(0, 0, W, H);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0f0f14');
    bgGrad.addColorStop(0.6, '#090910');
    bgGrad.addColorStop(1, '#07070b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle dot grid
    ctx.save();
    for (let gx = 20; gx < W; gx += 36) {
        for (let gy = 20; gy < H; gy += 36) {
            ctx.beginPath();
            ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
        }
    }
    ctx.restore();

    // Very subtle top bloom — barely visible depth, no distracting color
    const bloom = ctx.createRadialGradient(W / 2, -80, 0, W / 2, -80, 380);
    bloom.addColorStop(0, 'rgba(200, 20, 50, 0.06)');
    bloom.addColorStop(1, 'transparent');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, W, H);

    // Bottom fade vignette
    const bottomFade = ctx.createLinearGradient(0, H * 0.75, 0, H);
    bottomFade.addColorStop(0, 'transparent');
    bottomFade.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, 0, W, H);

    // ── 2. AVATAR ──────────────────────────────────────────────────────────
    const AVS = 118;
    const AVY = 38;
    const AVX = (W - AVS) / 2;
    const AVR = 24;

    // Outer glow halo — clean neutral premium glow
    ctx.save();
    ctx.shadowColor = 'rgba(255, 240, 220, 0.25)';
    ctx.shadowBlur = 45;
    roundRect(ctx, AVX - 4, AVY - 4, AVS + 8, AVS + 8, AVR + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Avatar clip & draw
    ctx.save();
    roundRect(ctx, AVX, AVY, AVS, AVS, AVR);
    ctx.fillStyle = '#111116';
    ctx.fill();
    ctx.clip();
    let avatarImg = null;
    // Utilize the direct hasCustomAvatar flag provided by profile logic
    const isDefaultAvatar = !data.hasCustomAvatar;
    
    if (!isDefaultAvatar) {  
        try { avatarImg = await loadImage(data.avatarUrl); } catch (_) {} 
    }
    if (avatarImg) {
        ctx.drawImage(avatarImg, AVX, AVY, AVS, AVS);
    } else {
        // Fallback: Default gradient with initials
        const avGrad = ctx.createLinearGradient(AVX, AVY, AVX + AVS, AVY + AVS);
        avGrad.addColorStop(0, '#2b2b36');
        avGrad.addColorStop(1, '#15151c');
        ctx.fillStyle = avGrad;
        ctx.fillRect(AVX, AVY, AVS, AVS);

        const initial = (data.username || 'P').charAt(0).toUpperCase();
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${AVS * 0.55}px ${FONT_ALL}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, AVX + AVS / 2, AVY + AVS / 2 + 4);
    }
    ctx.restore();

    // Clean sharp border
    ctx.save();
    roundRect(ctx, AVX, AVY, AVS, AVS, AVR);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── 3. USERNAME ────────────────────────────────────────────────────────
    const nameY = AVY + AVS + 75;
    const username = (data.username || 'Player').toUpperCase();

    ctx.save();
    let nameFontSize = 44;
    ctx.font = `800 ${nameFontSize}px ${FONT_ALL}`;
    while (ctx.measureText(username).width > W - 80 && nameFontSize > 22) {
        nameFontSize -= 1;
        ctx.font = `800 ${nameFontSize}px ${FONT_ALL}`;
    }
    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowBlur   = 24;
    ctx.shadowOffsetY = 0;
    
    // Metallic text gradient
    const nameWidth = ctx.measureText(username).width;
    const nameGrad = ctx.createLinearGradient((W - nameWidth)/2, 0, (W + nameWidth)/2, 0);
    nameGrad.addColorStop(0, '#ffffff');
    nameGrad.addColorStop(0.5, '#d4d4dc');
    nameGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = nameGrad;
    
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(username, W / 2, nameY);
    ctx.shadowColor = 'transparent'; // Reset glow
    ctx.restore();

    // ── 4. SUBTITLE ────────────────────────────────────────────────────────
    const subY = nameY + 45;
    if (data.pointsToNext) {
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `600 13px ${FONT_ALL}`;
        ctx.letterSpacing = '2px';
        ctx.fillStyle    = '#7a7a88';
        ctx.fillText(`◆   ${data.pointsToNext.toUpperCase()}   ◆`, W / 2, subY);
        ctx.restore();
    }

    // ── 5. HUD PILLS ───────────────────────────────────────────────────────
    const pillsY = subY + 46;
    const pillH   = 38;

    const rankStr = `RANGO ${data.rank && String(data.rank).startsWith('#') ? data.rank : `#${data.rank || '?'}`}`;
    const coinStr = fmt(data.coins || 0);
    const spinStr = fmt(data.spins || 0);

    ctx.font = `700 13px ${FONT_ALL}`;
    const rankW  = ctx.measureText(rankStr).width + 36;
    const coinW  = ctx.measureText(coinStr).width + 66;
    const spinW  = ctx.measureText(spinStr).width + 66;
    const gapP   = 16;
    const totalW = rankW + coinW + spinW + gapP * 2;
    let px = (W - totalW) / 2;

    // Rank pill — clean white, premium
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, px, pillsY, rankW, pillH, 10);
    ctx.fillStyle = '#f5f5f7';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle    = '#0a0a0f';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `900 14px ${FONT_ALL}`;
    ctx.letterSpacing = '0.5px';
    ctx.fillText(rankStr, px + rankW / 2, pillsY + pillH / 2 + 1);
    ctx.restore();
    px += rankW + gapP;

    // Coin / Spin pills — dark with canvas-drawn icons
    function drawValuePill(val, sx, w, iconFn) {
        ctx.save();

        // Background
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        roundRect(ctx, sx, pillsY, w, pillH, 9);
        ctx.shadowColor = 'transparent';
        
        const pg = ctx.createLinearGradient(sx, pillsY, sx, pillsY + pillH);
        pg.addColorStop(0, '#1c1c22');
        pg.addColorStop(1, '#101014');
        ctx.fillStyle = pg;
        ctx.fill();

        // Border
        ctx.strokeStyle = '#2e2e34';
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Top accent shimmer
        ctx.save();
        roundRect(ctx, sx + 1, pillsY + 1, w - 2, 1.5, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fill();
        ctx.restore();

        // Icon (canvas-drawn, centered vertically)
        iconFn(ctx, sx + 20, pillsY + pillH / 2, 9);

        // Divider
        ctx.beginPath();
        ctx.moveTo(sx + 34, pillsY + 7);
        ctx.lineTo(sx + 34, pillsY + pillH - 7);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Value text
        ctx.font         = `700 13px ${FONT_ALL}`;
        ctx.fillStyle    = '#e8e8ec';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(val, sx + 42, pillsY + pillH / 2 + 1);
        ctx.restore();
    }

    drawValuePill(coinStr, px, coinW, drawCoinIcon);      // moneda 🪙
    px += coinW + gapP;
    drawValuePill(spinStr, px, spinW, drawRouletteIcon);  // ruleta 🎰

    // ── Separator line between header and stats ─────────────────────────────
    const sepY = pillsY + pillH + 38;
    ctx.save();
    const sepGrad = ctx.createLinearGradient(60, sepY, W - 60, sepY);
    sepGrad.addColorStop(0,   'transparent');
    sepGrad.addColorStop(0.3, 'rgba(255, 215, 0, 0.05)');
    sepGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.35)');
    sepGrad.addColorStop(0.7, 'rgba(255, 215, 0, 0.05)');
    sepGrad.addColorStop(1,   'transparent');
    ctx.strokeStyle = sepGrad;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(60, sepY);
    ctx.lineTo(W - 60, sepY);
    ctx.stroke();
    ctx.restore();

    // ── 6. STATS GRID ──────────────────────────────────────────────────────
    const stats = [
        { lbl: 'PUNTOS',      val: fmt(data.points   || 0),      icon: 'bolt'    },
        { lbl: 'VICTORIAS',   val: fmt(data.wins     || 0),      icon: 'shield'  },
        { lbl: 'DERROTAS',    val: fmt(data.losses   || 0),      icon: 'skull'   },
        { lbl: 'MVPs',        val: fmt(data.mvps     || 0),      icon: 'star'    },
        { lbl: 'PARTIDAS',    val: fmt(data.matches  || 0),      icon: 'gamepad' },
        { lbl: 'EFECTIVIDAD', val: data.winrate      || '0%',    icon: 'trend'   },
        { lbl: 'RACHA',       val: String(data.streak || 0),     icon: 'fire'    },
        { lbl: 'CREACIONES',  val: String(data.creations || 0),  icon: 'brush'   },
    ];

    const cCols  = 4;
    const cPad   = 32;
    const cGapX  = 18;
    const cGapY  = 24;
    const startY = sepY + 38;
    const boxW   = (W - cPad * 2 - cGapX * 3) / cCols;
    const boxH   = 112;

    for (let i = 0; i < stats.length; i++) {
        const col = i % cCols;
        const row = Math.floor(i / cCols);
        const bx  = cPad + col * (boxW + cGapX);
        const by  = startY + row * (boxH + cGapY);

        ctx.save();

        // Drop shadow for the card
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 5;
        roundRect(ctx, bx, by, boxW, boxH, 11);
        ctx.shadowColor = 'transparent'; // reset shadow for contents

        // Card fill with gradient
        const cg = ctx.createLinearGradient(bx, by, bx, by + boxH);
        cg.addColorStop(0, '#1c1c24');
        cg.addColorStop(0.5, '#15151c');
        cg.addColorStop(1, '#0e0e12');
        ctx.fillStyle = cg;
        ctx.fill();

        // Border (Slightly more visible glass edge)
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Top accent shimmer — stronger
        ctx.save();
        roundRect(ctx, bx + 1, by + 1, boxW - 2, 1.5, 2);
        const shimmerGrad = ctx.createLinearGradient(bx, by, bx + boxW, by);
        shimmerGrad.addColorStop(0, 'rgba(255,255,255,0.0)');
        shimmerGrad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
        shimmerGrad.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = shimmerGrad;
        ctx.fill();
        ctx.restore();

        // Icon — top-right, slightly larger
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        drawStatIcon(ctx, stats[i].icon, bx + boxW - 26, by + 28, 20);

        // Value
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        let vFont = 28;
        ctx.font = `800 ${vFont}px ${FONT_ALL}`;
        while (ctx.measureText(stats[i].val).width > boxW - 30 && vFont > 14) {
            vFont--;
            ctx.font = `800 ${vFont}px ${FONT_ALL}`;
        }
        
        ctx.fillStyle = '#f0f0f2';
        ctx.shadowColor = 'rgba(255,255,255,0.08)';
        ctx.shadowBlur = 4;
        ctx.fillText(stats[i].val, bx + 18, by + 68);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Label — slightly brighter for legibility
        ctx.font      = `600 11px ${FONT_ALL}`;
        ctx.fillStyle = '#8a8a9a';
        ctx.letterSpacing = '1px';
        ctx.fillText(stats[i].lbl, bx + 18, by + 88);
        ctx.letterSpacing = '0px';

        ctx.restore();
    }

    // ── 7. FOOTER ──────────────────────────────────────────────────────────
    const badgeY = H - 26;

    let bpx = cPad;
    function drawBadge(label, solid) {
        ctx.save();
        ctx.font = `700 11px ${FONT_ALL}`;
        const bw = ctx.measureText(label).width + 24;
        roundRect(ctx, bpx, badgeY - 13, bw, 22, 6);
        ctx.fillStyle   = solid ? '#ffffff' : '#18181c';
        ctx.fill();
        ctx.strokeStyle = solid ? '#ffffff' : '#3c3c44';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.fillStyle    = solid ? '#050505' : '#e2e2e6';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bpx + bw / 2, badgeY - 1);
        ctx.restore();
        bpx += bw + 10;
    }
    if (data.hasX2)     drawBadge('BOOST ×2', true);
    if (data.hasShield) drawBadge('PROTECCIÓN', false);

    // Watermark
    ctx.save();
    ctx.font         = `700 11px ${FONT_ALL}`;
    ctx.fillStyle    = '#606070';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '2px';
    ctx.fillText('ROYAL RANKED', W - cPad, badgeY - 1);
    ctx.letterSpacing = '0px';
    ctx.restore();

    // ── Outer card border (thin gold→red gradient) ──────────────────────────
    ctx.save();
    const cardBorder = ctx.createLinearGradient(0, 0, 0, H);
    cardBorder.addColorStop(0,   'rgba(255, 255, 255, 0.14)');
    cardBorder.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
    cardBorder.addColorStop(1,   'rgba(255, 255, 255, 0.08)');
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, 1, 1, W - 2, H - 2, 4);
    ctx.stroke();
    ctx.restore();

    return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard };
