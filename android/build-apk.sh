#!/usr/bin/env bash
# StarVault - build a signed, installable APK from the static web app.
# No Gradle, no AndroidX, no network downloads: only the Android SDK
# build-tools (aapt2 / d8 / zipalign / apksigner) and a JDK are required.
#
#   ./android/build-apk.sh
#
# Override with ANDROID_SDK_ROOT / JAVA_HOME if auto-detection fails.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SRC="$HERE/app/src/main"
WORK="$HERE/build"
OUT="$ROOT/dist"
APK_NAME="StarVault-v1.0.0.apk"
STOREPASS="starvault2026"

# ---------------------------------------------------------------- SDK ----
SDK=""
for c in "${ANDROID_SDK_ROOT:-}" "${ANDROID_HOME:-}" \
         "$HOME/AppData/Local/Android/Sdk" "$HOME/Library/Android/sdk" \
         "$HOME/Android/Sdk" "/opt/android-sdk"; do
  if [ -n "$c" ] && [ -d "$c/build-tools" ]; then SDK="$c"; break; fi
done
if [ -z "$SDK" ]; then
  echo "ERROR: Android SDK not found. Set ANDROID_SDK_ROOT to your SDK path." >&2
  exit 1
fi
BT="$(ls -d "$SDK"/build-tools/*/ 2>/dev/null | sort -V | tail -1)"; BT="${BT%/}"
PLATFORM="$(ls "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1)"
if [ -z "$BT" ] || [ -z "$PLATFORM" ]; then
  echo "ERROR: SDK needs build-tools and an android-* platform: $SDK" >&2
  exit 1
fi
AAPT2="$BT/aapt2"; [ -x "$AAPT2" ] || AAPT2="$BT/aapt2.exe"
ZIPALIGN="$BT/zipalign"; [ -x "$ZIPALIGN" ] || ZIPALIGN="$BT/zipalign.exe"
D8_JAR="$BT/lib/d8.jar"
APKSIGNER_JAR="$BT/lib/apksigner.jar"

# ---------------------------------------------------------------- JDK ----
# d8 / apksigner need Java 11+. Prefer JDK 17, fall back to anything >= 11.
pick_java_home() {
  local c v major
  for c in "${JAVA_HOME:-}" \
           "/c/Program Files/Java/jdk-17" "/c/Program Files/Java/jdk-21" \
           /c/Program\ Files/Java/jdk-[0-9]* \
           /c/Program\ Files/Eclipse\ Adoptium/jdk-*-hotspot \
           /usr/lib/jvm/java-17-openjdk-* /usr/lib/jvm/java-21-openjdk-* \
           /Library/Java/JavaVirtualMachines/*/Contents/Home; do
    [ -n "$c" ] && [ -x "$c/bin/javac" ] || continue
    v="$("$c/bin/javac" -version 2>&1 | head -1)"
    major="$(echo "$v" | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
    [ "$major" = "1" ] && major=8
    if [ "$major" -ge 11 ] 2>/dev/null; then echo "$c"; return 0; fi
  done
  return 1
}
JDK="$(pick_java_home || true)"
if [ -n "$JDK" ]; then
  JAVA="$JDK/bin/java"; JAVAC="$JDK/bin/javac"; KEYTOOL="$JDK/bin/keytool"
else
  echo "ERROR: JDK 11+ not found. Set JAVA_HOME (JDK 17 recommended)." >&2
  exit 1
fi
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then echo "ERROR: python3 is required to inject classes.dex." >&2; exit 1; fi

echo "SDK      : $SDK ($(basename "$BT"), $(basename "$(dirname "$PLATFORM")"))"
echo "JDK      : $JDK"

# ------------------------------------------------------------- staging ----
rm -rf "$WORK"
mkdir -p "$WORK/res" "$WORK/classes" "$WORK/dex" "$WORK/assets/www" "$OUT"
cp -r "$SRC/res/." "$WORK/res/"
cp "$ROOT/index.html" "$WORK/assets/www/"
cp -r "$ROOT/css" "$ROOT/js" "$WORK/assets/www/"

# ------------------------------------------------------- resources.apk ----
echo "[1/6] aapt2 compile + link"
"$AAPT2" compile --dir "$WORK/res" -o "$WORK/res.zip"
"$AAPT2" link -o "$WORK/base.apk" \
  -I "$PLATFORM" \
  --manifest "$SRC/AndroidManifest.xml" \
  -A "$WORK/assets" \
  -R "$WORK/res.zip" \
  --auto-add-overlay \
  --min-sdk-version 24 --target-sdk-version 34

# ------------------------------------------------------------ classes ----
echo "[2/6] javac"
JAVA_FILES=($(find "$SRC/java" -name '*.java'))
"$JAVAC" -J-Duser.language=en -J-Duser.country=US \
  -encoding UTF-8 -source 8 -target 8 -Xlint:-options \
  -classpath "$PLATFORM" -d "$WORK/classes" "${JAVA_FILES[@]}"

echo "[3/6] d8 -> classes.dex"
CLASS_FILES=($(find "$WORK/classes" -name '*.class'))
"$JAVA" -Xmx512m -cp "$D8_JAR" com.android.tools.r8.D8 \
  --lib "$PLATFORM" --min-api 24 --output "$WORK/dex" "${CLASS_FILES[@]}"

echo "[4/6] inject classes.dex"
"$PY" "$HERE/tools/inject_dex.py" \
  "$WORK/base.apk" "$WORK/dex/classes.dex" "$WORK/unsigned.apk"

# ------------------------------------------------------------- signing ----
echo "[5/6] zipalign + sign"
"$ZIPALIGN" -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
KS="$HERE/starvault.keystore"
if [ ! -f "$KS" ]; then
  echo "  generating release keystore (keep this file private)"
  "$KEYTOOL" -genkeypair -alias starvault -keyalg RSA -keysize 2048 \
    -validity 10950 -keystore "$KS" -storepass "$STOREPASS" \
    -keypass "$STOREPASS" \
    -dname "CN=StarVault, OU=Open Source, O=StarVault, L=Shanghai, ST=Shanghai, C=CN" \
    >/dev/null 2>&1
fi
"$JAVA" -jar "$APKSIGNER_JAR" sign \
  --ks "$KS" --ks-key-alias starvault \
  --ks-pass "pass:$STOREPASS" --key-pass "pass:$STOREPASS" \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/$APK_NAME" "$WORK/aligned.apk"

echo "[6/6] verify"
"$JAVA" -jar "$APKSIGNER_JAR" verify --verbose "$OUT/$APK_NAME" | head -8
"$AAPT2" dump badging "$OUT/$APK_NAME" | head -4
echo
echo "OK -> $OUT/$APK_NAME ($(du -h "$OUT/$APK_NAME" | cut -f1))"
