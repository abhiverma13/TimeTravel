import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

import { createApp } from './app';
import { AuthService } from './auth/authService';
import { createGoogleTokenVerifier } from './auth/googleTokenVerifier';
import { env } from './config/env';
import { connectToDatabase, disconnectFromDatabase } from './db/connection';

async function main(): Promise<void> {
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET must be set in backend/.env');
  }
  await connectToDatabase(env.mongodbUri);

  const authService = new AuthService(createGoogleTokenVerifier(env.googleClientId), env.jwtSecret);
  const app = createApp({ authService });
  const hasTlsConfiguration = Boolean(env.tlsCertPath && env.tlsKeyPath);
  const server = hasTlsConfiguration
    ? createHttpsServer({ cert: readFileSync(env.tlsCertPath), key: readFileSync(env.tlsKeyPath) }, app)
    : createHttpServer(app);

  server.listen(env.port, () => {
    console.info(`Server listening on ${hasTlsConfiguration ? 'HTTPS' : 'HTTP'} port ${String(env.port)}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => {
        disconnectFromDatabase().catch((error: unknown) => {
          console.error('Failed to close the database connection', error);
          process.exitCode = 1;
        });
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error('Failed to start the TimeTravel backend', error);
  process.exitCode = 1;
});
