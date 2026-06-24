@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
set "npm_config_cache=C:\npmcache"
cd /d "%~dp0server"
echo Starting Decor to Impress judge server on http://localhost:8787 ...
npm run dev
