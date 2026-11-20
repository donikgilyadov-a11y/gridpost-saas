# Gridpost SaaS — P0–P8 foundation

Server-centric multi-tenant SaaS: PostgreSQL + RLS, JWT, Prisma, Redis/BullMQ, облачная публикация 24/7,
11 адаптеров соцсетей, OAuth 2.0, KMS, Next.js, AI Studio, аналитика, Stripe, MFA, аудит и наблюдаемость.

> Дорожная карта: [docs/SAAS_ROADMAP.md](../ai-os-new-main/blob/main/docs/SAAS_ROADMAP.md) в соседнем репозитории.

## Структура

```
apps/api/            NestJS API
  prisma/            schema.prisma + rls.sql
  src/
    auth/            register/login/JWT
    organizations/   изоляция по org_id + аудит
    prisma/          withOrg() — set_config('app.org_id') внутри транзакции
    queue/           BullMQ queue + idempotent enqueue
    secrets/         AES-GCM шифрование токенов с ключом организации (P2: KMS)
    publishing/      посты, social-аккаунты, worker, scheduler, Telegram-адаптер
    health/          GET /api/v1/health
apps/web/            Next.js клиент: auth, dashboard, calendar, create, accounts, settings
packages/shared/     общие типы и константы (планы, приоритеты платформ, idempotency key)
```

## Локальный запуск

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init
psql "$DATABASE_URL" -f apps/api/prisma/rls.sql
npm run dev
```

API: `http://localhost:3001/api/v1`

## Изоляция данных

- Каждая таблица (кроме `users`/`organizations`) имеет `organization_id`.
- `PrismaService.withOrg(orgId, …)` выставляет `app.org_id` в транзакции; PostgreSQL RLS фильтрует строки.
- RLS включён с `FORCE`: даже владелец таблиц подчиняется политикам. Runtime-роль БД не должна быть superuser.
- `org_id` берётся из JWT, а не из параметров запроса.
- `AuditLog` пишет действия с `actor_id` и `org_id`.

## Idempotентность очереди

`QueueService.enqueue()` использует `jobId = idempotencyKey`. Повторная постановка той же задачи не создаёт
второй job. В БД это дублируется уникальными ключами `(organizationId, idempotencyKey)` для `Post`
и `(organizationId, postId, accountId)` для `PostTarget`.

## Публикация (P1)

