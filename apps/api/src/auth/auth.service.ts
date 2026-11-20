import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import type { LoginDto, RegisterDto } from './dto'
import type { AuthUser } from '../common/auth'
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto): Promise<{ token: string; user: { id: string; email: string }; organizationId: string }> {
    const existing = await this.prisma.withSystem((tx) =>
      tx.user.findUnique({ where: { email: dto.email.toLowerCase() } })
    )
    if (existing) throw new ConflictException('Пользователь уже существует')

    const passwordHash = await bcrypt.hash(dto.password, 12)
    const slug = await this.uniqueSlug(dto.organizationName)

    // Registration is a bootstrap operation: no org context exists yet.
    const result = await this.prisma.withSystem(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email.toLowerCase(), passwordHash, displayName: dto.displayName }
      })
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, slug }
      })
      await tx.membership.create({
        data: { organizationId: organization.id, userId: user.id, role: 'OWNER' }
      })
      return { user, organization }
    })

    return {
      token: this.sign({ userId: result.user.id, organizationId: result.organization.id, role: 'OWNER', email: result.user.email }),
      user: { id: result.user.id, email: result.user.email },
      organizationId: result.organization.id
    }
  }

  async login(dto: LoginDto): Promise<{ token: string; user: { id: string; email: string }; organizationId: string }> {
    const user = await this.prisma.withSystem((tx) =>
      tx.user.findUnique({
        where: { email: dto.email.toLowerCase() },
        include: { memberships: { orderBy: { createdAt: 'asc' } } }
      })
    )
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный email или пароль')
    }
    if (user.mfaEnabled) {
      if (!user.mfaSecret || !dto.code || !verifyTotp(user.mfaSecret, dto.code)) {
        throw new UnauthorizedException('Неверный или отсутствующий код MFA')
      }
    }
    const membership = user.memberships[0]
    if (!membership) throw new UnauthorizedException('У пользователя нет организации')

    return {
      token: this.sign({
        userId: user.id,
        organizationId: membership.organizationId,
        role: membership.role,
        email: user.email
      }),
      user: { id: user.id, email: user.email },
      organizationId: membership.organizationId
    }
  }

  async setupMfa(userId: string, email: string) {
    const secret = generateTotpSecret()
    await this.prisma.withSystem((tx) =>
      tx.user.update({ where: { id: userId }, data: { mfaSecret: secret } })
    )
    return { secret, otpauthUrl: otpauthUrl(email, secret) }
  }

  async enableMfa(userId: string, code: string) {
    const user = await this.prisma.withSystem((tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId } })
    )
    if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code)) {
      throw new UnauthorizedException('Неверный код MFA')
    }
    await this.prisma.withSystem((tx) =>
      tx.user.update({ where: { id: userId }, data: { mfaEnabled: true } })
    )
    return { enabled: true }
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.prisma.withSystem((tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId } })
    )
    if (!user.mfaSecret || !verifyTotp(user.mfaSecret, code)) {
      throw new UnauthorizedException('Неверный код MFA')
    }
    await this.prisma.withSystem((tx) =>
      tx.user.update({
        where: { id: userId },
        data: { mfaEnabled: false, mfaSecret: null }
      })
    )
    return { enabled: false }
  }

  private sign(user: AuthUser): string {
    return this.jwt.sign({
      sub: user.userId,
      orgId: user.organizationId,
      role: user.role,
      email: user.email
    })
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'org'
    let slug = base
    let attempt = 0
    while (await this.prisma.withSystem((tx) => tx.organization.findUnique({ where: { slug } }))) {
      attempt += 1
      slug = `${base}-${attempt}`
    }
    return slug
  }
}
