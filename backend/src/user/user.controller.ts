import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserService, User, CompanyProfile } from './user.service';
import { JwksService } from '../auth/jwks.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TransferOwnershipDto, AcceptOwnershipDto, RejectOwnershipDto } from './dto/transfer-ownership.dto';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly jwksService: JwksService,
  ) {}

  private async getTenantFromToken(authHeader: string, tenantHeader: string | undefined): Promise<string> {
    if (tenantHeader) return tenantHeader;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Missing or invalid authorization header', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    const payload: any = await this.jwksService.verify(token);

    const tenantId = payload?.preferred_username || payload?.sub;
    if (!tenantId) {
      throw new HttpException('Tenant ID not found in token', HttpStatus.UNAUTHORIZED);
    }

    return String(tenantId);
  }

  @Post('init')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async initializeUserSchema(@Headers('authorization') authHeader: string, @Headers('x-tenant-id') tenantHeader: string | undefined) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    await this.userService.createUserSchema(tenantId);

    return { message: 'User schema initialized successfully' };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createUser(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: User,
    @Req() req?: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!body.email || !body.full_name || !body.role) {
      throw new HttpException('Missing required fields: email, full_name, role', HttpStatus.BAD_REQUEST);
    }

    return this.userService.upsertUser(tenantId, { ...body, tenant_id: tenantId });
  }

  @Get('email/:email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getUserByEmail(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('email') email: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const user = await this.userService.getUserByEmail(tenantId, email);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return user;
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async listUsers(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('role') role?: string,
    @Query('is_active') isActive?: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const filters: any = {};
    if (role) filters.role = role;
    if (isActive !== undefined) filters.is_active = isActive === 'true';

    return this.userService.listUsers(tenantId, filters);
  }

  @Put(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateUserRole(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: { role: 'admin' | 'analyst' | 'viewer' },
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!body.role || !['admin', 'analyst', 'viewer'].includes(body.role)) {
      throw new HttpException('Invalid role. Must be admin, analyst, or viewer', HttpStatus.BAD_REQUEST);
    }

    return this.userService.updateUserRole(tenantId, id, body.role);
  }

  @Put(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deactivateUser(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    await this.userService.deactivateUser(tenantId, id);

    return { message: 'User deactivated successfully' };
  }

  @Get('company/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getCompanyProfile(@Headers('authorization') authHeader: string, @Headers('x-tenant-id') tenantHeader: string | undefined) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const profile = await this.userService.getCompanyProfile(tenantId);
    // Always return a JSON object so the frontend gets a consistent shape
    return profile || { tenant_id: tenantId, company_name: null };
  }

  @Post('company/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateCompanyProfile(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() profile: CompanyProfile,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!profile.company_name) {
      throw new HttpException('Missing required field: company_name', HttpStatus.BAD_REQUEST);
    }

    return this.userService.upsertCompanyProfile(tenantId, {
      ...profile,
      tenant_id: tenantId,
    });
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async inviteUser(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: { email: string; role: 'admin' | 'analyst' | 'viewer' },
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!body.email || !body.role) {
      throw new HttpException('Missing required fields: email, role', HttpStatus.BAD_REQUEST);
    }

    const invitation = await this.userService.createInvitation(
      tenantId,
      body.email,
      body.role,
      tenantId,
    );

    return {
      invitation_id: invitation.id,
      invitation_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/accept-invitation?token=${invitation.invitation_token}`,
      expires_at: invitation.expires_at,
    };
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async listInvitations(@Headers('authorization') authHeader: string, @Headers('x-tenant-id') tenantHeader: string | undefined) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    return this.userService.listInvitations(tenantId);
  }

  @Post('accept-invitation')
  async acceptInvitation(@Body() body: { token: string; full_name: string }) {
    if (!body.token || !body.full_name) {
      throw new HttpException('Missing required fields: token, full_name', HttpStatus.BAD_REQUEST);
    }

    const invitation = await this.userService.getInvitationByToken(body.token);
    if (!invitation) {
      throw new HttpException('Invalid or expired invitation', HttpStatus.BAD_REQUEST);
    }

    if (new Date() > new Date(invitation.expires_at)) {
      throw new HttpException('Invitation has expired', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userService.acceptInvitation(invitation.tenant_id, body.token, {
      email: invitation.email,
      full_name: body.full_name,
      role: invitation.role,
      tenant_id: invitation.tenant_id,
      is_active: true,
    });

    return {
      message: 'Invitation accepted successfully',
      user: {
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    };
  }

  // Ownership Transfer Endpoints

  @Post('transfer-ownership')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async initiateOwnershipTransfer(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() dto: TransferOwnershipDto,
    @Req() req: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const currentOwnerEmail = req.user?.email;

    if (!currentOwnerEmail) {
      throw new HttpException('Could not identify current user', HttpStatus.UNAUTHORIZED);
    }

    const transferRequest = await this.userService.initiateOwnershipTransfer(
      tenantId,
      currentOwnerEmail,
      dto.new_owner_email,
      dto.reason,
    );

    return {
      message: 'Ownership transfer initiated. Awaiting acceptance from new owner.',
      transfer_request: transferRequest,
    };
  }

  @Post('transfer-ownership/accept')
  @UseGuards(JwtAuthGuard)
  async acceptOwnershipTransfer(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() dto: AcceptOwnershipDto,
    @Req() req: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const newOwnerEmail = req.user?.email;

    if (!newOwnerEmail) {
      throw new HttpException('Could not identify current user', HttpStatus.UNAUTHORIZED);
    }

    const result = await this.userService.acceptOwnershipTransfer(
      tenantId,
      dto.transfer_request_id,
      newOwnerEmail,
      dto.message,
    );

    return result;
  }

  @Post('transfer-ownership/reject')
  @UseGuards(JwtAuthGuard)
  async rejectOwnershipTransfer(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() dto: RejectOwnershipDto,
    @Req() req: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const newOwnerEmail = req.user?.email;

    if (!newOwnerEmail) {
      throw new HttpException('Could not identify current user', HttpStatus.UNAUTHORIZED);
    }

    const result = await this.userService.rejectOwnershipTransfer(
      tenantId,
      dto.transfer_request_id,
      newOwnerEmail,
      dto.reason,
    );

    return result;
  }

  @Post('transfer-ownership/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async cancelOwnershipTransfer(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') transferRequestId: string,
    @Req() req: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const currentOwnerEmail = req.user?.email;

    if (!currentOwnerEmail) {
      throw new HttpException('Could not identify current user', HttpStatus.UNAUTHORIZED);
    }

    const result = await this.userService.cancelOwnershipTransfer(
      tenantId,
      transferRequestId,
      currentOwnerEmail,
    );

    return result;
  }

  @Get('transfer-ownership/pending')
  @UseGuards(JwtAuthGuard)
  async getPendingTransferRequests(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.userService.getPendingTransferRequests(tenantId);
  }

  @Get('transfer-ownership/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAllTransferRequests(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.userService.getAllTransferRequests(tenantId);
  }

  @Get('profile/me')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Req() req: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const email = req.user?.email || req.user?.preferred_username;
    
    if (!email) {
      throw new HttpException('User email not found in token', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userService.getUserByEmail(tenantId, email);
    if (!user) {
      throw new HttpException('User profile not found', HttpStatus.NOT_FOUND);
    }

    return user;
  }

  @Put('profile/me')
  @UseGuards(JwtAuthGuard)
  async updateMyProfile(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: { full_name?: string; phone?: string; bio?: string },
    @Req() req: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const email = req.user?.email || req.user?.preferred_username;
    
    if (!email) {
      throw new HttpException('User email not found in token', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userService.getUserByEmail(tenantId, email);
    if (!user) {
      throw new HttpException('User profile not found', HttpStatus.NOT_FOUND);
    }

    // Update user profile
    const updatedUser = await this.userService.upsertUser(tenantId, {
      ...user,
      full_name: body.full_name || user.full_name,
      phone: body.phone || user.phone,
      bio: body.bio !== undefined ? body.bio : user.bio,
    });

    return updatedUser;
  }
}
