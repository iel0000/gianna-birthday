import { useState } from 'react';

export default function PhotoFrame({ src, alt, caption, shape = 'circle', size = 'md' }) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  return (
    <figure className={`photo photo--${shape} photo--${size}`}>
      <div className="photo__frame">
        {showImage ? (
          <img src={src} alt={alt} onError={() => setErrored(true)} />
        ) : (
          <div className="photo__placeholder" aria-label={alt}>
            <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden="true">
              <path
                d="M10 14h44v36H10z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="22" cy="26" r="4" fill="currentColor" />
              <path
                d="M14 46l12-14 10 10 8-6 6 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Photo coming soon</span>
          </div>
        )}
      </div>
      {caption && <figcaption className="photo__caption">{caption}</figcaption>}
    </figure>
  );
}
