#!/usr/bin/env bash
# fog APK 빌드 (Gradle 없이 Android SDK 도구만 사용)
# 사용법: ANDROID_SDK=/path/to/sdk ./build-apk.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_SDK:-$HOME/Android/Sdk}"
BT="$SDK/build-tools/${BUILD_TOOLS:-35.0.0}"; JAR="$SDK/platforms/android-34/android.jar"
rm -rf build && mkdir -p build/gen build/classes build/dex build/assets/www
cp -r ../public/. build/assets/www/
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$JAR" --manifest AndroidManifest.xml -R build/res.zip -A build/assets --java build/gen --auto-add-overlay
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -d build/classes $(find build/gen src -name '*.java')
(cd build/classes && jar cf ../classes.jar .)
"$BT/d8" --min-api 26 --lib "$JAR" --output build/dex build/classes.jar
cp build/base.apk build/unsigned.apk && (cd build/dex && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
[ -f debug.keystore ] || keytool -genkeypair -keystore debug.keystore -storepass android -keypass android -alias fog \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=fog debug" >/dev/null 2>&1
"$BT/apksigner" sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --out fog.apk build/aligned.apk
echo "완료: $(pwd)/fog.apk"
