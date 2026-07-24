#!/bin/sh
set -e

echo "→ Applying database migrations..."
npx prisma migrate deploy

# Seed only on first boot (when no user exists yet), so manual data is never wiped.
NEEDS_SEED=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(n=>{console.log(n>0?'no':'yes')}).catch(()=>console.log('yes')).finally(()=>p.\$disconnect());")
if [ "$NEEDS_SEED" = "yes" ]; then
  echo "→ Empty database — running seed..."
  npx tsx prisma/seed.ts || echo "seed skipped/failed"
else
  echo "→ Database already populated — skipping seed."
fi

# Idempotent: upsert the company USDT wallet list on every boot (runs even when
# the seed is skipped). Never duplicates rows or wipes synced balances.
echo "→ Importing company wallets (idempotent)..."
npx tsx prisma/import-company-wallets.ts || echo "company wallet import skipped/failed"

# Idempotent: ensure the restricted "expenses" account exists (from EXPENSES_PASSWORD).
echo "→ Ensuring expenses-only account (idempotent)..."
npx tsx prisma/ensure-expenses-user.ts || echo "expenses user ensure skipped/failed"

echo "→ Starting app..."
exec "$@"
