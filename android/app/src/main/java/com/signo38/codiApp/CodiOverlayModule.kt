package com.signo38.codiApp

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.signo38.codiApp.overlay.OverlayService

class CodiOverlayModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CodiOverlay"

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    } catch (e: Throwable) {
      promise.reject("E_OVERLAY", e.message, e)
    }
  }

  @ReactMethod
  fun requestOverlayPermission() {
    val ctx = reactApplicationContext
    if (Settings.canDrawOverlays(ctx)) {
      return
    }
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${ctx.packageName}"),
    )
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      ctx.startActivity(intent)
    } catch (_: Throwable) {
    }
  }

  @ReactMethod
  fun showFloatingWindow(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      if (!Settings.canDrawOverlays(ctx)) {
        promise.resolve(false)
        return
      }
      val intent = Intent(ctx, OverlayService::class.java).apply {
        action = OverlayService.ACTION_SHOW
      }
      ContextCompat.startForegroundService(ctx, intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("E_OVERLAY", e.message, e)
    }
  }

  @ReactMethod
  fun hideFloatingWindow(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val intent = Intent(ctx, OverlayService::class.java).apply {
        action = OverlayService.ACTION_HIDE
      }
      ContextCompat.startForegroundService(ctx, intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("E_OVERLAY", e.message, e)
    }
  }

  @ReactMethod
  fun minimizeFloatingWindow(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val intent = Intent(ctx, OverlayService::class.java).apply {
        action = OverlayService.ACTION_MINIMIZE
      }
      ContextCompat.startForegroundService(ctx, intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("E_OVERLAY", e.message, e)
    }
  }

  @ReactMethod
  fun restoreFloatingWindow(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val intent = Intent(ctx, OverlayService::class.java).apply {
        action = OverlayService.ACTION_RESTORE
      }
      ContextCompat.startForegroundService(ctx, intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("E_OVERLAY", e.message, e)
    }
  }
}
