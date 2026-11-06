package io.github.salmangox.monthcalendar

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.graphics.Typeface
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.GLUtils
import android.util.Base64
import android.util.Size
import android.view.HapticFeedbackConstants
import android.view.Surface
import androidx.activity.ComponentActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas as UiCanvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.Executors
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// ============================================================================
// 纪念相机（安卓原生，用户定的：能做原生就做原生；和 iPhone 的 NativeCam.swift 同一套界面和方案）
// 网页点「纪念相机」→ MCNative.openCam(json) → 这里全屏打开。界面只有：左上返回 · 右下翻转镜头上面是「调整」· 左下相册小图 · 快门 · 倍率。
// 取景：CameraX 把画面送进 OpenGL，用和网页 days.js 的 CAM_FS **同一个滤镜着色器**（按肤色保边磨皮、美白、红润、色温、反差、饱和、
// 黑位上浮、分离色调、光晕、暗角、颗粒），三端出来的颜色一样。拍照：按原始分辨率在离屏 OpenGL 里再算一遍，放上卡片，
// 和没放卡片的底图一起交给网页存进这个日子的相册（Days.addShot），画面缩成小图飞进左下角，马上能接着拍。
// 横着拿（重力感应，绕过旋转锁定）所有按钮和卡片转正，拍出横的照片。
// ============================================================================

class CamLook(val id: String, val name: String, val style: String, val font: String, val f: Map<String, Float>)

/** 滤镜着色器：和网页 CAM_FS 一样，只是取样换成相机的外部纹理（预览）或普通纹理（拍照） */
private fun camFS(external: Boolean) = (if (external) "#extension GL_OES_EGL_image_external : require\n" else "") + """
precision highp float;varying vec2 uv;uniform ${if (external) "samplerExternalOES" else "sampler2D"} tex;uniform vec2 px;uniform float rad,uSmooth,uWhite,uRosy,uBright,uWarm,uCon,uSat,uFade,uSplit,uVig,uGrain,uMono,uGlow,uMix,uTime;varying vec2 vuv;
float L(vec3 c){return dot(c,vec3(.299,.587,.114));}
float skin(vec3 c){float y=L(c);float cb=.5-.168736*c.r-.331264*c.g+.5*c.b;float cr=.5+.5*c.r-.418688*c.g-.081312*c.b;
 return smoothstep(.06,.16,y)*(1.-smoothstep(0.,.05,abs(cb-.43)-.06))*(1.-smoothstep(0.,.05,abs(cr-.585)-.065));}
void main(){vec3 o=texture2D(tex,uv).rgb;vec3 c=o;
 vec3 s=c;float ws=1.;vec3 g=c;
 for(int i=0;i<8;i++){float a=float(i)*.785398;vec2 d=vec2(cos(a),sin(a));
  for(int j=1;j<3;j++){vec3 t=texture2D(tex,uv+d*px*rad*float(j*j+1)).rgb;vec3 e=t-c;float w=exp(-dot(e,e)*55.);s+=t*w;ws+=w;g+=t;}}
 s/=ws;g/=17.;
 float k=skin(o);
 c=mix(c,s,clamp(uSmooth*(k*.95+.08),0.,1.));
 float b=1.+uWhite*4.;vec3 wc=log(1.+(b-1.)*c)/log(b);c=mix(c,wc,uWhite*(k*.75+.25));
 c+=uRosy*k*vec3(.05,-.012,.0);
 c=uBright>0.?mix(c,1.-(1.-c)*(1.-c),uBright*1.6):c*(1.+uBright*1.4);
 c+=uWarm*vec3(.075,.018,-.075);
 c=(c-.5)*(1.+uCon)+.5;
 float l=L(c);c=mix(vec3(l),c,1.+uSat);
 c+=uSplit*((1.-l)*vec3(-.03,.02,.05)+l*vec3(.05,.018,-.04));
 c=mix(c,1.-(1.-c)*(1.-g*1.05),uGlow*.45);
 c=uFade*vec3(.1,.095,.11)+c*(1.-uFade*.14);
 c=mix(c,vec3(L(c)),uMono);
 vec2 vv=vuv;float dv=distance(vv,vec2(.5));c*=1.-uVig*smoothstep(.32,.86,dv);
 float n=fract(sin(dot(vv*vec2(1789.3,1301.7)+uTime,vec2(12.9898,78.233)))*43758.5453)-.5;c+=n*uGrain*.07;
 gl_FragColor=vec4(mix(o,clamp(c,0.,1.),uMix),1.);}"""

/** 顶点：p 是 -1..1 的取景框；crop / 旋转 / 镜像都在这里把取景框上的点换到相机画面上 */
private const val CAM_VS = """
attribute vec2 p;uniform mat4 stm;uniform vec2 sc;uniform float rot,mir;varying vec2 uv;varying vec2 vuv;
void main(){vec2 t=p*.5+.5;vuv=vec2(t.x,1.-t.y);
 if(mir>.5)t.x=1.-t.x;
 t=(t-.5)*sc+.5;
 float a=radians(rot);vec2 c=t-.5;c=vec2(c.x*cos(a)-c.y*sin(a),c.x*sin(a)+c.y*cos(a));t=c+.5;
 uv=(stm*vec4(t,0.,1.)).xy;gl_Position=vec4(p,0.,1.);}"""

