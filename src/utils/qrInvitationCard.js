import QRCode from 'qrcode';
import {
  drawCentered,
  ensureFontsLoaded,
  fitFontSize,
  loadImage,
  roundedRect,
  wrapText
} from './canvasCard.js';

// Renders the host-facing invitation card: a themed portrait PNG carrying
// the guest's name, an invitation message, their reserved seats and the
// scannable QR. The host sends this single image to a guest instead of a
// bare QR that arrives with no context.

const PINK = '#d94994';
const PURPLE = '#6f4ed1';
const DEEP_PURPLE = '#3d2a73';
const LAVENDER = '#c8a8ff';
const WHITE = '#ffffff';

const W = 800;
const PAD = 40;
const HEADER_H = 250;
const QR_SIZE = 320;
const QR_FRAME_PAD = 24;
const QR_FRAME_SIZE = QR_SIZE + QR_FRAME_PAD * 2; // square frame around the QR

// Section heights. The total canvas height is summed from these before
// drawing, then the draw pass walks a cursor through the same constants —
// so layout lives in exactly one place.
const BODY_TOP_PAD = 40;
const EYEBROW_H = 30;
const NAME_H = 92;
const DIVIDER_H = 38;
const MESSAGE_LINE_H = 30;
const SEATS_GAP = 24;
const SEATS_BOX_H = 92;
const GODPARENT_H = 40;
const QR_CAPTION_H = 38;
const VENUE_GAP = 34;
const VENUE_H = 76;
const URL_H = 32;
const BODY_BOTTOM_PAD = 34;

const MESSAGE_FONT = 'italic 21px "Cormorant Garamond", serif';

const GUEST_MESSAGE =
  "Come and celebrate Avery's first birthday and christening with us. " +
  'Scan the code below to open your invitation and send us your reply.';

const GODPARENT_MESSAGE =
  "It would mean the world to us to have you stand as one of Avery's " +
  'godparents. Scan the code below to open your invitation and reply.';

// Generates the QR on its own canvas, then overlays the hero portrait
// clipped to a circle in the centre. Error correction H lets the QR
// survive ~30% obstruction, so the centre photo doesn't break scanning.
// If the photo fails to load, the QR is returned without it.
async function renderQrCanvas(url, logoSrc, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: DEEP_PURPLE,
      light: WHITE
    }
  });

  const logo = logoSrc ? await loadImage(logoSrc) : null;
  if (logo) {
    const ctx = canvas.getContext('2d');
    const logoSize = Math.round(size * 0.22); // 22% of the QR keeps it readable
    const cx = size / 2;
    const cy = size / 2;
    const r = logoSize / 2;

    // White circular pad so the QR modules around the photo stay readable.
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, cx - r, cy - r, logoSize, logoSize);
    ctx.restore();
  }

  return canvas;
}

