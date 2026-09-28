import Anthropic from '@anthropic-ai/sdk';

import env from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';

/*
 * One place that talks to the Claude API. Every call asks for a JSON answer
 * that matches a schema (structured outputs) and is validated again with zod
 * before anyone uses it. A declined request is retried server-side on
 * Anthropic's recommended fallback model (`fallbacks: "default"`).
 */

let client = null;

export function isAiEnabled() {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!isAiEnabled()) {
    throw new AppError('AI features are not set up — add ANTHROPIC_API_KEY on the server', 503, 'AI_DISABLED');
  }
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Sends one request and returns the parsed, validated JSON answer.
 *
 * @param {object} opts
 * @param {string} opts.system instructions
 * @param {Array} opts.content user content blocks (text / image / document)
 * @param {object} opts.jsonSchema JSON Schema the answer must follow
 * @param {import('zod').ZodTypeAny} opts.zodSchema the same shape, checked on arrival
 * @param {'low'|'medium'|'high'} [opts.effort]
 * @param {number} [opts.maxTokens]
 */
export async function askForJson({ system, content, jsonSchema, zodSchema, effort = 'medium', maxTokens = 16000 }) {
  const anthropic = getClient();
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: env.AI_MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema: jsonSchema } },
      system,
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AppError('The AI key on the server was rejected', 502, 'AI_AUTH');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AppError('The AI service is busy — try again in a minute', 503, 'AI_RATE_LIMITED');
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new AppError(`The AI service could not read this: ${err.message}`, 422, 'AI_BAD_REQUEST');
    }
    if (err instanceof Anthropic.APIError) {
      throw new AppError('The AI service is unavailable right now', 502, 'AI_UNAVAILABLE');
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new AppError('The AI service declined this request', 422, 'AI_REFUSED');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AppError('The AI answer was cut short — try again', 502, 'AI_TRUNCATED');
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError('The AI answer could not be read — try again', 502, 'AI_BAD_JSON');
  }
  const checked = zodSchema.safeParse(parsed);
  if (!checked.success) {
    throw new AppError('The AI answer was incomplete — try again', 502, 'AI_BAD_SHAPE');
  }
  return checked.data;
}

export default { isAiEnabled, askForJson };