private val UNIFORMS = listOf("smooth" to "uSmooth", "white" to "uWhite", "rosy" to "uRosy", "bright" to "uBright", "warm" to "uWarm", "con" to "uCon", "sat" to "uSat",
    "fade" to "uFade", "split" to "uSplit", "vig" to "uVig", "grain" to "uGrain", "mono" to "uMono", "glow" to "uGlow")

/** 编译好的滤镜程序（预览和离屏拍照各一个） */
private class CamProgram(external: Boolean) {
    val prog: Int
    private val loc = HashMap<String, Int>()
    private val quad: FloatBuffer = ByteBuffer.allocateDirect(32).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0) }
    init {
        fun sh(t: Int, s: String) = GLES20.glCreateShader(t).also { GLES20.glShaderSource(it, s); GLES20.glCompileShader(it) }
        prog = GLES20.glCreateProgram()
        GLES20.glAttachShader(prog, sh(GLES20.GL_VERTEX_SHADER, CAM_VS)); GLES20.glAttachShader(prog, sh(GLES20.GL_FRAGMENT_SHADER, camFS(external)))
        GLES20.glLinkProgram(prog)
    }
    fun u(n: String) = loc.getOrPut(n) { GLES20.glGetUniformLocation(prog, n) }
    /** 画一遍：stm 是纹理变换；sc 裁切比例（≤1）；rot 画面要转几度；f 参数 */
    fun draw(stm: FloatArray, scX: Float, scY: Float, rot: Float, mir: Boolean, texW: Int, texH: Int, f: Map<String, Float>, w: Int, h: Int) {
        GLES20.glViewport(0, 0, w, h)
        GLES20.glUseProgram(prog)
        val ap = GLES20.glGetAttribLocation(prog, "p")
        GLES20.glEnableVertexAttribArray(ap); GLES20.glVertexAttribPointer(ap, 2, GLES20.GL_FLOAT, false, 0, quad)
        GLES20.glUniformMatrix4fv(u("stm"), 1, false, stm, 0)
        GLES20.glUniform2f(u("sc"), scX, scY); GLES20.glUniform1f(u("rot"), rot); GLES20.glUniform1f(u("mir"), if (mir) 1f else 0f)
        GLES20.glUniform2f(u("px"), 1f / texW, 1f / texH)
        GLES20.glUniform1f(u("rad"), max(1f, min(texW, texH) / 540f))
        for ((k, n) in UNIFORMS) GLES20.glUniform1f(u(n), f[k] ?: 0f)
        GLES20.glUniform1f(u("uMix"), f["mix"] ?: 1f); GLES20.glUniform1f(u("uTime"), (System.nanoTime() / 1e9f) % 100f)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    }
}

