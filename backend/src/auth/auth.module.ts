import { Module, Global } from '@nestjs/common';
import { JwksService } from './jwks.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SystemUsersModule } from '../system-users/system-users.module';

@Global()
@Module({
	imports: [SystemUsersModule],
	controllers: [AuthController],
	providers: [JwksService, AuthService],
	exports: [JwksService, AuthService]
})
export class AuthModule {}
