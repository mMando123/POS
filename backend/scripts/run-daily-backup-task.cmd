@echo off
setlocal
cd /d %~dp0..

if not exist logs (
  mkdir logs
)

echo [%DATE% %TIME%] Daily backup task started >> logs\ops-daily-backup.log
node src\scripts\ops-backup-restore-test.js >> logs\ops-daily-backup.log 2>&1
set EXIT_CODE=%ERRORLEVEL%
echo [%DATE% %TIME%] Daily backup task finished with exit=%EXIT_CODE% >> logs\ops-daily-backup.log

exit /b %EXIT_CODE%

