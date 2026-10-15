import { z } from 'zod'

const querySchema = z.object({ token: z.string().min(10, 'Tautan undangan tidak valid.') })

export default defineEventHandler(async (event) => {
  const { token } = validatedQuery(event, querySchema)
  return previewInvitation(event, token)
})
