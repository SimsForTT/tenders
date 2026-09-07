// Minimum viable environment so importing ./env.js in tests doesn't throw.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-32-characters-long";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-32-characters-long";
process.env.NODE_ENV = "test";
