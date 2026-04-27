// Cartoon fairy clipart positioned around the viewport. Vite serves anything
// in /public at the root, so /fairyN.png works without an import.
//
// To regenerate the transparent PNGs from new source images:
//   python scripts/remove-bg.py public/fairy1.jpg public/fairy1.png
//
// (or batch-process a folder with the same script)

const fairies = [
  {
    src: '/fairy1.png', // hand on hip, wand-like pose
    style: {
      top: '6%',
      left: '3%',
      width: 'clamp(140px, 18vw, 240px)',
      animationDelay: '0s',
      transform: 'rotate(-6deg)'
    }
  },
  {
    src: '/fairy3.png', // arms-down standing fairy
    style: {
      top: '10%',
      right: '3%',
      width: 'clamp(140px, 18vw, 240px)',
      animationDelay: '-2.5s',
      transform: 'rotate(6deg)'
    }
  },
  {
    src: '/fairy4.png', // side profile, flying
    style: {
      bottom: '24%',
      left: '4%',
      width: 'clamp(130px, 16vw, 220px)',
      animationDelay: '-1.2s',
      transform: 'rotate(4deg)'
    }
  },
  {
    src: '/fairy2.png', // hand to hip, looking right
    style: {
      bottom: '12%',
      right: '4%',
      width: 'clamp(130px, 17vw, 230px)',
      animationDelay: '-3.6s',
      transform: 'rotate(-4deg) scaleX(-1)'
    }
  },
  {
    src: '/fairy1.png',
    style: {
      top: '46%',
      left: '50%',
      width: 'clamp(110px, 13vw, 180px)',
      animationDelay: '-1.8s',
      transform: 'translateX(-50%) rotate(-2deg)',
      opacity: 0.7
    }
  }
];

export default function BackgroundImages() {
  return (
    <div className="bg-fairies" aria-hidden="true">
      <div className="bg-fairies__veil" />
      {fairies.map((f, i) => (
        <div key={i} className="bg-fairy" style={f.style}>
          <img src={f.src} alt="" />
        </div>
      ))}
    </div>
  );
}

export function BackgroundCredits() {
  return null;
}
