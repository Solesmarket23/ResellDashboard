#!/bin/bash

# Deploy Auto-Repricing to Vercel
# This script commits and pushes your changes

echo "🚀 Deploying Auto-Repricing System to Vercel"
echo ""

# Check if there are changes to commit
if [[ -z $(git status -s) ]]; then
  echo "✅ No changes to commit. Everything is up to date."
  echo ""
  echo "If you've already deployed, run:"
  echo "  npm run enable-repricing"
  exit 0
fi

echo "📦 Changes to be committed:"
git status -s
echo ""

# Ask for confirmation
read -p "Continue with deployment? (yes/no): " confirm
if [[ $confirm != "yes" && $confirm != "y" ]]; then
  echo "❌ Deployment cancelled."
  exit 0
fi

echo ""
echo "📝 Committing changes..."
git add .
git commit -m "Add automated repricing system with 5-minute cron"

echo ""
echo "🚀 Pushing to Vercel..."
git push origin main

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Wait for Vercel to deploy (check: https://vercel.com/dashboard)"
echo ""
echo "2. Add CRON_SECRET environment variable in Vercel:"
echo "   - Go to: Settings → Environment Variables"
echo "   - Add: CRON_SECRET=your-secret-key-here"
echo ""
echo "3. Enable auto-repricing for your account:"
echo "   npm run enable-repricing"
echo ""
echo "4. Verify it's working:"
echo "   Visit: https://your-domain.com/api/cron/status"
echo ""

