import { Controller, Post, Body, HttpException, HttpStatus, Get, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './jwt.guard';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';
import { SystemUsersService } from '../system-users/system-users.service';
import { ApiTags, ApiOperation, ApiBody, ApiProperty } from '@nestjs/swagger';
import { RateLimitPresets } from '../config/throttle.config';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  username!: string;

  @ApiProperty({ example: 'admin' })
  password!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly db: DatabaseService,
    private readonly systemUsersService: SystemUsersService
  ) {}

  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 60000 } }) // Rate limit: 5 login attempts per minute
  @ApiOperation({ 
    summary: 'Login to get JWT token',
    description: 'Authenticate with Keycloak and receive access token for API requests. Rate limited to 5 attempts per minute.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'admin' },
        password: { type: 'string', example: 'admin' }
      },
      required: ['username', 'password']
    }
  })
  async login(@Body() loginDto: LoginDto) {
    try {
      const token = await this.authService.getToken(loginDto.username, loginDto.password);
      return {
        success: true,
        data: token
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Authentication failed',
          error: error.message
        },
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  @Post('refresh')
  @Throttle({ auth: { limit: 5, ttl: 60000 } }) // Rate limit: 5 refresh attempts per minute
  @ApiOperation({ 
    summary: 'Refresh access token',
    description: 'Get a new access token using refresh token. Rate limited to 5 attempts per minute.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refresh_token: { type: 'string' }
      },
      required: ['refresh_token']
    }
  })
  async refresh(@Body('refresh_token') refreshToken: string) {
    try {
      const token = await this.authService.refreshToken(refreshToken);
      return {
        success: true,
        data: token
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Token refresh failed',
          error: error.message
        },
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req: any) {
    // JwtAuthGuard already enriched req.user with roles from system_users (cached)
    const jwtUser = req.user || { sub: 'anonymous', preferred_username: 'anonymous' };
    const username = jwtUser.preferred_username || jwtUser.sub || 'anonymous';
    const email = jwtUser.email || username;
    const roles: string[] = jwtUser.roles || [];

    // If JwtAuthGuard already detected super_admin, use that (no extra DB query)
    if (roles.includes('super_admin')) {
      // Optionally fetch display name from cache (fast, no pool overhead)
      let fullName = email;
      try {
        const su = await this.systemUsersService.getSystemUserByEmail(email) 
                || await this.systemUsersService.getSystemUserByEmail(username);
        if (su) {
          fullName = su.full_name || email;
          // Fire-and-forget last login update
          this.systemUsersService.updateLastLogin(su.id).catch(() => {});
        }
      } catch (_) { /* cache miss is fine */ }

      return {
        success: true,
        data: {
          email,
          username: email,
          full_name: fullName,
          role: 'super_admin',
          is_active: true,
          is_super_admin: true,
          ...jwtUser,
        },
      };
    }

    // For demo mode (admin/admin), return admin role
    if (username === 'admin') {
      return {
        success: true,
        data: {
          email: 'admin',
          username: 'admin',
          role: 'admin',
          is_super_admin: false,
          ...jwtUser,
        },
      };
    }

    // Try to find user in tenant database to get role
    try {
      const tenantId = req.headers['x-tenant-id'] || 'admin';
      const userResult = await this.db.queryTenant(
        tenantId,
        'SELECT id, email, full_name, role, is_active FROM users WHERE email = $1 LIMIT 1',
        [email],
      );

      if (userResult.rows.length > 0) {
        const dbUser = userResult.rows[0];
        return {
          success: true,
          data: {
            email: dbUser.email,
            username: dbUser.email,
            role: dbUser.role,
            full_name: dbUser.full_name,
            is_active: dbUser.is_active,
            is_super_admin: false,
            ...jwtUser,
          },
        };
      }
    } catch (err) {
      // If DB query fails, continue with JWT data only
    }

    // Fallback: return JWT data without role
    return {
      success: true,
      data: {
        email,
        username: email,
        role: 'viewer',
        is_super_admin: false,
        ...jwtUser,
      },
    };
  }
}