private val IDENTITY = floatArrayOf(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
class CamModel(private val activity: ComponentActivity, private val eval: (String) -> Unit) {
    var open by mutableStateOf(false)
    var id = ""; var head = ""; var num = ""; var unit = ""; var date = ""; var today = false
    var looks: List<CamLook> = emptyList(); var t: Map<String, String> = emptyMap()
    var look by mutableIntStateOf(1)
    val tune = mutableStateMapOf<String, Float>()
    var style by mutableStateOf("glass"); var font by mutableStateOf("sans"); var ratio by mutableStateOf("full")
    var front by mutableStateOf(true)
    var zoom by mutableFloatStateOf(1f); var zooms by mutableStateOf(listOf(1f))
    var rot by mutableIntStateOf(0)
    var adj by mutableStateOf(false); var tab by mutableStateOf("beauty")
    var cardX by mutableFloatStateOf(.5f); var cardY by mutableFloatStateOf(.62f); var cardScale by mutableFloatStateOf(1f)
    var roll by mutableStateOf<ImageBitmap?>(null)
    var flash by mutableStateOf(false)
    var flying by mutableStateOf<ImageBitmap?>(null)
    var lookFlash by mutableStateOf(""); var lookFlashId by mutableIntStateOf(0)
    var busy by mutableStateOf(false)
    var camera: Camera? = null
    var capture: ImageCapture? = null
    var renderer: CamRenderer? = null
    private val sensors = activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val grav = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val x = e.values[0]; val y = e.values[1]
            var r = rot
            if (abs(x) > 6.5f && abs(x) > abs(y) * 1.3f) r = if (x > 0) 90 else -90 else if (y > 6.5f) r = 0   // 右边朝上：顺时针转 90° 才正
            if (r != rot) rot = r
        }
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    }

    fun t(s: String) = t[s] ?: s
    val curLook get() = looks.getOrNull(look)
    fun params(): Map<String, Float> {
        val m = HashMap(curLook?.f ?: emptyMap()); m["mix"] = 1f
        m.putAll(tune); return m
    }

    fun start(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        id = o.optString("id"); head = o.optString("head"); num = o.optString("num"); unit = o.optString("unit"); date = o.optString("date"); today = o.optBoolean("today")
        val la = o.optJSONArray("looks")
        looks = (0 until (la?.length() ?: 0)).mapNotNull { i ->
            val l = la!!.optJSONObject(i) ?: return@mapNotNull null
            val f = l.optJSONObject("f"); val fm = HashMap<String, Float>()
            f?.keys()?.forEach { k -> fm[k] = f.optDouble(k).toFloat() }
            CamLook(l.optString("id"), l.optString("name"), l.optString("style"), l.optString("font"), fm)
        }
        val tt = o.optJSONObject("t"); val tm = HashMap<String, String>(); tt?.keys()?.forEach { k -> tm[k] = tt.optString(k) }; t = tm
        roll = o.optString("roll").takeIf { it.startsWith("data:") }?.let { s -> runCatching { val b = Base64.decode(s.substringAfter(","), Base64.DEFAULT); BitmapFactory.decodeByteArray(b, 0, b.size).asImageBitmap() }.getOrNull() }
        tune.clear(); adj = false; tab = "beauty"; ratio = "full"; cardX = .5f; cardY = .62f; cardScale = 1f; zoom = 1f; front = true
        setLook(looks.indexOfFirst { it.id == "portrait" }.coerceAtLeast(0), quiet = true)
        sensors.getDefaultSensor(Sensor.TYPE_GRAVITY)?.let { sensors.registerListener(grav, it, SensorManager.SENSOR_DELAY_UI) }
        open = true
    }
    fun close() {
        sensors.unregisterListener(grav)
        runCatching { ProcessCameraProvider.getInstance(activity).get().unbindAll() }
        camera = null; capture = null
        open = false
    }
    fun setLook(i: Int, quiet: Boolean = false) {
        if (looks.isEmpty()) return
        look = ((i % looks.size) + looks.size) % looks.size; tune.clear()
        style = looks[look].style; font = looks[look].font
        if (!quiet) { lookFlash = looks[look].name; lookFlashId++ }
    }
    fun flip() { front = !front; zoom = 1f; renderer?.rebind() }
    fun zoomTo(z: Float) { zoom = z; camera?.cameraControl?.setZoomRatio(z) }

    /** 拍照：frameW/H 取景框（dp），cardW/H 卡片没缩放时的大小（dp） */
    fun shoot(frameW: Float, frameH: Float, cardW: Float, cardH: Float, density: Float) {
        val cap = capture ?: return
        if (busy) return
        busy = true; flash = true
        val p = params(); val r = rot; val st = style; val fo = font; val cx = cardX; val cy = cardY; val cs = cardScale; val mir = front
        cap.takePicture(Executors.newSingleThreadExecutor(), object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(img: ImageProxy) {
                val raw = img.toBitmap(); val deg = img.imageInfo.rotationDegrees; img.close()
                val res = runCatching { CamShot.make(raw, deg, mir, p, r, frameW / frameH, CardSpec(head, num, unit, date, today, st, fo), cx, cy, cs, frameW, cardW, cardH) }.getOrNull()
                activity.runOnUiThread {
                    busy = false; flash = false
                    if (res == null) return@runOnUiThread
                    flying = res.thumb
                    eval("MC.Days&&MC.Days.addShot&&MC.Days.addShot(${JSONObject.quote(id)},'${res.comp}','${res.base}',${res.meta})")
                }
            }
            override fun onError(e: ImageCaptureException) { activity.runOnUiThread { busy = false; flash = false } }
        })
    }
    fun openRoll() {
        val i = id; close()
        eval("(function(){var x=MC.data.days.find(function(d){return d.id===${JSONObject.quote(i)}});if(x&&x.photos.length)MC.Days.openViewer(x,0);})()")
    }
}

class CardSpec(val head: String, val num: String, val unit: String, val date: String, val today: Boolean, val style: String, val font: String)

// ---------------------------------------------------------------------------
// 取景：GLSurfaceView + CameraX 预览
// ---------------------------------------------------------------------------
class CamRenderer(private val m: CamModel, private val view: GLSurfaceView, private val owner: LifecycleOwner) : GLSurfaceView.Renderer {
    private var prog: CamProgram? = null
    private var tex = 0
    private var st: SurfaceTexture? = null
    private val stm = FloatArray(16)
    @Volatile private var bufW = 1920; @Volatile private var bufH = 1080; @Volatile private var sensorRot = 90
    private var vw = 1; private var vh = 1

