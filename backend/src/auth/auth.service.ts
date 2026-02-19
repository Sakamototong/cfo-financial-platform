import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly keycloakUrl = process.env.KEYCLOAK_HOST || process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  private readonly realm = process.env.KEYCLOAK_REALM || 'master';
  private readonly clientId = process.env.KEYCLOAK_CLIENT_ID || 'cfo-client';

  async getToken(username: string, password: string) {
    // Demo mode: accept admin/admin without Keycloak
    if (username === 'admin' && password === 'admin') {
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
