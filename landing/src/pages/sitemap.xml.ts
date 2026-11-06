import type { APIRoute } from 'astro';

const SITE_URL = 'https://iglesia238.com';

const pages = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/soluciones/', priority: '0.9', changefreq: 'monthly' },
  { path: '/como-funciona/', priority: '0.9', changefreq: 'monthly' },
  { path: '/seguridad/', priority: '0.8', changefreq: 'monthly' },
];

export const GET: APIRoute = () => {
  const lastmod = '2026-11-06';
  const urls = pages
    .map(
      (page) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <xhtml:link rel="alternate" hreflang="es-CO" href="${SITE_URL}${page.path}" />
    <xhtml:link rel="alternate" hreflang="es-419" href="${SITE_URL}${page.path}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${page.path}" />
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
