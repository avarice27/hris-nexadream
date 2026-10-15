// Cron harian HR (Vercel Cron, 00:30 WIB). Setiap langkah idempoten; kegagalan satu langkah tidak
// menghentikan langkah lain.
async function step<T>(name: string, fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (error) {
    console.error(`[cron:hr] ${name} failed`, error)
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export default defineEventHandler(event => runThrottled(event, 'hr', async () => ({
  employment: await step('employment', () => applyDueEmploymentChanges()),
  leave: await step('leave', () => grantDueLeaveEntitlements()),
  attendance: await step('attendance', () => autoCloseOpenAttendance()),
  expiry: await step('expiry', () => sendExpiryReminders()),
  broadcasts: await step('broadcasts', () => dispatchDueBroadcasts()),
  retention: await step('retention', () => purgeDeletedTenants()),
  formerEmployees: await step('formerEmployees', () => anonymizeFormerEmployees()),
  rateLimits: await step('rateLimits', () => pruneRateLimitBuckets())
})))
