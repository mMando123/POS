# 🚀 دليل نشر نظام زمام POS

## المتطلبات

| المتطلب | الحد الأدنى |
|---------|------------|
| RAM | 2 GB |
| CPU | 1 Core |
| مساحة القرص | 10 GB |
| نظام التشغيل | Ubuntu 22.04+ |

---

## الطريقة 1: Docker (الأسهل ✅)

### الخطوة 1: انسخ المشروع على السيرفر

```bash
git clone https://github.com/YOUR_USERNAME/pos.git
cd pos
```

### الخطوة 2: شغّل سكريبت التثبيت

```bash
chmod +x setup.sh
sudo ./setup.sh
# اختر: 1 (Docker)
```

### أو يدوياً:

```bash
# تثبيت Docker
curl -fsSL https://get.docker.com | sh

# بناء وتشغيل
docker compose up -d --build
```

### الروابط بعد التشغيل:

| الخدمة | الرابط |
|--------|--------|
| POS (الكاشير) | `http://YOUR_IP:3002` |
| الموقع | `http://YOUR_IP:3000` |
| شاشة المطبخ | `http://YOUR_IP:3003` |
| API | `http://YOUR_IP:3001` |
| الكل عبر Nginx | `http://YOUR_IP` |

### بيانات الدخول الافتراضية:
- **المستخدم:** `admin`
- **كلمة المرور:** `admin123`

---

## الطريقة 2: تثبيت يدوي

### الخطوة 1: انسخ المشروع

```bash
git clone https://github.com/YOUR_USERNAME/pos.git
cd pos
```

### الخطوة 2: شغّل السكريبت

```bash
chmod +x setup.sh
sudo ./setup.sh
# اختر: 2 (يدوي)
```

السكريبت سيقوم بـ:
1. تثبيت Node.js 20
2. تثبيت MySQL 8
3. إنشاء قاعدة البيانات
4. تثبيت المكتبات
5. بناء واجهات المستخدم
6. إعداد Nginx
7. إعداد PM2 للتشغيل التلقائي

---

## أوامر الإدارة

### Docker:

```bash
# عرض حالة الخدمات
docker compose ps

# عرض اللوقات
docker compose logs -f

# لوقات خدمة معينة
docker compose logs -f backend

# إيقاف الكل
docker compose down

# إعادة تشغيل
docker compose restart

# إعادة بناء وتشغيل
docker compose up -d --build

# الدخول لقاعدة البيانات
docker compose exec db mysql -u root -p pos_restaurant
```

### يدوي (PM2):

```bash
# حالة الخادم
pm2 status

# عرض اللوقات
pm2 logs

# إعادة تشغيل
pm2 restart all

# إعادة تشغيل Nginx
sudo systemctl restart nginx
```

---

## إعداد الدومين (اختياري)

### 1. أضف DNS A Record يشير لـ IP السيرفر

### 2. ثبّت Certbot لشهادة SSL مجانية:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## النسخ الاحتياطي

```bash
# نسخة احتياطية لقاعدة البيانات (Docker)
docker compose exec db mysqldump -u root -p pos_restaurant > backup_$(date +%Y%m%d).sql

# نسخة احتياطية (يدوي)
mysqldump -u root -p pos_restaurant > backup_$(date +%Y%m%d).sql

# استعادة
mysql -u root -p pos_restaurant < backup_YYYYMMDD.sql
```

---

## تحديث المشروع

```bash
# سحب التحديثات
git pull

# Docker
docker compose up -d --build

# يدوي
cd pos && npm run build && cd ..
cd website && npm run build && cd ..
cd kds && npm run build && cd ..
pm2 restart all
```

---

## 📁 هيكل الملفات المُنشأة

```
pos/
├── docker-compose.yml      # تكوين Docker
├── nginx.conf              # Nginx reverse proxy
├── setup.sh                # سكريبت التثبيت
├── DEPLOYMENT.md           # هذا الملف
├── backend/
│   ├── Dockerfile
│   └── .dockerignore
├── pos/
│   ├── Dockerfile
│   ├── nginx-spa.conf
│   └── .dockerignore
├── website/
│   ├── Dockerfile
│   ├── nginx-spa.conf
│   └── .dockerignore
└── kds/
    ├── Dockerfile
    ├── nginx-spa.conf
    └── .dockerignore
```
