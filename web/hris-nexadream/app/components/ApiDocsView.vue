<script setup lang="ts">
import type { ApiEndpoint, ApiSection } from '#shared/utils/api-docs'

// Referensi API dari katalog bersama (shared/utils/api-docs.ts) — tidak ditulis dua kali.
const props = defineProps<{ data: { baseUrl: string, sections: ApiSection[], errors: Array<{ code: string, status: number, meaning: string }> }, internal?: boolean }>()
const methodColor: Record<string, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = { GET: 'success', POST: 'info', PATCH: 'warning', PUT: 'warning', DELETE: 'error' }
const authLabel: Record<ApiEndpoint['auth'], string> = { 'none': 'Tanpa autentikasi', 'bearer': 'Bearer token', 'bearer-or-apikey': 'Bearer token atau X-Api-Key' }
function curl(e: ApiEndpoint) {
  const url = `${props.data.baseUrl}${e.path}`
  const auth = e.auth === 'none' ? '' : e.auth === 'bearer' ? ' \\\n  -H "Authorization: Bearer $TOKEN"' : ' \\\n  -H "X-Api-Key: $HN_API_KEY"'
  const body = e.body?.length ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(Object.fromEntries(e.body.filter(b => b.required).map(b => [b.name, b.type.startsWith('number') ? 0 : b.type.startsWith('boolean') ? false : '…'])))}'` : ''
  return `curl -X ${e.method} "${url}"${auth}${body}`
}
const pretty = (v: unknown) => JSON.stringify(v, null, 2)
const wrapped = (e: ApiEndpoint) => (e.paginated ? e.responseExample : { data: e.responseExample })
</script>

<template>
  <div class="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
    <nav
      class="hidden lg:block"
      aria-label="Bagian API"
    >
      <ul class="sticky top-24 space-y-1 text-sm">
        <li>
          <a
            href="#pengantar"
            class="text-muted hover:text-default"
          >Pengantar</a>
        </li>
        <li
          v-for="s in data.sections"
          :key="s.id"
        >
          <a
            :href="`#${s.id}`"
            class="text-muted hover:text-default"
          >{{ s.title }}</a>
        </li>
        <li>
          <a
            href="#galat"
            class="text-muted hover:text-default"
          >Kode galat</a>
        </li>
      </ul>
    </nav>
    <div class="min-w-0 space-y-12">
      <section
        id="pengantar"
        class="scroll-mt-24 space-y-3 text-sm"
      >
        <p>Base URL: <code class="rounded bg-elevated px-1.5 py-0.5">{{ data.baseUrl }}</code></p>
        <p>
          Integrasi server-ke-server memakai header <code>X-Api-Key</code> (dibuat pemilik perusahaan di Pengaturan → API key; fitur paket Enterprise).
          Key dengan scope <code>read</code> hanya membaca; <code>write</code> diperlukan untuk POST/PATCH/DELETE; data pribadi & gaji memerlukan scope <code>sensitive</code>.
        </p>
        <p>
          Respons sukses dibungkus <code>{ "data": … }</code> (daftar: <code>{ "data": [ … ], "meta": { page, limit, total, pageCount } }</code>);
          galat <code>{ "error": { code, message, status, details } }</code>. Waktu dalam ISO UTC, tanggal kerja <code>YYYY-MM-DD</code> menurut zona kantor, uang dalam rupiah bulat.
        </p>
        <p>
          Spesifikasi mesin: <a
            :href="`${data.baseUrl}/openapi.json${internal ? '?scope=internal' : ''}`"
            class="text-primary underline"
          >OpenAPI 3.1</a>.
        </p>
      </section>

      <section
        v-for="s in data.sections"
        :id="s.id"
        :key="s.id"
        class="scroll-mt-24 space-y-6"
      >
        <div>
          <h2 class="text-xl font-semibold text-highlighted">
            {{ s.title }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ s.description }}
          </p>
        </div>
        <article
          v-for="e in s.endpoints"
          :id="e.id"
          :key="e.id"
          class="scroll-mt-24 space-y-3 rounded-xl border border-default p-5"
        >
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :label="e.method"
              :color="methodColor[e.method]"
              variant="subtle"
              class="font-mono"
            />
            <code class="text-sm font-semibold">{{ e.path }}</code>
            <span class="text-sm text-muted">— {{ e.summary }}</span>
          </div>
          <p
            v-if="e.description"
            class="text-sm text-muted"
          >
            {{ e.description }}
          </p>
          <p class="text-xs text-muted">
            {{ authLabel[e.auth] }}<span v-if="e.paginated"> · berpaginasi</span><span v-if="e.cacheable"> · mendukung ETag</span><span v-if="e.errors?.length"> · galat khusus: {{ e.errors.join(', ') }}</span>
          </p>
          <table
            v-if="e.params?.length || e.body?.length"
            class="w-full text-sm"
          >
            <tbody class="divide-y divide-default">
              <tr
                v-for="p in [...(e.params ?? []).map(x => ({ ...x, where: x.in })), ...(e.body ?? []).map(x => ({ ...x, where: 'body' }))]"
                :key="p.where + p.name"
              >
                <td class="py-1.5 pr-3 align-top font-mono text-xs">
                  {{ p.name }}<span
                    v-if="p.required"
                    class="text-error"
                  >*</span>
                </td>
                <td class="py-1.5 pr-3 align-top text-xs text-muted">
                  {{ p.where }} · {{ p.type }}
                </td>
                <td class="py-1.5 align-top text-xs">
                  {{ p.description }}
                </td>
              </tr>
            </tbody>
          </table>
          <pre class="overflow-x-auto rounded-lg bg-elevated p-3 text-xs"><code>{{ curl(e) }}</code></pre>
          <details>
            <summary class="cursor-pointer text-xs text-muted">
              Contoh respons
            </summary>
            <pre class="mt-2 overflow-x-auto rounded-lg bg-elevated p-3 text-xs"><code>{{ pretty(wrapped(e)) }}</code></pre>
          </details>
        </article>
      </section>

      <section
        id="galat"
        class="scroll-mt-24"
      >
        <h2 class="mb-3 text-xl font-semibold text-highlighted">
          Kode galat
        </h2>
        <table class="w-full text-sm">
          <tbody class="divide-y divide-default">
            <tr
              v-for="c in data.errors"
              :key="c.code"
            >
              <td class="py-1.5 pr-3 font-mono text-xs">
                {{ c.code }}
              </td>
              <td class="py-1.5 pr-3 tabular text-xs text-muted">
                {{ c.status }}
              </td>
              <td class="py-1.5 text-xs">
                {{ c.meaning }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
