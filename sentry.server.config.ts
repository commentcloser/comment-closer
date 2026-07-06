import * as Sentry from '@sentry/nextjs';

// Only initialises when a DSN is provided, so this is a no-op until you set
// SENTRY_DSN in the environment (OBS-1).
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    enabled: true,
  });
}
