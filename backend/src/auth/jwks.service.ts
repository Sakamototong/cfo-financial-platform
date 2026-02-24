import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

@Injectable()
export class JwksService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private issuer: string;
  private audience: string | undefined;

  private allowedIssuers: string[];

  constructor() {
    const host = process.env.KEYCLOAK_HOST || 'http://keycloak:8080';
    const realm = process.env.KEYCLOAK_REALM || 'master';
    this.issuer = `${host}/realms/${realm}`;
    this.audience = process.env.KEYCLOAK_CLIENT_ID;

    // Accept tokens issued with either the internal Docker hostname or the
    // external URL that browsers / the Keycloak admin console see.
    const externalHost = process.env.KEYCLOAK_EXTERNAL_HOST || 'http://localhost:8081';
    this.allowedIssuers = [
      this.issuer,                       // e.g. http://keycloak:8080/realms/master
      `${externalHost}/realms/${realm}`,  // e.g. http://localhost:8081/realms/master
    ];

    console.log(`[JwksService] Configured issuers: ${this.allowedIssuers.join(', ')}, audience: ${this.audience || '(none)'}`);
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/protocol/openid-connect/certs`));
  }

  async verify(token: string): Promise<JWTPayload> {
    // Allow a local demo token format to bypass JWKS verification for dev convenience
    if (token && token.startsWith('demo-token-')) {
      const { AuthService } = require('./auth.service');
      const parsed = AuthService.parseDemoToken(token);
      const role = parsed?.role || 'admin';
      const demoUsername = parsed?.username || 'admin';
      const demoTenant = parsed?.tenant || 'admin';
      
      const demoPayload: any = { 
        sub: demoUsername, 
        preferred_username: demoTenant, 
        email: demoUsername,
        demo_username: demoUsername,
        azp: 'demo',
        realm_access: {
          roles: [role]
        }
      };
      
      console.log(`[JwksService] Demo token: user=${demoUsername}, role=${role}, tenant=${demoTenant}`);
      return demoPayload as JWTPayload;
    }

    // Verify token with issuer only, skip audience check
    // Keycloak tokens have multiple audiences (master-realm, account, etc.)
    // Try each allowed issuer — the token may have been issued via the external
    // URL (localhost:8081) or the internal Docker hostname (keycloak:8080).
    let lastErr: any;
    for (const iss of this.allowedIssuers) {
      try {
        const opts: any = { issuer: iss };
        const { payload } = await jwtVerify(token, this.jwks as any, opts);
        console.log(`[JwksService] Token verified. Subject: ${payload.sub}, preferred_username: ${payload.preferred_username}, azp: ${payload.azp}`);
        return payload;
      } catch (err) {
        lastErr = err;
        // If it's an issuer mismatch, try the next one
        if ((err as any)?.message?.includes('iss')) continue;
        // For other errors (e.g. expired, bad signature), throw immediately
        console.error(`[JwksService] Token verification failed:`, (err as any)?.message || err);
        throw err;
      }
    }

    console.error(`[JwksService] Token verification failed:`, (lastErr as any)?.message || lastErr);
    throw lastErr;
  }
}
