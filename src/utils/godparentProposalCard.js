import {
  drawCentered,
  ensureFontsLoaded,
  loadImage,
  roundedRect,
  wrapText
} from './canvasCard.js';

// Renders a godparent proposal card — the static image the host sends
// when asking someone to stand as one of Avery's godparents. One card per
// role ('ninong' for the godfathers, 'ninang' for the godmothers). Neither
// carries guest data, so each PNG goes to everyone being asked that role.
//
// Layout follows the guest invitation card (invitationCard.js): the same
// gradient header band, the same pink→purple cursive headline, and the
// same dashed hero box — here it carries the question instead of a seat
// count.

const PINK = '#d94994';
const PURPLE = '#6f4ed1';
const DEEP_PURPLE = '#3d2a73';
const LAVENDER = '#c8a8ff';
const WHITE = '#ffffff';

const W = 800;
const PAD = 40;
const HEADER_H = 285;
const PORTRAIT_SIZE = 150;
const PORTRAIT_RING = 7;
// How far the portrait's centre sits below the header band's edge. Keeps
// the ring clear of the date line above it while still straddling the band.
const PORTRAIT_DROP = 10;

// Section heights. The total canvas height is summed from these before
// drawing, then the draw pass walks a cursor through the same constants —
// so the layout lives in exactly one place.
const BODY_TOP_PAD = PORTRAIT_DROP + PORTRAIT_SIZE / 2 + PORTRAIT_RING + 40;
const EYEBROW_H = 34;
const BOX_GAP = 34;
const BOX_H = 236;
const DIVIDER_H = 40;
const MESSAGE_LINE_H = 31;
const MESSAGE_GAP = 34;
const DETAILS_H = 96;
const SIGNOFF_H = 84;
const BODY_BOTTOM_PAD = 40;

const MESSAGE_FONT = 'italic 21px "Cormorant Garamond", serif';

const MESSAGE =
  'Mama and Daddy have chosen you to walk beside me in faith and love — to guide me, ' +
  'pray for me, and be a steady presence as I grow. It would mean the world to have ' +
  'you stand with me on my christening day.';

// The only thing that differs between the two cards is the word in the
// hero box and the filename the host saves it under.
export const PROPOSAL_ROLES = {
  ninong: { label: 'Ninong', question: 'Ninong?', file: 'avery-ninong-proposal.png' },
  ninang: { label: 'Ninang', question: 'Ninang?', file: 'avery-ninang-proposal.png' }
};

export async function generateGodparentProposalCard({ role = 'ninong', portraitSrc } = {}) {
  const roleConfig = PROPOSAL_ROLES[role];
  if (!roleConfig) {
    throw new Error(`Unknown proposal role "${role}".`);
  }

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
    BOX_GAP +
    BOX_H +
    DIVIDER_H +
    messageLines.length * MESSAGE_LINE_H +
    MESSAGE_GAP +
    DETAILS_H +
    SIGNOFF_H +
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
  drawCentered(ctx, 'Our Avery', cx, cardY + 112, {
    font: '58px "Great Vibes", cursive',
    fill: WHITE,
    baseline: 'middle'
  });
  drawCentered(ctx, '1ST BIRTHDAY & CHRISTENING', cx, cardY + 148, {
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
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(cx, portraitCy, r + PORTRAIT_RING, 0, Math.PI * 2);
  ctx.fill();
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
      font: '48px "Quicksand", sans-serif',
      fill: LAVENDER,
      baseline: 'middle'
    });
  }
  ctx.restore();

  // ── Body ──
  let y = cardY + HEADER_H + BODY_TOP_PAD;

  drawCentered(ctx, '✨  W I T H   A L L   M Y   H E A R T  ✨', cx, y, {
    font: '600 12px "Quicksand", sans-serif',
    fill: PURPLE
  });
  y += EYEBROW_H + BOX_GAP;

  // ── The question, in the dashed hero box ──
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

  drawCentered(ctx, 'Would you do me the honour —', cx, y + 36, {
    font: 'italic 19px "Cormorant Garamond", serif',
    fill: PURPLE,
    baseline: 'middle'
  });

  const questionGradient = ctx.createLinearGradient(boxX, y + 60, boxX + boxW, y + 190);
  questionGradient.addColorStop(0, PINK);
  questionGradient.addColorStop(0.6, '#a07cff');
  questionGradient.addColorStop(1, PURPLE);

  drawCentered(ctx, 'Will you be my', cx, y + 98, {
    font: '52px "Great Vibes", cursive',
    fill: questionGradient,
    baseline: 'middle'
  });
  drawCentered(ctx, roleConfig.question, cx, y + 176, {
    font: '86px "Great Vibes", cursive',
    fill: questionGradient,
    baseline: 'middle'
  });
  y += BOX_H;

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

  // ── Christening details ──
  drawCentered(ctx, 'T H E   C H R I S T E N I N G', cx, y, {
    font: '500 11px "Quicksand", sans-serif',
    fill: PURPLE
  });
  drawCentered(ctx, 'RCK Private Resort and Event Center', cx, y + 26, {
    font: '600 18px "Cormorant Garamond", serif',
    fill: DEEP_PURPLE
  });
  drawCentered(ctx, 'Mabalacat City, Pampanga · Saturday, October 3, 2026', cx, y + 54, {
    font: '400 13px "Quicksand", sans-serif',
    fill: PURPLE
  });
  y += DETAILS_H;

  // ── Sign-off ──
  drawCentered(ctx, 'With all my love,', cx, y, {
    font: '500 13px "Quicksand", sans-serif',
    fill: PURPLE
  });
  drawCentered(ctx, 'Gianna Avery', cx, y + 46, {
    font: '44px "Great Vibes", cursive',
    fill: PINK,
    baseline: 'middle'
  });

  return canvas.toDataURL('image/png');
}
