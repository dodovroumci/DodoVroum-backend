import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { loadLoginThrottleConfig } from './auth-throttle.config';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, AuthThrottlerGuard],
  exports: [AuthService],
})
export class AuthModule implements OnModuleInit {
  onModuleInit() {
    // Refus de démarrage si AUTH_LOGIN_LIMIT / AUTH_LOGIN_WINDOW_SECONDS sont invalides.
    loadLoginThrottleConfig(process.env);
  }
}
