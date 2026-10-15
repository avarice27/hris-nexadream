-- Fase 8: hak akses impersonasi (idempoten). viewSensitive sengaja TIDAK diberikan ke peran mana pun (D7).
INSERT INTO "permissions" ("id","key","group","description","createdAt","updatedAt")
VALUES ('perm-impersonation-use','impersonation.use','impersonation','Gunakan masuk sebagai (impersonate)',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("id","key","group","description","createdAt","updatedAt")
VALUES ('perm-impersonation-viewsensitive','impersonation.viewSensitive','impersonation','Lihat data sensitif saat masuk sebagai (impersonate)',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id" FROM "roles" r, "permissions" p
WHERE r."slug" = 'superadmin' AND p."key" = 'impersonation.use'
ON CONFLICT DO NOTHING;
