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
# يعمل على: Ubuntu 22.04 / 24.04 (VPS أو WSL2)
#

set -e

# ============ Colors ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# ============ Check Root ============
if [ "$EUID" -ne 0 ]; then
    print_error "يجب تشغيل السكريبت بصلاحيات root"
    echo "استخدم: sudo ./setup.sh"
    exit 1
fi

# ============ Detect environment ============
IS_WSL=false
if grep -qi "microsoft\|wsl" /proc/version 2>/dev/null; then
    IS_WSL=true
fi

print_header "🚀 بدء تثبيت نظام زمام POS"

if [ "$IS_WSL" = true ]; then
    print_info "تم اكتشاف بيئة WSL2"
else
    print_info "تم اكتشاف بيئة Linux/VPS"
fi

# ============ Method Selection ============
echo "اختر طريقة التثبيت:"
echo ""
echo "  1) Docker (الأسهل - موصى به)"
echo "  2) يدوي (Node.js + MySQL مباشرة)"
echo ""
read -p "اختيارك [1/2]: " INSTALL_METHOD
INSTALL_METHOD=${INSTALL_METHOD:-1}

# ============================================================
#  Function: Install Docker Engine inside Linux/WSL
# ============================================================
install_docker_engine() {
    print_step "تثبيت Docker Engine..."

    # Remove old/broken docker packages
    apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    # Install prerequisites
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release

    # Add Docker official GPG key
    install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
    fi

    # Set up Docker repository
    UBUNTU_CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME" 2>/dev/null || echo "jammy")
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $UBUNTU_CODENAME stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    print_success "تم تثبيت Docker Engine"
}

# ============================================================
#  Function: Ensure Docker daemon is running
# ============================================================
ensure_docker_running() {
    print_step "التأكد من تشغيل Docker daemon..."

    # Try systemctl first (works on real VPS and some WSL setups)
    if command -v systemctl &>/dev/null && systemctl is-system-running &>/dev/null 2>&1; then
        systemctl enable docker 2>/dev/null || true
        systemctl start docker 2>/dev/null || true
    fi

    # Check if Docker is actually responding
    if docker info &>/dev/null 2>&1; then
        print_success "Docker daemon يعمل"
        return 0
    fi

    # If systemctl didn't work (common in WSL), start dockerd manually
    if [ "$IS_WSL" = true ]; then
        print_info "بيئة WSL: تشغيل Docker daemon يدوياً..."
        
        # Start dockerd in background
        nohup dockerd > /var/log/dockerd.log 2>&1 &
        DOCKERD_PID=$!
        
        # Wait for Docker to be ready
        echo -n "  انتظار Docker..."
        for i in $(seq 1 20); do
            if docker info &>/dev/null 2>&1; then
                echo ""
                print_success "Docker daemon يعمل (PID: $DOCKERD_PID)"
                return 0
            fi
            echo -n "."
            sleep 2
        done
        echo ""
        print_error "فشل تشغيل Docker daemon!"
        echo "السجلات:"
        tail -20 /var/log/dockerd.log 2>/dev/null || true
        exit 1
    else
        # Real Linux - try service command
        service docker start 2>/dev/null || true
        sleep 3
        if docker info &>/dev/null 2>&1; then
            print_success "Docker daemon يعمل"
            return 0
        fi
        print_error "فشل تشغيل Docker daemon!"
        exit 1
    fi
}

# ============================================================
#  Function: Verify Docker actually works (not just a shim)
# ============================================================
docker_works() {
    # Check if docker command exists AND actually responds
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        return 0
    fi
    return 1
}

