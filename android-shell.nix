# Entering this shell accepts the Android SDK license via Nixpkgs configuration.
# Review docs/ANDROID.md and the SDK license before entering it.
let
  pkgs = import <nixpkgs> { config = { allowUnfree = true; android_sdk.accept_license = true; }; };
  android = pkgs.androidenv.composeAndroidPackages {
    platformVersions = [ "36" ];
    buildToolsVersions = [ "36.0.0" ];
    cmakeVersions = [ "3.30.5" ];
    includeNDK = true;
    ndkVersions = [ "27.1.12297006" ];
    includeEmulator = true;
    includeSystemImages = true;
    systemImageTypes = [ "google_apis" ];
    abiVersions = [ "x86_64" ];
  };
  sdk = "${android.androidsdk}/libexec/android-sdk";
in pkgs.mkShell {
  packages = [ pkgs.jdk17 pkgs.android-studio android.androidsdk ];
  JAVA_HOME = pkgs.jdk17.home;
  ANDROID_HOME = sdk;
  ANDROID_SDK_ROOT = sdk;
  ANDROID_NDK_HOME = "${sdk}/ndk/27.1.12297006";
  GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${sdk}/build-tools/36.0.0/aapt2";
}
