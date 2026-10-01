#!/usr/bin/env bash
# Emulator-Smoke-Test: installiert die Debug-APK, startet die App und prüft,
# dass sie nicht abstürzt, das Spiel-JS läuft und AdMob initialisiert.
set -uo pipefail
APK="$1"
PKG=de.outbreakhero.game

adb install -r "$APK" || exit 1
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 60
adb logcat -d > logcat.txt
adb exec-out screencap -p > smoke.png

echo "---------------- App-Konsole ----------------"
grep -E "Capacitor/Console|\[Outbreak\]" logcat.txt | tail -n 80
echo "---------------- Abstürze -------------------"
grep -E "FATAL EXCEPTION" -A 20 logcat.txt | head -n 60

fail=0
if grep -q "FATAL EXCEPTION" logcat.txt; then echo "::error::App ist abgestürzt"; fail=1; fi
if ! grep -q "\[Outbreak\] Spiel gestartet" logcat.txt; then echo "::error::Spiel-JS wurde nicht gestartet"; fail=1; fi
if ! grep -q "\[Outbreak\] Plattform: android" logcat.txt; then echo "::error::Native Plattform nicht erkannt"; fail=1; fi
if grep -q "\[Outbreak\] JS-Fehler" logcat.txt; then echo "::error::JavaScript-Fehler in der App"; fail=1; fi
if grep -q "\[Outbreak\] AdMob bereit" logcat.txt; then echo "AdMob: OK"; else echo "::warning::AdMob nicht initialisiert"; fi
if grep -q "\[Outbreak\] Rewarded-Video geladen" logcat.txt; then echo "Rewarded-Test-Video: geladen"; else echo "::warning::Rewarded-Video nicht geladen (im Emulator ohne Netz/Play-Dienste möglich)"; fi
[ "$fail" = 0 ] && echo "Smoke-Test bestanden"
exit "$fail"
