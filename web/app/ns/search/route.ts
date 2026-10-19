// nightshift radio: song search. Reads YouTube's public results page server-side
// (no API key, no CORS) and returns the top videos.
export const dynamic = 'force-dynamic';

interface Hit { id: string; title: string; channel: string; length: string }

function collect(node: unknown, out: Hit[]) {
  if (out.length >= 10 || !node || typeof node !== 'object') return;
  const v = (node as { videoRenderer?: Record<string, unknown> }).videoRenderer;
  if (v && typeof v.videoId === 'string') {
    const text = (k: string) => {
      const o = v[k] as { runs?: { text?: string }[]; simpleText?: string } | undefined;
      return o?.runs?.[0]?.text ?? o?.simpleText ?? '';
    };
    const length = text('lengthText');
    if (length) out.push({ id: v.videoId, title: text('title'), channel: text('ownerText'), length });
    return;
  }
  for (const child of Object.values(node)) collect(child, out);
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 100);
  if (!q) return Response.json({ results: [] });
  try {
    const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en&sp=EgIQAQ%253D%253D`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const json = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)?.[1];
    const results: Hit[] = [];
    if (json) collect(JSON.parse(json), results);
    return Response.json({ results }, { headers: { 'Cache-Control': 's-maxage=3600' } });
  } catch {
    return Response.json({ results: [] }, { status: 502 });
  }
}
