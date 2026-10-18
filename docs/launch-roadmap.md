# Klim-Lux: maintenance roadmap

## Source and recovery

1. Preserve a verified production baseline and separate backups of CMS data and uploaded files.
2. Complete privacy review of the local public-source candidate before importing its tree onto the existing GitHub history.
3. Restore source integration without replacing the existing Site, database, bucket, domain, or runtime configuration.

## Quality and content

- Maintain PL, RU, and EN routes, canonical URLs, language links, the sitemap, and retired-language redirects.
- Preserve authored text, real photographs, and intentional hidden items. Add commercial facts only after the owner confirms them.
- Verify the relevant browser interactions and accessibility when their code changes. Measure performance before making performance claims.
- Use isolated tests for CMS, uploads, mail, and release tools. Follow `docs/release.md`; avoid unrelated runtime changes during source recovery.

## Promotion

Use actual Search Console and analytics results when available. A submitted sitemap or accepted notification is not proof of indexing, and an accepted contact request is not proof of a completed sale. Business profile details, service areas, and opening hours require confirmed business facts.