    override fun onSurfaceCreated(gl: GL10?, c: javax.microedition.khronos.egl.EGLConfig?) {
        prog = CamProgram(true)
        val t = IntArray(1); GLES20.glGenTextures(1, t, 0); tex = t[0]
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, tex)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        st = SurfaceTexture(tex).apply { setOnFrameAvailableListener { view.requestRender() } }
        view.post { rebind() }
    }
    override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int) { vw = w; vh = h }
    override fun onDrawFrame(gl: GL10?) {
        val s = st ?: return; val p = prog ?: return
        runCatching { s.updateTexImage() }
        s.getTransformMatrix(stm)
        // 相机画面转正后的宽高；按取景框铺满（aspect fill）裁切
        val rw = if (sensorRot % 180 == 0) bufW else bufH; val rh = if (sensorRot % 180 == 0) bufH else bufW
        val k = max(vw.toFloat() / rw, vh.toFloat() / rh)
        val scX = vw / (rw * k); val scY = vh / (rh * k)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0); GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, tex)
        p.draw(stm, scX, scY, 0f, false, bufW, bufH, m.params(), vw, vh)   // SurfaceTexture 的变换矩阵已经把传感器方向转正、前置镜头也已经镜像了，这里不再转、不再翻（和拍出来的照片一致）
    }
    /** 绑定 CameraX：预览送进 SurfaceTexture，拍照用 ImageCapture */
    fun rebind() {
        val ctx = view.context
        val f = ProcessCameraProvider.getInstance(ctx)
        f.addListener({
            val provider = f.get()
            val preview = Preview.Builder().setTargetResolution(Size(1080, 1920)).build()
            preview.setSurfaceProvider(ContextCompat.getMainExecutor(ctx)) { req ->
                bufW = req.resolution.width; bufH = req.resolution.height
                req.setTransformationInfoListener(ContextCompat.getMainExecutor(ctx)) { info -> sensorRot = info.rotationDegrees }
                val s = st ?: return@setSurfaceProvider
                s.setDefaultBufferSize(bufW, bufH)
                val surface = Surface(s)
                req.provideSurface(surface, ContextCompat.getMainExecutor(ctx)) { surface.release() }
            }
            val cap = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build()
            val sel = if (m.front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
            runCatching {
                provider.unbindAll()
                val cam = provider.bindToLifecycle(owner, sel, preview, cap)
                m.camera = cam; m.capture = cap
                val zs = cam.cameraInfo.zoomState.value
                val lo = zs?.minZoomRatio ?: 1f; val hi = zs?.maxZoomRatio ?: 1f
                m.zooms = listOf(.5f, 1f, 2f, 3f).filter { it >= lo - .01f && it <= hi + .01f }.ifEmpty { listOf(1f) }
                cam.cameraControl.setZoomRatio(1f)
            }
        }, ContextCompat.getMainExecutor(ctx))
    }
}

// ---------------------------------------------------------------------------
// 拍好的一张：离屏 OpenGL 按原图套滤镜，按画幅裁，放上卡片
// ---------------------------------------------------------------------------
object CamShot {
    class Result(val comp: String, val base: String, val meta: String, val thumb: ImageBitmap)

    fun make(raw0: Bitmap, deg: Int, mirror: Boolean, p: Map<String, Float>, rot: Int, frameAR: Float, card: CardSpec,
             cx0: Float, cy0: Float, cs: Float, frameWdp: Float, cardWdp: Float, cardHdp: Float): Result? {
        // 转正（相机传感器方向）、前置镜像，再按横拿转过来
        val mtx = Matrix(); mtx.postRotate(deg.toFloat()); if (mirror) mtx.postScale(-1f, 1f)
        var raw = Bitmap.createBitmap(raw0, 0, 0, raw0.width, raw0.height, mtx, true)
        // 按取景框的比例裁（横拿时是它转过来）
        var ar = frameAR; if (rot != 0) ar = 1 / ar
        // 横拿：把竖着的画面转成横的（世界的上在画面的右 / 左边）
        if (rot != 0) { val m2 = Matrix(); m2.postRotate(-rot.toFloat()); raw = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m2, true) }
        var cw = raw.width.toFloat(); var ch = cw / ar
        if (ch > raw.height) { ch = raw.height.toFloat(); cw = ch * ar }
        val k0 = min(1f, 2560f / max(cw, ch))
        val W = (cw * k0).roundToInt(); val H = (ch * k0).roundToInt()
        val crop = Bitmap.createBitmap(raw, ((raw.width - cw) / 2).roundToInt(), ((raw.height - ch) / 2).roundToInt(), cw.roundToInt(), ch.roundToInt())
        val src = if (k0 < 1f) Bitmap.createScaledBitmap(crop, W, H, true) else crop
        val base = OffscreenFilter.run(src, p) ?: src
        // 卡片：取景框里的位置 → 输出图里的位置（横拍时跟着转）
        var cx = cx0; var cy = cy0
        if (rot == 90) { val nx = cy; cy = 1 - cx; cx = nx } else if (rot == -90) { val nx = 1 - cy; cy = cx; cx = nx }
        val portraitW = if (rot == 0) W else H
        val k = portraitW / frameWdp * cs      // 卡片上 1dp 在照片上是多少像素
        val cwPx = cardWdp * k; val chPx = cardHdp * k
        val rect = RectF(cx * W - cwPx / 2, cy * H - chPx / 2, cx * W + cwPx / 2, cy * H + chPx / 2)
        val comp = base.copy(Bitmap.Config.ARGB_8888, true)
        CardPainter.draw(Canvas(comp), base, rect, k, card)
        fun b64(b: Bitmap): String { val o = ByteArrayOutputStream(); b.compress(Bitmap.CompressFormat.JPEG, 90, o); return Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP) }
        val meta = JSONObject().put("style", card.style).put("font", card.font).put("x", (rect.centerX() / W).toDouble()).put("y", (rect.centerY() / H).toDouble())
            .put("s", (k / W).toDouble()).put("cw", W).put("ch", H).toString()
        val tw = 240; val th = (tw * H / W.toFloat()).roundToInt()
        return Result(b64(comp), b64(base), meta, Bitmap.createScaledBitmap(comp, tw, th, true).asImageBitmap())
    }
}

