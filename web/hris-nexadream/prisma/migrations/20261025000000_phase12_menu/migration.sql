-- Fase 12: menu "Kesiapan produksi" di grup Sistem (idempoten).
INSERT INTO "menus" ("id","parentId","label","slug","path","icon","permissionKey","order","isActive","createdAt","updatedAt")
VALUES ('menu-system-status','menu-system','Kesiapan produksi','system-status','/admin/system','i-lucide-rocket','settings.read',3,true,(now() at time zone 'utc'),(now() at time zone 'utc'))
ON CONFLICT ("id") DO NOTHING;
