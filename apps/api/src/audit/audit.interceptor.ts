import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthUser } from '../common/auth'

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()
    if (request.method === 'GET' || request.path.includes('/billing/webhook')) return next.handle()

    return next.handle().pipe(
      tap(() => {
        const user = (request as Request & { user?: AuthUser }).user
        const organizationId = user?.organizationId
        if (!organizationId) return
        void this.prisma
          .withOrg(organizationId, (tx) =>
            tx.auditLog.create({
              data: {
                organizationId,
                actorId: user?.userId ?? null,
                action: `${request.method} ${String(request.route?.path ?? request.path)}`,
                resource: String(request.params?.id ?? 'request'),
                metadata: { status: response.statusCode, ip: request.ip } as object
              }
            })
          )
          .catch(() => undefined)
      })
    )
  }
}
