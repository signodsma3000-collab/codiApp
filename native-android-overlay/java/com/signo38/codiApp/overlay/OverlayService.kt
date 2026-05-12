package com.signo38.codiApp.overlay

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.View.MeasureSpec
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.widget.NestedScrollView
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.common.BitMatrix
import com.signo38.codiApp.R
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

class OverlayService : Service() {

  companion object {
    const val ACTION_SHOW = "com.signo38.codiApp.overlay.ACTION_SHOW"
    const val ACTION_HIDE = "com.signo38.codiApp.overlay.ACTION_HIDE"
    const val ACTION_MINIMIZE = "com.signo38.codiApp.overlay.ACTION_MINIMIZE"
    const val ACTION_RESTORE = "com.signo38.codiApp.overlay.ACTION_RESTORE"
    /** Broadcast local (setPackage) tras actualizar JSON del pull en SharedPreferences. */
    const val ACTION_PULL_UPDATED = "com.signo38.codiApp.overlay.PULL_UPDATED"

    private const val NOTIFICATION_ID = 1001
    private const val CHANNEL_ID = "codi_overlay"

    private const val MIN_PANEL_SCALE = 0.22f
    private const val MAX_PANEL_SCALE = 5f
    /** Ancho base del panel en dp (escala 1). */
    private const val PANEL_BASE_WIDTH_DP = 300f

    private const val OVERLAY_PREFS_NAME = "codi_overlay"
    private const val PREF_SCANNER_PASSTHROUGH_TO_SAP = "scanner_passthrough_to_sap"
    private const val PREF_PULL_SNAPSHOT_JSON = "pull_snapshot_json"
  }

  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var params: WindowManager.LayoutParams? = null

  private var pinchHost: PinchHostFrameLayout? = null
  /** Panel interior (fondo, contenido). El tamaño es siempre real en px, sin scaleX/Y. */
  private var overlayRoot: LinearLayout? = null
  private var overlayTitle: TextView? = null
  private var overlayHeader: LinearLayout? = null
  private var overlayScroll: NestedScrollView? = null
  private var minimizeButton: ImageButton? = null
  private var closeButton: ImageButton? = null
  private var locationField: EditText? = null
  private var micButton: ImageButton? = null
  private var enterButton: Button? = null
  private var clearButton: Button? = null
  private var barcodeView: ImageView? = null
  private var generatedValueView: TextView? = null
  private var generatedLabelView: TextView? = null
  private var scannerPassthroughSwitch: Switch? = null