/** 卡片画进照片：样式（玻璃 / 透明 / 浅色 / 深色）和屏幕上一样 */
object CardPainter {
    fun draw(c: Canvas, base: Bitmap, r: RectF, k: Float, card: CardSpec) {
        val rad = 26 * k
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        when (card.style) {
            "glass" -> {
                paint.color = android.graphics.Color.argb(26, 255, 255, 255); c.drawRoundRect(r, rad, rad, paint)
                paint.style = Paint.Style.STROKE; paint.strokeWidth = max(1.5f, 1.2f * k); paint.color = android.graphics.Color.argb(140, 255, 255, 255)
                c.drawRoundRect(r, rad, rad, paint); paint.style = Paint.Style.FILL
            }
            "light" -> { paint.color = android.graphics.Color.argb(225, 255, 255, 255); c.drawRoundRect(r, rad, rad, paint) }
            "dark" -> { paint.color = android.graphics.Color.argb(148, 12, 12, 16); c.drawRoundRect(r, rad, rad, paint) }
        }
        val ink = if (card.style == "light") android.graphics.Color.rgb(23, 27, 32) else android.graphics.Color.WHITE
        val fam = when (card.font) { "serif" -> Typeface.SERIF; "mono" -> Typeface.MONOSPACE; else -> Typeface.SANS_SERIF }
        fun tp(sz: Float, bold: Boolean) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ink; textSize = sz * k; typeface = Typeface.create(fam, if (bold) Typeface.BOLD else Typeface.NORMAL); textAlign = Paint.Align.CENTER
            if (card.style != "light") setShadowLayer(4 * k, 0f, 1 * k, android.graphics.Color.argb(if (card.style == "clear") 100 else 64, 0, 0, 0))
        }
        val cx = r.centerX()
        val h = tp(14f, true); val n = tp(if (card.today) 52f else 66f, true); val u = tp(18f, true); val d = tp(11.5f, false).apply { alpha = 217 }
        c.drawText(card.head, cx, r.top + 16 * k + 14 * k, h)
        val nw = n.measureText(card.num); val uw = if (card.unit.isEmpty()) 0f else u.measureText(card.unit) + 4 * k
        val base0 = r.top + 16 * k + 18 * k + (if (card.today) 52f else 66f) * k * .86f
        n.textAlign = Paint.Align.LEFT; u.textAlign = Paint.Align.LEFT
        val x0 = cx - (nw + uw) / 2
        c.drawText(card.num, x0, base0, n)
        if (card.unit.isNotEmpty()) c.drawText(card.unit, x0 + nw + 4 * k, base0, u)
        c.drawText(card.date, cx, r.bottom - 14 * k - 2 * k, d)
    }
}

/** 离屏 OpenGL：一张图按原分辨率套滤镜（和预览同一个着色器） */
object OffscreenFilter {
    fun run(src: Bitmap, p: Map<String, Float>): Bitmap? = runCatching {
        val dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY); val v = IntArray(2); EGL14.eglInitialize(dpy, v, 0, v, 1)
        val attrs = intArrayOf(EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8, EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT, EGL14.EGL_NONE)
        val cfgs = arrayOfNulls<EGLConfig>(1); val nc = IntArray(1); EGL14.eglChooseConfig(dpy, attrs, 0, cfgs, 0, 1, nc, 0)
        val ctx = EGL14.eglCreateContext(dpy, cfgs[0], EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
        val W = src.width; val H = src.height
        val surf = EGL14.eglCreatePbufferSurface(dpy, cfgs[0], intArrayOf(EGL14.EGL_WIDTH, W, EGL14.EGL_HEIGHT, H, EGL14.EGL_NONE), 0)
        EGL14.eglMakeCurrent(dpy, surf, surf, ctx)
        val prog = CamProgram(false)
        val t = IntArray(1); GLES20.glGenTextures(1, t, 0); GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t[0])
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR); GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE); GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, src, 0)
        // 位图上下颠倒地进纹理：纹理变换把 y 翻过来
        val flip = floatArrayOf(1f, 0f, 0f, 0f, 0f, -1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 1f, 0f, 1f)
        prog.draw(flip, 1f, 1f, 0f, false, W, H, p, W, H)
        val buf = ByteBuffer.allocateDirect(W * H * 4).order(ByteOrder.nativeOrder())
        GLES20.glReadPixels(0, 0, W, H, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buf)
        EGL14.eglMakeCurrent(dpy, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
        EGL14.eglDestroySurface(dpy, surf); EGL14.eglDestroyContext(dpy, ctx); EGL14.eglTerminate(dpy)
        val out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888); buf.rewind(); out.copyPixelsFromBuffer(buf)
        // glReadPixels 是从下往上：翻回来
        val m = Matrix(); m.postScale(1f, -1f)
        Bitmap.createBitmap(out, 0, 0, W, H, m, true)
    }.getOrNull()
}

