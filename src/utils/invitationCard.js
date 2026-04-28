import QRCode from 'qrcode';

// Wait for the brand web fonts to be ready before painting the card —
// otherwise the canvas falls back to a generic serif while the
// Google-Font script is still loading.
async function ensureFontsLoaded() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  await Promise.all([
    document.fonts.load('400 120px "Great Vibes"'),
    document.fonts.load('400 80px "Great Vibes"'),
    document.fonts.load('italic 32px "Cormorant Garamond"'),
    document.fonts.load('600 22px "Cormorant Garamond"'),
    document.fonts.load('500 13px "Quicksand"')
  ]).catch(() => {});
}

function roundedRect(ctx, x, y, w, h, r) {
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

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Renders the personalised invitation card onto an offscreen canvas
// and returns it as a PNG data URL. Layout is portrait 800×1200 so it
// looks like a printable ticket / pass.
export async function generateInvitationCard({ user, rsvp, inviteUrl }) {
  await ensureFontsLoaded();

  const W = 800;
  const H = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fff3f9');
  bg.addColorStop(0.5, '#f3e8ff');
  bg.addColorStop(1, '#fde4f1');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Inner card ──
  const cardX = 50;
  const cardY = 50;
  const cardW = W - cardX * 2;
  const cardH = H - cardY * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(217, 73, 148, 0.18)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fill();
  ctx.restore();

  // ── Header gradient band ──
  const headerH = 280;
  ctx.save();
  roundedRect(ctx, cardX, cardY, cardW, headerH, 36);
  ctx.clip();
  const header = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH);
  header.addColorStop(0, '#ff7eb6');
  header.addColorStop(0.5, '#c8a8ff');
  header.addColorStop(1, '#a07cff');
  ctx.fillStyle = header;
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();

  // ── Header text ──
  ctx.textAlign = 'center';
  const cx = W / 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = '500 13px "Quicksand", sans-serif';
  ctx.fillText('A   F A I R Y   C E L E B R A T I O N', cx, cardY + 50);

  ctx.font = '60px "Great Vibes", cursive';
  ctx.fillText('Our Avery', cx, cardY + 130);

  ctx.font = '600 16px "Quicksand", sans-serif';
  ctx.fillText('1ST BIRTHDAY & CHRISTENING', cx, cardY + 175);

  // Sparkle line under header
  ctx.font = '14px "Quicksand", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText('✦  Saturday · October 3, 2026 · 1:30 PM  ✦', cx, cardY + 220);

  // ── Body content ──
  const bodyY = cardY + headerH + 40;

  // "ADMIT ONE" eyebrow
  ctx.fillStyle = '#6f4ed1';
  ctx.font = '600 12px "Quicksand", sans-serif';
  ctx.fillText('✨  Y O U   A R E   W E L C O M E   ✨', cx, bodyY);

  // Guest name (cursive, gradient)
  const displayName = user.invitation?.name || user.name || 'Dear Guest';
  ctx.font = '64px "Great Vibes", cursive';
  const nameGradient = ctx.createLinearGradient(cardX, bodyY + 40, cardX + cardW, bodyY + 80);
  nameGradient.addColorStop(0, '#d94994');
  nameGradient.addColorStop(0.6, '#a07cff');
  nameGradient.addColorStop(1, '#6f4ed1');
  ctx.fillStyle = nameGradient;
  ctx.fillText(displayName, cx, bodyY + 70);

  // Sparkle divider
  ctx.fillStyle = '#c8a8ff';
  ctx.font = '14px "Quicksand", sans-serif';
  ctx.fillText('✦   ✧   ✦', cx, bodyY + 110);

  // ── Reserved seats hero ──
  const seatsBoxY = bodyY + 140;
  const seatsBoxH = 160;
  const seatsBoxX = cardX + 60;
  const seatsBoxW = cardW - 120;

  ctx.save();
  const seatsBg = ctx.createLinearGradient(0, seatsBoxY, 0, seatsBoxY + seatsBoxH);
  seatsBg.addColorStop(0, '#fff3f9');
  seatsBg.addColorStop(1, '#f3e8ff');
  ctx.fillStyle = seatsBg;
  roundedRect(ctx, seatsBoxX, seatsBoxY, seatsBoxW, seatsBoxH, 22);
  ctx.fill();
  ctx.strokeStyle = '#c8a8ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  roundedRect(ctx, seatsBoxX, seatsBoxY, seatsBoxW, seatsBoxH, 22);
  ctx.stroke();
  ctx.restore();

  // Big seat count number
  if (rsvp.attending) {
    const countGradient = ctx.createLinearGradient(0, seatsBoxY + 30, 0, seatsBoxY + 110);
    countGradient.addColorStop(0, '#d94994');
    countGradient.addColorStop(1, '#a07cff');
    ctx.fillStyle = countGradient;
    ctx.font = '700 76px "Cormorant Garamond", serif';
    ctx.fillText(String(rsvp.seats || 0), cx, seatsBoxY + 100);

    ctx.fillStyle = '#3d2a73';
    ctx.font = 'italic 22px "Cormorant Garamond", serif';
    ctx.fillText(
      rsvp.seats === 1 ? 'seat reserved for you' : 'seats reserved for you',
      cx,
      seatsBoxY + 135
    );
  } else {
    ctx.fillStyle = '#3d2a73';
    ctx.font = 'italic 26px "Cormorant Garamond", serif';
    ctx.fillText('We will miss you 🌸', cx, seatsBoxY + 80);
    ctx.font = '500 14px "Quicksand", sans-serif';
    ctx.fillStyle = '#6f4ed1';
    ctx.fillText('Your blessings are still with Avery.', cx, seatsBoxY + 115);
  }

  // ── Optional kids line ──
  let cursorY = seatsBoxY + seatsBoxH + 36;
  if (rsvp.attending && rsvp.bringingKids && rsvp.kidsCount > 0) {
    ctx.fillStyle = '#6f4ed1';
    ctx.font = '500 16px "Quicksand", sans-serif';
    ctx.fillText(
      `🌸  Bringing ${rsvp.kidsCount} ${rsvp.kidsCount === 1 ? 'little one' : 'little ones'}`,
      cx,
      cursorY
    );
    cursorY += 36;
  }

  if (rsvp.isGodparent || user.invitation?.is_godparent) {
    ctx.fillStyle = '#d94994';
    ctx.font = '500 16px "Quicksand", sans-serif';
    ctx.fillText("💜  Lovingly listed as one of Avery's godparents", cx, cursorY);
    cursorY += 36;
  }

  // ── Venue ──
  cursorY = Math.max(cursorY, seatsBoxY + seatsBoxH + 56);
  ctx.fillStyle = '#6f4ed1';
  ctx.font = '500 11px "Quicksand", sans-serif';
  ctx.fillText('T H E   V E N U E', cx, cursorY);
  cursorY += 26;
  ctx.fillStyle = '#3d2a73';
  ctx.font = '600 18px "Cormorant Garamond", serif';
  ctx.fillText('RCK Private Resort and Event Center', cx, cursorY);
  cursorY += 24;
  ctx.fillStyle = '#6f4ed1';
  ctx.font = '400 13px "Quicksand", sans-serif';
  ctx.fillText('Mabalacat City, Pampanga', cx, cursorY);

  // ── QR code at bottom (entry pass) ──
  if (inviteUrl) {
    const qrSize = 140;
    const qrX = cx - qrSize / 2;
    const qrY = cardY + cardH - qrSize - 80;

    const qrCanvas = document.createElement('canvas');
    try {
      await QRCode.toCanvas(qrCanvas, inviteUrl, {
        width: qrSize,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#3d2a73', light: '#ffffff' }
      });
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    } catch (err) {
      console.warn('[invitation card] QR draw failed', err);
    }

    ctx.fillStyle = '#8a7aaa';
    ctx.font = '500 12px "Quicksand", sans-serif';
    ctx.fillText('Show this at the door', cx, qrY + qrSize + 24);
  }

  return canvas.toDataURL('image/png');
}
