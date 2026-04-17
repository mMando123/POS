#!/bin/bash
# ============================================================
#  Zimam POS - Smart Deploy Script
#  يقوم بسحب التحديثات، البناء، التشغيل، والتحقق من الصحة
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_step() { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}▶ $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
print_ok()   { echo -e "${GREEN}✅ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_err()  { echo -e "${RED}❌ $1${NC}"; }

# ============================================================
# 1. Pull latest code
# ============================================================
print_step "سحب آخر التحديثات من GitHub..."
if git pull origin main; then
    print_ok "تم سحب التحديثات بنجاح"
else
    print_warn "فشل سحب التحديثات - سيتم المتابعة بالكود الحالي"
fi

# ============================================================
# 2. Stop old containers
# ============================================================
print_step "إيقاف الحاويات القديمة..."
sudo docker compose down --remove-orphans 2>/dev/null || true
print_ok "تم إيقاف الحاويات"

# ============================================================
# 3. Build backend with no cache
# ============================================================
print_step "بناء الـ Backend (بدون Cache)..."
if sudo docker compose build --no-cache backend; then
    print_ok "تم بناء الـ Backend بنجاح"
else
    print_err "فشل بناء الـ Backend!"
    exit 1
fi

# ============================================================
# 4. Build frontend services
# ============================================================
print_step "بناء واجهات العرض (POS, Website, KDS)..."
if sudo docker compose build pos website kds; then
    print_ok "تم بناء الواجهات بنجاح"
else
    print_err "فشل بناء الواجهات!"
    exit 1
fi

# ============================================================
# 5. Start database first and wait
# ============================================================
print_step "تشغيل قاعدة البيانات..."
sudo docker compose up -d db
echo -n "انتظار جاهزية MySQL..."
for i in $(seq 1 30); do
    if sudo docker compose exec -T db mysqladmin ping -h localhost -u root -pZimam2026! --silent 2>/dev/null; then
        echo ""
        print_ok "قاعدة البيانات جاهزة!"
        break
    fi
    echo -n "."
    sleep 2
done

# ============================================================
# 6. Start backend and check health
# ============================================================
print_step "تشغيل الـ Backend..."
sudo docker compose up -d backend

echo ""
echo -e "${CYAN}انتظار بدء تشغيل الـ Backend (قد يستغرق 30-60 ثانية)...${NC}"
echo ""

BACKEND_OK=false
for i in $(seq 1 40); do
    # Check if container is running
    STATUS=$(sudo docker compose ps backend --format '{{.Status}}' 2>/dev/null)
    
    if echo "$STATUS" | grep -qi "exit\|dead\|restarting"; then
        echo ""
        print_err "الـ Backend انهار! عرض آخر 30 سطر من السجلات:"
        echo -e "${RED}─────────────────────────────────────────────────${NC}"
        sudo docker compose logs backend --tail 30
        echo -e "${RED}─────────────────────────────────────────────────${NC}"
        echo ""
        print_err "يرجى إصلاح الأخطاء أعلاه ثم إعادة التشغيل"
        exit 1
    fi
    
    # Check health endpoint
    if sudo docker compose exec -T backend node -e "
        const h = require('http');
        h.get('http://localhost:3001/api/health', (r) => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => { console.log(d); process.exit(r.statusCode === 200 ? 0 : 1); });
        }).on('error', () => process.exit(1));
    " 2>/dev/null; then
        BACKEND_OK=true
        break
    fi
    
    echo -ne "\r  ⏳ محاولة $i/40 - الحالة: $STATUS"
    sleep 3
done

echo ""

if [ "$BACKEND_OK" = true ]; then
    print_ok "الـ Backend يعمل بنجاح! 🎉"
else
    print_err "الـ Backend لم يستجب بعد 2 دقيقة! عرض السجلات:"
    echo -e "${RED}─────────────────────────────────────────────────${NC}"
    sudo docker compose logs backend --tail 50
    echo -e "${RED}─────────────────────────────────────────────────${NC}"
    exit 1
fi

# ============================================================
# 7. Start remaining services
# ============================================================
print_step "تشغيل باقي الخدمات (POS, Website, KDS, Nginx)..."
sudo docker compose up -d
print_ok "تم تشغيل جميع الخدمات"

# ============================================================
# 8. Final health check
# ============================================================
print_step "فحص نهائي لجميع الخدمات..."
echo ""

sleep 5

# Check each service
SERVICES=("db" "backend" "pos" "website" "kds" "nginx")
ALL_OK=true

for svc in "${SERVICES[@]}"; do
    STATUS=$(sudo docker compose ps "$svc" --format '{{.Status}}' 2>/dev/null)
    if echo "$STATUS" | grep -qi "up\|running\|healthy"; then
        print_ok "$svc: $STATUS"
    else
        print_err "$svc: $STATUS"
        ALL_OK=false
    fi
done

echo ""

# ============================================================
# 9. Test API connectivity
# ============================================================
print_step "اختبار اتصال API..."

# Test from backend container directly
if sudo docker compose exec -T backend node -e "
    const h = require('http');
    h.get('http://localhost:3001/api/health', (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => { console.log('Backend API:', d); process.exit(0); });
    }).on('error', (e) => { console.log('Error:', e.message); process.exit(1); });
" 2>/dev/null; then
    print_ok "Backend API يستجيب بشكل صحيح"
else
    print_err "Backend API لا يستجيب!"
    ALL_OK=false
fi

# Test from nginx (simulating frontend request)
if sudo docker compose exec -T nginx wget -qO- http://backend:3001/api/health 2>/dev/null; then
    echo ""
    print_ok "Nginx ← Backend: الاتصال يعمل"
else
    print_err "Nginx ← Backend: فشل الاتصال!"
    ALL_OK=false
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}"
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║     🎉 تم التشغيل بنجاح! النظام جاهز 🎉     ║"
    echo "  ╠══════════════════════════════════════════════╣"
    echo "  ║                                              ║"
    echo "  ║  🖥️  POS:     http://localhost:8080           ║"
    echo "  ║  🌐 Website: http://localhost:8080/menu      ║"
    echo "  ║  🍳 KDS:     http://localhost:8080/kitchen   ║"
    echo "  ║  📡 API:     http://localhost:3001/api       ║"
    echo "  ║                                              ║"
    echo "  ╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
else
    echo -e "${RED}"
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║   ⚠️  بعض الخدمات لم تبدأ بشكل صحيح ⚠️     ║"
    echo "  ╠══════════════════════════════════════════════╣"
    echo "  ║                                              ║"
    echo "  ║  لعرض السجلات:                               ║"
    echo "  ║  sudo docker compose logs backend --tail 50  ║"
    echo "  ║  sudo docker compose logs nginx --tail 20    ║"
    echo "  ║                                              ║"
    echo "  ╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
    exit 1
fi
