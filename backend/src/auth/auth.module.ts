import { Module, Global } from '@nestjs/common';
import { JwksService } from './jwks.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt.guard';
import { SystemUsersModule } from '../system-users/system-users.module';
import { DatabaseModule } from '../database/database.module';

@Global()
@Module({
	imports: [SystemUsersModule, DatabaseModule],
	controllers: [AuthController],
	providers: [JwksService, AuthService, JwtAuthGuard],
	exports: [JwksService, AuthService, JwtAuthGuard]
})
export class AuthModule {}
