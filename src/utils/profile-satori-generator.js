const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Dynamic imports are loaded inside the function
let satori, Resvg, html;

// --- Helper: Asset Loading ---
// Load fonts synchronously for Satori
function loadFont(filename) {
    try {
        const fontPath = path.join(process.cwd(), filename);
        if (fs.existsSync(fontPath)) {
            return fs.readFileSync(fontPath);
        }
    } catch (e) { }
    return null;
}

const coolveticaData = loadFont('coolvetica-rg.ttf');
// Fallback font data if needed (Inter is usually system or we can fetch, but for hosting 
// we ideally want local. Since we don't have Inter helper handy, we might rely on a fallback 
// or fetch it. For now let's use Coolvetica for headers and default sans for others, 
// or try to fetch Inter buffer if strictness required. 
// Satori works best with ArrayBuffers.

async function generateProfileCard(data) {
    // 0. Load Dependencies (ESM/CommonJS compatibility)
    // 0. Load Dependencies (ESM/CommonJS compatibility)
    // Optimization: Check globally first to avoid await overhead if already loaded
    if (!html) html = (await import('satori-html')).html;
    if (!satori) satori = (await import('satori')).default;
    if (!Resvg) Resvg = (await import('@resvg/resvg-js')).Resvg;

    // Helper: Validate Image URL
    const isValidImageUrl = (url) => {
        if (!url || typeof url !== 'string') return false;
        if (url.includes('google.com/search')) return false; // Block google search result pages
        return url.startsWith('http');
    };

    // Helper: Timeout wrapper
    const withTimeout = (promise, ms, errorMsg) => {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(errorMsg || `Timeout after ${ms}ms`)), ms)
            )
        ]);
    };

    // 1. Prepare Data & Load Assets in Parallel
    const loadAvatar = async () => {
        let url = data.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
        if (url.startsWith('http')) {
            try {
                const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
                if (resp.data) {
                    const b64 = Buffer.from(resp.data).toString('base64');
                    const mime = resp.headers['content-type'] || 'image/png';
                    return `data:${mime};base64,${b64}`;
                }
            } catch (e) { }
        }
        return url;
    };

    const loadLocalImage = async (url) => {
        if (!url) return null;
        const DEFAULT_BG_NAMES = ['profile_bg_v2.png', 'card_background.png'];
        // Use provided URL if http
        if (isValidImageUrl(url)) return url;

        // Skip default placeholders if we want to treat them as null (or handle differently)
        if (DEFAULT_BG_NAMES.some(name => url.includes(name))) return null;

        // Try local file
        try {
            if (fs.existsSync(url)) {
                // Use async read
                const buffer = await fs.promises.readFile(url);
                return `data:image/png;base64,${buffer.toString('base64')}`;
            }
        } catch (e) { }
        return null;
    };

    // Execute all loads in parallel
    const [avatarUrl, bgImageSrc, bannerImageSrc] = await Promise.all([
        loadAvatar(),
        loadLocalImage(data.backgroundUrl),
        loadLocalImage(data.bannerUrl)
    ]);

    // 3. Prepare Theme Styles (Defaults vs Custom)
    const t = data.theme || {};
    const styles = {
        containerColor: t.containerColor || '#141414',
        containerStrokeColor: t.containerStrokeColor || '#1f1f1f',
        textColor: t.textColor || '#ffffff',
        subtextColor: t.subtextColor || '#cccccc',
        statLabelColor: t.statLabelColor || '#888888',
        statValueColor: t.statValueColor || '#ffffff',
        gridLineColor: t.gridLineColor || 'rgba(255, 255, 255, 0.1)',
        avatarBorderColor: t.avatarBorderColor || '#141414',
        rankTextColor: t.rankTextColor || '#ffffff',
        accentColor: t.accent || '#8a8a8a',
        fontFamily: t.fontFamily || "'Inter', sans-serif"
    };

    // Radius handling
    const avatarRadius = t.avatarRadius || '50%';
    const cardRadius = t.cardRadius || '20px';

    // 2. Define Styles (Inline CSS object syntax for Satori mainly, but satori-html parses string styles)
    // We reuse the exact CSS logic but convert to inline styles where satori-html handles it.
    // Note: Satori supports Flexbox natively.

    // Background logic
    // Reference HTML used linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%) for body.
    // Container in CSS was #141414.

    // Format Numbers
    const formatNumber = (num) => {
        if (!num) return '0';
        num = Number(num);
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };

    // Coin specific format: Show properly with K/M (13596 -> 13.5K)
    const formatCoins = (num) => {
        return formatNumber(num);
    };

    // Construct the stats HTML string manually first
    // Construct the stats HTML string manually first (Using dynamic colors)
    // Construct the stats HTML string manually first (Using dynamic colors)
    const statsList = [
        { l: 'PUNTOS', v: (data.currentSeason?.points || 0).toLocaleString() },
        { l: 'VICTORIAS', v: formatNumber(data.currentSeason?.wins || 0) },
        { l: 'DERROTAS', v: formatNumber(data.currentSeason?.losses || 0) },
        { l: 'MVPS', v: formatNumber(data.currentSeason?.mvps || 0) },
        { l: 'PARTIDAS', v: formatNumber(data.matches) },
        { l: 'WINRATE', v: data.winrate },
        { l: 'RACHA', v: data.streak },
        { l: 'CREACIONES', v: formatNumber(data.creations) }
    ];

    const renderStat = (stat) => `
        <div style="display: flex; flex-direction: column; align-items: center; width: 130px;">
            <span style="font-family: ${styles.fontFamily}; font-size: 10px; color: ${styles.statLabelColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">${stat.l}</span>
            <span style="font-family: ${styles.fontFamily}; font-size: 26px; font-weight: 800; color: ${styles.statValueColor}; letter-spacing: -0.5px;">${stat.v}</span>
        </div>
    `;

    const statsHtml =
        statsList.slice(0, 4).map(renderStat).join('') +
        `<div style="display: flex; width: 100%; height: 1px; background-color: ${styles.gridLineColor}; margin: 5px 0; opacity: 0.4;"></div>` +
        statsList.slice(4).map(renderStat).join('');

    // Construct the full HTML string
    // Note: We use a standard template literal, NOT the html tag function initially
    // BACKGROUND LOGIC: Use img if present, else gradient.
    const backgroundStyle = bgImageSrc
        ? 'background: #000;'
        : 'background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%);';

    const template = `
    <div style="display: flex; width: 730px; height: 760px; ${backgroundStyle} flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 50px; font-family: ${styles.fontFamily}; position: relative;">
        <!-- Background Image Layer -->
        ${bgImageSrc ? `<img src="${bgImageSrc}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;" />` : ''}

        <!-- Banner Header (Outside Card, Top) -->
        ${bannerImageSrc ? `
        <div style="display: flex; position: absolute; top: 0; left: 0; width: 100%; height: 260px; overflow: hidden;">
            <img src="${bannerImageSrc}" style="width: 100%; height: 100%; object-fit: cover; object-position: center;" />
            <div style="display: flex; position: absolute; bottom: 0; left: 0; width: 100%; height: 100px; background: linear-gradient(to top, #141414, transparent);"></div>
        </div>` : ''}
        
        <!-- Card Container -->
        <div style="display: flex; width: 650px; height: 520px; background-color: ${styles.containerColor}; border-radius: ${cardRadius}; position: relative; border: 2px solid ${styles.containerStrokeColor}; flex-direction: column; padding: 40px; box-shadow: 0 30px 60px rgba(0,0,0,0.8);">
            
            <!-- Banner Image (Inside Card Container, Top) -->
            <!-- Banner Image REMOVED from here -->

            <!-- Avatar (Absolute) -->
            <div style="display: flex; position: absolute; top: -85px; left: 36px; width: 156px; height: 156px; border-radius: ${avatarRadius}; background-color: ${styles.containerColor}; padding: 0; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
                <img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: ${avatarRadius}; border: 6px solid ${styles.avatarBorderColor};" />
            </div>

            <!-- Currency (Top Right Absolute) -->
            <div style="display: flex; position: absolute; top: 35px; right: 40px; gap: 12px;">
                <!-- Coin -->
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(20, 20, 20, 0.8); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
                    <div style="display: flex; width: 18px; height: 18px;">
                         <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" fill="#ffd700"/></svg>
                    </div>
                    <span style="font-family: ${styles.fontFamily}; font-weight: 700; font-size: 14px; color: #ddd;">${formatCoins(data.coins)}</span>
                </div>
                <!-- Spins -->
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(20, 20, 20, 0.8); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
                    <div style="display: flex; width: 18px; height: 18px;">
                         <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                            <circle cx="12" cy="12" r="10" fill="none" stroke="#ddd" stroke-width="2"/>
                            <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93" stroke="#ddd" stroke-width="1"/>
                            <circle cx="12" cy="12" r="3" fill="#ddd"/>
                            <path d="M12 0l-3 4h6z" fill="#ff4444"/>
                        </svg>
                    </div>
                    <span style="font-family: ${styles.fontFamily}; font-weight: 700; font-size: 14px; color: #ddd;">${data.spins || 0}</span>
                </div>
            </div>

            <!-- Rank Badge (Below Currency) -->
            <div style="display: flex; position: absolute; top: 90px; right: 40px; background: rgba(255,255,255,0.05); padding: 6px 14px; border-radius: 8px;">
                 <span style="font-family: ${styles.fontFamily}; font-size: 12px; color: ${styles.statLabelColor}; margin-right: 6px; font-weight: 700;">RANK</span>
                 <span style="font-family: ${styles.fontFamily}; font-size: 12px; color: ${styles.rankTextColor}; font-weight: 700;">${data.rank || 'N/A'}</span>
            </div>

            <!-- Header Info -->
            <div style="display: flex; flex-direction: column; margin-top: 75px; margin-bottom: 35px; align-items: flex-start; position: relative;">
                <div style="display: flex; font-family: 'Coolvetica'; font-size: 44px; font-weight: 800; color: ${styles.textColor}; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${data.username}</div>
                <div style="display: flex; font-family: ${styles.fontFamily}; font-size: 16px; color: ${styles.subtextColor}; margin-top: 6px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${data.pointsToNext}</div>
            </div>

            <!-- Divider (More visible) -->
            <div style="display: flex; width: 100%; height: 2px; background-color: ${styles.gridLineColor}; margin-top: 10px; margin-bottom: 10px;"></div>

            <!-- Stats Grid (Increased gap and margins) -->
            <div style="display: flex; flex-wrap: wrap; width: 100%; margin-top: 20px; padding-left: 15px; box-sizing: border-box; justify-content: space-between; gap: 35px 0px;">
                ${statsHtml}
            </div>

            <!-- Footer (Badges) -->
            <div style="display: flex; margin-top: auto; padding-top: 25px; gap: 24px; border-top: 1px solid ${styles.gridLineColor};">
                ${data.hasX2 ? `
                <div style="display: flex; gap: 6px; align-items: center;">
                    <span style="font-family: ${styles.fontFamily}; font-style: italic; font-weight: 900; font-size: 22px; color: #444;">X2</span>
                </div>` : ''}

                ${data.hasShield ? `
                <div style="display: flex; gap: 6px; align-items: center;">
                     <div style="display: flex; width: 24px; height: 24px; opacity: 0.5;">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="${styles.accentColor}"/>
                        </svg>
                     </div>
                </div>` : ''}
            </div>

        </div>
    </div>
    `;

    // Parse it with html()
    const markup = html(template);

    // 3. Render SVG with Satori (with timeout)
    let svg;
    try {
        svg = await withTimeout(
            satori(markup, {
                width: 730,
                height: 760,
                fonts: [
                    {
                        name: 'Coolvetica',
                        data: coolveticaData || Buffer.alloc(0),
                        weight: 800,
                        style: 'normal',
                    },
                    {
                        name: 'Inter',
                        data: coolveticaData || Buffer.alloc(0),
                        weight: 400,
                        style: 'normal',
                    }
                ],
            }),
            15000, // 15 second timeout
            'Satori render timeout (15s) - posible problema con imágenes remotas'
        );
    } catch (error) {
        throw new Error(`Error generando imagen de perfil: ${error.message}`);
    }

    // 4. Convert to PNG with ReSVG
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 730 * 2 },
        background: 'rgba(0,0,0,0)',
    });

    const pngBuffer = resvg.render().asPng();
    return pngBuffer;
}

module.exports = { generateProfileCard };
