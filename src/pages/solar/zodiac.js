// Zodiac constellation catalog + random sky picks. THREE/DOM-free on purpose
// (dynamics.js precedent) so it stays unit-testable under node --test.
//
// Each sign: approximate recognizable star pattern in a [-1, 1]^2 box;
// links index into points. element/dates/brightest/lore feed the dossier
// panel when a constellation is clicked.
export const ZODIAC = [
  { name: 'Aries', symbol: '♈', element: 'Fire', dates: 'Mar 21 – Apr 19',
    brightest: 'Hamal', lore: 'The ram of the Golden Fleece, whose flight carried Phrixus across the sea to Colchis.',
    points: [[-0.9, -0.3], [-0.1, 0.1], [0.5, 0.35], [0.9, 0.1]],
    links: [[0, 1], [1, 2], [2, 3]] },
  { name: 'Taurus', symbol: '♉', element: 'Earth', dates: 'Apr 20 – May 20',
    brightest: 'Aldebaran', lore: 'The bull Zeus became to carry Europa over the waves; its red eye Aldebaran follows the Pleiades forever.',
    points: [[-0.9, 0.9], [-0.3, 0.2], [0, -0.1], [0.3, 0.2], [0.9, 0.85], [0, -0.7]],
    links: [[0, 1], [1, 5], [4, 3], [3, 5], [1, 3]] },
  { name: 'Gemini', symbol: '♊', element: 'Air', dates: 'May 21 – Jun 20',
    brightest: 'Pollux', lore: 'The twins Castor and Pollux, who shared immortality between them so neither would face the dark alone.',
    points: [[-0.35, 0.9], [-0.4, 0.1], [-0.5, -0.8], [0.35, 0.85], [0.45, 0.1], [0.55, -0.75]],
    links: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4]] },
  { name: 'Cancer', symbol: '♋', element: 'Water', dates: 'Jun 21 – Jul 22',
    brightest: 'Tarf', lore: 'The crab sent by Hera to pinch Heracles mid-battle — crushed underfoot, but honored with a place in the sky.',
    points: [[0, 0.9], [0, 0.05], [-0.65, -0.7], [0.6, -0.6]],
    links: [[0, 1], [1, 2], [1, 3]] },
  { name: 'Leo', symbol: '♌', element: 'Fire', dates: 'Jul 23 – Aug 22',
    brightest: 'Regulus', lore: 'The Nemean lion with an impenetrable hide, first of the labors of Heracles.',
    points: [[0.3, 0.8], [0.6, 0.65], [0.7, 0.3], [0.5, 0], [0.15, 0.55], [-0.3, 0.05], [-0.85, -0.35], [-0.35, -0.45]],
    links: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 3], [3, 5], [5, 6], [6, 7], [7, 3]] },
  { name: 'Virgo', symbol: '♍', element: 'Earth', dates: 'Aug 23 – Sep 22',
    brightest: 'Spica', lore: 'The harvest maiden Astraea, last immortal to leave the Earth, holding an ear of wheat — bright Spica.',
    points: [[-0.9, 0.5], [-0.4, 0.25], [0, 0], [0.2, 0.6], [0.5, -0.3], [0.9, -0.6], [-0.2, -0.6]],
    links: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [1, 6]] },
  { name: 'Libra', symbol: '♎', element: 'Air', dates: 'Sep 23 – Oct 22',
    brightest: 'Zubeneschamali', lore: 'The scales of justice — once the claws of the scorpion, later cut free to weigh mortal deeds.',
    points: [[0, 0.8], [-0.6, 0.2], [0.6, 0.25], [-0.75, -0.6], [0.7, -0.65]],
    links: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4]] },
  { name: 'Scorpio', symbol: '♏', element: 'Water', dates: 'Oct 23 – Nov 21',
    brightest: 'Antares', lore: 'The scorpion that felled Orion; the hunter and his killer were set at opposite ends of the sky, never to meet.',
    points: [[-0.6, 0.95], [-0.85, 0.75], [-0.6, 0.55], [-0.45, 0.25], [-0.4, -0.1], [-0.25, -0.45], [0.05, -0.7], [0.45, -0.75], [0.75, -0.5], [0.85, -0.2]],
    links: [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9]] },
  { name: 'Sagittarius', symbol: '♐', element: 'Fire', dates: 'Nov 22 – Dec 21',
    brightest: 'Kaus Australis', lore: 'The centaur archer, bow drawn at the scorpion’s heart, guarding the gate to the galactic center.',
    points: [[-0.6, 0.2], [-0.2, 0.5], [0.05, 0.9], [0.3, 0.45], [0.6, 0.1], [0.35, -0.45], [-0.25, -0.5], [-0.75, -0.2]],
    links: [[0, 1], [1, 2], [2, 3], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]] },
  { name: 'Capricorn', symbol: '♑', element: 'Earth', dates: 'Dec 22 – Jan 19',
    brightest: 'Deneb Algedi', lore: 'The sea-goat Pan became when he dove into the Nile to escape the monster Typhon — goat above, fish below.',
    points: [[-0.85, 0.4], [-0.3, 0.15], [0.3, 0.2], [0.85, 0.45], [0.4, -0.4], [-0.2, -0.55]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
  { name: 'Aquarius', symbol: '♒', element: 'Air', dates: 'Jan 20 – Feb 18',
    brightest: 'Sadalsuud', lore: 'The cup-bearer Ganymede, carried to Olympus by an eagle, pouring an endless stream into the sky.',
    points: [[-0.9, 0.2], [-0.5, 0.5], [-0.1, 0.15], [0.3, 0.5], [0.7, 0.1], [0.9, -0.3], [0.2, -0.6], [-0.4, -0.35]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] },
  { name: 'Pisces', symbol: '♓', element: 'Water', dates: 'Feb 19 – Mar 20',
    brightest: 'Alpherg', lore: 'Aphrodite and Eros as two fishes bound by a cord, so the current could never pull them apart.',
    points: [[0.85, 0.45], [0.6, 0.6], [0.45, 0.35], [0.7, 0.2], [0.15, -0.25], [-0.35, -0.65], [-0.6, -0.2], [-0.8, 0.3], [-0.55, 0.55]],
    links: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]] },
];

// 50% of galaxy builds show no zodiac at all; the other half scatter 2-4
// distinct random signs across the sky. pitch stays under ±0.95 rad so the
// tangent basis in the renderer never degenerates at the poles.
// rng is injectable for deterministic tests.
export function pickZodiac(rng = Math.random) {
  if (rng() < 0.5) return null;
  const count = 2 + Math.floor(rng() * 3);
  const indices = [...ZODIAC.keys()];
  const picks = [];
  for (let i = 0; i < count; i++) {
    const sign = ZODIAC[indices.splice(Math.floor(rng() * indices.length), 1)[0]];
    picks.push({
      sign,
      yaw: rng() * Math.PI * 2,
      pitch: (rng() - 0.5) * 1.9,
      roll: rng() * Math.PI * 2,
      scale: 130 + rng() * 90,
    });
  }
  return picks;
}