if [ "$INSTALL_METHOD" = "1" ]; then
    # ============================================
    #           DOCKER INSTALLATION
    # ============================================
    print_header "📦 تثبيت عبر Docker"

    # ---- Step 1: Install Docker if needed ----
    if docker_works; then
        print_success "Docker يعمل بالفعل ($(docker --version))"
    else
        print_info "Docker غير مثبت أو لا يعمل - سيتم التثبيت الآن..."
        install_docker_engine
        ensure_docker_running
    fi

    # ---- Step 2: Verify docker compose ----
    print_step "التحقق من Docker Compose..."
    if docker compose version &>/dev/null 2>&1; then
        print_success "Docker Compose جاهز ($(docker compose version --short))"
    else
        print_error "Docker Compose غير متوفر!"
        apt-get install -y docker-compose-plugin
        print_success "تم تثبيت Docker Compose"
    fi

    # ---- Step 3: Create .env file ----
    print_step "إنشاء ملف الإعدادات .env..."
    if [ ! -f .env ]; then
        JWT_SECRET=$(openssl rand -hex 64)
        cat > .env << EOF
# ===== Zimam POS Configuration =====

# Database
DB_NAME=pos_restaurant
DB_PASSWORD=Zimam2026Secure!

# Security
JWT_SECRET=${JWT_SECRET}

# CORS (add your domain)
CORS_ORIGIN=http://localhost,http://localhost:80,http://localhost:8080,http://localhost:3000,http://localhost:3002,http://localhost:3003

