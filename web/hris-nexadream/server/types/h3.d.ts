import type { SessionClaims } from '../services/auth/types'
import type { PlatformContext, TenantContext } from '../utils/auth'

declare module 'h3' {
  interface H3EventContext {
    sessionClaims?: SessionClaims | null
    platformContext?: PlatformContext
    tenantContext?: TenantContext
  }
}

export {}
