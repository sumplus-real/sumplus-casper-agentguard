#!/bin/bash
# Sumplus Arsenal initialization script
# This script starts the development server

set -e

echo "======================================"
echo "  Sumplus Arsenal - Starting Dev Server"
echo "======================================"

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
  echo "⚠️  .env.local not found!"
  echo "   Copying from .env.local.example..."
  if [ -f ".env.local.example" ]; then
    cp .env.local.example .env.local
    echo "   ✓ Created .env.local"
    echo "   ⚠️  Please update it with your Supabase credentials!"
    echo ""
  fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
  echo "✓ Dependencies installed"
  echo ""
fi

# Start Next.js development server
echo "Starting Next.js development server..."
echo "Server will be available at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop"
echo "======================================"

npm run dev
