// "Tumhara mini-MBA lesson": the concept the visitor just used, and where Zenith teaches it.
// ZENITH WORDING ONLY FROM zenithschool.ai / the vendored copy data/zenith.json (src zenith_site_2026_10_07):
//   programme "B.Tech in AI + Mini MBA", usp "4 mandatory real-world live projects with 30+ companies",
//   course names from skill_map (how-businesses-make-money, talking-to-users, product-thinking).
// Claude never writes these lines; it only picks the concept. Change wording here, nowhere else.

export const PROGRAMME = 'B.Tech in AI + mini-MBA, one KRMU degree';
const LIVE_PROJECTS = '4 mandatory real-world live projects with 30+ companies';

const COURSES = {
  customer: 'Product Thinking for AI Startups: Design Thinking & Problem Discovery',
  finance: 'Finance & Unit Economics',
  gtm: 'Product, Market & GTM',
  strategy: 'Mini-MBA: AI Law, Ethics, Venture Deals, Strategy, Decision-Making & Competition',
};

export const LESSONS = {
  customer: { title: 'Customer', emoji: 'target', course: COURSES.customer },
  margin: { title: 'Margin', emoji: 'chart', course: COURSES.finance },
  pricing: { title: 'Pricing', emoji: 'card', course: COURSES.finance },
  unit_economics: { title: 'Unit economics', emoji: 'scale', course: COURSES.finance },
  moat: { title: 'Moat', emoji: 'shield', course: COURSES.strategy },
  scale: { title: 'Scale', emoji: 'rocket', course: COURSES.gtm },
  brand: { title: 'Brand', emoji: 'heart', course: COURSES.gtm },
  distribution: { title: 'Go-to-market', emoji: 'compass', course: COURSES.gtm },
};

/** The Zenith line under the lesson. Same facts every time, only the course name changes. */
export function zenithLine(concept) {
  const l = LESSONS[concept] || LESSONS.customer;
  return `Zenith ke B.Tech in AI + mini-MBA mein yeh "${l.course}" mein seekhte hain, aur ${LIVE_PROJECTS} pe apply karte hain.`;
}

export function lessonCard(concept, explain) {
  const key = LESSONS[concept] ? concept : 'customer';
  return { concept: key, title: LESSONS[key].title, icon: LESSONS[key].emoji, explain, zenith: zenithLine(key), course: LESSONS[key].course };
}
