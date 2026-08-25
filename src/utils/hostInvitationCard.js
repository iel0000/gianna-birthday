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
// the guest's name, an invitation message and their reserved seats. The
// host sends this single image to a guest instead of a bare QR that
// arrives with no context.
//
// Three variants share the layout, differing only in how the guest is
// asked to reply:
//   'qr'     — the standard card: message + QR + the link in plain text.
//   'guided' — same QR, preceded by numbered camera instructions, for a
//              guest who has a smartphone but has never scanned a code.
//   'simple' — no QR, no link, nothing to tap. Their seats are reserved
//              and the card says so; nothing is asked of them.

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

// Extra sections the non-QR variants need.
const STEPS_TITLE_H = 36;
const STEP_LINE_H = 34;
const STEPS_BOTTOM_GAP = 14;
const DEADLINE_H = 38;
const NOTE_GAP = 26;
const NOTE_BOX_H = 134;
const WHEN_H = 26;

// Avery's portrait sits under the header band on every variant — the same
// treatment the landing page and the godparent proposal card use. It used
// to be embedded in the centre of the QR, which cost scan reliability for
// a photo too small to enjoy.
const PORTRAIT_SIZE = 170;
const PORTRAIT_RING = 7;
const PORTRAIT_GAP = 26;
const PORTRAIT_BLOCK_H = PORTRAIT_SIZE + PORTRAIT_RING * 2 + PORTRAIT_GAP;

// Only the variants that ask for a reply carry the deadline — the 'simple'
// card asks for nothing, so a cut-off there would contradict it.
const RSVP_BY = 'Kindly reply on or before September 17, 2026';

const STEPS = [
  'Open the camera on your phone',
  'Point it at the square below',
  'Tap the link that pops up'
];

const GUEST_MESSAGE =
  "Come and celebrate Avery's first birthday and dedication with us. " +
  'Scan the code below to open your invitation and send us your reply.';

const GODPARENT_MESSAGE =
  "It would mean the world to us to have you stand as one of Avery's " +
  'godparents. Scan the code below to open your invitation and reply.';

// The 'simple' variant asks nothing of the guest, so its message says so
// rather than pointing at a code that isn't there.
const SIMPLE_GUEST_MESSAGE =
  "Come and celebrate Avery's first birthday and dedication with us. " +
  'We would love to have you there on her special day.';

const SIMPLE_GODPARENT_MESSAGE =
  "It would mean the world to us to have you stand as one of Avery's " +
  'godparents on her dedication day.';

export const CARD_VARIANTS = {
  qr: { label: 'Standard', file: '' },
  guided: { label: 'Step by step', file: '-steps' },
  simple: { label: 'No reply needed', file: '-simple' }
};

// Generates the QR on its own canvas. Nothing is overlaid on it — the
// portrait lives in the card's hero slot instead, which keeps every module
// scannable. Error correction stays at H for print and screenshot wear.
async function renderQrCanvas(url, size) {
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

  return canvas;
}

