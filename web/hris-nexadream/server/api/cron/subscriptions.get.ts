// Vercel Cron (lihat vercel.json). Publik, di-throttle, setiap langkah idempoten.
// Siaran terjadwal ikut dikirim di sini juga agar ada dua jendela kirim per hari (08:00 & 00:30 WIB);
// dengan paket Vercel Pro jadwal cron bisa dibuat per jam.
export default defineEventHandler(event => runThrottled(event, 'subscriptions', async () => ({
  ...(await runSubscriptionJobs()),
  broadcasts: await dispatchDueBroadcasts().catch(error => ({ error: error instanceof Error ? error.message : String(error) }))
})))
