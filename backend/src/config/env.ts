import 'dotenv/config';

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? fallback : trimmed;
}

function parsePort(rawPort: string | undefined): number {
  const port = Number.parseInt(nonEmpty(rawPort, '3000'), 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort ?? ''}`);
  }
  return port;
}

export const env = {
  port: parsePort(process.env.PORT),
  mongodbUri: nonEmpty(process.env.MONGODB_URI, 'mongodb://localhost:27017/timetravel'),
  googleClientId: nonEmpty(process.env.GOOGLE_CLIENT_ID, ''),
  jwtSecret: nonEmpty(process.env.JWT_SECRET, ''),
  tlsCertPath: nonEmpty(process.env.TLS_CERT_PATH, ''),
  tlsKeyPath: nonEmpty(process.env.TLS_KEY_PATH, ''),
} as const;