export async function generateHostInvitationCard({
  invitation,
  url,
  portraitSrc,
  variant = 'qr'
}) {
  if (!CARD_VARIANTS[variant]) {
    throw new Error(`Unknown invitation card variant "${variant}".`);
  }
  await ensureFontsLoaded();

  const showsQr = variant !== 'simple';
  const isGodparent = !!invitation.is_godparent;
  const seats = Math.max(0, Number(invitation.seats) || 0);
  const name = invitation.name || 'Dear Guest';
  const message = showsQr
    ? isGodparent
      ? GODPARENT_MESSAGE
      : GUEST_MESSAGE
    : isGodparent
      ? SIMPLE_GODPARENT_MESSAGE
      : SIMPLE_GUEST_MESSAGE;

  const cardX = PAD;
  const cardW = W - PAD * 2;
  const contentW = cardW - 120;

  // ── Measure pass: the message's line count drives the canvas height ──
  const measure = document.createElement('canvas').getContext('2d');
  const messageLines = wrapText(measure, message, contentW, MESSAGE_FONT);

  // Everything above the reply section is identical across variants.
  const sharedH =
    BODY_TOP_PAD +
    PORTRAIT_BLOCK_H +
    EYEBROW_H +
    NAME_H +
    DIVIDER_H +
    messageLines.length * MESSAGE_LINE_H +
    SEATS_GAP +
    SEATS_BOX_H +
    (isGodparent ? GODPARENT_H : 0);

  const stepsH =
    variant === 'guided'
      ? STEPS_TITLE_H + STEPS.length * STEP_LINE_H + STEPS_BOTTOM_GAP
      : 0;

  const replyH = showsQr
    ? (variant === 'guided' ? stepsH : QR_CAPTION_H) + QR_FRAME_SIZE + DEADLINE_H
    : NOTE_GAP + NOTE_BOX_H;

  const bodyH =
    sharedH +
    replyH +
    VENUE_GAP +
    VENUE_H +
    (showsQr ? URL_H : WHEN_H) +
    BODY_BOTTOM_PAD;

  const H = PAD * 2 + HEADER_H + bodyH;

  const qrCanvas = showsQr ? await renderQrCanvas(url, QR_SIZE) : null;
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

  drawCentered(ctx, 'A   F A I R Y   C E L E B R A T I O N', cx, cardY + 42, {
    font: '500 13px "Quicksand", sans-serif',
    fill: WHITE
  });
  drawCentered(ctx, 'Our Avery', cx, cardY + 118, {
    font: '58px "Great Vibes", cursive',
    fill: WHITE,
    baseline: 'middle'
  });
  drawCentered(ctx, '1ST BIRTHDAY & DEDICATION', cx, cardY + 156, {
    font: '600 16px "Quicksand", sans-serif',
    fill: WHITE
  });
  drawCentered(ctx, '✦  Saturday · October 3, 2026 · 1:30 PM  ✦', cx, cardY + 200, {
    font: '14px "Quicksand", sans-serif',
    fill: 'rgba(255, 255, 255, 0.9)'
  });

  // ── Body ──
  let y = cardY + HEADER_H + BODY_TOP_PAD;

  // ── Portrait ──
  {
    const r = PORTRAIT_SIZE / 2;
    const portraitCy = y + PORTRAIT_RING + r;

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

    y += PORTRAIT_BLOCK_H;
  }

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

  // ── Reply section ──
  if (variant === 'guided') {
    drawCentered(ctx, 'H O W   T O   R E P L Y', cx, y + 8, {
      font: '600 12px "Quicksand", sans-serif',
      fill: PURPLE
    });
    y += STEPS_TITLE_H;

    // Numbered, left-aligned so the eye tracks down the list. The block is
    // centred as a whole by measuring the widest line first.
    const stepFont = '500 17px "Quicksand", sans-serif';
    ctx.font = stepFont;
    const widest = Math.max(
      ...STEPS.map((step, i) => ctx.measureText(`${i + 1}.  ${step}`).width)
    );
    const stepX = cx - widest / 2;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    STEPS.forEach((step, i) => {
      const lineY = y + STEP_LINE_H / 2 + i * STEP_LINE_H;

      ctx.beginPath();
      ctx.fillStyle = LAVENDER;
      ctx.arc(stepX + 11, lineY, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '600 14px "Quicksand", sans-serif';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), stepX + 11, lineY + 1);

      ctx.font = stepFont;
      ctx.fillStyle = DEEP_PURPLE;
      ctx.textAlign = 'left';
      ctx.fillText(step, stepX + 36, lineY);
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    y += STEPS.length * STEP_LINE_H + STEPS_BOTTOM_GAP;
  } else if (showsQr) {
    drawCentered(ctx, 'S C A N   T O   O P E N   R S V P', cx, y + 8, {
      font: '600 12px "Quicksand", sans-serif',
      fill: PURPLE
    });
    y += QR_CAPTION_H;
  } else {
    // No QR, no link — a reassurance box where the code would have been.
    y += NOTE_GAP;
    const noteX = cardX + 60;
    const noteW = cardW - 120;

    ctx.save();
    const noteBg = ctx.createLinearGradient(0, y, 0, y + NOTE_BOX_H);
    noteBg.addColorStop(0, '#fff3f9');
    noteBg.addColorStop(1, '#f3e8ff');
    ctx.fillStyle = noteBg;
    roundedRect(ctx, noteX, y, noteW, NOTE_BOX_H, 22);
    ctx.fill();
    ctx.strokeStyle = LAVENDER;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    roundedRect(ctx, noteX, y, noteW, NOTE_BOX_H, 22);
    ctx.stroke();
    ctx.restore();

    drawCentered(ctx, 'Nothing to reply to', cx, y + 42, {
      font: '34px "Great Vibes", cursive',
      fill: PINK,
      baseline: 'middle'
    });
    drawCentered(ctx, 'Your seats are saved — simply come', cx, y + 86, {
      font: 'italic 19px "Cormorant Garamond", serif',
      fill: DEEP_PURPLE,
      baseline: 'middle'
    });
    drawCentered(ctx, 'and celebrate with us. 💜', cx, y + 110, {
      font: 'italic 19px "Cormorant Garamond", serif',
      fill: DEEP_PURPLE,
      baseline: 'middle'
    });
    y += NOTE_BOX_H;
  }

  const frameX = cx - QR_FRAME_SIZE / 2;
  if (showsQr) {
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
    y += QR_FRAME_SIZE;

    drawCentered(ctx, `✦  ${RSVP_BY}  ✦`, cx, y + DEADLINE_H / 2, {
      font: '600 15px "Quicksand", sans-serif',
      fill: PINK,
      baseline: 'middle'
    });
    y += DEADLINE_H;
  }
  y += VENUE_GAP;

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

  if (showsQr) {
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
  } else {
    // No link to print, so repeat the when — the one thing they must remember.
    drawCentered(ctx, 'Saturday · October 3, 2026 · 1:30 PM', cx, y, {
      font: '600 14px "Quicksand", sans-serif',
      fill: PINK
    });
  }

  return canvas.toDataURL('image/png');
}
