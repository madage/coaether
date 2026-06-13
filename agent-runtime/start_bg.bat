@echo off
cd /d E:\coaether\agent-runtime
start "CoAetherRuntime" /min cmd.exe /c "agent-runtime.exe start > runtime3.log 2>&1 &"
exit /b 0
