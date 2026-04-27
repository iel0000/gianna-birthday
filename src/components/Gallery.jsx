import PhotoFrame from './PhotoFrame.jsx';
import useReveal from '../utils/useReveal.js';

// Drop image files into public/photos/ with these names to replace placeholders.
// Filenames marked with `?` are optional — placeholders will show until the file exists.
const B = import.meta.env.BASE_URL;
const photos = [
  { src: `${B}photos/gianna-1.jpg`, alt: 'Gianna smiling', caption: 'Our little fairy' },
  { src: `${B}photos/gianna-2.jpg`, alt: 'Gianna playing', caption: 'A year of giggles' },
  { src: `${B}photos/gianna-3.jpg`, alt: 'Gianna with family', caption: 'Loved beyond measure' },
  { src: `${B}photos/gianna-4.jpg`, alt: 'Gianna dressed up', caption: 'Sparkle &amp; mischief' }
];

export default function Gallery() {
  const ref = useReveal();
  return (
    <section ref={ref} className="gallery reveal" aria-label="Photos of Gianna">
      <header className="gallery__header">
        <p className="gallery__eyebrow">A peek inside the fairy ring</p>
        <h2 className="gallery__title">Our Avery</h2>
      </header>

      <div className="gallery__grid">
        {photos.map((photo, index) => (
          <div
            className="gallery__item reveal-child"
            key={photo.src}
            style={{ '--reveal-delay': `${index * 140}ms` }}
          >
            <PhotoFrame
              src={photo.src}
              alt={photo.alt}
              caption={photo.caption}
              shape="rounded"
              size="lg"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