API (все пути под `JwtAuthGuard + OrganizationGuard`):

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST` | `/api/v1/social-accounts/connect` | подключить аккаунт; токен шифруется, `chatId` лежит в `metadata` |
| `GET` | `/api/v1/social-accounts` | список без токенов |
| `POST` | `/api/v1/posts` | создать пост и цели; `key` — клиентский идемпотентный ключ |
| `GET` | `/api/v1/posts` и `/posts/:id` | статусы по каждому аккаунту |
| `POST` | `/api/v1/posts/:id/retry` | ретрай только упавших целей |

Жизненный цикл: `SCHEDULED → QUEUED → PUBLISHING → PUBLISHED/FAILED`. Worker атомарно захватывает цель через
`UPDATE … RETURNING`, не публикует повторно уже `PUBLISHED`, обновляет статусы и счётчик попыток. Планировщик
каждые 15 секунд ставит в очередь наступившие посты и возвращает задачи, зависшие в `PUBLISHING` более 5 минут.

Реализованы **Telegram, Facebook Pages и Instagram Business**. Ошибки 4xx (кроме 429) считаются постоянными и не
ретраются; сетевые, 5xx и 429 — ретраются с экспоненциальной задержкой до 5 попыток.

## OAuth и ключи (P2)

- `GET /api/v1/oauth/:platform/url` — ссылка авторизации (Facebook или Instagram) со state и PKCE.
- `POST /api/v1/oauth/:platform/callback` — обмен кода на токен, поиск Page / IG Business ID и сохранение
  зашифрованного аккаунта.
- Токены шифруются **ключом организации** (AES-GCM), ключ обёрнут KMS (`KMS_PROVIDER=aws`) или локальным
  мастер-ключом (`env`, для разработки). Ротация: `POST /api/v1/organizations/current/rotate-keys`.
- Воркер помечает аккаунт `EXPIRED` и не публикует после истечения срока токена.

Матрица возможностей площадок — в `packages/shared` (`PLATFORM_CAPABILITIES`).

## Ограничения текущей итерации

- `scheduledAt` — UTC-момент; часовые пояса организаций пока не реализованы.
- Refresh-токены и автопродление OAuth не сделаны — после истечения аккаунт нужно переподключить.
- Instagram TEXT-посты зависят от поддержки `media_type=TEXT`; надёжный путь — `imageUrl` (появится с S3 в P3).
- Реальный OAuth требует `FACEBOOK_APP_ID/SECRET` и `OAUTH_REDIRECT_URI`; в тестах площадки подменяются моками.

## Веб-клиент (P3)

```bash
npm run dev:api   # http://localhost:3001/api/v1
npm run dev:web   # http://localhost:3000
```

Разделы: Dashboard (статистика, статусы, ручная публикация черновиков), Calendar, Create, AI Studio,
Social Accounts, Settings (голос бренда и ротация ключей). JWT в localStorage, все запросы идут через `lib/api.ts`.

## AI (P4)

- Провайдеры: OpenAI-совместимый API, Ollama, `mock` для тестов (`AI_PROVIDER`).
- `POST /ai/content` — адаптация темы под каждую площадку (заголовок, текст, крючок, хештеги, CTA) с учётом
  Brand Voice организации и матрицы возможностей платформ.
- `POST /ai/plan` — контент-план с темами, причинами и предлагаемым временем.
- Brand Voice: `GET/PUT /ai/brand-voice` — тон, аудитория, язык, длина, запрещённые слова и фирменные выражения.
- **Human approval**: AI пишет только черновики (`POST /ai/drafts`, статус `DRAFT`). Публикация — отдельный
  явный вызов `POST /posts/:id/publish`; авто-постинга нет.

## Аналитика (P5)

- `POST /analytics/sync` — тянет Insights из Facebook/Instagram для опубликованных постов с `remoteId`,
  сохраняет снимки метрик (доступность зависит от разрешений API).
- `GET /analytics/summary` — суммы Reach, Impressions, Likes, Comments, Shares, Clicks, Followers и разбивка
  по площадкам; `nullable` поля означают, что метрику площадка не отдаёт.
- `GET /analytics/recommendations` — AI-агент анализирует сводку и возвращает конкретные действия с приоритетом.
- В UI — вкладка Analytics с синхронизацией, карточками метрик и рекомендациями.

## Биллинг (P6)

- Модель `Subscription` (Stripe customer/subscription, тариф, статус, конец периода).
- `GET /billing/plans` — тарифы Free/Starter/Pro/Business/Agency/Enterprise, `GET /billing/subscription` — текущий.
- `POST /billing/checkout` — Stripe Checkout (нужны `STRIPE_SECRET_KEY` и `STRIPE_PRICE_*`),
  `POST /billing/portal` — управление подпиской.
- `POST /billing/webhook` — проверка подписи `Stripe-Signature` (HMAC-SHA256, окно 5 минут) и синхронизация
  статуса/тарифа из событий `checkout.session.completed`, `customer.subscription.updated/deleted`.
- Лимиты аккаунтов теперь берутся из активной подписки и проверяются и при подключении аккаунта, и при создании
  поста. Просроченная/отменённая подписка деградирует до `free`.
- В UI — вкладка Billing с текущим тарифом и кнопками выбора плана.

> Для локальной разработки без Stripe можно оставить тариф `free`: лимит 2 аккаунта работает без внешних вызовов.

## Безопасность и эксплуатация (P7)

- **MFA**: TOTP (RFC 6238) без внешних зависимостей — `POST /auth/mfa/setup`, `/enable`, `/disable`; при включённом
  MFA вход без 6-значного кода невозможен. Секрет показывается как `otpauth://` URI.
