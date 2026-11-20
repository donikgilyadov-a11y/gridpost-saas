# Changelog

## 0.1.0 (P0 + P1)

- **P0**: монорепозиторий, NestJS API, Prisma-схема organizations/users/accounts/posts/targets/audit,
  Row Level Security с organization-контекстом, JWT-авторизация, BullMQ-очередь, Docker Compose, CI.
- **P1**: облачная публикация — API постов и social-аккаунтов, воркер с атомарным захватом цели, идемпотентность
  на трёх уровнях, статусы публикаций, ретраи и реконсилятор, планировщик, Telegram-адаптер.
- **P2**: OAuth 2.0 (PKCE + state) для Facebook Pages и Instagram Business, KMS-провайдеры (AWS KMS или локальный
  мастер-ключ) с данных ключом на организацию и ротацией, адаптеры Facebook/Instagram, матрица возможностей
  площадок, проверка срока действия OAuth-токена, unit-тесты трёх адаптеров на моковых API.
- **P3**: веб-клиент Next.js — авторизация, Dashboard, Calendar, Create (языковые варианты и адресаты),
  Social Accounts (OAuth и Telegram), Settings (ротация ключей), общий API-клиент и адаптивная тёмная тема.
- **P4**: AI провайдеры (OpenAI/Ollama/mock), Content Studio с адаптацией под площадки, контент-план, Brand Voice
  на уровне организации, AI-черновики с обязательным ручным подтверждением публикации, вкладка AI Studio в UI.
- **P5**: метрики Reach/Impressions/Engagement и др. (снимки в PostgreSQL), синхронизация Insights Facebook и
  Instagram, сводка по площадкам, AI-рекомендации, вкладка Analytics в веб-клиенте.
- **P6**: Stripe Checkout и Billing Portal, webhook с проверкой подписи, модель подписки, тарифы Free…Enterprise,
  принудительное соблюдение лимитов аккаунтов на сервере, вкладка Billing.
