import { z } from 'zod';
import type { Fact } from './pulsoai.stats.js';

export const PULSOAI_MODEL = 'openai/gpt-oss-20b';
export const PROMPT_VERSION = 'pulsoai-facts-v1';
export class GenerationError extends Error {
  constructor(public readonly code: 'PROVIDER_UNAVAILABLE' | 'INVALID_GENERATION' | 'CONFIGURATION_ERROR',
    public readonly retryable = false, public readonly retryAfterMs = 30_000) { super(code); }
}
export function composePlan(facts: Fact[], input: unknown): string {
  const plan = z.object({ sentences: z.array(z.object({
    id: z.string(), variant: z.union([z.literal(0), z.literal(1)]),
  }).strict()).length(facts.length) }).strict().safeParse(input);
  if (!plan.success) throw new GenerationError('INVALID_GENERATION');
  const used = new Set<string>();
  return plan.data.sentences.map(({ id, variant }) => {
    const fact = facts.find(f => f.id === id);
    if (!fact || used.has(id)) throw new GenerationError('INVALID_GENERATION');
    used.add(id);
    return fact.wordings[variant];
  }).join('\n\n');
}
export async function generateSummary(facts: Fact[], options: { key: string; model: string }, request: typeof fetch = fetch) {
  if (options.model !== PULSOAI_MODEL || !options.key.trim()) throw new GenerationError('CONFIGURATION_ERROR');
  let response: Response;
  try {
    response = await request('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.key}` },
      body: JSON.stringify({ model: options.model, reasoning_effort: 'low', max_completion_tokens: 2048,
        stream: false, messages: [
          { role: 'system', content: 'Eres PulsoAI. Organiza un resumen descriptivo académico en español usando TODOS los hechos proporcionados exactamente una vez. Devuelve un plan JSON, no prosa. Selecciona variante 0 o 1 por hecho. Pon overview primero y disclaimer al final; agrupa cada magnitud con su calidad. No calcules, diagnostiques ni añadas hechos.' },
          { role: 'user', content: JSON.stringify({ facts }) },
        ], response_format: { type: 'json_schema', json_schema: { name: 'pulsoai_plan', strict: true,
          schema: { type: 'object', additionalProperties: false, required: ['sentences'], properties: {
            sentences: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'variant'],
              properties: { id: { type: 'string', enum: facts.map(f => f.id) }, variant: { type: 'integer', enum: [0, 1] } } } },
          } },
        } },
      }),
    });
  } catch { throw new GenerationError('PROVIDER_UNAVAILABLE', true); }
  if (!response.ok) {
    const wait = response.headers.get('retry-after');
    const seconds = wait ? Number(wait) : NaN;
    const deadline = wait ? Date.parse(wait) : NaN;
    const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(deadline) ? deadline - Date.now() : 30_000;
    throw new GenerationError('PROVIDER_UNAVAILABLE', response.status === 429 || response.status >= 500,
      Math.min(86_400_000, Math.max(30_000, retryAfterMs)));
  }
  try {
    const data = z.object({ model: z.string(), choices: z.array(z.object({ finish_reason: z.string(),
      message: z.object({ content: z.string() }) })).min(1) }).parse(await response.json());
    if (data.model !== options.model || data.choices?.[0]?.finish_reason !== 'stop') throw new Error();
    const text = composePlan(facts, JSON.parse(data.choices[0].message.content));
    return { text, model: data.model as string };
  } catch { throw new GenerationError('INVALID_GENERATION'); }
}
