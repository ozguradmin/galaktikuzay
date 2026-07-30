# Galaktik Uzay Operations Dashboard

Private operations interface for the Galaktik Uzay publishing pipeline. It
shows publishing status, recent posts and logs, and exposes controlled actions
for scheduling, draft generation, and manual publishing.

Authentication and Worker access are handled server-side. Browser JavaScript
never receives the dashboard password, session-signing secret, or Worker API
token.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Required variables are documented in `.env.example`. Use new random values;
never reuse an AI API key as an authentication secret.

## Checks

```bash
npm run lint
npm run build
```
