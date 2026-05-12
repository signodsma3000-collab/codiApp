package com.signo38.codiApp

import android.content.Context
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

  @ReactMethod
  fun syncPullSnapshotJson(json: String?, promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val prefs = ctx.getSharedPreferences(OVERLAY_PREFS_NAME, Context.MODE_PRIVATE)
      val ed = prefs.edit()
      if (json.isNullOrBlank()) {
        ed.remove(PREF_PULL_SNAPSHOT_JSON)
      } else {
        ed.putString(PREF_PULL_SNAPSHOT_JSON, json)
      }
      ed.apply()
      val intent = Intent(OverlayService.ACTION_PULL_UPDATED).setPackage(ctx.packageName)
      ctx.sendBroadcast(intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.reject("E_PULL", e.message, e)
    }
  }

  private companion object {
    private const val OVERLAY_PREFS_NAME = "codi_overlay"
    private const val PREF_PULL_SNAPSHOT_JSON = "pull_snapshot_json"
  }
}
