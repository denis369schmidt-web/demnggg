// Brücke zu den nativen Capacitor-Plugins. Wird per esbuild zu www/native.js
// gebündelt und stellt die Plugins als window.OutbreakNative bereit, damit das
// Spiel selbst ohne Bundler auskommt (siehe zombie/platform.js).
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Haptics } from "@capacitor/haptics";
import { StatusBar } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { InAppReview } from "@capacitor-community/in-app-review";
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";

window.OutbreakNative = {
  Capacitor,
  App,
  Haptics,
  StatusBar,
  SplashScreen,
  InAppReview,
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
};
