@echo off
REM ═══════════════════════════════════════════════════
REM   Automated MySQL Backup — POS Restaurant System
REM   Schedule this with Windows Task Scheduler every 6 hours
REM ═══════════════════════════════════════════════════

SET DB_NAME=pos_restaurant
SET DB_USER=root
SET DB_PASS=Mando123@#
SET BACKUP_DIR=%~dp0backups
SET TIMESTAMP=%DATE:~-4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%
SET TIMESTAMP=%TIMESTAMP: =0%

REM Create backup directory if not exists
IF NOT EXIST "%BACKUP_DIR%" MKDIR "%BACKUP_DIR%"

REM Full database dump
echo [%DATE% %TIME%] Starting backup...
mysqldump -u%DB_USER% -p%DB_PASS% --single-transaction --routines --triggers %DB_NAME% > "%BACKUP_DIR%\pos_%TIMESTAMP%.sql"

IF %ERRORLEVEL% EQU 0 (
    echo [%DATE% %TIME%] Backup successful: pos_%TIMESTAMP%.sql
    
    REM Delete backups older than 7 days
    forfiles /P "%BACKUP_DIR%" /S /M "pos_*.sql" /D -7 /C "cmd /c del @path" 2>nul
    echo [%DATE% %TIME%] Old backups cleaned up.
) ELSE (
    echo [%DATE% %TIME%] ERROR: Backup failed!
)
