import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PipeTransform,
  UnauthorizedException,
  createParamDecorator
} from '@nestjs/common'
import type { z } from 'zod'
import { AuthGuard } from '@nestjs/passport'

export interface AuthUser {
  userId: string
  organizationId: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
}

export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value)
  }
}

export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>()
    if (!request.user?.organizationId) throw new UnauthorizedException('Организация не определена')
    return true
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<{ user: AuthUser }>()
  return request.user
})

export const CurrentOrg = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<{ user: AuthUser }>()
  return request.user.organizationId
})
