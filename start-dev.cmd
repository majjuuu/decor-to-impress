@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
set "npm_config_cache=C:\npmcache"
cd /d "%~dp0client"
npm run dev
