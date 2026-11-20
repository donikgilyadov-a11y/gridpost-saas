# Gridpost SaaS — P0 foundation

Серверная основа multi-tenant SaaS:organization как граница изоляции, PostgreSQL + RLS, JWT/OAuth-готовый слой,
Prisma-схема, Redis/BullMQ инфраструктура и Docker Compose.

> Это **фаза P0** плана [docs/SAAS_ROADMAP.md](../../talproject/docs/SAAS_ROADMAP.md) (путь в соседнем репозитории).
> Публикация в соцсети и веб-UI появятся в P1/P2.

## Структура

```
apps/api/            NestJS API
  prisma/            schema.prisma + rls.sql
  src/
    auth/            register/login/JWT
    organizations/   изоляция по org_id + аудит
    prisma/          withOrg() — set_config('app.org_id') внутри транзакции
    queue/           BullMQ queue + idempotent enqueue
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
и `(organizationId, postId, accountId)` для `PostTarget`. Worker появится в P1 вместе с адаптерами соцсетей.

## Проверки

```bash
npm run typecheck
npm run build
```