// ---------------------------------------------------------------------------
// 界面
// ---------------------------------------------------------------------------
/** 透明玻璃（相机上用）：几乎全透，靠一层很淡的亮、左上亮右下暗的高光边看出是一块玻璃 */
private fun Modifier.clearGlass(shape: RoundedCornerShape) = this
    .background(Brush.linearGradient(listOf(Color.White.copy(alpha = .16f), Color.White.copy(alpha = .04f), Color.White.copy(alpha = .1f))), shape)
    .border(1.dp, Brush.linearGradient(listOf(Color.White.copy(alpha = .6f), Color.White.copy(alpha = .12f), Color.White.copy(alpha = .3f))), shape)

private val RATIOS = listOf("full" to 0f, "34" to 3f / 4, "45" to 4f / 5, "916" to 9f / 16, "11" to 1f)
private val RATIO_LABEL = mapOf("full" to "全屏", "34" to "3:4", "45" to "4:5", "916" to "9:16", "11" to "1:1")

@SuppressLint("ClickableViewAccessibility")
@Composable
fun NativeCamScreen(m: CamModel, owner: LifecycleOwner) {
    val view = LocalView.current
    val tick: () -> Unit = { view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
    val dens = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black)) {
        val fullW = maxWidth.value; val fullH = maxHeight.value
        val ar = RATIOS.first { it.first == m.ratio }.second
        val (fw, fh) = if (ar <= 0f) fullW to fullH else { var w = fullW; var h = w / ar; if (h > fullH) { h = fullH; w = h * ar }; w to h }
        val fx = (fullW - fw) / 2; val fy = if (ar <= 0f) 0f else max(0f, (fullH - fh) * .4f)
        val rot = m.rot.toFloat()
        val rotA by animateFloatAsState(rot, spring(.85f, 380f), label = "rot")
        var rollPos by remember { mutableStateOf(Offset.Zero) }
        // 取景（滤镜实时）
        AndroidView(factory = { ctx ->
            GLSurfaceView(ctx).apply {
                setEGLContextClientVersion(2)
                val r = CamRenderer(m, this, owner); m.renderer = r
                setRenderer(r); renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
            }
        }, modifier = Modifier.offset(fx.dp, fy.dp).size(fw.dp, fh.dp)
            .pointerInput(Unit) {   // 左右滑换方案
                var dx = 0f
                detectHorizontalDragGestures(onDragStart = { dx = 0f }, onDragEnd = { if (abs(dx) > 120) { m.setLook(m.look + if (dx < 0) 1 else -1); tick() } }) { _, d -> dx += d }
            })
        // 方案名闪一下
        var flashOn by remember { mutableStateOf(false) }
        LaunchedEffect(m.lookFlashId) { if (m.lookFlashId > 0) { flashOn = true; delay(800); flashOn = false } }
        val fa by animateFloatAsState(if (flashOn) 1f else 0f, tween(if (flashOn) 160 else 260), label = "fl")
        Text(m.lookFlash, Modifier.align(Alignment.TopCenter).offset(y = (fy + fh * .38f).dp).graphicsLayer { alpha = fa; rotationZ = rotA },
            color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, style = TextStyle(shadow = Shadow(Color.Black.copy(alpha = .35f), Offset(0f, 2f), 12f)))
        // 卡片：拖动、双指缩放
        var cardSize by remember { mutableStateOf(androidx.compose.ui.geometry.Size(200f, 120f)) }
        CardView(m, Modifier
            .onSizeChanged { cardSize = androidx.compose.ui.geometry.Size(it.width / dens.density, it.height / dens.density) }
            .offset { IntOffset(((fx + m.cardX * fw) * dens.density - cardSize.width * dens.density / 2).roundToInt(), ((fy + m.cardY * fh) * dens.density - cardSize.height * dens.density / 2).roundToInt()) }
            .graphicsLayer { scaleX = m.cardScale; scaleY = m.cardScale; rotationZ = rotA }
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    m.cardX = (m.cardX + pan.x / dens.density / fw).coerceIn(.08f, .92f)
                    m.cardY = (m.cardY + pan.y / dens.density / fh).coerceIn(.08f, .92f)
                    m.cardScale = (m.cardScale * zoom).coerceIn(.55f, 2.2f)
                }
            })
        if (m.flash) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = .8f)))
        // 按钮
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.padding(16.dp)) { CamCircle("back", rotA) { m.close() } }
            Spacer(Modifier.weight(1f))
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AnimatedVisibility(m.adj, enter = fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 6 }, exit = fadeOut(tween(140)) + slideOutVertically(tween(160)) { it / 6 }) { AdjustPanel(m, tick) }
                if (!m.adj && m.looks.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    m.looks.indices.forEach { i -> Box(Modifier.size(width = if (i == m.look) 16.dp else 5.dp, height = 5.dp).clip(CircleShape).background(Color.White.copy(alpha = if (i == m.look) 1f else .38f))) }
                }
                if (m.zooms.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    m.zooms.forEach { z ->
                        val on = abs(m.zoom - z) < .05f
                        Box(Modifier.size(if (on) 38.dp else 32.dp).clip(CircleShape).clearGlass(RoundedCornerShape(50)).pointerInput(z) { detectTapGestures(onTap = { m.zoomTo(z); tick() }) }, contentAlignment = Alignment.Center) {
                            Text(if (z == .5f) ".5×" else "${z.roundToInt()}×", color = if (on) Color(0xFFFFD60A) else Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.rotate(rotA))
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp), verticalAlignment = Alignment.Bottom) {
                    // 相册小图
                    Box(Modifier.size(50.dp).onGloballyPositioned { rollPos = it.boundsInRoot().center }.graphicsLayer { rotationZ = rotA }
                        .clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .08f))
                        .border(1.5.dp, Color.White.copy(alpha = if (m.roll == null) .35f else .85f), RoundedCornerShape(12.dp))
                        .pointerInput(Unit) { detectTapGestures(onTap = { m.openRoll() }) }) {
                        m.roll?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                    }
                    Spacer(Modifier.weight(1f))
                    // 快门
                    val sc by animateFloatAsState(if (m.busy) .86f else 1f, tween(120), label = "sh")
                    Box(Modifier.size(74.dp).border(4.dp, Color.White, CircleShape).padding(7.dp).pointerInput(Unit) {
                        detectTapGestures(onTap = { tick(); m.shoot(fw, fh, cardSize.width, cardSize.height, dens.density) })
                    }) { Box(Modifier.fillMaxSize().scale(sc).clip(CircleShape).background(Color.White)) }
                    Spacer(Modifier.weight(1f))
                    // 「调整」在翻转镜头上面
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        CamCircle("adjust", rotA, on = m.adj) { m.adj = !m.adj; tick() }
                        CamCircle("flip", rotA, big = true) { m.flip(); tick() }
                    }
                }
            }
        }
        FlyIn(m, rollPos, fullW * dens.density, fullH * dens.density)
    }
}

