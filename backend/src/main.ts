import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import { ThrottlerExceptionFilter } from './filters/throttler-exception.filter';
import { RateLimitHeadersInterceptor } from './interceptors/rate-limit-headers.interceptor';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Apply global filters and interceptors (Phase 2 - Security)
  app.useGlobalFilters(new ThrottlerExceptionFilter());
  app.useGlobalInterceptors(new RateLimitHeadersInterceptor());

  // Serve static assets for custom Swagger UI extension
  const publicPath = join(process.cwd(), 'public');
  try { fs.mkdirSync(publicPath + '/swagger-ui', { recursive: true }) } catch (e) {}
  app.useStaticAssets(join(publicPath, 'swagger-ui'), { prefix: '/swagger-ui' });

  // Enable CORS for frontend
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3001', 'http://localhost:8080'],
    credentials: true,
  });

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('CFO Platform API')
    .setDescription(
      'Financial Planning & Analysis Platform - Phase 2 (Rate Limited)\n\n' +
      '## Rate Limiting\n' +
      'API endpoints are protected by rate limiting to prevent abuse:\n' +
      '- **Default**: 60 requests per minute\n' +
      '- **Authentication**: 5 requests per minute (login, refresh)\n' +
      '- **ETL Imports**: 20 requests per minute\n\n' +
      'Rate limit information is included in response headers:\n' +
      '- `X-RateLimit-Limit`: Maximum requests allowed\n' +
      '- `X-RateLimit-Remaining`: Requests remaining in current window\n' +
      '- `X-RateLimit-Reset`: Unix timestamp when limit resets\n\n' +
      'When rate limit is exceeded, you will receive a **429 Too Many Requests** response with `Retry-After` header.'
    )
    .setVersion('2.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token from Keycloak',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Tenant', 'Multi-tenant provisioning and management')
    .addTag('Financial', 'Financial statements and line items')
    .addTag('ETL', 'Excel/CSV import functionality')
    .addTag('Scenario', 'Scenario and assumption management')
    .addTag('Projection', 'Financial projection engine')
    .addTag('Reports', 'Variance analysis and reporting')
    .addTag('User', 'User and company profile management')
    .addTag('DIM', 'Dimension configuration and templates')
    .addTag('Admin', 'System administration and ETL parameters')
    .addTag('Workflow', 'Approval workflow management')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Write a copy of the OpenAPI document for the frontend assistant to consume
  try {
    const outPath = join(process.cwd(), 'public', 'swagger-doc.json');
    fs.writeFileSync(outPath, JSON.stringify(document));
  } catch (e) {
    console.warn('Could not write swagger-doc.json', e);
  }

    SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'CFO Platform API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    // load our custom JS which injects the OpenAI assistant UI
    customJs: '/swagger-ui/swagger-ai-new.js',
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  console.log(`Backend listening on port ${port}`);
  console.log(`Swagger documentation available at http://localhost:${port}/api`);
}
bootstrap();
