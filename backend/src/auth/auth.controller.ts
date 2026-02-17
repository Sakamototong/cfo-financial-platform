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
    // Get user info from JWT token
    const jwtUser = req.user || { sub: 'anonymous', preferred_username: 'anonymous' };
    const username = jwtUser.preferred_username || jwtUser.sub || 'anonymous';
    const email = jwtUser.email || username;
    
    console.log('[AuthController /auth/me] JWT User:', jwtUser);
    console.log('[AuthController /auth/me] Email to check:', email);
    
    // Check if user is a super admin first
    try {
      console.log('[AuthController /auth/me] Checking system_users for email:', email);
      const systemUser = await this.systemUsersService.getSystemUserByEmail(email);
      console.log('[AuthController /auth/me] System user found:', systemUser);
      
      if (systemUser && systemUser.role === 'super_admin' && systemUser.is_active) {
        // Update last login
        await this.systemUsersService.updateLastLogin(systemUser.id);
        
        console.log('[AuthController /auth/me] Returning super_admin role');
        return {
          success: true,
          data: {
            id: systemUser.id,
            email: systemUser.email,
            username: systemUser.email,
            full_name: systemUser.full_name,
            role: 'super_admin',
            is_active: systemUser.is_active,
            is_super_admin: true,
            ...jwtUser
          }
        };
      }
      console.log('[AuthController /auth/me] System user not super_admin or not active');
    } catch (err) {
      console.error('[AuthController /auth/me] Error checking system user:', err);
      // If system user check fails, continue with tenant-level check
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
          ...jwtUser 
        } 
      };
    }
    
    // Try to find user in tenant database to get role
    try {
      const tenantId = req.headers['x-tenant-id'] || 'testco';
      const userResult = await this.db.queryTenant(
        tenantId,
        'SELECT id, email, full_name, role, is_active FROM users WHERE email = $1 LIMIT 1',
        [email]
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
            ...jwtUser
          }
        };
      }
    } catch (err) {
      // If DB query fails, continue with JWT data only
    }
    
    // Fallback: return JWT data without role
    return { 
      success: true, 
      data: { 
        email: email,
        username: email,
        role: 'viewer', // default role
        is_super_admin: false,
        ...jwtUser 
      } 
    };
  }
}
