import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api/v1')
  app.enableShutdownHooks()
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true
  })

  const port = Number(process.env.PORT ?? 3001)
  await app.listen(port)
  new Logger('Bootstrap').log(`Gridpost API listening on http://localhost:${port}/api/v1`)
}

void bootstrap()
