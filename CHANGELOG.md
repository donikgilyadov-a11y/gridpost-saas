# Changelog

## 0.1.0 (P0 + P1)

- **P0**: монорепозиторий, NestJS API, Prisma-схема organizations/users/accounts/posts/targets/audit,
  Row Level Security с organization-контекстом, JWT-авторизация, BullMQ-очередь, Docker Compose, CI.
- **P1**: облачная публикация — API постов и social-аккаунтов, AES-GCM шифрование токенов, воркер с атомарным
  захватом цели, идемпотентность на трёх уровнях, статусы публикаций, ретраи и реконсилятор, планировщик,
  Telegram-адаптер, unit-тест адаптера на моковом Bot API.
