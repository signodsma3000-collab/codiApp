package com.signo38.codiApp.overlay

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.ViewConfiguration
import android.widget.FrameLayout
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Pellizco = dos dedos (escala). Un dedo con arrastre = mover ventana (callback),
 * sin pelear con teclado/mic/botones gracias a pruebas de hit y slop.
 */
class PinchHostFrameLayout @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

  var onPinchScale: ((Float) -> Unit)? = null

  /** Si el dedo está sobre input/mic/botones de cabecera → no iniciar arrastre de ventana. */
  var isInteractiveDragTarget: ((MotionEvent) -> Boolean)? = null

  /** Si el DOWN fue dentro del scroll de contenido → priorizar scroll vertical frente a mover ventana. */
  var isScrollArea: ((MotionEvent) -> Boolean)? = null

  /** Se llama una vez al empezar el arrastre (primer MOVE que supera el slop), para anclar la ventana. */
  var onWindowDragBegin: ((MotionEvent) -> Unit)? = null

  /** Entrega los eventos del gesto de arrastre de ventana (DOWN/MOVE/UP) ya interceptados. */
  var onWindowDrag: ((MotionEvent) -> Boolean)? = null

  /**
   * Iluminación del borde: readyToMove = ya pasó el slop y puede moverse;
   * isMoving = ventana desplazándose (primer frame tras interceptar).
   */
  var onDragVisualState: ((readyToMove: Boolean, isMoving: Boolean) -> Unit)? = null

  private val scaleGestureDetector = ScaleGestureDetector(
    context,
    object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScale(detector: ScaleGestureDetector): Boolean {
        onPinchScale?.invoke(detector.scaleFactor)
        return true
      }
    },
  )

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var downRawX = 0f
  private var downRawY = 0f
  private var trackingPossibleDrag = false
  private var startedInScrollArea = false
  private var draggingWindow = false
  private var notifiedReadySlop = false

  init {
    clipChildren = false
    clipToPadding = false
  }

  private fun clearDragVisual() {
    notifiedReadySlop = false
    onDragVisualState?.invoke(false, false)
  }

  override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    if (ev.pointerCount > 1) {
      draggingWindow = false
      trackingPossibleDrag = false
      clearDragVisual()
      return true
    }

    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        trackingPossibleDrag = isInteractiveDragTarget?.invoke(ev) != true
        startedInScrollArea = isScrollArea?.invoke(ev) == true
        downRawX = ev.rawX
        downRawY = ev.rawY
        draggingWindow = false
        notifiedReadySlop = false
        onDragVisualState?.invoke(false, false)
        return false
      }
      MotionEvent.ACTION_MOVE -> {
        if (!trackingPossibleDrag) return false
        val dx = ev.rawX - downRawX
        val dy = ev.rawY - downRawY
        if (hypot(dx.toDouble(), dy.toDouble()) < touchSlop) {
          return false
        }
        if (startedInScrollArea && abs(dy) >= abs(dx)) {
          trackingPossibleDrag = false
          clearDragVisual()
          return false
        }
        if (!notifiedReadySlop) {
          notifiedReadySlop = true
          onDragVisualState?.invoke(true, false)
        }
        if (!draggingWindow) {
          draggingWindow = true
          onWindowDragBegin?.invoke(ev)
          onDragVisualState?.invoke(true, true)
        }
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (!draggingWindow) {
          trackingPossibleDrag = false
        }
        if (!draggingWindow) {
          clearDragVisual()
        }
        return false
      }
    }
    return false
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.pointerCount > 1) {
      scaleGestureDetector.onTouchEvent(event)
      return true
    }

    if (draggingWindow) {
      onWindowDrag?.invoke(event)
      if (event.actionMasked == MotionEvent.ACTION_MOVE) {
        onDragVisualState?.invoke(true, true)
      }
      if (event.actionMasked == MotionEvent.ACTION_UP ||
        event.actionMasked == MotionEvent.ACTION_CANCEL
      ) {
        draggingWindow = false
        trackingPossibleDrag = false
        clearDragVisual()
      }
      return true
    }

    scaleGestureDetector.onTouchEvent(event)
    return super.onTouchEvent(event)
  }
}
