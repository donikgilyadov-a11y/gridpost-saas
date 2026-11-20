import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { AuthUser } from '../common/auth'

interface JwtPayload {
  sub: string
  orgId: string
  role: AuthUser['role']
  email?: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET')
    })
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    return { userId: payload.sub, organizationId: payload.orgId, role: payload.role, email: payload.email }
  }
}