# API URLs (leave as /api for Docker setup)
POS_API_URL=/api
WEBSITE_API_URL=/api
KDS_API_URL=/api
EOF
        print_success "تم إنشاء .env"
    else
        print_info ".env موجود بالفعل - لن يتم تعديله"
    fi

    # ---- Step 4: Stop old containers ----
    print_step "إيقاف أي حاويات قديمة..."
    docker compose down --remove-orphans 2>/dev/null || true

    # ---- Step 5: Build all services ----
    print_step "بناء جميع الخدمات (قد يستغرق عدة دقائق)..."
    if docker compose build --no-cache; then
        print_success "تم بناء جميع الخدمات"
    else
        print_error "فشل بناء الخدمات! تحقق من الأخطاء أعلاه"
        exit 1
    fi

    # ---- Step 6: Start database first ----
    print_step "تشغيل قاعدة البيانات..."
    docker compose up -d db

    echo -n "  انتظار جاهزية MySQL..."
    DB_READY=false
    for i in $(seq 1 30); do
        if docker compose exec -T db mysqladmin ping -h localhost -u root -pZimam2026Secure! --silent 2>/dev/null; then
            DB_READY=true
            echo ""
            break
        fi
        echo -n "."
        sleep 2
    done

    if [ "$DB_READY" = true ]; then
        print_success "قاعدة البيانات جاهزة"
    else
        print_error "قاعدة البيانات لم تستجب بعد 60 ثانية!"
        echo "السجلات:"
        docker compose logs db --tail 20
        exit 1
    fi

    # ---- Step 7: Start backend ----
    print_step "تشغيل الـ Backend..."
    docker compose up -d backend

    echo ""
    echo -e "${CYAN}  انتظار بدء تشغيل الـ Backend (30-60 ثانية)...${NC}"
    echo ""

    BACKEND_OK=false
    for i in $(seq 1 40); do
        # Check if container crashed
        STATUS=$(docker compose ps backend --format '{{.Status}}' 2>/dev/null || echo "unknown")

        if echo "$STATUS" | grep -qi "exit\|dead"; then
            echo ""
            print_error "الـ Backend انهار! السجلات:"
            echo -e "${RED}─────────────────────────────────────────────────${NC}"
            docker compose logs backend --tail 40
            echo -e "${RED}─────────────────────────────────────────────────${NC}"
            exit 1
        fi

        # Check health endpoint
        if docker compose exec -T backend node -e "
            const h = require('http');
            h.get('http://localhost:3001/api/health', (r) => {
                process.exit(r.statusCode === 200 ? 0 : 1);
            }).on('error', () => process.exit(1));
        " 2>/dev/null; then
            BACKEND_OK=true
            break
        fi

        echo -ne "\r  ⏳ محاولة $i/40..."
        sleep 3
    done

    echo ""

    if [ "$BACKEND_OK" = true ]; then
        print_success "الـ Backend يعمل بنجاح! 🎉"
    else
        print_error "الـ Backend لم يستجب! السجلات:"
        echo -e "${RED}─────────────────────────────────────────────────${NC}"
        docker compose logs backend --tail 50
        echo -e "${RED}─────────────────────────────────────────────────${NC}"
        exit 1
    fi

    # ---- Step 8: Start everything else ----
    print_step "تشغيل باقي الخدمات (POS, Website, KDS, Nginx)..."
    docker compose up -d

    sleep 5

    # ---- Step 9: Final check ----
    print_step "فحص نهائي لجميع الخدمات..."
    echo ""

    SERVICES=("db" "backend" "pos" "website" "kds" "nginx")
    ALL_OK=true

    for svc in "${SERVICES[@]}"; do
        STATUS=$(docker compose ps "$svc" --format '{{.Status}}' 2>/dev/null || echo "not found")
        if echo "$STATUS" | grep -qi "up\|running\|healthy"; then
            print_success "$svc: يعمل ✓"
        else
            print_error "$svc: $STATUS"
            ALL_OK=false
        fi
    done

    # ---- Step 10: Test API ----
    echo ""
    print_step "اختبار اتصال API..."
    if docker compose exec -T backend node -e "
        const h = require('http');
        h.get('http://localhost:3001/api/health', (r) => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => { console.log('  API Response:', d); process.exit(0); });
        }).on('error', (e) => { console.log('  Error:', e.message); process.exit(1); });
    " 2>/dev/null; then
        print_success "Backend API يستجيب بنجاح"
    else
        print_error "Backend API لا يستجيب!"
        ALL_OK=false
    fi

    # ---- Summary ----
    echo ""
    SERVER_IP=$(hostname -I | awk '{print $1}')

    if [ "$ALL_OK" = true ]; then
        echo -e "${GREEN}"
        echo "  ╔══════════════════════════════════════════════════╗"
        echo "  ║       🎉 تم التثبيت والتشغيل بنجاح! 🎉          ║"
        echo "  ╠══════════════════════════════════════════════════╣"
        echo "  ║                                                  ║"
        echo "  ║  🖥️  POS:     http://$SERVER_IP:8080              "
        echo "  ║  🌐 Website: http://$SERVER_IP:8080/menu          "
        echo "  ║  🍳 KDS:     http://$SERVER_IP:8080/kitchen       "
        echo "  ║  📡 API:     http://$SERVER_IP:3001/api            "
        echo "  ║                                                  ║"
        echo "  ║  بيانات الدخول: admin / admin123                 ║"
        echo "  ║                                                  ║"
        echo "  ╚══════════════════════════════════════════════════╝"
        echo -e "${NC}"
    else
        echo -e "${YELLOW}"
        echo "  ╔══════════════════════════════════════════════════╗"
        echo "  ║   ⚠️  بعض الخدمات لم تبدأ بشكل صحيح             ║"
        echo "  ╠══════════════════════════════════════════════════╣"
        echo "  ║  لعرض السجلات:                                   ║"
        echo "  ║  docker compose logs backend --tail 50           ║"
        echo "  ║  docker compose logs nginx --tail 20             ║"
        echo "  ╚══════════════════════════════════════════════════╝"
        echo -e "${NC}"
    fi

    echo ""
    echo "أوامر مفيدة:"
    echo "  docker compose logs -f backend  # عرض سجلات الباك إند مباشرة"
    echo "  docker compose restart          # إعادة تشغيل الكل"
    echo "  docker compose down             # إيقاف الكل"
    echo "  ./deploy.sh                     # إعادة بناء وتشغيل ذكي"

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
    cd "$PROJECT_DIR/backend" && npm install
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
