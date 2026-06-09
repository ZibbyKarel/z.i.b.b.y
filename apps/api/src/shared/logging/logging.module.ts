import { Global, type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common"
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core"
import { AllExceptionsFilter } from "./all-exceptions.filter"
import { LoggerService } from "./logger.service"
import { LoggingInterceptor } from "./logging.interceptor"
import { TraceContextService } from "./trace-context.service"
import { createTraceMiddleware } from "./trace.middleware"

/**
 * Wires the observability layer once, app-wide:
 *
 * - `LoggerService` / `TraceContextService` are exported and, being `@Global`,
 *   injectable from any module without re-importing this one.
 * - The request/response `LoggingInterceptor` and the `AllExceptionsFilter` are
 *   registered via `APP_INTERCEPTOR` / `APP_FILTER` so they resolve their own
 *   dependencies through DI.
 * - The trace middleware is applied here (not in `main.ts`) so it runs for *every*
 *   way the app is built — production bootstrap and the e2e test harness alike —
 *   ahead of guards, interceptors and the controller.
 */
@Global()
@Module({
  providers: [
    TraceContextService,
    LoggerService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [LoggerService, TraceContextService],
})
export class LoggingModule implements NestModule {
  constructor(private readonly trace: TraceContextService) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(createTraceMiddleware(this.trace)).forRoutes("*")
  }
}
