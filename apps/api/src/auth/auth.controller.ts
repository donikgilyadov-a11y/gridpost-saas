import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, JwtAuthGuard, ZodPipe, type AuthUser } from '../common/auth'
import { AuthService } from './auth.service'
import { loginSchema, registerSchema, type LoginDto, type RegisterDto } from './dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body(new ZodPipe(registerSchema)) dto: RegisterDto) {
    return this.auth.register(dto)
  }

  @Post('login')
  login(@Body(new ZodPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user
  }
}