/** 拍好的那一张：从整个取景缩成小图，飞进左下角的相册（坐标都是整个画面的像素） */
@Composable
private fun FlyIn(m: CamModel, target: Offset, W: Float, H: Float) {
    val img = m.flying ?: return
    val p = remember(img) { Animatable(0f) }
    LaunchedEffect(img) { p.animateTo(1f, tween(520, easing = androidx.compose.animation.core.CubicBezierEasing(.32f, .72f, 0f, 1f))); m.roll = img; m.flying = null }
    val dens = LocalDensity.current
    val v = p.value; val tw = 50 * dens.density
    val w = W + (tw - W) * v; val h = H + (tw - H) * v
    val cx = W / 2 + (target.x - W / 2) * v; val cy = H / 2 + (target.y - H / 2) * v
    Image(img, null, Modifier.offset { IntOffset((cx - w / 2).roundToInt(), (cy - h / 2).roundToInt()) }
        .size(with(dens) { w.toDp() }, with(dens) { h.toDp() }).clip(RoundedCornerShape((12 * v).dp)), contentScale = ContentScale.Crop)
}

@Composable
private fun CamCircle(kind: String, rot: Float, on: Boolean = false, big: Boolean = false, act: () -> Unit) {
    val s = if (big) 52.dp else 46.dp
    Box(Modifier.size(s).clip(CircleShape).background(if (on) Color.White.copy(alpha = .9f) else Color.Black.copy(alpha = .28f)).clearGlass(RoundedCornerShape(50))
        .pointerInput(Unit) { detectTapGestures(onTap = { act() }) }, contentAlignment = Alignment.Center) {
        val c = if (on) Color.Black else Color.White
        UiCanvas(Modifier.size(if (big) 22.dp else 20.dp).rotate(rot)) {
            val w = size.width; val st = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round)
            when (kind) {
                "back" -> { drawLine(c, Offset(w * .62f, w * .18f), Offset(w * .3f, w * .5f), 2.4.dp.toPx(), StrokeCap.Round); drawLine(c, Offset(w * .3f, w * .5f), Offset(w * .62f, w * .82f), 2.4.dp.toPx(), StrokeCap.Round) }
                "adjust" -> {
                    drawLine(c, Offset(0f, w * .3f), Offset(w, w * .3f), 2.dp.toPx(), StrokeCap.Round); drawLine(c, Offset(0f, w * .7f), Offset(w, w * .7f), 2.dp.toPx(), StrokeCap.Round)
                    drawCircle(if (on) Color.White else Color(0xFF333333), w * .12f, Offset(w * .65f, w * .3f)); drawCircle(c, w * .12f, Offset(w * .65f, w * .3f), style = st)
                    drawCircle(if (on) Color.White else Color(0xFF333333), w * .12f, Offset(w * .35f, w * .7f)); drawCircle(c, w * .12f, Offset(w * .35f, w * .7f), style = st)
                }
                else -> {   // 翻转：两段弧加箭头
                    drawArc(c, 200f, 140f, false, style = st, topLeft = Offset(w * .1f, w * .1f), size = androidx.compose.ui.geometry.Size(w * .8f, w * .8f))
                    drawArc(c, 20f, 140f, false, style = st, topLeft = Offset(w * .1f, w * .1f), size = androidx.compose.ui.geometry.Size(w * .8f, w * .8f))
                    drawLine(c, Offset(w * .88f, w * .28f), Offset(w * .9f, w * .5f), 2.dp.toPx(), StrokeCap.Round); drawLine(c, Offset(w * .12f, w * .72f), Offset(w * .1f, w * .5f), 2.dp.toPx(), StrokeCap.Round)
                }
            }
        }
    }
}

