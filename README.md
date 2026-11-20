# Gridpost SaaS — P0–P3 foundation

Server-centric multi-tenant SaaS: PostgreSQL + RLS, JWT, Prisma, Redis/BullMQ, облачная публикация 24/7,
OAuth 2.0, KMS-шифрование токенов и веб-клиент на Next.js.

> Дорожная карта: [docs/SAAS_ROADMAP.md](../ai-os-new-main/blob/main/docs/SAAS_ROADMAP.md) в соседнем репозитории.
> Дальше по плану: P4 (AI Content Studio / агент / brand voice), P5 (аналитика).

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

Разделы: Dashboard (статистика и статусы), Calendar (группировка по датам), Create (языковые варианты, выбор
аккаунтов и языка, отложенная публикация), Social Accounts (OAuth и ручное подключение Telegram), Settings
(ротация ключей). JWT хранится в localStorage, все запросы идут через `lib/api.ts`. Тёмная адаптивная тема.

Electron из старого репозитория остаётся необязательным клиентом; перенос его в тонкую обёртку над API — отдельная
задача после P4/P5.

## Проверки

```bash
npm run typecheck
npm test
npm run build
```
