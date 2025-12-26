-- Adicionar coluna para armazenar a chave VAPID pública usada no registro do device
-- Isso ajuda a identificar qual chave foi usada quando o device foi registrado
-- (útil para debug de erros 403 - VAPID credentials mismatch)

ALTER TABLE "device" 
ADD COLUMN IF NOT EXISTS "vapidPublicKeyUsed" text;

-- Criar índice para facilitar buscas por chave VAPID
CREATE INDEX IF NOT EXISTS "idx_device_vapid_public_key_used" ON "device"("vapidPublicKeyUsed");

-- Comentário na coluna
COMMENT ON COLUMN "device"."vapidPublicKeyUsed" IS 'Chave VAPID pública usada quando o device foi registrado. Armazenada para debug de erros 403 (VAPID mismatch).';





