#!/bin/bash

# Test the Gmail sync cron job locally

echo "🧪 Testing Gmail Sync Cron Job..."
echo ""
echo "Making request to: http://localhost:3000/api/cron/sync-purchases"
echo ""

# Make the request
curl -v http://localhost:3000/api/cron/sync-purchases

echo ""
echo ""
echo "✅ Test complete! Check the output above for results."

