// Shared canvas primitives for the PNG cards this site generates: the
// guest's invitation card (invitationCard.js), the host's invitation card
// (hostInvitationCard.js), and the godparent proposal cards
// (godparentProposalCard.js).

// Wait for the brand web fonts to be ready before painting a card —
// otherwise the canvas falls back to a generic serif while the
// Google-Font script is still loading.
export async function ensureFontsLoaded() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  await Promise.all([
    document.fonts.load('400 120px "Great Vibes"'),
    document.fonts.load('400 80px "Great Vibes"'),
    document.fonts.load('italic 32px "Cormorant Garamond"'),
    document.fonts.load('600 22px "Cormorant Garamond"'),
    document.fonts.load('500 13px "Quicksand"')
  ]).catch(() => {});
}

export function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Loads an image as a Promise<HTMLImageElement>. Resolves null on
// failure so callers can degrade gracefully instead of rejecting.
export function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// `fill` may be a colour string or a CanvasGradient.
export function drawCentered(ctx, text, cx, y, { font, fill, baseline = 'top' }) {
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = baseline;
  ctx.fillText(text, cx, y);
}

// Greedy word wrap. Returns the lines; the caller multiplies by its own
// line height to lay them out.
export function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);

  return lines;
}

// Shrinks a single-line font size until the text fits maxWidth. Guest
// names are host-entered and can be long, so headline text that must
// stay on one line runs through this first.
export function fitFontSize(ctx, text, maxWidth, buildFont, maxSize, minSize = 18) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = buildFont(size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}