  private var pullSection: LinearLayout? = null
  private var pullContent: LinearLayout? = null
  private var pullUpdatedReceiverRegistered = false
  private val pullUpdatedReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val raw = locationField?.text?.toString() ?: ""
      updatePullContextForLocation(raw)
    }
  }

  /**
   * Si es true, la ventana overlay no recibe teclas del pistole/teclado físico (FLAG_NOT_FOCUSABLE);
   * el sistema las entrega a la ventana enfocada detrás (p. ej. SAP).
   */
  private var scannerPassthroughToSap = true

  private var keyboardLayoutListener: ViewTreeObserver.OnGlobalLayoutListener? = null

  /** Posición preferida por el usuario (arrastre); se reaplica al ocultar el teclado. */
  private var userX: Int = 40
  private var userY: Int = 140

  private var isMinimized: Boolean = false
  private var foregroundStarted: Boolean = false

  private var speechRecognizer: SpeechRecognizer? = null

  private var dragInitialX = 0
  private var dragInitialY = 0
  private var dragDownRawX = 0f
  private var dragDownRawY = 0f

  /** Factor de zoom uniforme (conserva proporción ancho/alto del contenido). */
  private var panelScale: Float = 1f

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_HIDE -> {
        ensureForegroundStarted()
        hideOverlay()
        stopForegroundIfNeeded()
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_MINIMIZE -> {
        ensureForegroundStarted()
        minimizeInternal()
        return START_STICKY
      }
      ACTION_RESTORE -> {
        ensureForegroundStarted()
        restoreInternal()
        return START_STICKY
      }
      ACTION_SHOW, null -> {
        if (!Settings.canDrawOverlays(this)) {
          stopSelf()
          return START_NOT_STICKY
        }
        ensureForegroundStarted()
        attachOverlayIfNeeded()
        return START_STICKY
      }
      else -> return START_STICKY
    }
  }

  override fun onDestroy() {
    stopForegroundIfNeeded()
    try {
      speechRecognizer?.destroy()
    } catch (_: Throwable) {
    }
    speechRecognizer = null
    hideOverlay()
    foregroundStarted = false
    super.onDestroy()
  }

  private fun ensureForegroundStarted() {
    if (foregroundStarted) return
    startAsForeground()
    foregroundStarted = true
  }

  private fun stopForegroundIfNeeded() {
    if (!foregroundStarted) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(Service.STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    foregroundStarted = false
  }

  private fun startAsForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "CODI Overlay", NotificationManager.IMPORTANCE_LOW)
      nm.createNotificationChannel(channel)
    }

    val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("CODI APP")
      .setContentText("Ventana flotante activa")
      .setSmallIcon(android.R.drawable.ic_menu_view)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()

    startForeground(NOTIFICATION_ID, notif)
  }

  private fun baseOverlayLayoutFlags(): Int {
    return WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
  }

  private fun overlayFlagsForPassthroughState(): Int {
    return baseOverlayLayoutFlags() or
      if (scannerPassthroughToSap) WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE else 0
  }

  private fun applyScannerPassthroughWindowFlags() {
    val p = params ?: return
    p.flags = overlayFlagsForPassthroughState()
    val host = pinchHost ?: return
    val wm = windowManager ?: return
    if (scannerPassthroughToSap) {
      locationField?.clearFocus()
      val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
      val token = overlayView?.windowToken
      if (imm != null && token != null) {
        imm.hideSoftInputFromWindow(token, 0)
      }
    }
    try {
      wm.updateViewLayout(host, p)
    } catch (_: Throwable) {
    }
  }

  private fun overlayPrefs(): SharedPreferences {
    return getSharedPreferences(OVERLAY_PREFS_NAME, Context.MODE_PRIVATE)
  }

  private fun readScannerPassthroughPref(): Boolean {
    return overlayPrefs().getBoolean(PREF_SCANNER_PASSTHROUGH_TO_SAP, true)
  }

  private fun persistScannerPassthroughPref(value: Boolean) {
    overlayPrefs().edit().putBoolean(PREF_SCANNER_PASSTHROUGH_TO_SAP, value).apply()
  }

  private fun readPullSnapshotJson(): String? {
    return overlayPrefs().getString(PREF_PULL_SNAPSHOT_JSON, null)?.takeIf { it.isNotBlank() }
  }

  private fun registerPullUpdatedReceiver() {
    if (pullUpdatedReceiverRegistered) return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(pullUpdatedReceiver, IntentFilter(ACTION_PULL_UPDATED), Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        registerReceiver(pullUpdatedReceiver, IntentFilter(ACTION_PULL_UPDATED))
      }
      pullUpdatedReceiverRegistered = true
    } catch (_: Throwable) {
    }
  }

  private fun unregisterPullUpdatedReceiver() {
    if (!pullUpdatedReceiverRegistered) return
    try {
      unregisterReceiver(pullUpdatedReceiver)
    } catch (_: Throwable) {
    }
    pullUpdatedReceiverRegistered = false
  }

  private fun hidePullContextSection() {
    pullSection?.visibility = View.GONE
    pullContent?.removeAllViews()
  }

  private fun normalizeVoiceToLocationPull(transcript: String): String {
    var t = transcript.trim().lowercase(Locale.ROOT)
    t = t.replace(Regex("\\b(guión|guion)\\b", RegexOption.IGNORE_CASE), "-")
    t = t.replace(Regex("\\braya\\b", RegexOption.IGNORE_CASE), "-")
    t = t.replace(Regex("\\s+"), "")
    t = t.replace(Regex("-+"), "-")
    return t.uppercase(Locale.ROOT)
  }

  private fun locationMatchKeyPull(raw: String): String {
    val t = raw.trim().uppercase(Locale.ROOT)
    if (t.isEmpty()) return ""
    return normalizeVoiceToLocationPull(t).replace("-", "")
  }

  private fun scanToLocationKeyPull(input: String): String {
    var s = input.trim()
    if (s.isEmpty()) return ""
    val upper = s.uppercase(Locale.ROOT)
    val prefix = "MX1 002 "
    if (upper.startsWith(prefix)) {
      s = s.substring(prefix.length).trim()
    } else {
      val re = Regex("^MX1\\s+002\\s+", RegexOption.IGNORE_CASE)
      if (re.containsMatchIn(s)) {
        s = s.replaceFirst(re, "").trim()
      }
    }
    return locationMatchKeyPull(s)
  }

  private fun addPullLabel(parent: LinearLayout, text: String, textSizeSp: Float, color: Int) {
    val tv = TextView(this)
    tv.text = text
    tv.setTextColor(color)
    tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp)
    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    lp.bottomMargin = dp(4)
    tv.layoutParams = lp
    parent.addView(tv)
  }

  private fun pullBarcodeTargetWidth(): Int {
    val rw = overlayRoot?.width ?: 0
    return if (rw > 0) max(120, rw - dp(24)) else max(120, dp(260))
  }

  private fun addPullBarcode(parent: LinearLayout, value: String) {
    val v = value.trim()
    if (v.isEmpty()) return
    try {
      val w = pullBarcodeTargetWidth()
      val h = max(36, (90f * panelScale).toInt().coerceAtMost(200))
      val bmp = generateCode128(v, w, h)
      val iv = ImageView(this)
      iv.setImageBitmap(bmp)
      iv.adjustViewBounds = true
      iv.scaleType = ImageView.ScaleType.FIT_CENTER
      val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
      lp.bottomMargin = dp(8)
      iv.layoutParams = lp
      parent.addView(iv)
      val mono = TextView(this)
      mono.text = v
      mono.setTextColor(Color.parseColor("#c8c8d0"))
      mono.textSize = 10f
      mono.gravity = Gravity.CENTER_HORIZONTAL
      val lp2 = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
      lp2.bottomMargin = dp(10)
      mono.layoutParams = lp2
      parent.addView(mono)
    } catch (_: Throwable) {
    }
  }

  private fun updatePullContextForLocation(warehouseRaw: String) {
    val section = pullSection ?: return
    val content = pullContent ?: return
    val trimmed = warehouseRaw.trim()
    if (trimmed.isEmpty()) {
      hidePullContextSection()
      return
    }
    val jsonStr = readPullSnapshotJson()
    if (jsonStr.isNullOrBlank()) {
      hidePullContextSection()
      return
    }
    try {
      val root = JSONObject(jsonStr)
      if (root.optInt("version") != 1) {
        hidePullContextSection()
        return
      }
      val locs = root.optJSONArray("locations") ?: run {
        hidePullContextSection()
        return
      }
      val matchKey = scanToLocationKeyPull(trimmed)
      if (matchKey.isEmpty()) {
        hidePullContextSection()
        return
      }
      var matched: JSONObject? = null
      for (i in 0 until locs.length()) {
        val obj = locs.optJSONObject(i) ?: continue
        if (obj.optString("matchKey", "") == matchKey) {
          matched = obj
          break
        }
      }
      section.visibility = View.VISIBLE
      content.removeAllViews()
      if (matched == null) {
        addPullLabel(content, "Sin coincidencias en pull para esta ubicación.", 12f, Color.parseColor("#c9a227"))
        overlayView?.post { syncPanelLayoutAndWindow() }
        return
      }
      val display = matched.optString("locationDisplay", trimmed).ifBlank { trimmed }
      addPullLabel(content, "Ubicación: $display", 13f, Color.WHITE)
      addPullLabel(content, "Código (ubicación)", 10f, Color.parseColor("#9a9aa3"))
      val locBarcode = generatedValueView?.text?.toString()?.trim()?.takeIf { it.isNotEmpty() } ?: "MX1 002 $trimmed"
      addPullBarcode(content, locBarcode)

      val dns = matched.optJSONArray("dns") ?: JSONArray()
      for (j in 0 until dns.length()) {
        val dnObj = dns.optJSONObject(j) ?: continue
        val dnDisplay = dnObj.optString("dnDisplay", "").trim()
        addPullLabel(
          content,
          "DN: " + if (dnDisplay.isEmpty()) "—" else dnDisplay,
          12f,
          Color.parseColor("#64d2ff"),
        )
        if (dnDisplay.isNotEmpty()) {
          addPullLabel(content, "Código (DN)", 10f, Color.parseColor("#9a9aa3"))
          addPullBarcode(content, "MX1 002 $dnDisplay")
        }
        val lines = dnObj.optJSONArray("lines") ?: JSONArray()
        for (k in 0 until lines.length()) {
          val line = lines.optJSONObject(k) ?: continue
          val item = line.optString("item", "").trim()
          val box = line.optString("box", "").trim()
          addPullLabel(content, "Item: " + if (item.isEmpty()) "—" else item, 11f, Color.parseColor("#e4e4ea"))
          addPullLabel(content, "Box: " + if (box.isEmpty()) "—" else box, 11f, Color.parseColor("#e4e4ea"))
        }
      }
    } catch (_: Throwable) {
      hidePullContextSection()
      return
    }
    overlayView?.post { syncPanelLayoutAndWindow() }
  }

  private fun dp(value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      resources.displayMetrics,
    ).toInt()
  }

  /** Convierte dp de diseño base a px reales en pantalla, escalados por [panelScale]. */
  private fun scaledDp(dpValue: Float): Int {
    return (dpValue * resources.displayMetrics.density * panelScale).toInt().coerceAtLeast(0)
  }

  /** Tamaño de texto en px (no sp de accesibilidad) coherente con el zoom del panel. */
  private fun scaledSpToPx(spValue: Float): Float {
    val atOne = TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_SP,
      spValue,
      resources.displayMetrics,
    )
    return atOne * panelScale
  }

  private fun rawHitsView(target: View?, ev: MotionEvent): Boolean {
    target ?: return false
    if (target.visibility != View.VISIBLE) return false
    val loc = IntArray(2)
    target.getLocationOnScreen(loc)
    val x = ev.rawX
    val y = ev.rawY
    return x >= loc[0] && x < loc[0] + target.width && y >= loc[1] && y < loc[1] + target.height
  }

  private fun rawHitsInteractive(ev: MotionEvent): Boolean {
    return rawHitsView(locationField, ev) ||
      rawHitsView(micButton, ev) ||
      rawHitsView(enterButton, ev) ||
      rawHitsView(clearButton, ev) ||
      rawHitsView(minimizeButton, ev) ||
      rawHitsView(closeButton, ev) ||
      rawHitsView(scannerPassthroughSwitch, ev)
  }

  private fun setTopMargin(v: View?, topDp: Float) {
    v ?: return
    val lp = v.layoutParams as? ViewGroup.MarginLayoutParams ?: return
    lp.topMargin = scaledDp(topDp)
    v.layoutParams = lp
  }

  /**
   * Aplica medidas reales a todo el panel y ajusta [WindowManager.LayoutParams] al resultado medido.
   * Mantiene la misma escala en ancho y alto (misma relación de aspecto del contenido).
   */
  private fun syncPanelLayoutAndWindow(depth: Int = 0) {
    val root = overlayRoot ?: return
    val host = pinchHost ?: return
    val p = params ?: return
    val wm = windowManager ?: return

    val panelW = scaledDp(PANEL_BASE_WIDTH_DP).coerceAtLeast(1)
    val pad = scaledDp(10f)
    root.setPadding(pad, pad, pad, pad)
    val rootLp = FrameLayout.LayoutParams(panelW, ViewGroup.LayoutParams.WRAP_CONTENT)
    root.layoutParams = rootLp

    overlayHeader?.setPadding(0, 0, 0, scaledDp(8f))
    overlayTitle?.setTextSize(TypedValue.COMPLEX_UNIT_PX, scaledSpToPx(14f))

    minimizeButton?.let { b ->
      val lp = b.layoutParams as LinearLayout.LayoutParams
      lp.width = scaledDp(36f)
      lp.height = scaledDp(36f)
      lp.marginEnd = scaledDp(4f)
      b.layoutParams = lp
      val p4 = scaledDp(4f)
      b.setPadding(p4, p4, p4, p4)
    }
    closeButton?.let { b ->
      val lp = b.layoutParams as LinearLayout.LayoutParams
      lp.width = scaledDp(36f)
      lp.height = scaledDp(36f)
      b.layoutParams = lp
      val p4 = scaledDp(4f)
      b.setPadding(p4, p4, p4, p4)
    }

    overlayScroll?.let { scroll ->
      val lp = scroll.layoutParams as LinearLayout.LayoutParams
      lp.width = LinearLayout.LayoutParams.MATCH_PARENT
      lp.height = LinearLayout.LayoutParams.WRAP_CONTENT
      scroll.layoutParams = lp
    }

    locationField?.let { et ->
      val lp = et.layoutParams as LinearLayout.LayoutParams
      lp.height = scaledDp(48f)
      et.layoutParams = lp
      val px = scaledDp(14f)
      et.setPadding(px, 0, px, 0)
      et.setTextSize(TypedValue.COMPLEX_UNIT_PX, scaledSpToPx(16f))
    }

    micButton?.let { b ->
      val lp = b.layoutParams as LinearLayout.LayoutParams
      lp.width = scaledDp(48f)
      lp.height = scaledDp(48f)
      lp.marginStart = scaledDp(10f)
      b.layoutParams = lp
    }

    enterButton?.let { btn ->
      val lp = btn.layoutParams as LinearLayout.LayoutParams
      lp.width = 0
      lp.weight = 1f
      lp.height = scaledDp(44f).coerceAtLeast(scaledDp(36f))
      lp.marginStart = 0
      lp.marginEnd = scaledDp(8f)
      btn.layoutParams = lp
      btn.setMinimumHeight(0)
      btn.setMinimumWidth(0)
      btn.setTextSize(TypedValue.COMPLEX_UNIT_PX, scaledSpToPx(13f))
      val px = scaledDp(10f)
      btn.setPadding(px, scaledDp(8f), px, scaledDp(8f))
    }
    clearButton?.let { btn ->
      val lp = btn.layoutParams as LinearLayout.LayoutParams
      lp.width = 0
      lp.weight = 1f
      lp.height = scaledDp(44f).coerceAtLeast(scaledDp(36f))
      lp.marginStart = 0
      lp.marginEnd = 0
      btn.layoutParams = lp
      btn.setMinimumHeight(0)
      btn.setMinimumWidth(0)
      btn.setTextSize(TypedValue.COMPLEX_UNIT_PX, scaledSpToPx(13f))
      val px = scaledDp(10f)
      btn.setPadding(px, scaledDp(8f), px, scaledDp(8f))
    }

    generatedLabelView?.let { tv ->
      tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, scaledSpToPx(12f))
      setTopMargin(tv, 14f)
    }
    barcodeView?.let { iv ->
      val lp = iv.layoutParams as LinearLayout.LayoutParams
      lp.width = LinearLayout.LayoutParams.MATCH_PARENT
      lp.height = scaledDp(80f)
      iv.layoutParams = lp
      setTopMargin(iv, 8f)
    }
    generatedValueView?.let { tv ->
      tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, scaledSpToPx(12f))
      setTopMargin(tv, 6f)
    }

    root.requestLayout()
    host.requestLayout()

    host.post {
      val wSpec = MeasureSpec.makeMeasureSpec(panelW, MeasureSpec.EXACTLY)
      val hSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)
      root.measure(wSpec, hSpec)
      var mw = root.measuredWidth.coerceAtLeast(1)
      var mh = root.measuredHeight.coerceAtLeast(1)
      val dm = resources.displayMetrics
      val maxW = dm.widthPixels - dp(8)
      val maxH = dm.heightPixels - dp(16)
      if (mw > maxW || mh > maxH) {
        val fit = min(maxW.toFloat() / mw, maxH.toFloat() / mh)
        if (fit < 1f && depth < 6) {
          panelScale *= fit
          panelScale = panelScale.coerceIn(MIN_PANEL_SCALE, MAX_PANEL_SCALE)
          syncPanelLayoutAndWindow(depth + 1)
          return@post
        }
      }
      val fw = mw.coerceIn(1, maxOf(1, maxW))
      val fh = mh.coerceIn(1, maxOf(1, maxH))
      if (p.width != fw || p.height != fh) {
        p.width = fw
        p.height = fh
        try {
          wm.updateViewLayout(host, p)
        } catch (_: Throwable) {
        }
      }
      clampWindowOnScreen()
      refreshBarcodeForCurrentScale()
    }
  }

  private fun clampWindowOnScreen() {
    val host = pinchHost ?: return
    val p = params ?: return
    val wm = windowManager ?: return
    val dm = resources.displayMetrics
    val maxX = max(0, dm.widthPixels - p.width)
    val maxY = max(0, dm.heightPixels - p.height)
    val nx = p.x.coerceIn(0, maxX)
    val ny = p.y.coerceIn(0, maxY)
    if (nx != p.x || ny != p.y) {
      p.x = nx
      p.y = ny
      userX = nx
      userY = ny
      try {
        wm.updateViewLayout(host, p)
      } catch (_: Throwable) {
      }
    } else {
      userX = p.x
      userY = p.y
    }
  }

  private fun refreshBarcodeForCurrentScale() {
    if (generatedLabelView?.visibility != View.VISIBLE) return
    val text = generatedValueView?.text?.toString().orEmpty()
    if (text.isEmpty()) return
    val bw = max(120, (900f * panelScale).toInt().coerceAtMost(2400))
    val bh = max(48, (220f * panelScale).toInt().coerceAtMost(900))
    try {
      barcodeView?.setImageBitmap(generateCode128(text, bw, bh))
    } catch (_: Throwable) {
    }
  }

  private fun dragGlowDrawable(strokeAlpha: Int): GradientDrawable {
    val d = GradientDrawable()
    d.shape = GradientDrawable.RECTANGLE
    val r = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 14f, resources.displayMetrics)
    d.cornerRadius = r
    val sw = max(1, (1.5f * resources.displayMetrics.density).toInt())
    d.setStroke(sw, Color.argb(strokeAlpha.coerceIn(0, 255), 120, 195, 255))
    return d
  }

  private var cachedDragGlowSoft: GradientDrawable? = null
  private var cachedDragGlowStrong: GradientDrawable? = null

  private fun applyDragVisualState(readyToMove: Boolean, isMoving: Boolean) {
    val root = overlayRoot ?: return
    when {
      isMoving -> {
        if (cachedDragGlowStrong == null) {
          cachedDragGlowStrong = dragGlowDrawable(210)
        }
        root.foreground = cachedDragGlowStrong
        root.elevation = 22f
      }
      readyToMove -> {
        if (cachedDragGlowSoft == null) {
          cachedDragGlowSoft = dragGlowDrawable(105)
        }
        root.foreground = cachedDragGlowSoft
        root.elevation = 17f
      }
      else -> {
        root.foreground = null
        root.elevation = 12f
      }
    }
  }

  private fun attachOverlayIfNeeded() {
    if (overlayView != null) return
    if (!Settings.canDrawOverlays(this)) return

    scannerPassthroughToSap = readScannerPassthroughPref()

    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

    val inflater = getSystemService(LAYOUT_INFLATER_SERVICE) as LayoutInflater
    val view = inflater.inflate(R.layout.overlay_panel, null)

    val host = view.findViewById<PinchHostFrameLayout>(R.id.overlay_pinch_host)
    pinchHost = host
    val root = view.findViewById<LinearLayout>(R.id.overlay_root)
    overlayRoot = root
    overlayTitle = view.findViewById(R.id.overlay_title)
    overlayHeader = view.findViewById(R.id.overlay_header)
    overlayScroll = view.findViewById(R.id.overlay_scroll)
    minimizeButton = view.findViewById(R.id.overlay_minimize)
    closeButton = view.findViewById(R.id.overlay_close)
    locationField = view.findViewById(R.id.overlay_location)
    micButton = view.findViewById(R.id.overlay_mic)
    enterButton = view.findViewById(R.id.overlay_enter)
    clearButton = view.findViewById(R.id.overlay_clear)
    barcodeView = view.findViewById(R.id.overlay_barcode)
    generatedValueView = view.findViewById(R.id.overlay_generated_value)
    generatedLabelView = view.findViewById(R.id.overlay_generated_label)
    scannerPassthroughSwitch = view.findViewById(R.id.overlay_scanner_passthrough)
    pullSection = view.findViewById(R.id.overlay_pull_section)
    pullContent = view.findViewById(R.id.overlay_pull_content)
    scannerPassthroughSwitch?.setOnCheckedChangeListener(null)
    scannerPassthroughSwitch?.isChecked = scannerPassthroughToSap
    scannerPassthroughSwitch?.setOnCheckedChangeListener { _, checked ->
      scannerPassthroughToSap = checked
      persistScannerPassthroughPref(checked)
      applyScannerPassthroughWindowFlags()
    }

    root.clipToOutline = true
    root.elevation = 12f

    fun generateFromLocation(raw: String) {
      val trimmed = raw.trim()
      if (trimmed.isEmpty()) {
        this@OverlayService.hidePullContextSection()
        return
      }
      val finalText = "MX1 002 $trimmed"
      generatedLabelView?.visibility = View.VISIBLE
      generatedValueView?.text = finalText
      val bw = max(120, (900f * panelScale).toInt().coerceAtMost(2400))
      val bh = max(48, (220f * panelScale).toInt().coerceAtMost(900))
      val bmp = generateCode128(finalText, bw, bh)
      barcodeView?.setImageBitmap(bmp)
      this@OverlayService.updatePullContextForLocation(trimmed)
    }

    host.isInteractiveDragTarget = { ev -> rawHitsInteractive(ev) }
    host.isScrollArea = { ev -> rawHitsView(overlayScroll, ev) }
    host.onWindowDragBegin = fun(ev: MotionEvent) {
      val par = params ?: return
      dragInitialX = par.x
      dragInitialY = par.y
      dragDownRawX = ev.rawX
      dragDownRawY = ev.rawY
    }
    host.onWindowDrag = fun(ev: MotionEvent): Boolean {
      val par = params ?: return false
      val wm = windowManager ?: return false
      val h = pinchHost ?: return false
      when (ev.actionMasked) {
        MotionEvent.ACTION_MOVE -> {
          par.x = dragInitialX + (ev.rawX - dragDownRawX).toInt()
          par.y = dragInitialY + (ev.rawY - dragDownRawY).toInt()
          userX = par.x
          userY = par.y
          try {
            wm.updateViewLayout(h, par)
          } catch (_: Throwable) {
          }
          clampWindowOnScreen()
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          userX = par.x
          userY = par.y
          clampWindowOnScreen()
        }
      }
      return true
    }

    host.onDragVisualState = { ready, moving ->
      applyDragVisualState(ready, moving)
    }

    closeButton?.setOnClickListener {
      hideOverlay()
      stopForegroundIfNeeded()
      stopSelf()
    }

    minimizeButton?.setOnClickListener {
      if (isMinimized) {
        restoreInternal()
      } else {
        minimizeInternal()
      }
    }

    enterButton?.setOnClickListener {
      generateFromLocation(locationField?.text?.toString() ?: "")
    }
    clearButton?.setOnClickListener {
      locationField?.setText("")
      generatedValueView?.text = ""
      barcodeView?.setImageBitmap(null)
      generatedLabelView?.visibility = View.INVISIBLE
      hidePullContextSection()
    }

    host.onPinchScale = { factor ->
      panelScale = (panelScale * factor).coerceIn(MIN_PANEL_SCALE, MAX_PANEL_SCALE)
      syncPanelLayoutAndWindow()
    }

    locationField?.setOnEditorActionListener { v, _, _ ->
      generateFromLocation((v as EditText).text?.toString() ?: "")
      true
    }

    locationField?.setOnFocusChangeListener { _, hasFocus ->
      if (hasFocus) {
        overlayScroll?.postDelayed({
          scrollFocusedInputIntoView()
          applyKeyboardAndScroll()
        }, 60)
      }
    }

    micButton?.setOnClickListener {
      startListening { transcript ->
        val normalized = normalizeSpeech(transcript)
        if (normalized.isNotEmpty()) {
          locationField?.setText(normalized)
          locationField?.setSelection(normalized.length)
          generateFromLocation(normalized)
        }
      }
    }

    generatedLabelView?.visibility = View.INVISIBLE
    generatedValueView?.text = ""
    barcodeView?.setImageBitmap(null)

    val layoutType =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }

    params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      layoutType,
      overlayFlagsForPassthroughState(),
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = userX
      y = userY
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
        WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED
    }

    windowManager?.addView(view, params)
    overlayView = view

    keyboardLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
      applyKeyboardAndScroll()
    }
    view.viewTreeObserver.addOnGlobalLayoutListener(keyboardLayoutListener)

    view.post {
      syncPanelLayoutAndWindow()
      applyKeyboardAndScroll()
    }
    registerPullUpdatedReceiver()
  }

  private fun scrollFocusedInputIntoView() {
    val scroll = overlayScroll ?: return
    val et = locationField ?: return
    scroll.post {
      val scrollLoc = IntArray(2)
      scroll.getLocationOnScreen(scrollLoc)
      val etLoc = IntArray(2)
      et.getLocationOnScreen(etLoc)
      val relativeTop = etLoc[1] - scrollLoc[1]
      scroll.smoothScrollTo(0, max(0, relativeTop - dp(12)))
    }
  }

  /**
   * Ajusta la ventana frente al IME usando el rectángulo visible ([View.getWindowVisibleDisplayFrame])
   * y limita la altura del scroll para que el contenido sea desplazable sin tapar el EditText.
   */
  private fun applyKeyboardAndScroll() {
    val root = overlayView ?: return
    val p = params ?: return
    val wm = windowManager ?: return

    val visible = Rect()
    root.getWindowVisibleDisplayFrame(visible)

    val dm = resources.displayMetrics
    val imeInset = dm.heightPixels - visible.bottom
    val keyboardOpen = imeInset > dp(80)

    val rootLoc = IntArray(2)
    root.getLocationOnScreen(rootLoc)

    val overlayH = root.height
    val overlayW = root.width
    if (overlayH <= 0 || overlayW <= 0) return

    if (keyboardOpen) {
      val margin = dp(10)
      val maxY = visible.bottom - overlayH - margin
      p.y = min(userY, maxOf(0, maxY))
      val maxX = dm.widthPixels - overlayW - dp(8)
      p.x = userX.coerceIn(0, max(0, maxX))
    } else {
      p.x = userX
      p.y = userY
    }

    try {
      wm.updateViewLayout(root, p)
    } catch (_: Throwable) {
    }

    val scroll = overlayScroll ?: return
    val header = overlayHeader ?: return

    header.post {
      val headerH = header.height
      val stripH = dp(8)
      val inner = scroll.getChildAt(0)
      if (inner != null) {
        inner.measure(
          View.MeasureSpec.makeMeasureSpec(scroll.width, View.MeasureSpec.EXACTLY),
          View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        val contentNeed = inner.measuredHeight

        val availBottom = visible.bottom
        val availForBody = availBottom - rootLoc[1] - stripH - dp(12)
        val maxScroll = max(dp(120), availForBody - headerH)
        val targetH = min(contentNeed + dp(8), maxScroll)

        val lp = scroll.layoutParams as LinearLayout.LayoutParams
        if (keyboardOpen && targetH > 0 && lp.height != targetH) {
          lp.height = targetH
          scroll.layoutParams = lp
        } else if (!keyboardOpen && lp.height != LinearLayout.LayoutParams.WRAP_CONTENT) {
          lp.height = LinearLayout.LayoutParams.WRAP_CONTENT
          scroll.layoutParams = lp
        }

        if (locationField?.hasFocus() == true) {
          scrollFocusedInputIntoView()
        }
      }
    }
  }

  private fun ensureRecordAudioPermission(): Boolean {
    val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    if (granted) {
      return true
    }
    Toast.makeText(this, "Activa el permiso Micrófono para CODI APP en Ajustes.", Toast.LENGTH_LONG).show()
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
      data = Uri.fromParts("package", packageName, null)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Throwable) {
    }
    return false
  }

  private fun minimizeInternal() {
    if (overlayScroll == null) return
    isMinimized = true
    overlayScroll?.visibility = View.GONE
    minimizeButton?.setImageResource(android.R.drawable.arrow_up_float)
    minimizeButton?.contentDescription = "Restaurar"
    overlayView?.post { syncPanelLayoutAndWindow() }
  }

  private fun restoreInternal() {
    if (overlayScroll == null) return
    isMinimized = false
    overlayScroll?.visibility = View.VISIBLE
    minimizeButton?.setImageResource(android.R.drawable.arrow_down_float)
    minimizeButton?.contentDescription = "Minimizar"
    overlayView?.post {
      syncPanelLayoutAndWindow()
      applyKeyboardAndScroll()
    }
  }

  private fun hideOverlay() {
    unregisterPullUpdatedReceiver()
    hidePullContextSection()

    keyboardLayoutListener?.let { listener ->
      try {
        overlayView?.viewTreeObserver?.removeOnGlobalLayoutListener(listener)
      } catch (_: Throwable) {
      }
    }
    keyboardLayoutListener = null

    overlayRoot?.foreground = null
    overlayRoot?.elevation = 12f

    pinchHost?.onPinchScale = null
    pinchHost?.onWindowDragBegin = null
    pinchHost?.onWindowDrag = null
    pinchHost?.onDragVisualState = null
    pinchHost?.isInteractiveDragTarget = null
    pinchHost?.isScrollArea = null
    pinchHost = null

    val wm = windowManager
    val v = overlayView
    if (wm != null && v != null) {
      try {
        wm.removeView(v)
      } catch (_: Throwable) {
      }
    }
    overlayView = null
    windowManager = null
    params = null
    overlayHeader = null
    overlayScroll = null
    overlayRoot = null
    overlayTitle = null
    minimizeButton = null
    closeButton = null
    locationField = null
    micButton = null
    enterButton = null
    clearButton = null
    barcodeView = null
    generatedValueView = null
    generatedLabelView = null
    scannerPassthroughSwitch = null
    pullSection = null
    pullContent = null
    isMinimized = false
  }

  private fun startListening(onResult: (String) -> Unit) {
    if (!ensureRecordAudioPermission()) {
      return
    }
    if (!SpeechRecognizer.isRecognitionAvailable(this)) {
      Toast.makeText(this, "El reconocimiento de voz no está disponible en este dispositivo.", Toast.LENGTH_LONG).show()
      return
    }

    val sr = speechRecognizer ?: SpeechRecognizer.createSpeechRecognizer(this).also {
      speechRecognizer = it
    }

    sr.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: android.os.Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onError(error: Int) {
        val msg = when (error) {
          SpeechRecognizer.ERROR_AUDIO -> "No se pudo usar el micrófono (audio)."
          SpeechRecognizer.ERROR_CLIENT -> "Dictado ocupado. Vuelve a intentar."
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Sin permiso de micrófono."
          SpeechRecognizer.ERROR_NETWORK -> "Error de red en el reconocimiento."
          SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Red demasiado lenta."
          SpeechRecognizer.ERROR_NO_MATCH -> "No se entendió. Habla más cerca y claro."
          SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "El reconocedor está ocupado."
          SpeechRecognizer.ERROR_SERVER -> "Error del servicio de reconocimiento."
          SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No se detectó voz a tiempo."
          else -> "Error de voz ($error)."
        }
        Toast.makeText(this@OverlayService, msg, Toast.LENGTH_LONG).show()
      }
      override fun onResults(results: android.os.Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val best = matches?.firstOrNull() ?: ""
        onResult(best)
      }
      override fun onPartialResults(partialResults: android.os.Bundle?) {}
      override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
    })

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale("es", "MX"))
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      putExtra(RecognizerIntent.EXTRA_PROMPT, "Ubicación")
    }

    sr.startListening(intent)
  }

  private fun normalizeSpeech(transcript: String): String {
    var t = transcript.trim().lowercase(Locale.getDefault())
    t = t.replace(Regex("\\b(guión|guion)\\b", RegexOption.IGNORE_CASE), "-")
    t = t.replace(Regex("\\braya\\b", RegexOption.IGNORE_CASE), "-")
    t = t.replace(Regex("\\s+"), "")
    t = t.replace(Regex("-+"), "-")
    return t.uppercase(Locale.getDefault())
  }

  private fun generateCode128(value: String, codeWidth: Int, codeHeight: Int): Bitmap {
    val hints = mutableMapOf<EncodeHintType, Any>(EncodeHintType.MARGIN to 2)
    val matrix: BitMatrix =
      MultiFormatWriter().encode(value, BarcodeFormat.CODE_128, codeWidth, codeHeight, hints)
    val bitW = matrix.getWidth()
    val bitH = matrix.getHeight()
    val bmp = Bitmap.createBitmap(bitW, bitH, Bitmap.Config.ARGB_8888)
    for (x in 0 until bitW) {
      for (y in 0 until bitH) {
        bmp.setPixel(x, y, if (matrix.get(x, y)) Color.BLACK else Color.WHITE)
      }
    }
    return bmp
  }
}
