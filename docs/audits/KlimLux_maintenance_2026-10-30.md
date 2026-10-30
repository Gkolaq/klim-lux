# KLIM-LUX — инженерная диагностика, контроль рисков и оптимизация

Дата UTC: 2026-10-30T04:25:27+00:00. Режим: read-only аудит production + локально протестированный контроль качества. Не является публикацией новой версии.

## 1. Source of truth
- Site project: `appgprj_6ac13fc8d10481918e5df6e700854015`.
- Production: https://www.klim-lux.com/
- Последняя документированная native-публикация в историческом журнале от 28.10.2026: `v50`, active/public. Сегодняшний прямой native get_site/source HEAD недоступен; source SHA опубликованной версии = UNKNOWN.
- GitHub `Gkolaq/klim-lux`, default `main` = `87fbd9147837cd7151896015af22c682cb560fb7` (27.07.2025); recovery branch HEAD=`e3a2cf9689345aaa5ed909b026f86b7047de7fa6`, transport branch HEAD=`5528b99348ff3e6469b1c181e046344af31ee364`. Эти ветки не доказаны исходниками v50.
- Существующий архив Google Drive: `KlimLux_v39_Codex_source.zip`, затем `KlimLux_GitHub_source_v41_verified.zip`, `KlimLux_SEO_v42_verified_delta_2026-10-19.zip`. Полного проверенного backup v50 в доступной папке не найдено.

## 2. Production HTTP/SEO — внешние выборочные проверки 30.10.2026
- `/pl/`, `/ru/`, `/en/` возвращают содержимое главных страниц; title, description, lang, canonical соответствуют языку.
- `/pl/contacts/` и `/pl/portfolio/303/` отдают страницы с каноническими адресами.
- `/robots.txt` содержит `User-agent: *`, `Allow: /`, запреты для `/admin/`, `/api/`, `/language/`, `/library-files/` и ссылку на sitemap.
- `/sitemap.xml` — 1005 URLs по заголовку внешнего чтения; PL/RU/EN присутствуют.
- `/be/` переходит на `/ru/`; не проверен точный HTTP status редиректа на уровне браузера.
- Неавторизованный `/admin/` — HTTP 401 (защищена анонимная точка входа; это не аудит ролей).
- Запрос вымышленного 404 URL был заблокирован антибот-слоем и не даёт вывода о 404 обработке.
- HTML-экстрактор не обнаружил `form`/`input` в `/pl/contacts/`; наличие интерактивного JS-формуляра не проверено. Риск для конверсии; нужен E2E, не объявлять дефект доказанным.

## 3. Search Console — 30.09–27.10.2026
7 clicks; 116 impressions; CTR 6.03%; avg position 12.62. В результате на уровне URL присутствуют устаревшие `/be/` адреса с единичными показами; наличие записей в GSC не доказывает ошибку redirect. Выборочный анализ не равен общей диагностике индексации.

## 4. Реально выполненная инженерная работа
- Создан read-only Node.js smoke checker (`scripts/klim-live-smoke.mjs`) для 3 языков, canonical, `html lang`, robots, sitemap, закрытой `/admin/` и старого BE redirect.
- Написаны независимые unit/fixture tests: здоровая локальная площадка и внесённая ошибка canonical; `node --test` 2/2 PASS (Node v22.16.0).
- Доставка заявок и CMS не тестировались, production HTTP-проверки выполнялись внешним fetch инструментом, не новым Node-скриптом.
- Не изменены production, DNS, CMS, данные клиентов, формы, рекламные метки или архивы старых версий.

## 5. Критическая проверка и ограничения
HIGH риск: наличие противоречащих по времени источников; нельзя импортировать GitHub main/recovery в native Site v50 без Version Guard. Один документированный source v50 commit не получен, поэтому невозможно добросовестно назвать новую GitHub-ветку полным backup v50.
Не проверены реальная доставка заявок, авторизация admin изнутри, браузерный JS/mobile E2E, Google реиндексация, северо/восточная региональная доступность, исходник Sites v50, текущий Codex HEAD. Скрипт на сайте не запускался и не внедрялся в production.

## 6. Приоритетная следующая задача
В Sites/Work-capable среде прочитать актуальный native source SHA и release/version, выгрузить точный исходник, сделать независимый архив с SHA256, сравнить с GitHub branch и после проверок безопасно синхронизировать GitHub. До этого не пытаться заменить production исходниками v41.
