// nightshift radio: the shared clock. Listeners correct their device time against
// this so a phone with a drifting clock still hears the same moment of the broadcast.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