- **Rate limiting**: глобально 120 запросов/минуту, на `/auth/login` — 5, на `/auth/register` — 3.
- **Аудит**: `AuditInterceptor` записывает все изменяющие запросы с `org_id`, `actor_id`, статусом и IP (кроме webhook).
- **Наблюдаемость**: Sentry (`SENTRY_DSN`) и OpenTelemetry (`OTEL_ENABLED=true`) инициализируются до запуска Nest.
- **GDPR**: `GET /privacy/export` (все данные организации без сырых секретов) и `DELETE /privacy/organization`
  (каскадное удаление). Кнопки есть в Settings.
- **Бэкапы**: `scripts/backup.sh` — `pg_dump` + gzip, ротация и опциональная загрузка в S3.
- **Kubernetes**: манифесты в `k8s/` (deployments, services, ingress, configmap). Секреты создаются отдельно
  как `gridpost-secrets` и не хранятся в git.

## Интеграции (P8)

Воркер умеет публиковать в 11 площадок: Telegram, Facebook Pages, Instagram Business, LinkedIn (UGC Posts),
X (API v2, треды через reply), Bluesky (atproto `createRecord`, reply-chain), Mastodon (`scheduled_at` нативно),
Threads (Threads API), Pinterest (Pins API) — плюс YouTube и TikTok, которые через официальные API принимают
**только видео**: эти два адаптера возвращают понятную permanent-ошибку до появления S3-пайплайна загрузки файлов.

Матрица возможностей и ограничений — `PLATFORM_CAPABILITIES` в `packages/shared`.

## Медиа и OAuth следующих площадок

- **S3-медиатека**: `POST /media/presign` возвращает presigned PUT URL (15 минут, ContentType зафиксирован),
  `POST /media/:id/confirm` проверяет объект через `HeadObject`, `GET /media` и `DELETE /media/:id` — список и удаление.
  Файлы лежат по ключу `orgId/uuid-name`, BOM и лимит 50 МБ проверяются на сервере.
- Медиа из медиатеки привязываются к посту через `mediaIds`; воркер передаёт `imageUrl`/`videoUrl` в адаптеры
  Instagram, LinkedIn, Threads, Pinterest (фото) и Telegram при наличии.
- **OAuth**: добавлены LinkedIn (`w_member_social`, body token exchange, `urn:li:person` из userinfo) и X
  (PKCE + Basic auth, `/2/users/me`). Facebook/Instagram работают через Graph API. Остальные площадки пока
  подключаются токеном и `metadata` (handle, pds, host, userId, boardId).
- **YouTube/TikTok**: адаптеры загружают видео из S3 — YouTube через resumable session (`X-Upload-Content-*`),
  TikTok через `PULL_URL` + polling `publish_id`. Без видео в медиатеке пост не публикуется (permanent-ошибка).

## Команды, клиенты, автоматизации и входящие

- **Teams**: приглашение участника по email, смена роли (`OWNER/ADMIN/MEMBER`) и удаление — в Settings.
- **Clients**: модель клиента агентства, привязка соцаккаунтов через `POST /clients/accounts/:id/assign`, вкладка Clients.
- **Automations**: правила `SCHEDULE_GAP` и `LOW_ENGAGEMENT` с действием `CREATE_DRAFT`; `POST /automations/run`
  проверяет условия и через AI создаёт **только черновики** (без публикации), вкладка Automations.
- **Inbox**: синхронизация комментариев Facebook/Instagram через Graph API, дедупликация по `externalId`,
  отметка «прочитано», вкладка Inbox.

## Интерфейс и релиз

- Тёмная и светлая темы (переключатель в сайдбаре, выбор хранится в localStorage), RU/EN метки навигации.
- Календарь с drag-and-drop: перетаскивание поста на другую дату меняет `scheduledAt` через
  `PATCH /posts/:id/schedule` (опубликованные посты не переносятся).
- Docker-образы `api` и `web` публикуются в GHCR по тегу `v*` (`.github/workflows/docker.yml`); манифесты
  Kubernetes и бэкап-скрипт описаны выше.

Локальный запуск: `docker compose up -d`, `npm install`, `npm run prisma:generate`, миграции, `npm run dev:api`
и `npm run dev:web`.

Electron из старого репозитория остаётся необязательным клиентом; перенос его в тонкую обёртку над API — отдельная
задача после P4/P5.

## Проверки

```bash
npm run typecheck
npm test
npm run build
```
