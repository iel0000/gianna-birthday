import useReveal from '../utils/useReveal.js';

const VENUE_NAME = 'RCK Private Resort and Event Center';
const VENUE_ADDRESS = 'Purok Uno Camachiles, Rivera Compound, Mabalacat City, Pampanga';
const MAPS_QUERY = encodeURIComponent(`${VENUE_NAME}, ${VENUE_ADDRESS}`);
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${MAPS_QUERY}`;

const cards = [
  {
    title: 'The Christening',
    when: 'Saturday · October 3, 2026 · 1:30 PM',
    where: VENUE_NAME,
    note: 'A blessing for our little fairy as she begins her faith journey.',
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18" />
        <path d="M6 9h12" />
        <path d="M9 21h6" />
      </svg>
    )
  },
  {
    title: 'The Birthday Reception',
    when: 'Reception immediately following',
    where: VENUE_NAME,
    note: 'Cake, fairy dust, and a wee bit of mischief — come as you are.',
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 21h16" />
        <path d="M5 15c2-2 4-2 7-2s5 0 7 2" />
        <path d="M5 15v6" />
        <path d="M19 15v6" />
        <path d="M12 3v4" />
        <path d="M10 7h4" />
      </svg>
    )
  },
  {
    title: 'What to Bring',
    when: 'Your magical self',
    where: 'No gifts required',
    note: 'Your blessings and presence are the only sparkle we need. A wish for Avery would be lovely.',
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12v9H4v-9" />
        <path d="M2 7h20v5H2z" />
        <path d="M12 22V7" />
        <path d="M12 7H8a2 2 0 110-4c2 0 4 4 4 4z" />
        <path d="M12 7h4a2 2 0 100-4c-2 0-4 4-4 4z" />
      </svg>
    )
  }
];

export default function EventDetails() {
  const sectionRef = useReveal();
  return (
    <section ref={sectionRef} className="details reveal" aria-label="Event details">
      <div className="details__grid">
        {cards.map((card, index) => (
          <article
            className="detail-card reveal-child"
            key={card.title}
            style={{ '--reveal-delay': `${index * 120}ms` }}
          >
            <div className="detail-card__icon" aria-hidden="true">{card.icon}</div>
            <h3>{card.title}</h3>
            <p className="detail-card__when">{card.when}</p>
            <p className="detail-card__where">{card.where}</p>
            <p className="detail-card__note">{card.note}</p>
          </article>
        ))}
      </div>

      <article
        className="venue-card reveal-child"
        style={{ '--reveal-delay': `${cards.length * 120}ms` }}
      >
        <div className="venue-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s-7-7.5-7-13a7 7 0 0114 0c0 5.5-7 13-7 13z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </div>
        <div className="venue-card__body">
          <p className="venue-card__eyebrow">The Venue</p>
          <h3 className="venue-card__name">{VENUE_NAME}</h3>
          <p className="venue-card__address">{VENUE_ADDRESS}</p>
          <a className="venue-card__link" href={MAPS_URL} target="_blank" rel="noreferrer">
            Open in Google Maps →
          </a>
        </div>
      </article>
    </section>
  );
}
