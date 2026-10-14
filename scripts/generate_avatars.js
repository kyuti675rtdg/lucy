#!/usr/bin/env node
// Generate 30 original geometric avatar SVGs for Project Lucy.
// Deterministic: variety driven by index (1-based). No external assets.
const fs = require('fs');
const path = require('path');

const INITIALS = ['ST','DM','HG','YB','TA','MC','LP','SR','AK','NB','KJ','ZA','RW','FA','GE','BM','OD','LM','TN','EK','JA','PS','CR','DW','HI','SA','KM','LT','AB','WN'];
const BGS = ['#101014', '#1A1A21', '#241f31'];
const PALETTE = ['#8B5CF6', '#FBBF24', '#2DD4BF'];

function svg(i /* 1-based */, initials) {
  const bg = BGS[(i - 1) % BGS.length];
  const c0 = PALETTE[(i - 1) % 3];
  const c1 = PALETTE[(i + 1) % 3];
  const c2 = PALETTE[(i + 2) % 3];
  const rings = 2 + ((i - 1) % 2); // 2 or 3 rings
  const rot = (i * 47) % 360;      // per-index rotation
  let parts = [];
  parts.push(`<rect width="128" height="128" rx="28" fill="${bg}"/>`);
  // concentric circles, varied radii
  const baseR = [52, 40, 29][0];
  for (let r = 0; r < rings; r++) {
    const rad = baseR - r * 12;
    const col = [c0, c1, c2][r % 3];
    const sw = r === 0 ? 7 : 5;
    parts.push(`<circle cx="64" cy="64" r="${rad}" fill="none" stroke="${col}" stroke-width="${sw}"/>`);
  }
  // arc segment for variety
  const arcAngle = 200 + ((i * 53) % 120);
  const arcCol = c1;
  parts.push(`<g transform="rotate(${rot} 64 64)">` +
    `<path d="M 64 ${64 - 52} A 52 52 0 ${(arcAngle > 180 ? 1 : 0)} 1 ` +
    `${(64 + 52 * Math.sin(arcAngle * Math.PI / 180)).toFixed(1)} ${(64 - 52 * Math.cos(arcAngle * Math.PI / 180)).toFixed(1)}" ` +
    `fill="none" stroke="${arcCol}" stroke-width="9" stroke-linecap="round"/></g>`);
  // initials
  parts.push(`<text x="64" y="79" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" ` +
    `font-size="34" font-weight="800" fill="#FFFFFF" letter-spacing="1">${initials}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    parts.join('') + `</svg>`;
}

const outDir = path.join(__dirname, '..', 'assets', 'avatars');
fs.mkdirSync(outDir, { recursive: true });
for (let n = 1; n <= 30; n++) {
  const name = `u${String(n).padStart(2, '0')}.svg`;
  fs.writeFileSync(path.join(outDir, name), svg(n, INITIALS[n - 1]));
  console.log('wrote', name);
}
