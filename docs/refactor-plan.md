# Klim-Lux: maintenance plan

The application separates configuration, content and languages, shared components, views, styling, SEO, server storage, and administration.

## Boundaries

- Preserve the existing Site, URLs, D1/R2 bindings, schema history, authored content, original artwork, real photographs, and owner edits.
- Keep UI behavior in browser modules, storage and validation on the server, and shared presentation in components and styles.
- Use CMS values for editable business information. Do not invent addresses, prices, testimonials, service areas, or commercial promises.
- Make a focused change and run the relevant checks from `docs/release.md`. Device interaction and Core Web Vitals require their own measurements.

## Public source preparation

Prepare a sanitized tree separately from the production baseline. Review the exact diff before any GitHub import or release. Source synchronization does not authorize changes to production content, media, or infrastructure.
