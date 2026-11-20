# Gridpost SaaS — P0 + P1 foundation

Server-centric multi-tenant SaaS: организация как граница изоляции, PostgreSQL + RLS, JWT, Prisma, Redis/BullMQ,
облачная публикация 24/7 с идемпотентностью и воркером.

> Дорожная карта: [docs/SAAS_ROADMAP.md](../ai-os-new-main/blob/main/docs/SAAS_ROADMAP.md) в соседнем репозитории.
> Дальше по плану: P2 (Facebook/Instagram + KMS), P3 (веб-клиент), P4 (AI).

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

Реализован только **Telegram P0**. Ошибки 4xx (кроме 429) считаются постоянными и не ретраятся; сетевые, 5xx и
429 — ретраются с экспоненциальной задержкой до 5 попыток.

Ограничения P1: `scheduledAt` — UTC-момент (часовые пояса организаций в следующей итерации), мастер-ключ шифрования
один на инсталляцию (KMS и ротация — P2), реальный OAuth и остальные площадки — P2/P8.

## Проверки

```bash
npm run typecheck
npm test
npm run build
```
