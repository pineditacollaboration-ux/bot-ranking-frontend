const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

let browser = null;

async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            headless: 'new'
        });
    }
    return browser;
}

// Helper: convert hex color to "r,g,b" string for use in rgba()
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}

async function generateProfileCard(data) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    // Card dimensions: 960 x 480
    await page.setViewport({ width: 960, height: 480, deviceScaleFactor: 2 });

    const avatarUrl = data.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const username = data.username || 'Usuario';
    const discordTag = data.discordTag || '';
    const coinVal = Math.floor(data.coins || 0).toLocaleString('es-CO');
    const spinVal = (data.spins || 0).toString();
    const rankStr = typeof data.rank === 'string' && data.rank.startsWith('#') ? data.rank : (data.rank ? `#${data.rank}` : 'N/A');
    const pointsToNext = data.pointsToNext || '';

    // Load logo as base64 for watermark
    let logoBase64 = '';
    try {
        const logoPath = path.join(process.cwd(), 'imagenes wins y puntos', 'royal.png');
        if (fs.existsSync(logoPath)) {
            const buf = fs.readFileSync(logoPath);
            logoBase64 = 'data:image/png;base64,' + buf.toString('base64');
        }
    } catch (_) {}

    const seasonStats = data.currentSeason || {};
    const pointsRaw  = data.points    || seasonStats.points    || 0;
    const points     = Number(pointsRaw).toLocaleString('en-US');
    const pointFontSize = points.length > 9 ? '20px' : points.length > 7 ? '24px' : '28px';
    const wins       = formatNumber(data.wins      || seasonStats.wins      || 0);
    const losses     = formatNumber(data.losses    || seasonStats.losses    || 0);
    const winrateRaw = data.winrate || '0.0%';
    const mvps       = formatNumber(data.mvps      || seasonStats.mvps      || 0);
    const streak     = String(data.streak || seasonStats.streak || 0);
    const matches    = formatNumber(data.matches   || 0);
    const creations  = formatNumber(data.creations || seasonStats.creations || 0);

    // Win rate as number for the progress bar
    const winratePct = parseFloat(winrateRaw) || 0;
    const winrateBarWidth = Math.min(100, Math.max(0, winratePct));

    // Determine rank tier color
    const rankNum = parseInt(String(rankStr).replace('#','')) || 9999;
    let tierColor = '#8b5cf6';       // purple  – default
    let tierLabel = 'PLATINO';
    if (rankNum <= 5)   { tierColor = '#f59e0b'; tierLabel = '\u00c9LITE';    }
    else if (rankNum <= 15) { tierColor = '#e0001a'; tierLabel = 'DIAMANTE'; }
    else if (rankNum <= 30) { tierColor = '#6366f1'; tierLabel = 'ORO';    }
    else if (rankNum <= 60) { tierColor = '#3b82f6'; tierLabel = 'PLATA';  }
    else                    { tierColor = '#64748b'; tierLabel = 'BRONCE';  }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            body {
                width: 960px;
                height: 480px;
                background: #080810;
                font-family: 'Inter', 'Arial', sans-serif;
                color: #fff;
                display: flex;
                overflow: hidden;
                position: relative;
            }

            /* ── BACKGROUND LAYERS ── */
            .bg-grid {
                position: absolute;
                inset: 0;
                background-image:
                    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
                background-size: 40px 40px;
                pointer-events: none;
                z-index: 0;
            }

            .bg-glow-red {
                position: absolute;
                left: -60px;
                top: -60px;
                width: 380px;
                height: 380px;
                background: radial-gradient(circle, rgba(224,0,26,0.18) 0%, transparent 70%);
                pointer-events: none;
                z-index: 0;
            }

            .bg-glow-purple {
                position: absolute;
                right: -40px;
                bottom: -60px;
                width: 320px;
                height: 320px;
                background: radial-gradient(circle, rgba(${hexToRgb(tierColor)},0.14) 0%, transparent 70%);
                pointer-events: none;
                z-index: 0;
            }

            /* ── DIAGONAL DIVIDER ── */
            .divider-line {
                position: absolute;
                left: 260px;
                top: 0;
                width: 3px;
                height: 100%;
                background: linear-gradient(to bottom, transparent 0%, ${tierColor}88 30%, ${tierColor} 50%, ${tierColor}88 70%, transparent 100%);
                z-index: 1;
            }
            .divider-line::after {
                content: '';
                position: absolute;
                left: -8px;
                top: 50%;
                transform: translateY(-50%);
                width: 18px;
                height: 18px;
                background: ${tierColor};
                clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
            }

            /* ── LEFT PANEL ── */
            .left-panel {
                width: 260px;
                min-width: 260px;
                height: 480px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0;
                position: relative;
                z-index: 2;
                padding-bottom: 8px;
                background: linear-gradient(160deg, rgba(${hexToRgb(tierColor)},0.07) 0%, rgba(8,8,16,0.0) 60%);
                border-left: 2px solid ${tierColor}55;
            }

            /* Avatar with glowing ring */
            .avatar-ring {
                width: 164px;
                height: 164px;
                border-radius: 50%;
                padding: 3px;
                background: conic-gradient(
                    ${tierColor} 0deg,
                    ${tierColor}cc 90deg,
                    #1a1a2e 180deg,
                    ${tierColor}cc 270deg,
                    ${tierColor} 360deg
                );
                box-shadow:
                    0 0 24px ${tierColor}88,
                    0 0 60px ${tierColor}33,
                    inset 0 0 12px rgba(0,0,0,0.5);
                position: relative;
                flex-shrink: 0;
            }

            .avatar-inner {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                overflow: hidden;
                border: 3px solid #080810;
            }

            .avatar-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            /* Rank badge under avatar */
            .rank-badge {
                margin-top: 16px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                background: rgba(${hexToRgb(tierColor)},0.08);
                border: 1px solid ${tierColor}44;
                border-radius: 10px;
                padding: 10px 26px 10px;
                box-shadow: 0 0 20px ${tierColor}22, inset 0 1px 0 ${tierColor}33;
                min-width: 140px;
            }

            .tier-label {
                font-size: 9px;
                font-weight: 900;
                letter-spacing: 4px;
                color: ${tierColor};
                text-transform: uppercase;
                text-shadow: 0 0 10px ${tierColor}cc;
            }

            .rank-number {
                font-size: 34px;
                font-weight: 900;
                color: #fff;
                line-height: 1;
                letter-spacing: -1.5px;
                text-align: center;
                text-shadow: 0 2px 12px rgba(0,0,0,0.6);
            }

            .rank-number span {
                font-size: 14px;
                font-weight: 600;
                color: rgba(255,255,255,0.4);
                vertical-align: super;
                margin-right: 2px;
                letter-spacing: 1px;
            }

            /* Coins + Spins pills */
            .currency-row {
                margin-top: 14px;
                display: flex;
                gap: 8px;
            }

            .c-pill {
                display: flex;
                align-items: center;
                gap: 5px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 20px;
                padding: 4px 10px 4px 7px;
                font-size: 12px;
                font-weight: 700;
                color: #ccc;
            }

            .c-pill svg { width: 14px; height: 14px; flex-shrink: 0; }

            /* ── RIGHT PANEL ── */
            .right-panel {
                flex: 1;
                display: flex;
                flex-direction: column;
                padding: 22px 26px 18px 30px;
                position: relative;
                z-index: 2;
            }

            /* ── USERNAME AREA ── */
            .username-row {
                margin-bottom: 4px;
            }

            .username {
                font-size: 34px;
                font-weight: 900;
                letter-spacing: -1px;
                line-height: 1;
                background: linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.78) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                display: inline-block;
                max-width: 640px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                padding-bottom: 6px;
                border-bottom: 2px solid ${tierColor}66;
            }

            .user-tag {
                font-size: 13px;
                color: rgba(255,255,255,0.38);
                font-weight: 500;
                margin-top: 4px;
            }

            .points-to-next {
                display: inline-block;
                margin-top: 6px;
                font-size: 11px;
                font-weight: 600;
                color: ${tierColor};
                background: ${tierColor}18;
                border: 1px solid ${tierColor}44;
                border-radius: 999px;
                padding: 2px 10px;
                letter-spacing: 0.5px;
            }

            /* ── SECTION DIVIDER ── */
            .section-sep {
                height: 1px;
                background: linear-gradient(90deg, ${tierColor}55 0%, rgba(255,255,255,0.08) 40%, transparent 80%);
                margin: 10px 0 8px 0;
            }

            .section-label {
                font-size: 9px;
                font-weight: 900;
                letter-spacing: 3.5px;
                color: rgba(255,255,255,0.28);
                text-transform: uppercase;
                margin-bottom: 9px;
            }

            /* ── STATS GRID 4x2 ── */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                grid-template-rows: repeat(2, 1fr);
                gap: 9px;
                flex: 1;
            }

            .stat-card {
                background: rgba(255,255,255,0.035);
                border: 1px solid rgba(255,255,255,0.07);
                border-radius: 8px;
                padding: 11px 13px 11px;
                display: flex;
                flex-direction: column;
                justify-content: flex-start;
                position: relative;
                overflow: hidden;
            }

            /* Top colored accent bar per card */
            .stat-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: var(--card-accent, rgba(255,255,255,0.1));
                border-radius: 8px 8px 0 0;
            }

            .stat-card::after {
                content: '';
                position: absolute;
                top: -20px;
                right: -10px;
                width: 60px;
                height: 60px;
                background: radial-gradient(circle, var(--card-accent-glow, transparent) 0%, transparent 70%);
                pointer-events: none;
            }

            /* Card accent colors */
            .card-pts  { --card-accent: #f59e0b; --card-accent-glow: rgba(245,158,11,0.12); }
            .card-wins { --card-accent: #22c55e; --card-accent-glow: rgba(34,197,94,0.12); }
            .card-loss { --card-accent: #e0001a; --card-accent-glow: rgba(224,0,26,0.12); }
            .card-mvp  { --card-accent: #a855f7; --card-accent-glow: rgba(168,85,247,0.12); }
            .card-part { --card-accent: #3b82f6; --card-accent-glow: rgba(59,130,246,0.12); }
            .card-wr   { --card-accent: #06b6d4; --card-accent-glow: rgba(6,182,212,0.12); }
            .card-str  { --card-accent: #f97316; --card-accent-glow: rgba(249,115,22,0.12); }
            .card-cre  { --card-accent: #ec4899; --card-accent-glow: rgba(236,72,153,0.12); }

            .stat-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .stat-lbl {
                font-size: 9.5px;
                font-weight: 800;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                color: rgba(255,255,255,0.38);
            }

            .stat-icon svg {
                width: 16px;
                height: 16px;
                opacity: 0.6;
            }

            .stat-val {
                font-size: 28px;
                font-weight: 800;
                color: #fff;
                line-height: 1;
                letter-spacing: -0.5px;
                margin-top: 8px;
                flex: 1;
                display: flex;
                align-items: center;
            }

            /* Win rate progress bar */
            .wr-bar-track {
                height: 4px;
                background: rgba(255,255,255,0.12);
                border-radius: 999px;
                margin-top: 5px;
                overflow: hidden;
                flex-shrink: 0;
            }

            .wr-bar-fill {
                height: 100%;
                width: ${winrateBarWidth}%;
                background: linear-gradient(90deg, #06b6d4, #3b82f6);
                border-radius: 999px;
            }

            /* ── WATERMARK ── */
            .watermark {
                position: absolute;
                right: 22px;
                bottom: 14px;
                opacity: 0.12;
                height: 28px;
                pointer-events: none;
                z-index: 1;
            }

            /* ── FOOTER BADGES ── */
            .footer-badges {
                display: flex;
                gap: 7px;
                margin-top: 10px;
                align-items: center;
            }

            .footer-badge {
                font-size: 11px;
                font-weight: 800;
                padding: 2px 9px;
                border-radius: 4px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.45);
            }
        </style>
    </head>
    <body>
        <!-- BG layers -->
        <div class="bg-grid"></div>
        <div class="bg-glow-red"></div>
        <div class="bg-glow-purple"></div>

        <!-- Vertical divider -->
        <div class="divider-line"></div>

        <!-- LEFT: Avatar + Rank -->
        <div class="left-panel">
            <div class="avatar-ring">
                <div class="avatar-inner">
                    <img src="${avatarUrl}" class="avatar-img" crossorigin="anonymous">
                </div>
            </div>

            <div class="rank-badge">
                <div class="tier-label">${tierLabel}</div>
                <div class="rank-number"><span>RANGO </span>${rankStr}</div>
            </div>

            <div class="currency-row">
                <div class="c-pill">
                    <svg viewBox="0 0 24 24" fill="#ffd700"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.31 14.71V18h-1.5v-1.27c-1.48-.29-2.83-1.14-2.86-2.97h1.71c.03.91.66 1.63 2.32 1.63 1.71 0 2.1-.86 2.1-1.39 0-.72-.39-1.41-2.34-1.87-2.17-.52-3.66-1.42-3.66-3.21 0-1.51 1.21-2.49 2.72-2.81V5h1.52v1.29c1.62.4 2.44 1.63 2.49 2.97h-1.71c-.04-.98-.56-1.64-1.94-1.64-1.31 0-2.1.59-2.1 1.43 0 .73.57 1.22 2.34 1.67 1.76.46 3.65 1.22 3.66 3.42-.01 1.61-1.21 2.48-2.73 2.77z"/></svg>
                    ${coinVal}
                </div>
                <div class="c-pill">
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#aaa" stroke-width="2"/><path d="M12 7v5l3 3" stroke="#aaa" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="#e0001a"/></svg>
                    ${spinVal}
                </div>
            </div>
        </div>

        <!-- RIGHT: Content -->
        <div class="right-panel">

            <!-- Username -->
            <div class="username-row">
                <div class="username">${username}</div>
                ${discordTag ? `<div class="user-tag">${discordTag}</div>` : ''}
                ${pointsToNext ? `<div class="points-to-next">${pointsToNext}</div>` : ''}
            </div>

            <div class="section-sep"></div>
            <div class="section-label">Estadísticas de temporada</div>

            <!-- Stats 4x2 -->
            <div class="stats-grid">

                <div class="stat-card card-pts">
                    <div class="stat-top">
                        <div class="stat-lbl">Puntos</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2Zm0 18A8 8 0 1 1 20 12 8 8 0 0 1 12 20Zm0-12A4 4 0 1 0 16 12 4 4 0 0 0 12 8Zm0 6A2 2 0 1 1 14 12 2 2 0 0 1 12 14Z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val" style="font-size:${pointFontSize}">${points}</div>
                </div>

                <div class="stat-card card-wins">
                    <div class="stat-top">
                        <div class="stat-lbl">Victorias</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#22c55e"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val">${wins}</div>
                </div>

                <div class="stat-card card-loss">
                    <div class="stat-top">
                        <div class="stat-lbl">Derrotas</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#e0001a"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val">${losses}</div>
                </div>

                <div class="stat-card card-mvp">
                    <div class="stat-top">
                        <div class="stat-lbl">MVPs</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#a855f7"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val">${mvps}</div>
                </div>

                <div class="stat-card card-part">
                    <div class="stat-top">
                        <div class="stat-lbl">Partidas</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#3b82f6"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val">${matches}</div>
                </div>

                <div class="stat-card card-wr">
                    <div class="stat-top">
                        <div class="stat-lbl">Efectividad</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#06b6d4"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val">${winrateRaw}</div>
                    <div class="wr-bar-track"><div class="wr-bar-fill"></div></div>
                </div>

                <div class="stat-card card-str">
                    <div class="stat-top">
                        <div class="stat-lbl">Racha</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#f97316"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val">${streak}</div>
                </div>

                <div class="stat-card card-cre">
                    <div class="stat-top">
                        <div class="stat-lbl">Creaciones</div>
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="#ec4899"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
                        </div>
                    </div>
                    <div class="stat-val">${creations}</div>
                </div>

            </div>

            <!-- Footer badges -->
            ${(data.hasX2 || data.hasShield) ? `
            <div class="footer-badges">
                ${data.hasX2 ? '<span class="footer-badge">✕2 ACTIVO</span>' : ''}
                ${data.hasShield ? '<span class="footer-badge">🛡️ ESCUDO</span>' : ''}
            </div>` : ''}

        </div>

        ${logoBase64 ? `<img src="${logoBase64}" class="watermark" alt="">` : ''}
    </body>
    </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.screenshot({ type: 'png', omitBackground: false });
    await page.close();
    return buffer;
}

function formatNumber(num) {
    if (!num) return '0';
    return Number(num).toLocaleString('en-US');
}

// Helper: convert hex color to "r,g,b" string for use in rgba()
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}

module.exports = { generateProfileCard };
