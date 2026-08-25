// Saving a canvas-generated PNG is browser-specific, and the naive path
// fails silently on phones: iOS Safari ignores the `download` attribute on
// a `data:` URL, so tapping "Download my pass" did nothing at all.
//
// Which path is right depends on the device, not on what the browser
// happens to support:
//   • Phones and tablets — the Web Share API, whose sheet offers "Save
//     Image" and sending straight to Messenger. On iOS it is the only thing
//     that works at all, since Safari ignores `download` on a data: URL.
//   • Desktop — a plain download. Windows Chrome and Edge also implement
//     the Share API, but a host clicking "Download PNG" wants a file on
//     disk, not a share sheet asking which app to send it to.
// Callers get the method back so the UI can say what happened.

// Share only where a share sheet is the natural way to keep a file. A
// desktop with a touchscreen still reports a fine primary pointer, so this
// stays false there — which is the behaviour we want.
function prefersShareSheet() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (navigator.userAgentData?.mobile) return true;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  return !!coarse && (navigator.maxTouchPoints || 0) > 0;
}

export function dataUrlToBlob(dataUrl) {
  const [meta, base64] = String(dataUrl).split(',');
  const mime = /:(.*?);/.exec(meta || '')?.[1] || 'image/png';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Deferred — revoking immediately can cancel the save before the browser
  // has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

// Returns { ok, method } where method is 'share' | 'cancelled' | 'download'.
export async function savePng({ dataUrl, filename, shareTitle }) {
  const blob = dataUrlToBlob(dataUrl);

  let file = null;
  try {
    file = new File([blob], filename, { type: blob.type });
  } catch {
    file = null; // Very old Safari has no File constructor.
  }

  if (file && prefersShareSheet() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle || filename });
      return { ok: true, method: 'share' };
    } catch (err) {
      // The guest dismissing the sheet is not a failure — don't then shove a
      // download at them. Anything else falls through to the download path.
      if (err?.name === 'AbortError') {
        return { ok: true, method: 'cancelled' };
      }
      console.warn('[savePng] share failed, falling back to download', err);
    }
  }

  downloadBlob(blob, filename);
  return { ok: true, method: 'download' };
}
