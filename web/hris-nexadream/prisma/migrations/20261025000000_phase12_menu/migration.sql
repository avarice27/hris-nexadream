-- Fase 12: menu "Kesiapan produksi" di grup Sistem (idempoten).
-- Pada database baru, menu dibuat oleh seed (dijalankan setelah migrasi), jadi baris ini hanya
-- disisipkan bila grup induk "menu-system" sudah ada (database yang sudah pernah di-seed).
INSERT INTO "menus" ("id","parentId","label","slug","path","icon","permissionKey","order","isActive","createdAt","updatedAt")
SELECT 'menu-system-status','menu-system','Kesiapan produksi','system-status','/admin/system','i-lucide-rocket','settings.read',3,true,(now() at time zone 'utc'),(now() at time zone 'utc')
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'menu-system')
ON CONFLICT ("id") DO NOTHING;
