import mongoose from 'mongoose';
import { z } from 'zod';

import FunctionProspectus from '../models/FunctionProspectus.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { assertDocumentAccess } from '../utils/access.js';
import { askForJson, isAiEnabled } from './ai.service.js';

/*
 * AI menu check on a Function Prospectus: does the menu offer enough
 * variety — flavours, colours, cooking methods, main ingredients — or does
 * it repeat itself (three red gravies, two paneer mains, every starter
 * fried)? The result is kept on the sheet with the menu it was run on, so
 * the page can tell when the menu has changed since.
 */

const ASPECTS = ['Flavour', 'Colour', 'Cooking method', 'Main ingredient', 'Offering & variety'];
const RATINGS = ['good', 'fair', 'poor'];

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['balanced', 'needs_attention', 'unbalanced'] },
    summary: { type: 'string' },
    aspects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          aspect: { type: 'string', enum: ASPECTS },
          rating: { type: 'string', enum: RATINGS },
          finding: { type: 'string' },
        },
        required: ['aspect', 'rating', 'finding'],
        additionalProperties: false,
      },
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          course: { type: 'string' },
          dishes: { type: 'array', items: { type: 'string' } },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['course', 'dishes', 'problem', 'suggestion'],
        additionalProperties: false,
      },
    },
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          course: { type: 'string' },
          dish: { type: 'string' },
          flavour: { type: 'string' },
          colour: { type: 'string' },
          method: { type: 'string' },
          ingredient: { type: 'string' },
        },
        required: ['course', 'dish', 'flavour', 'colour', 'method', 'ingredient'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'summary', 'aspects', 'issues', 'dishes'],
  additionalProperties: false,
};

const resultZod = z.object({
  verdict: z.enum(['balanced', 'needs_attention', 'unbalanced']),
  summary: z.string(),
  aspects: z.array(z.object({ aspect: z.enum(ASPECTS), rating: z.enum(RATINGS), finding: z.string() })),
  issues: z.array(z.object({ course: z.string(), dishes: z.array(z.string()), problem: z.string(), suggestion: z.string() })),
  dishes: z.array(
    z.object({
      course: z.string(),
      dish: z.string(),
      flavour: z.string(),
      colour: z.string(),
      method: z.string(),
      ingredient: z.string(),
    })
  ),
});

const SYSTEM = `You are an experienced Indian banquet chef reviewing a function menu for a hotel's banquet team before it goes to the kitchen.
Judge whether the menu is well balanced, course by course and as a whole:
- Flavour: a spread of profiles (spicy, tangy, sweet, mild, smoky, creamy) rather than one repeated.
- Colour: gravies and dishes that look different on the buffet (red, yellow, green, white, brown), not the same colour again and again.
- Cooking method: a mix of tandoor, fried, sautéed / dry, gravy, steamed, baked — not everything fried or everything in gravy.
- Main ingredient: no ingredient carrying several dishes in the same course (e.g. two paneer mains, three potato dishes), a sensible spread of vegetables, pulses, dairy, and meats where the menu has them.
- Offering & variety: the courses cover what guests expect (dals, breads, rice, dessert), portions of dry vs gravy, veg / non-veg balance where both appear.
Work only from the dishes listed — never invent dishes. Tag every listed dish in "dishes" (its course, flavour, colour, cooking method and main ingredient, a few words each; "unknown" if the name gives no clue).
Raise an issue only for a real clash, naming the dishes involved and a concrete swap the team could make. Keep the summary to two sentences and each finding to one sentence.
If the menu has too few dishes to judge, say so in the summary and rate what you can.`;

/** A stable fingerprint of the menu as typed, to tell when it changes. */
export function menuKeyOf(fp) {
  const courses = (fp.menuCourses || [])
    .map((c) => `${String(c.name || '').trim()}:${(c.dishes || []).map((d) => String(d).trim()).filter(Boolean).join('|')}`)
    .join('||');
  return `${courses}##${String(fp.menu || '').trim()}`;
}

/** The menu as the reviewer reads it: one course per line with its dishes. */
export function menuText(fp) {
  const lines = [];
  for (const course of fp.menuCourses || []) {
    const dishes = (course.dishes || []).map((d) => String(d).trim()).filter(Boolean);
    if (dishes.length) lines.push(`${course.name || 'Course'}: ${dishes.join(', ')}`);
  }
  if (!lines.length && fp.menu) lines.push(String(fp.menu).trim());
  return lines.join('\n');
}

export async function checkProspectusMenu(id, actor, req) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Prospectus not found', 404, 'NOT_FOUND');
  const fp = await FunctionProspectus.findById(id);
  if (!fp) throw new AppError('Prospectus not found', 404, 'NOT_FOUND');
  await assertDocumentAccess(fp, actor);
  if (!isAiEnabled()) {
    throw new AppError('The menu check is not set up — add ANTHROPIC_API_KEY on the server', 503, 'AI_DISABLED');
  }
  const menu = menuText(fp);
  if (!menu) throw new AppError('Type the dishes under the courses first', 422, 'NO_MENU');

  const context = [
    fp.functionType ? `Function: ${fp.functionType}` : '',
    fp.pax ? `Guests: ${fp.pax}` : '',
    fp.menuPackage ? `Menu package: ${fp.menuPackage}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const result = await askForJson({
    system: SYSTEM,
    content: [{ type: 'text', text: `${context ? `${context}\n\n` : ''}Menu:\n${menu}` }],
    jsonSchema: RESULT_SCHEMA,
    zodSchema: resultZod,
    effort: 'medium',
    maxTokens: 16000,
  });

  const menuCheck = { at: new Date(), byName: actor?.user?.name || '', menuKey: menuKeyOf(fp), result };
  // Stored without touching the sheet's draft / revision state: checking a
  // menu is not an edit of it.
  await FunctionProspectus.updateOne({ _id: fp._id }, { $set: { menuCheck } });
  await writeAudit({
    req,
    actor: actor?.user,
    action: 'prospectus.menu_check',
    entityType: 'FunctionProspectus',
    entityId: fp._id,
    summary: `Menu checked on FP ${fp.number || ''} — ${result.verdict.replace('_', ' ')}`,
  });
  return { menuCheck };
}
