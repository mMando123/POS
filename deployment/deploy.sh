#!/bin/bash

# Restaurant App VPS Deployment Script
# Ubuntu 22.04 LTS

set -e

echo "🚀 Starting Restaurant App Deployment..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
echo "📦 Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Certbot for SSL
echo "📦 Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# Create app directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/restaurant
sudo chown -R $USER:$USER /var/www/restaurant

# Clone or copy application files
echo "📥 Copy your application files to /var/www/restaurant"

# Setup PostgreSQL
echo "🔧 Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE DATABASE restaurant_db;"
sudo -u postgres psql -c "CREATE USER restaurant_user WITH ENCRYPTED PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE restaurant_db TO restaurant_user;"

# Instructions for next steps
echo ""
echo "✅ Base installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy your application files to /var/www/restaurant"
echo "2. Update backend/.env with production settings"
echo "3. Run: cd /var/www/restaurant/backend && npm run migrate"
echo "4. Build frontend apps:"
echo "   cd pos && npm run build"
echo "   cd website && npm run build"
echo "   cd kds && npm run build"
echo "5. Copy deployment/nginx.conf to /etc/nginx/sites-available/restaurant"
echo "6. Enable site: sudo ln -s /etc/nginx/sites-available/restaurant /etc/nginx/sites-enabled/"
echo "7. Get SSL: sudo certbot --nginx -d yourdomain.com"
echo "8. Start backend: cd /var/www/restaurant && pm2 start ecosystem.config.js"
echo "9. Save PM2: pm2 save && pm2 startup"
echo ""
echo "🎉 Deployment preparation complete!"
