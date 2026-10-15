import type { H3Event } from 'h3'
import type { z } from 'zod'

// Pesan zod ditulis dalam Bahasa Indonesia; isu PERTAMA ditampilkan ke pengguna.

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.join('.') || undefined
    throw httpError(400, 'VALIDATION_FAILED', issue?.message || 'Data tidak valid.', { field })
  }
  return result.data
}

export async function readValidatedJson<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const body = await readBody(event).catch(() => undefined)
  return parseOrThrow(schema, body ?? {})
}

export function validatedQuery<T extends z.ZodType>(event: H3Event, schema: T): z.infer<T> {
  return parseOrThrow(schema, getQuery(event))
}

/** /api/v1: request non-GET/HEAD/DELETE wajib application/json. */
export function assertJsonRequest(event: H3Event) {
  const method = event.method.toUpperCase()
  if (['GET', 'HEAD', 'DELETE'].includes(method)) return
  const type = getRequestHeader(event, 'content-type') || ''
  if (!type.toLowerCase().includes('application/json')) {
    throw httpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type harus application/json.')
  }
}
