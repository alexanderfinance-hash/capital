-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('sync', 'sheets', 'manual');

-- CreateEnum
CREATE TYPE "AssetBucket" AS ENUM ('crypto', 'vehicles', 'cash', 'other');

-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('BTC', 'ETH', 'TRX', 'TON');

-- CreateEnum
CREATE TYPE "WalletScope" AS ENUM ('personal', 'company');

-- CreateEnum
CREATE TYPE "WalletGroup" AS ENUM ('clean', 'dirty');

-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('main', 'small');

-- CreateEnum
CREATE TYPE "SnapshotScope" AS ENUM ('personal', 'company');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "icon" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "delta" DECIMAL(6,2),
    "source" "DataSource" NOT NULL,
    "bucket" "AssetBucket" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "scope" "WalletScope" NOT NULL,
    "chain" "Chain" NOT NULL,
    "token" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" "WalletGroup",
    "kind" "WalletKind",
    "balance" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "balanceUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL,
    "enteredBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserve" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "salaryWeekly" INTEGER NOT NULL,
    "salaryWeeks" INTEGER NOT NULL,
    "tech" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseMonth" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "monthStart" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ExpenseMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "period" TEXT NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinAllocation" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "pct" INTEGER NOT NULL,

    CONSTRAINT "CoinAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalSnapshot" (
    "id" TEXT NOT NULL,
    "scope" "SnapshotScope" NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceCache" (
    "symbol" TEXT NOT NULL,
    "usd" DECIMAL(18,8) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceCache_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "source" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("source")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_slug_key" ON "Asset"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_slug_key" ON "Wallet"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_chain_address_token_key" ON "Wallet"("chain", "address", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseMonth_monthStart_key" ON "ExpenseMonth"("monthStart");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_period_name_key" ON "ExpenseCategory"("period", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CoinAllocation_ticker_key" ON "CoinAllocation"("ticker");

-- CreateIndex
CREATE INDEX "CapitalSnapshot_scope_capturedAt_idx" ON "CapitalSnapshot"("scope", "capturedAt");
