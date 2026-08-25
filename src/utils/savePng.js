// Saving a canvas-generated PNG is browser-specific, and the naive path
// fails silently on phones: iOS Safari ignores the `download` attribute on
// a `data:` URL, so tapping "Download my pass" did nothing at all.
//
// Order of preference:
//   1. Web Share API with the file attached — on iOS and Android this opens
//      the native sheet ("Save Image", "Send to Messenger"), which is what a
//      guest on a phone actually wants.
//   2. A blob: URL with `download` — works on desktop and on Android
//      Chrome, unlike a data: URL of the same image.
// Callers get the method back so the UI can say what happened.

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

  if (file && navigator.canShare?.({ files: [file] })) {
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
