# Photos of Gianna

Drop your image files into this folder. The site references them by filename — until a file exists, the page shows a soft "Photo coming soon" placeholder, so you can add images at any time.

## Filenames the site expects

| File name | Where it appears |
| --- | --- |
| `gianna-hero.jpg` | Round portrait at the top of the invitation, framed in white |
| `gianna-1.jpg` | Gallery — first card (caption: "Our little fairy") |
| `gianna-2.jpg` | Gallery — second card (caption: "A year of giggles") |
| `gianna-3.jpg` | Gallery — third card (caption: "Loved beyond measure") |
| `gianna-4.jpg` | Gallery — fourth card (caption: "Sparkle & mischief") |

`.jpg`, `.jpeg`, `.png`, and `.webp` all work — just match the exact filename above (including extension). If you'd rather use a different extension, update the `src` in `src/components/Hero.jsx` and `src/components/Gallery.jsx`.

## Recommended sizes

- **Hero portrait** — square (1:1), at least 600 × 600 px. The site crops to a circle.
- **Gallery photos** — portrait (4:5), at least 800 × 1000 px. The site crops to a rounded rectangle.

Smaller is fine; larger files just take longer to load. Anything under ~500 KB per image is ideal.

## Adding more photos

To add a 5th, 6th, etc. gallery photo, edit the `photos` array in `src/components/Gallery.jsx` and append:

```js
{ src: '/photos/gianna-5.jpg', alt: 'Gianna at the park', caption: 'A spring afternoon' }
```

Then drop `gianna-5.jpg` into this folder.
