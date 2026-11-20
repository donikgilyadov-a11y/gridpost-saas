import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CurrentUser, JwtAuthGuard, ZodPipe, type AuthUser } from '../common/auth'
import { AuthService } from './auth.service'
import { loginSchema, mfaCodeSchema, registerSchema, type LoginDto, type RegisterDto } from './dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  register(@Body(new ZodPipe(registerSchema)) dto: RegisterDto) {
    return this.auth.register(dto)
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body(new ZodPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.setupMfa(user.userId, user.email ?? '')
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  mfaEnable(@CurrentUser() user: AuthUser, @Body(new ZodPipe(mfaCodeSchema)) body: { code: string }) {
    return this.auth.enableMfa(user.userId, body.code)
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  mfaDisable(@CurrentUser() user: AuthUser, @Body(new ZodPipe(mfaCodeSchema)) body: { code: string }) {
    return this.auth.disableMfa(user.userId, body.code)
  }
}
