# Changelog

## 0.1.0 (P0 + P1)

- **P0**: монорепозиторий, NestJS API, Prisma-схема organizations/users/accounts/posts/targets/audit,
  Row Level Security с organization-контекстом, JWT-авторизация, BullMQ-очередь, Docker Compose, CI.
- **P1**: облачная публикация — API постов и social-аккаунтов, воркер с атомарным захватом цели, идемпотентность
  на трёх уровнях, статусы публикаций, ретраи и реконсилятор, планировщик, Telegram-адаптер.
- **P2**: OAuth 2.0 (PKCE + state) для Facebook Pages и Instagram Business, KMS-провайдеры (AWS KMS или локальный
  мастер-ключ) с данных ключом на организацию и ротацией, адаптеры Facebook/Instagram, матрица возможностей
  площадок, проверка срока действия OAuth-токена, unit-тесты трёх адаптеров на моковых API.