@Composable
private fun CardView(m: CamModel, modifier: Modifier) {
    val shape = RoundedCornerShape(26.dp)
    val ink = if (m.style == "light") Color(0xFF171B20) else Color.White
    val fam = when (m.font) { "serif" -> FontFamily.Serif; "mono" -> FontFamily.Monospace; else -> FontFamily.SansSerif }
    val sh = if (m.style == "light") null else Shadow(Color.Black.copy(alpha = if (m.style == "clear") .4f else .25f), Offset(0f, 2f), 10f)
    val bg = when (m.style) {
        "glass" -> Modifier.clearGlass(shape)
        "light" -> Modifier.background(Color.White.copy(alpha = .88f), shape)
        "dark" -> Modifier.background(Color(0xFF0C0C10).copy(alpha = .58f), shape)
        else -> Modifier
    }
    Column(modifier.then(bg).widthIn(min = 184.dp).padding(start = 26.dp, end = 26.dp, top = 16.dp, bottom = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(m.head, color = ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, fontFamily = fam, maxLines = 1, style = TextStyle(shadow = sh))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(m.num, color = ink, fontSize = if (m.today) 52.sp else 66.sp, fontWeight = if (m.font == "serif") FontWeight.Medium else FontWeight.ExtraBold, fontFamily = fam, style = TextStyle(shadow = sh))
            if (m.unit.isNotEmpty()) Text(m.unit, color = ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, fontFamily = fam, modifier = Modifier.padding(start = 4.dp, bottom = 10.dp), style = TextStyle(shadow = sh))
        }
        Text(m.date, color = ink.copy(alpha = .85f), fontSize = 11.5.sp, fontFamily = fam, style = TextStyle(shadow = sh))
    }
}

@Composable
private fun AdjustPanel(m: CamModel, tick: () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    // 安卓没有系统的背景模糊：面板压一层较深的底（高光边照旧），后面的画面和卡片退后，面板上的字看得清
    Column(Modifier.fillMaxWidth().background(Color(0xFF101014).copy(alpha = .62f), shape).clearGlass(shape).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Seg(listOf("beauty" to "美颜", "filter" to "滤镜", "text" to "文字", "frame" to "画幅"), m.tab, m) { m.tab = it; tick() }
        when (m.tab) {
            "beauty" -> Sliders(m, listOf(Triple("smooth", "磨皮", 0f to 1f), Triple("white", "美白", 0f to 1f), Triple("rosy", "红润", 0f to 1f)))
            "filter" -> Sliders(m, listOf(Triple("mix", "滤镜强度", 0f to 1f), Triple("bright", "亮度", -.3f to .3f), Triple("warm", "色温", -.4f to .4f), Triple("grain", "颗粒", 0f to .6f)))
            "text" -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Seg(listOf("glass" to "玻璃", "clear" to "透明", "light" to "浅色", "dark" to "深色"), m.style, m) { m.style = it; tick() }
                Seg(listOf("sans" to "默认", "round" to "圆体", "serif" to "衬线", "mono" to "等宽"), m.font, m) { m.font = it; tick() }
            }
            else -> Seg(RATIOS.map { it.first to RATIO_LABEL[it.first]!! }, m.ratio, m) { m.ratio = it; tick() }
        }
        if (m.tab == "beauty" || m.tab == "filter")
            Text(m.t("还原这个方案"), color = Color.White.copy(alpha = .75f), fontSize = 12.5.sp, modifier = Modifier.align(Alignment.CenterHorizontally).pointerInput(Unit) { detectTapGestures(onTap = { m.tune.clear(); tick() }) }.padding(6.dp))
    }
}

@Composable
private fun Seg(items: List<Pair<String, String>>, sel: String, m: CamModel, pick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().clearGlass(RoundedCornerShape(50)).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        items.forEach { (k, l) ->
            Box(Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(50)).background(if (sel == k) Color.White.copy(alpha = .9f) else Color.Transparent)
                .pointerInput(k) { detectTapGestures(onTap = { pick(k) }) }, contentAlignment = Alignment.Center) {
                Text(m.t(l), color = if (sel == k) Color.Black else Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun Sliders(m: CamModel, rows: List<Triple<String, String, Pair<Float, Float>>>) {
    Column {
        rows.forEach { (k, l, r) ->
            val v = m.tune[k] ?: m.params()[k] ?: 0f
            Row(Modifier.height(36.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(m.t(l), color = Color.White, fontSize = 13.sp, modifier = Modifier.width(64.dp))
                Slider(value = v, onValueChange = { m.tune[k] = it }, valueRange = r.first..r.second, modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color.White.copy(alpha = .22f)),
                    thumb = { Box(Modifier.size(22.dp).shadow(4.dp, CircleShape).clip(CircleShape).background(Color.White)) },   // 圆的拇指（和 iPhone 一样）
                    track = { st -> Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = .22f))) {
                        Box(Modifier.fillMaxWidth(((v - r.first) / (r.second - r.first)).coerceIn(0f, 1f)).height(4.dp).background(Color.White)) } })
                Text("${((if (r.first < 0) v / r.second else (v - r.first) / (r.second - r.first)) * 100).roundToInt()}", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(34.dp).padding(start = 6.dp))
            }
        }
    }
}
