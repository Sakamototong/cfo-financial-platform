import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly keycloakUrl = process.env.KEYCLOAK_HOST || process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  private readonly realm = process.env.KEYCLOAK_REALM || 'master';
  private readonly clientId = process.env.KEYCLOAK_CLIENT_ID || 'cfo-client';

  // Demo/test user credentials mapped to their roles and tenants
  private readonly demoUsers: Record<string, { password: string; role: string; tenant: string }> = {
    'admin':        { password: 'admin',          role: 'super-admin', tenant: 'admin' },
    'superadmin':   { password: 'SuperAdmin123!', role: 'super-admin', tenant: 'admin' },
    'admin-user':   { password: 'Secret123!',     role: 'admin',       tenant: 'admin' },
    'acme-admin':   { password: 'Secret123!',     role: 'admin',       tenant: 'acme_corp_155cf73a2fe388f0' },
    'analyst-user': { password: 'Secret123!',     role: 'analyst',     tenant: 'admin' },
    'acme-analyst': { password: 'Secret123!',     role: 'analyst',     tenant: 'acme_corp_155cf73a2fe388f0' },
    'viewer-user':  { password: 'Secret123!',     role: 'viewer',      tenant: 'admin' },
    'acme-viewer':  { password: 'Secret123!',     role: 'viewer',      tenant: 'acme_corp_155cf73a2fe388f0' },
  };

  /** Parse a demo token → { role, username, tenant } or null */
  static parseDemoToken(token: string): { role: string; username: string; tenant: string } | null {
    if (!token || !token.startsWith('demo-token-')) return null;
    // Format: demo-token-{role}.{username}-{timestamp}
    const body = token.replace('demo-token-', '');       // e.g. "admin.admin-user-1234"
    const dotIdx = body.indexOf('.');
    if (dotIdx === -1) {
      // Legacy format: demo-token-{role}-{timestamp}  (no username)
      const rolePart = body.replace(/-\d+$/, '');
      return { role: rolePart.replace(/-/g, '_'), username: 'admin', tenant: 'admin' };
    }
    const rolePart = body.substring(0, dotIdx);           // "admin" or "super-admin"
    const rest = body.substring(dotIdx + 1);              // "admin-user-1234"
    const usernamePart = rest.replace(/-\d+$/, '');       // "admin-user"
    const role = rolePart.replace(/-/g, '_');
    // Look up tenant from static map
    const TENANT_MAP: Record<string, string> = {
      'admin': 'admin', 'superadmin': 'admin',
      'admin-user': 'admin', 'analyst-user': 'admin', 'viewer-user': 'admin',
      'acme-admin': 'acme_corp_155cf73a2fe388f0', 'acme-analyst': 'acme_corp_155cf73a2fe388f0', 'acme-viewer': 'acme_corp_155cf73a2fe388f0',
    };
    return { role, username: usernamePart, tenant: TENANT_MAP[usernamePart] || 'admin' };
  }

  async getToken(username: string, password: string) {
    // Demo mode: accept documented test users without Keycloak
    const demoUser = this.demoUsers[username];
    if (demoUser && demoUser.password === password) {
      // Token format: demo-token-{role}.{username}-{timestamp}
      return {
        access_token: `demo-token-${demoUser.role}.${username}-${Date.now()}`,
        refresh_token: 'demo-refresh-' + Date.now(),
        expires_in: 3600,
        refresh_expires_in: 7200,
        token_type: 'Bearer',
      };
    }

    try {
      const tokenUrl = `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
      
      const params = new URLSearchParams();
      params.append('grant_type', 'password');
      params.append('client_id', this.clientId);
      params.append('username', username);
      params.append('password', password);

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        refresh_expires_in: response.data.refresh_expires_in,
        token_type: response.data.token_type,
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new HttpException('Invalid username or password', HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(
        `Keycloak authentication failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async refreshToken(refreshToken: string) {
    // Demo mode: accept demo refresh tokens
    if (refreshToken && refreshToken.startsWith('demo-refresh-')) {
      return {
        access_token: 'demo-token-super-admin-' + Date.now(),
        refresh_token: 'demo-refresh-' + Date.now(),
        expires_in: 3600,
        refresh_expires_in: 7200,
        token_type: 'Bearer',
      };
    }

    try {
      const tokenUrl = `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
      
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', this.clientId);
      params.append('refresh_token', refreshToken);

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        refresh_expires_in: response.data.refresh_expires_in,
        token_type: response.data.token_type,
      };
    } catch (error: any) {
      if (error.response?.status === 400) {
        throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(
        `Token refresh failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
