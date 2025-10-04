#!/bin/bash

# Production startup script for blog-simple
set -e

# Source environment variables
source /home/eransa/code/blog-simple/.env

# Source NVM
source /home/eransa/.nvm/nvm.sh

# Change to project directory
cd /home/eransa/code/blog-simple

# Run database migrations
# npx prisma migrate deploy

# Start the Next.js application in production mode
npm start
