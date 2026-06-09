-- CreateTable
CREATE TABLE "TelegramState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "offset" BIGINT NOT NULL DEFAULT 0,
    "lastChatId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramState_pkey" PRIMARY KEY ("id")
);
