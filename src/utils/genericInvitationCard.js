import {
  drawCentered,
  ensureFontsLoaded,
  loadImage,
  roundedRect,
  wrapText
} from './canvasCard.js';

// A generic "you are invited" card the host can post anywhere — a group
// chat, a story, a printed board at the door. It carries no guest name and
// no seat count, so one image works for everybody and nothing personal
// leaks when it is forwarded.
//
// Same visual language as the personalised cards (hostInvitationCard.js)
// and the godparent proposals: gradient header band, portrait under it,
// dashed hero box.

const PINK = '#d94994';
const PURPLE = '#6f4ed1';
const DEEP_PURPLE = '#3d2a73';
const LAVENDER = '#c8a8ff';
const WHITE = '#ffffff';

const W = 800;
const PAD = 40;
const HEADER_H = 285;
const PORTRAIT_SIZE = 170;
const PORTRAIT_RING = 7;
const PORTRAIT_DROP = 10;

// Section heights, summed before drawing and then walked through by the
// draw pass — layout lives in exactly one place.
const BODY_TOP_PAD = PORTRAIT_DROP + PORTRAIT_SIZE / 2 + PORTRAIT_RING + 38;
const EYEBROW_H = 34;
const HERO_H = 76;
const DIVIDER_H = 36;
const MESSAGE_LINE_H = 31;
const MESSAGE_GAP = 30;
const BOX_H = 176;
const BODY_BOTTOM_PAD = 46;

const MESSAGE_FONT = 'italic 21px "Cormorant Garamond", serif';

const MESSAGE =
  "Our little fairy turns one, and she is being welcomed into the faith on " +
  'the same day. Come share the cake, the blessings and the fairy dust with us.';

