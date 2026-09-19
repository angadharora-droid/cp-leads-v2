// "STARTERS : Paneer Tikka, Veg Spring Roll" — a course name before the
// colon, its dishes after it. The name must have a letter, so a time such
// as "07:00 PM" is never taken for a course.
const COURSE_LINE = /^\s*([^:]*[A-Za-z][^:]*?)\s*:\s+(.+)$/;

const items = (s) =>
  s
    .split(/\s+\+\s+|,\s+/)
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Tidies a menu list to one item per line: a course typed on one line
 * becomes its name on its own line with each dish under it, items joined
 * with ", " or " + " are split apart, and a blank line separates courses.
 * The same rule runs on the server when the sheet is saved.
 */
export function tidyList(text) {
  const out = [];
  const gap = () => {
    if (out.length && out[out.length - 1] !== '') out.push('');
  };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      gap();
      continue;
    }
    const course = line.match(COURSE_LINE);
    if (course) {
      gap();
      out.push(course[1].trim());
      out.push(...items(course[2]));
      continue;
    }
    out.push(...items(line));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}
