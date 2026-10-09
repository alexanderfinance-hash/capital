-- Ссылка на строку-заглушку в общей ДДС (убирается при включении секретного режима).
ALTER TABLE "SecretExpenseTxn" ADD COLUMN "placeholder" TEXT;
