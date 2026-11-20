# Production deployment (v0.1.0)

## 1. Что понадобится

- Домен для web (`gridpost.example.com`) и API (`api.gridpost.example.com`) + wildcard/сертификат TLS.
- PostgreSQL 16, Redis 7, S3-совместимое хранилище (AWS S3 / MinIO / Cloudflare R2).
- GitHub Container Registry: образы уже опубликованы:
  - `ghcr.io/donikgilyadov-a11y/gridpost-saas-api:v0.1.0`
  - `ghcr.io/donikgilyadov-a11y/gridpost-saas-web:v0.1.0`
- Аккаунты разработчиков: Facebook/Meta (Pages + Instagram Business), LinkedIn, X; Stripe; OpenAI (или Ollama).

## 2. Подготовка БД

1. Создать БД `gridpost` и роль `gridpost` **без прав superuser**.
2. Применить миграции Prisma из образа API или локально:
   ```bash
   DATABASE_URL=postgresql://... npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   ```
3. **Обязательно** применить RLS:
   ```bash
   psql "$DATABASE_URL" -f apps/api/prisma/rls.sql
   ```
   Без RLS изоляция организаций держится только на уровнях кода.

## 3. Секреты

Создать `gridpost-secrets` (Kubernetes) или `.env` (Compose) со следующими ключами:

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Redis (BullMQ) |
| `JWT_SECRET` | 32+ случайных байт |
| `KMS_PROVIDER` + `KMS_KEY_ID` | `aws` (продакшн) или `env` + `TOKEN_MASTER_KEY` (только dev) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` | медиа |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `OAUTH_REDIRECT_URI` | Facebook/Instagram OAuth |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | X OAuth (PKCE + Basic) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | AI Studio / агент |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | подписки |
| `SENTRY_DSN`, `OTEL_ENABLED` | наблюдаемость (опционально) |
| `WEB_ORIGIN` | CORS, например `https://gridpost.example.com` |

`OAUTH_REDIRECT_URI` должен быть вида `https://api.gridpost.example.com/api/v1/oauth/callback` и быть зарегистрирован в каждом OAuth-провайдере.

## 4. Запуск

```bash
kubectl create secret generic gridpost-secrets --from-env-file=.env.production
kubectl apply -f k8s/
kubectl get pods -w
```

Проверка: `curl https://api.gridpost.example.com/api/v1/health` → `{"status":"ok","db":"up",...}`.

## 5. Stripe

1. Создать 4 recurring price (Starter/Pro/Business/Agency) и записать их ID в `STRIPE_PRICE_*`.
2. В Stripe Dashboard → Webhooks добавить `https://api.gridpost.example.com/api/v1/billing/webhook`
   и подписать события `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Скопировать signing secret в `STRIPE_WEBHOOK_SECRET` (проверка HMAC-SHA256 в коде).

## 6. Публикация в соцсети

- Facebook/Instagram: Meta App Review, scopes `pages_manage_posts`, `instagram_content_publish`, `pages_show_list`.
- LinkedIn: `w_member_social`, `openid`, `profile`.
- X: OAuth 2.0 с PKCE, scope `tweet.write`, `offline.access`.
- Bluesky/Mastodon/Threads/Pinterest/YouTube/TikTok подключаются токеном через `POST /social-accounts/connect` с нужным `metadata`.

## 7. Бэкапы и обновление

- `scripts/backup.sh` по cron: `pg_dump | gzip`, ротация 14 дней, опциональная загрузка в S3.
- Обновление: поднять новый тег → CI соберёт образы → `kubectl set image deployment/gridpost-api api=...:vX` и web, затем `rollout status`.
- Откат: предыдущий тег образа в GHCR.

## 8. Ограничения

- Видео для YouTube/TikTok забирается из S3 по публичному `S3_PUBLIC_URL`; приватный bucket потребует presigned GET.
- Instagram `media_type=TEXT` доступен не на всех аккаунтах — надёжнее прикладывать изображение.
- Часовые пояса организаций пока не реализованы: `scheduledAt` — UTC-момент.
