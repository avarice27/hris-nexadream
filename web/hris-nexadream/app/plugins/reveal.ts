// v-reveal: animasi muncul-saat-gulir untuk landing (14 §2 "Motion").
// Universal (bukan .client): SSR butuh getSSRProps. Dua pengaman:
// 1) status tersembunyi hanya berlaku setelah kelas `js-reveal` dipasang di <html> oleh JS,
//    jadi konten tidak pernah tertahan tersembunyi bila JS gagal;
// 2) CSS-nya hanya aktif di bawah `prefers-reduced-motion: no-preference`.
export default defineNuxtPlugin((nuxtApp) => {
  let observer: IntersectionObserver | null = null

  if (import.meta.client && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-reveal')
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer?.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 })
  }

  nuxtApp.vueApp.directive<HTMLElement>('reveal', {
    getSSRProps: () => ({}),
    mounted(el) {
      if (!observer) return
      const rect = el.getBoundingClientRect()
      // Yang sudah terlihat saat dimuat tidak dianimasikan (hindari kedip setelah SSR).
      if (rect.top < window.innerHeight) return
      el.setAttribute('data-reveal', '')
      observer.observe(el)
    },
    beforeUnmount(el) {
      observer?.unobserve(el)
    }
  })
})
