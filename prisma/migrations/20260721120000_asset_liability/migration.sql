-- Долг/задолженность у актива: положительный `value`, но вычитается из личного
-- капитала (и исключается из пончика «Состав капитала»).
ALTER TABLE "Asset" ADD COLUMN "liability" BOOLEAN NOT NULL DEFAULT false;
