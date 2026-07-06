import * as Sentry from '@sentry/nextjs';

// No-op until SENTRY_DSN is set (OBS-1).
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    enabled: true,
  });
}
