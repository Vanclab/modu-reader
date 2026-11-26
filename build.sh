#!/bin/bash
set -e
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk
BT=$SDK/build-tools/debian
AJ=$SDK/platforms/android-23/android.jar
KS="${KS:-$HOME/.dsh/debug.keystore}"
PASS="${KS_PASS:-androiddebug}"

rm -rf build && mkdir -p build/classes

echo "== 1/6 javac =="
javac --release 8 -encoding UTF-8 -cp "$AJ" -d build/classes $(find src -name '*.java')
echo "   ok"

echo "== 2/6 dx =="
"$BT/dx" --dex --output=build/classes.dex build/classes 2>&1 | grep -vi "^warning" || true
ls -lh build/classes.dex | awk '{print "   "$5}'

echo "== 3/6 aapt package =="
"$BT/aapt" package -f -M AndroidManifest.xml -S res -A assets -I "$AJ" \
  --min-sdk-version 21 --target-sdk-version 33 -F build/app.unsigned.apk

echo "== 4/6 add dex =="
(cd build && "$BT/aapt" add app.unsigned.apk classes.dex)

echo "== 5/6 zipalign =="
"$BT/zipalign" -f 4 build/app.unsigned.apk build/app.aligned.apk

echo "== 6/6 sign =="
if [ ! -f "$KS" ]; then
  keytool -genkeypair -v -keystore "$KS" -storepass "$PASS" -keypass "$PASS" \
    -alias dsh -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=DSH Debug, O=DSH, C=CN" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --out build/app.apk build/app.aligned.apk

echo "== done =="
ls -lh build/app.apk | awk '{print "   APK "$5}'
"$BT/aapt" dump badging build/app.apk | head -3
