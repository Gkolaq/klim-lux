# Commercial service map — PL / EN

Scope: the four existing services, Polish and English editions, with Warsaw as
the confirmed business location. These are targeting hypotheses based on the
actual offer, not measured search volumes or guaranteed rankings. Existing URLs,
owner text, photographs and business facts are retained.

| Service path | Polish intent and phrase hypotheses | English intent and phrase hypotheses |
|---|---|---|
| `/services/upholstery/` | Replace fixed upholstery: `wymiana tapicerki Warszawa`, `tapicerowanie kanapy Warszawa`, `tapicerowanie fotela` | Replace fixed upholstery: `sofa reupholstery Warsaw`, `armchair reupholstery Warsaw` |
| `/services/restoration/` | Repair comfort, filling, springs or frame: `renowacja mebli tapicerowanych Warszawa`, `naprawa siedziska kanapy`, `wymiana wypełnienia fotela` | Repair the upholstered furniture underneath: `upholstered furniture restoration Warsaw`, `sagging sofa seat repair Warsaw` |
| `/services/covers/` | Removable fitted cover: `pokrowce na kanapy na wymiar Warszawa`, `szycie pokrowców na fotele`, `zdejmowany pokrowiec na kanapę` | Removable fitted cover: `made to measure sofa covers Warsaw`, `custom armchair covers Warsaw` |
| `/services/details/` | Conditional mechanism repair or individual upholstered elements: `naprawa mechanizmu kanapy Warszawa`, `poduszki na wymiar Warszawa` | Conditional mechanism repair or individual elements: `sofa bed mechanism repair Warsaw`, `made to measure cushions Warsaw` |

Each path has existing `/pl` and `/en` editions on `https://www.klim-lux.com`.
The service overview owns the broad workshop/service-list intent. The details
page retains its two existing intents; this map does not invent separate offers.

## Contextual navigation

`src/data/service-links.ts` defines the two useful alternatives for each service:

- Upholstery → restoration for underlying wear; covers for a removable solution.
- Restoration → upholstery for the outer finish; details for mechanisms or separate elements.
- Covers → upholstery for fixed fabric replacement; restoration for a damaged seat/frame.
- Details → restoration for wider furniture repair; covers for removable fabric parts.

Links use current localized service titles and leads, normal server-rendered
`<a href>` elements, and same-language canonical paths. Missing services are
omitted. Russian remains supported in the shared interface; no new language is
introduced. Existing visual styles are reused without new CSS.

## Facts and limits

- Confirmed: Oleg Klimko / Klim & Co, Warsaw, existing services and real portfolio.
- Visits, final scope, pricing, timing, transport and compatible mechanism parts
  are agreed individually, as stated in the existing offer.
- Europe-wide furniture collection/delivery, additional workshop locations,
  fixed prices, lead times, credentials and search volumes: UNKNOWN.
- English supports international visitors; it does not imply physical branches
  or a confirmed service area throughout Europe.
- Owner-authored final content remains a later owner task. No duplicate city
  pages, keyword stuffing, automatic translations or repeated indexing requests.

## Measurement

Use separate PL and EN service-prefix groups in the existing search analytics.
Record impressions/clicks as a baseline and distinguish them from enquiries.
Search-query samples are sparse; absence of a query row is not proof of zero
demand. Reassess after fresh settled data, rather than repeating the same report
immediately after deployment. A live link check is not proof of reindexing.

Technical basis: [Google Search Central — link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
