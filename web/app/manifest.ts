import type { MetadataRoute } from 'next';

// Served by Next at /manifest.webmanifest. Same-origin so it works behind
// Caddy/Cloudflare without any extra route plumbing.

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Pinned so changing start_url later doesn't make the browser treat this as
    // a different PWA and ship a duplicate home-screen icon.
    id: '/',
    name: 'nightshift radio',
    short_name: 'nightshift',
    description:
      'Your late-night companion: 24/7 Punjabi radio with a DJ who never clocks out.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Falls back through minimal-ui to standalone; browsers ignore values they
    // don't understand.
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#100e0c',
    theme_color: '#100e0c',
    categories: ['music', 'entertainment'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/192-maskable', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/512-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // `form_factor: wide` shows on desktop install flows, narrow on mobile.
    screenshots: [
      {
        src: '/screenshots/wide',
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide',
        label: 'nightshift radio player — now playing on the broadcast',
      },
      {
        src: '/screenshots/narrow',
        sizes: '720x1280',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'nightshift radio on mobile',
      },
    ],
  };
}