export async function generateQrInvitationCard({ invitation, url, logoSrc }) {
  await ensureFontsLoaded();

  const isGodparent = !!invitation.is_godparent;
  const seats = Math.max(0, Number(invitation.seats) || 0);
  const name = invitation.name || 'Dear Guest';
  const message = isGodparent ? GODPARENT_MESSAGE : GUEST_MESSAGE;

  const cardX = PAD;
  const cardW = W - PAD * 2;
  const contentW = cardW - 120;

  // ── Measure pass: the message's line count drives the canvas height ──
  const measure = document.createElement('canvas').getContext('2d');
  const messageLines = wrapText(measure, message, contentW, MESSAGE_FONT);

  const bodyH =
    BODY_TOP_PAD +
    EYEBROW_H +
    NAME_H +
    DIVIDER_H +
    messageLines.length * MESSAGE_LINE_H +
    SEATS_GAP +
    SEATS_BOX_H +
    (isGodparent ? GODPARENT_H : 0) +
    QR_CAPTION_H +
    QR_FRAME_SIZE +
    VENUE_GAP +
    VENUE_H +
    URL_H +
    BODY_BOTTOM_PAD;

  const H = PAD * 2 + HEADER_H + bodyH;

  const qrCanvas = await renderQrCanvas(url, logoSrc, QR_SIZE);

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

  drawCentered(ctx, 'A   F A I R Y   C E L E B R A T I O N', cx, cardY + 42, {
    font: '500 13px "Quicksand", sans-serif',
    fill: WHITE
  });
  drawCentered(ctx, 'Our Avery', cx, cardY + 118, {
    font: '58px "Great Vibes", cursive',
    fill: WHITE,
    baseline: 'middle'
  });
  drawCentered(ctx, '1ST BIRTHDAY & CHRISTENING', cx, cardY + 156, {
    font: '600 16px "Quicksand", sans-serif',
    fill: WHITE
  });
  drawCentered(ctx, '✦  Saturday · October 3, 2026 · 1:30 PM  ✦', cx, cardY + 200, {
    font: '14px "Quicksand", sans-serif',
    fill: 'rgba(255, 255, 255, 0.9)'
  });

  // ── Body ──
  let y = cardY + HEADER_H + BODY_TOP_PAD;

  drawCentered(ctx, "✨  Y O U ' R E   I N V I T E D  ✨", cx, y, {
    font: '600 12px "Quicksand", sans-serif',
    fill: PURPLE
  });
  y += EYEBROW_H;

  const nameSize = fitFontSize(
    ctx,
    name,
    contentW,
    (size) => `${size}px "Great Vibes", cursive`,
    62,
    28
  );
  const nameGradient = ctx.createLinearGradient(cardX, y, cardX + cardW, y + NAME_H);
  nameGradient.addColorStop(0, PINK);
  nameGradient.addColorStop(0.6, '#a07cff');
  nameGradient.addColorStop(1, PURPLE);
  drawCentered(ctx, name, cx, y + NAME_H / 2, {
    font: `${nameSize}px "Great Vibes", cursive`,
    fill: nameGradient,
    baseline: 'middle'
  });
  y += NAME_H;

  drawCentered(ctx, '✦   ✧   ✦', cx, y, {
    font: '14px "Quicksand", sans-serif',
    fill: LAVENDER
  });
  y += DIVIDER_H;

  messageLines.forEach((line) => {
    drawCentered(ctx, line, cx, y, { font: MESSAGE_FONT, fill: DEEP_PURPLE });
    y += MESSAGE_LINE_H;
  });
  y += SEATS_GAP;

  // ── Reserved seats ──
  const seatsBoxX = cardX + 60;
  const seatsBoxW = cardW - 120;
  ctx.save();
  const seatsBg = ctx.createLinearGradient(0, y, 0, y + SEATS_BOX_H);
  seatsBg.addColorStop(0, '#fff3f9');
  seatsBg.addColorStop(1, '#f3e8ff');
  ctx.fillStyle = seatsBg;
  roundedRect(ctx, seatsBoxX, y, seatsBoxW, SEATS_BOX_H, 22);
  ctx.fill();
  ctx.strokeStyle = LAVENDER;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  roundedRect(ctx, seatsBoxX, y, seatsBoxW, SEATS_BOX_H, 22);
  ctx.stroke();
  ctx.restore();

  const seatsGradient = ctx.createLinearGradient(0, y + 16, 0, y + 60);
  seatsGradient.addColorStop(0, PINK);
  seatsGradient.addColorStop(1, '#a07cff');
  drawCentered(ctx, String(seats), cx, y + 40, {
    font: '700 42px "Cormorant Garamond", serif',
    fill: seatsGradient,
    baseline: 'middle'
  });
  drawCentered(ctx, seats === 1 ? 'seat reserved for you' : 'seats reserved for you', cx, y + 70, {
    font: '500 14px "Quicksand", sans-serif',
    fill: DEEP_PURPLE,
    baseline: 'middle'
  });
  y += SEATS_BOX_H;

  if (isGodparent) {
    drawCentered(ctx, "💜  Lovingly listed as one of Avery's godparents", cx, y + 12, {
      font: '500 16px "Quicksand", sans-serif',
      fill: PINK
    });
    y += GODPARENT_H;
  }

  // ── QR ──
  drawCentered(ctx, 'S C A N   T O   O P E N   R S V P', cx, y + 8, {
    font: '600 12px "Quicksand", sans-serif',
    fill: PURPLE
  });
  y += QR_CAPTION_H;

  const frameX = cx - QR_FRAME_SIZE / 2;
  ctx.save();
  ctx.fillStyle = WHITE;
  roundedRect(ctx, frameX, y, QR_FRAME_SIZE, QR_FRAME_SIZE, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 124, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  roundedRect(ctx, frameX, y, QR_FRAME_SIZE, QR_FRAME_SIZE, 26);
  ctx.stroke();
  ctx.restore();

  // Clip the QR to a rounded rect so its square white corners don't
  // poke past the frame's radius.
  ctx.save();
  roundedRect(ctx, frameX + QR_FRAME_PAD, y + QR_FRAME_PAD, QR_SIZE, QR_SIZE, 14);
  ctx.clip();
  ctx.drawImage(qrCanvas, frameX + QR_FRAME_PAD, y + QR_FRAME_PAD, QR_SIZE, QR_SIZE);
  ctx.restore();
  y += QR_FRAME_SIZE + VENUE_GAP;

  // ── Venue ──
  drawCentered(ctx, 'T H E   V E N U E', cx, y, {
    font: '500 11px "Quicksand", sans-serif',
    fill: PURPLE
  });
  drawCentered(ctx, 'RCK Private Resort and Event Center', cx, y + 24, {
    font: '600 18px "Cormorant Garamond", serif',
    fill: DEEP_PURPLE
  });
  drawCentered(ctx, 'Mabalacat City, Pampanga', cx, y + 52, {
    font: '400 13px "Quicksand", sans-serif',
    fill: PURPLE
  });
  y += VENUE_H;

  // Plain-text link, in case the camera won't cooperate.
  const urlSize = fitFontSize(
    ctx,
    url,
    cardW - 80,
    (size) => `400 ${size}px "Quicksand", sans-serif`,
    12,
    7
  );
  drawCentered(ctx, url, cx, y, {
    font: `400 ${urlSize}px "Quicksand", sans-serif`,
    fill: '#8a7aaa'
  });

  return canvas.toDataURL('image/png');
}
