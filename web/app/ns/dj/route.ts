// nightshift radio: the AI DJ. Writes one short on-air link between two songs with
// Gemini. Without GEMINI_API_KEY (or on any failure) it answers 204 and the
// player falls back to its own written lines, so the station never goes quiet.
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const clip = (v: unknown, n = 120) => (typeof v === 'string' ? v.slice(0, n) : '');

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return new Response(null, { status: 204 });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* empty body */ }
  const prompt = `You are ${clip(b.host, 30) || 'the host'}, a warm late-night radio DJ on "nightshift radio", hosting the show "${clip(b.show, 40)}".
Mood: ${clip(b.mood, 30)}. Local time: ${clip(b.time, 30)}. Weather: ${clip(b.weather, 40) || 'unknown'}.
Just played: ${clip(b.prev) || 'nothing yet'}. Up next: ${clip(b.next) || 'a fresh pick'}.
Write ONE on-air link of 1-2 short sentences (max 35 words) to say between the songs. Casual, human, a little Punjabi/Hinglish flavour is welcome.
Mention the next artist if known. No emojis, no hashtags, no quotes, no stage directions.`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6000),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 120 } }),
    });
    if (!r.ok) return new Response(null, { status: 204 });
    const d = await r.json();
    const text = String(d?.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/["*_#]/g, '').trim();
    return text ? Response.json({ text }) : new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
