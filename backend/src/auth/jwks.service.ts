import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

@Injectable()
export class JwksService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private issuer: string;
  private audience: string | undefined;

  constructor() {
    const host = process.env.KEYCLOAK_HOST || 'http://keycloak:8080';
    const realm = process.env.KEYCLOAK_REALM || 'master';
    this.issuer = `${host}/realms/${realm}`;
    this.audience = process.env.KEYCLOAK_CLIENT_ID;
    console.log(`[JwksService] Configured issuer: ${this.issuer}, audience: ${this.audience || '(none)'}`);
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/protocol/openid-connect/certs`));
  }

  async verify(token: string): Promise<JWTPayload> {
    // Allow a local demo token format to bypass JWKS verification for dev convenience
    if (token && token.startsWith('demo-token-')) {
      // Extract role from token (e.g., demo-token-super-admin -> super_admin)
      const rolePart = token.replace('demo-token-', '');
      const role = rolePart.replace(/-/g, '_'); // Convert hyphens to underscores
      
      const demoPayload: any = { 
        sub: 'admin', 
        preferred_username: 'admin', 
        azp: 'demo',
        realm_access: {
          roles: [role] // Single role from token
        }
      };
      
      console.log(`[JwksService] Using demo token with role: ${role}`);
      return demoPayload as JWTPayload;
    }

    // Verify token with issuer only, skip audience check
    // Keycloak tokens have multiple audiences (master-realm, account, etc.)
    const opts: any = { issuer: this.issuer };
    // Don't verify audience to allow flexible token usage
    // if (this.audience) opts.audience = this.audience;
    
    try {
      const { payload } = await jwtVerify(token, this.jwks as any, opts);
      console.log(`[JwksService] Token verified. Subject: ${payload.sub}, preferred_username: ${payload.preferred_username}, azp: ${payload.azp}`);
      return payload;
    } catch (err) {
      console.error(`[JwksService] Token verification failed:`, (err as any)?.message || err);
      throw err;
    }
  }
}
