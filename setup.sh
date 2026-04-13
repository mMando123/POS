#!/bin/bash
#
# ╔══════════════════════════════════════════════════╗
# ║       سكريبت تثبيت نظام زمام POS الكامل         ║
# ║       Zimam POS System - Auto Installer          ║
# ╚══════════════════════════════════════════════════╝
#
# الاستخدام:
#   chmod +x setup.sh && sudo ./setup.sh
#
# يعمل على: Ubuntu 22.04 / 24.04
#

set -e

# ============ Colors ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  $1${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# ============ Check Root ============
if [ "$EUID" -ne 0 ]; then
    print_error "يجب تشغيل السكريبت بصلاحيات root"
    echo "استخدم: sudo ./setup.sh"
    exit 1
fi

print_header "🚀 بدء تثبيت نظام زمام POS"

# ============ Method Selection ============
echo "اختر طريقة التثبيت:"
echo ""
echo "  1) Docker (الأسهل - موصى به)"
echo "  2) يدوي (Node.js + MySQL مباشرة)"
echo ""
read -p "اختيارك [1/2]: " INSTALL_METHOD
INSTALL_METHOD=${INSTALL_METHOD:-1}

if [ "$INSTALL_METHOD" = "1" ]; then
    # ============================================
    #           DOCKER INSTALLATION
    # ============================================
    print_header "📦 تثبيت عبر Docker"

    # Install Docker
    print_step "تثبيت Docker..."
    if command -v docker &> /dev/null; then
        print_success "Docker موجود بالفعل"
    else
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
        print_success "تم تثبيت Docker"
    fi

    # Install Docker Compose
    print_step "تثبيت Docker Compose..."
    if command -v docker compose &> /dev/null; then
        print_success "Docker Compose موجود بالفعل"
    else
        apt-get install -y docker-compose-plugin
        print_success "تم تثبيت Docker Compose"
    fi

    # Create .env file if not exists
    if [ ! -f .env ]; then
        print_step "إنشاء ملف الإعدادات .env..."
        JWT_SECRET=$(openssl rand -hex 64)
        cat > .env << EOF
# ===== Zimam POS Configuration =====

# Database
DB_NAME=pos_restaurant
DB_PASSWORD=Zimam2026Secure!

# Security
JWT_SECRET=${JWT_SECRET}

# CORS (add your domain)
CORS_ORIGIN=http://localhost,http://localhost:80,http://localhost:3000,http://localhost:3002,http://localhost:3003

# API URLs (leave as /api for Docker setup)
POS_API_URL=/api
WEBSITE_API_URL=/api
KDS_API_URL=/api
EOF
        print_success "تم إنشاء .env"
    fi

    # Build and start all services
    print_step "بناء وتشغيل الخدمات..."
    docker compose build --no-cache
    docker compose up -d

    print_header "✅ تم التثبيت بنجاح!"
    echo ""
    echo -e "  🖥️  POS (الكاشير):     ${GREEN}http://localhost:3002${NC}"
    echo -e "  🌍 الموقع:             ${GREEN}http://localhost:3000${NC}"
    echo -e "  🍳 شاشة المطبخ:        ${GREEN}http://localhost:3003${NC}"
    echo -e "  ⚙️  API:               ${GREEN}http://localhost:3001${NC}"
    echo -e "  🔗 الكل عبر Nginx:     ${GREEN}http://localhost${NC}"
    echo ""
    echo "أوامر مفيدة:"
    echo "  docker compose logs -f        # عرض اللوقات"
    echo "  docker compose restart        # إعادة تشغيل"
    echo "  docker compose down           # إيقاف الكل"
    echo "  docker compose up -d --build  # إعادة بناء وتشغيل"

else
    # ============================================
    #           MANUAL INSTALLATION
    # ============================================
    print_header "🔧 تثبيت يدوي"

    # Get project directory
    PROJECT_DIR=$(pwd)
    print_step "مجلد المشروع: $PROJECT_DIR"

    # ---- System Updates ----
    print_step "تحديث النظام..."
    apt-get update -y && apt-get upgrade -y

    # ---- Node.js 20 ----
    print_step "تثبيت Node.js 20..."
    if command -v node &> /dev/null; then
        NODE_V=$(node -v)
        print_success "Node.js موجود: $NODE_V"
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        print_success "تم تثبيت Node.js $(node -v)"
    fi

    # ---- PM2 ----
    print_step "تثبيت PM2..."
    npm install -g pm2
    print_success "تم تثبيت PM2"

    # ---- MySQL 8 ----
    print_step "تثبيت MySQL..."
    if command -v mysql &> /dev/null; then
        print_success "MySQL موجود بالفعل"
    else
        apt-get install -y mysql-server
        systemctl enable mysql
        systemctl start mysql
        print_success "تم تثبيت MySQL"
    fi

    # ---- Create Database ----
    print_step "إنشاء قاعدة البيانات..."
    read -p "كلمة مرور MySQL root (اتركها فارغة إذا لم تُعيَّن): " MYSQL_ROOT_PASS
    read -p "اسم قاعدة البيانات [pos_restaurant]: " DB_NAME
    DB_NAME=${DB_NAME:-pos_restaurant}
    read -p "كلمة مرور مستخدم التطبيق: " APP_DB_PASS

    if [ -z "$MYSQL_ROOT_PASS" ]; then
        mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        mysql -u root -e "CREATE USER IF NOT EXISTS 'zimam_app'@'localhost' IDENTIFIED BY '$APP_DB_PASS';"
        mysql -u root -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO 'zimam_app'@'localhost'; FLUSH PRIVILEGES;"
    else
        mysql -u root -p"$MYSQL_ROOT_PASS" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        mysql -u root -p"$MYSQL_ROOT_PASS" -e "CREATE USER IF NOT EXISTS 'zimam_app'@'localhost' IDENTIFIED BY '$APP_DB_PASS';"
        mysql -u root -p"$MYSQL_ROOT_PASS" -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO 'zimam_app'@'localhost'; FLUSH PRIVILEGES;"
    fi
    print_success "تم إنشاء قاعدة البيانات: $DB_NAME"

    # ---- Backend .env ----
    print_step "إعداد ملف البيئة..."
    JWT_SECRET=$(openssl rand -hex 64)
    cat > "$PROJECT_DIR/backend/.env" << EOF