export async function generateGenericInvitationCard({ portraitSrc } = {}) {
  await ensureFontsLoaded();

  const cardX = PAD;
  const cardW = W - PAD * 2;
  const contentW = cardW - 120;

  // ── Measure pass: the message's line count drives the canvas height ──
  const measure = document.createElement('canvas').getContext('2d');
  const messageLines = wrapText(measure, MESSAGE, contentW, MESSAGE_FONT);

  const bodyH =
    BODY_TOP_PAD +
    EYEBROW_H +
    HERO_H +
    DIVIDER_H +
    messageLines.length * MESSAGE_LINE_H +
    MESSAGE_GAP +
    BOX_H +
    BODY_BOTTOM_PAD;

  const H = PAD * 2 + HEADER_H + bodyH;

  const portrait = portraitSrc ? await loadImage(portraitSrc) : null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const cx = W / 2;
  const cardY = PAD;
  const cardH = H - PAD * 2;

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fff3f9');
  bg.addColorStop(0.5, '#f3e8ff');
  bg.addColorStop(1, '#fde4f1');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Inner card ──
  ctx.save();
  ctx.shadowColor = 'rgba(217, 73, 148, 0.18)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = WHITE;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fill();
  ctx.restore();

  // ── Header gradient band ──
  ctx.save();
  roundedRect(ctx, cardX, cardY, cardW, HEADER_H, 36);
  ctx.clip();
  const header = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + HEADER_H);
  header.addColorStop(0, '#ff7eb6');
  header.addColorStop(0.5, LAVENDER);
  header.addColorStop(1, '#a07cff');
  ctx.fillStyle = header;
  ctx.fillRect(cardX, cardY, cardW, HEADER_H);
  ctx.restore();

  drawCentered(ctx, 'A   F A I R Y   C E L E B R A T I O N', cx, cardY + 40, {
    font: '500 13px "Quicksand", sans-serif',
    fill: WHITE
  });
  drawCentered(ctx, 'Gianna Avery', cx, cardY + 112, {
    font: '56px "Great Vibes", cursive',
    fill: WHITE,
    baseline: 'middle'
  });
  drawCentered(ctx, '1ST BIRTHDAY & DEDICATION', cx, cardY + 148, {
    font: '600 16px "Quicksand", sans-serif',
    fill: WHITE
  });
  drawCentered(ctx, '✦  Saturday · October 3, 2026 · 1:30 PM  ✦', cx, cardY + 186, {
    font: '14px "Quicksand", sans-serif',
    fill: 'rgba(255, 255, 255, 0.9)'
  });

  // ── Portrait, straddling the bottom edge of the header band ──
  const portraitCy = cardY + HEADER_H + PORTRAIT_DROP;
  const r = PORTRAIT_SIZE / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(217, 73, 148, 0.22)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(cx, portraitCy, r + PORTRAIT_RING, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, portraitCy, r, 0, Math.PI * 2);
  ctx.clip();
  if (portrait) {
    // Cover-fit: scale the shorter side up to the circle, centre the overflow.
    const scale = Math.max(PORTRAIT_SIZE / portrait.width, PORTRAIT_SIZE / portrait.height);
    const dw = portrait.width * scale;
    const dh = portrait.height * scale;
    ctx.drawImage(portrait, cx - dw / 2, portraitCy - dh / 2, dw, dh);
  } else {
    const fallback = ctx.createLinearGradient(cx - r, portraitCy - r, cx + r, portraitCy + r);
    fallback.addColorStop(0, '#ffe1f0');
    fallback.addColorStop(1, '#efe1ff');
    ctx.fillStyle = fallback;
    ctx.fillRect(cx - r, portraitCy - r, PORTRAIT_SIZE, PORTRAIT_SIZE);
    drawCentered(ctx, '✦', cx, portraitCy, {
      font: '52px "Quicksand", sans-serif',
      fill: LAVENDER,
      baseline: 'middle'
    });
  }
  ctx.restore();

  // ── Body ──
  let y = cardY + HEADER_H + BODY_TOP_PAD;

  drawCentered(ctx, '✨  Y O U   A R E   I N V I T E D  ✨', cx, y, {
    font: '600 12px "Quicksand", sans-serif',
    fill: PURPLE
  });
  y += EYEBROW_H;

  const heroGradient = ctx.createLinearGradient(cardX, y, cardX + cardW, y + HERO_H);
  heroGradient.addColorStop(0, PINK);
  heroGradient.addColorStop(0.6, '#a07cff');
  heroGradient.addColorStop(1, PURPLE);
  drawCentered(ctx, 'Come celebrate with us', cx, y + HERO_H / 2, {
    font: '54px "Great Vibes", cursive',
    fill: heroGradient,
    baseline: 'middle'
  });
  y += HERO_H;

  drawCentered(ctx, '✦   ✧   ✦', cx, y + DIVIDER_H / 2, {
    font: '14px "Quicksand", sans-serif',
    fill: LAVENDER,
    baseline: 'middle'
  });
  y += DIVIDER_H;

  messageLines.forEach((line) => {
    drawCentered(ctx, line, cx, y, { font: MESSAGE_FONT, fill: DEEP_PURPLE });
    y += MESSAGE_LINE_H;
  });
  y += MESSAGE_GAP;

  // ── When & where, in the dashed hero box ──
  const boxX = cardX + 60;
  const boxW = cardW - 120;

  ctx.save();
  const boxBg = ctx.createLinearGradient(0, y, 0, y + BOX_H);
  boxBg.addColorStop(0, '#fff3f9');
  boxBg.addColorStop(1, '#f3e8ff');
  ctx.fillStyle = boxBg;
  roundedRect(ctx, boxX, y, boxW, BOX_H, 22);
  ctx.fill();
  ctx.strokeStyle = LAVENDER;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  roundedRect(ctx, boxX, y, boxW, BOX_H, 22);
  ctx.stroke();
  ctx.restore();

  drawCentered(ctx, 'W H E N', cx, y + 26, {
    font: '500 11px "Quicksand", sans-serif',
    fill: PURPLE
  });
  drawCentered(ctx, 'Saturday, October 3, 2026 · 1:30 PM', cx, y + 52, {
    font: '600 18px "Cormorant Garamond", serif',
    fill: DEEP_PURPLE
  });
  drawCentered(ctx, 'Dedication, with the reception to follow', cx, y + 78, {
    font: '400 13px "Quicksand", sans-serif',
    fill: PURPLE
  });

  drawCentered(ctx, 'W H E R E', cx, y + 108, {
    font: '500 11px "Quicksand", sans-serif',
    fill: PURPLE
  });
  drawCentered(ctx, 'RCK Private Resort and Event Center', cx, y + 132, {
    font: '600 18px "Cormorant Garamond", serif',
    fill: DEEP_PURPLE
  });
  drawCentered(ctx, 'Mabalacat City, Pampanga', cx, y + 156, {
    font: '400 13px "Quicksand", sans-serif',
    fill: PURPLE
  });

  return canvas.toDataURL('image/png');
}
