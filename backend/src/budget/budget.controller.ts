import { Controller, Get, Post, Put, Delete, Body, Param, Headers, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.constants';
import { BudgetService } from './budget.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { CreateBudgetLineItemDto, UpdateBudgetLineItemDto } from './dto/budget-line-item.dto';

@ApiTags('Budgets')
@ApiBearerAuth('JWT-auth')
@Controller('budgets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  // ===== BUDGET CRUD =====

  @Get()
  @Roles(Role.ANALYST) // Analyst or higher can view budgets
  @ApiOperation({ summary: 'Get all budgets' })
  findAll(@Headers('x-tenant-id') tenantId: string) {
    return this.budgetService.findAll(tenantId);
  }

  @Get(':id')
  @Roles(Role.ANALYST)
  @ApiOperation({ summary: 'Get budget by ID' })
  findOne(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string
  ) {
    return this.budgetService.findOne(tenantId, id);
  }

  @Post()
  @Roles(Role.FINANCE_MANAGER) // Finance Manager or higher can create budgets
  @ApiOperation({ summary: 'Create new budget' })
  create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateBudgetDto
  ) {
    return this.budgetService.create(tenantId, dto);
  }

  @Put(':id')
  @Roles(Role.FINANCE_MANAGER)
  @ApiOperation({ summary: 'Update budget' })
  update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto
  ) {
    return this.budgetService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.FINANCE_MANAGER)
  @ApiOperation({ summary: 'Delete budget' })
  remove(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string
  ) {
    return this.budgetService.remove(tenantId, id);
  }

  // ===== LINE ITEMS =====

  @Get(':id/line-items')
  getLineItems(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string
  ) {
    return this.budgetService.getLineItems(tenantId, budgetId);
  }

  @Post(':id/line-items')
  createLineItem(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string,
    @Body() dto: CreateBudgetLineItemDto
  ) {
    return this.budgetService.createLineItem(tenantId, budgetId, dto);
  }

  @Put(':id/line-items/:lineItemId')
  updateLineItem(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string,
    @Param('lineItemId') lineItemId: string,
    @Body() dto: UpdateBudgetLineItemDto
  ) {
    return this.budgetService.updateLineItem(tenantId, budgetId, lineItemId, dto);
  }

  @Delete(':id/line-items/:lineItemId')
  removeLineItem(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string,
    @Param('lineItemId') lineItemId: string
  ) {
    return this.budgetService.removeLineItem(tenantId, budgetId, lineItemId);
  }

  // ===== WORKFLOW =====

  @Post(':id/submit')
  submitForApproval(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string,
    @Body('userId') userId: string
  ) {
    return this.budgetService.submitForApproval(tenantId, budgetId, userId);
  }

  @Post(':id/approve')
  approve(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string,
    @Body('userId') userId: string
  ) {
    return this.budgetService.approve(tenantId, budgetId, userId);
  }

  @Post(':id/reject')
  reject(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string,
    @Body() body: { userId: string; reason: string }
  ) {
    return this.budgetService.reject(tenantId, budgetId, body.userId, body.reason);
  }

  @Post(':id/lock')
  lock(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string
  ) {
    return this.budgetService.lock(tenantId, budgetId);
  }

  // ===== COPY FROM PREVIOUS YEAR =====

  @Post('copy')
  copyFromPreviousYear(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { sourceBudgetId: string; newFiscalYear: number; newBudgetType: string }
  ) {
    return this.budgetService.copyFromPreviousYear(
      tenantId,
      body.sourceBudgetId,
      body.newFiscalYear,
      body.newBudgetType
    );
  }

  // ===== ALLOCATIONS =====

  @Get(':id/allocations')
  getAllocations(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string
  ) {
    return this.budgetService.getAllocations(tenantId, budgetId);
  }

  // ===== SUMMARY & ANALYTICS =====

  @Get(':id/summary')
  getSummary(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string
  ) {
    return this.budgetService.getSummary(tenantId, budgetId);
  }

  @Get(':id/department-summary')
  getDepartmentSummary(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') budgetId: string
  ) {
    return this.budgetService.getDepartmentSummary(tenantId, budgetId);
  }
}