PORT=3001
NODE_ENV=production
DB_DIALECT=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=$DB_NAME
DB_USER=zimam_app
DB_PASSWORD=$APP_DB_PASS
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=12h
REFRESH_TOKEN_EXPIRES_DAYS=7
CORS_ORIGIN=http://localhost,http://localhost:3000,http://localhost:3002,http://localhost:3003
ACCOUNTING_STRICT_DEFAULTS=true
ACCOUNTING_AUTO_REMAP_POSTING=false
ACCOUNTING_ALLOW_GLOBAL_FALLBACK=false
EOF
    print_success "تم إنشاء backend/.env"

    # ---- Install Dependencies ----
    print_step "تثبيت المكتبات..."
    cd "$PROJECT_DIR" && npm install
    cd "$PROJECT_DIR/pos" && npm install
    cd "$PROJECT_DIR/website" && npm install
    cd "$PROJECT_DIR/kds" && npm install
    print_success "تم تثبيت المكتبات"

    # ---- Build Frontends ----
    print_step "بناء واجهات المستخدم..."
    cd "$PROJECT_DIR/pos" && npm run build
    cd "$PROJECT_DIR/website" && npm run build
    cd "$PROJECT_DIR/kds" && npm run build
    print_success "تم بناء الواجهات"

    # ---- Nginx ----
    print_step "تثبيت وإعداد Nginx..."
    apt-get install -y nginx

    cat > /etc/nginx/sites-available/zimam-pos << NGINXEOF
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 20M;

    # POS Frontend
    location / {
        root $PROJECT_DIR/pos/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Website Frontend
    location /menu {
        alias $PROJECT_DIR/website/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # KDS Frontend
    location /kitchen {
        alias $PROJECT_DIR/kds/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
    }

    # Uploads
    location /uploads/ {
        alias $PROJECT_DIR/backend/uploads/;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/zimam-pos /etc/nginx/sites-enabled/
    nginx -t && systemctl restart nginx
    print_success "تم إعداد Nginx"

    # ---- PM2 Setup ----
    print_step "إعداد PM2 للتشغيل التلقائي..."
    cd "$PROJECT_DIR"

    cat > ecosystem.production.config.js << 'PM2EOF'
module.exports = {
    apps: [{
        name: 'zimam-backend',
        script: './backend/src/server.js',
        cwd: __dirname,
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production'
        }
    }]
};
PM2EOF

    pm2 start ecosystem.production.config.js
    pm2 save
    pm2 startup systemd -u root --hp /root
    print_success "تم إعداد PM2"

    # ---- Firewall ----
    print_step "إعداد جدار الحماية..."
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 22/tcp
    echo "y" | ufw enable 2>/dev/null || true
    print_success "تم إعداد جدار الحماية"

    print_header "✅ تم التثبيت بنجاح!"
    echo ""
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo -e "  🖥️  POS (الكاشير):     ${GREEN}http://$SERVER_IP${NC}"
    echo -e "  🌍 الموقع:             ${GREEN}http://$SERVER_IP/menu${NC}"
    echo -e "  🍳 شاشة المطبخ:        ${GREEN}http://$SERVER_IP/kitchen${NC}"
    echo -e "  ⚙️  API:               ${GREEN}http://$SERVER_IP/api${NC}"
    echo ""
    echo "بيانات الدخول الافتراضية:"
    echo "  المستخدم: admin"
    echo "  كلمة المرور: admin123"
    echo ""
    echo "أوامر مفيدة:"
    echo "  pm2 status           # حالة الخادم"
    echo "  pm2 logs             # عرض اللوقات"
    echo "  pm2 restart all      # إعادة تشغيل"
    echo "  sudo systemctl restart nginx  # إعادة تشغيل Nginx"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  شكراً لاستخدامك نظام زمام POS 🎉     ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
