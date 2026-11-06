import SwiftUI
import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import CoreMotion
import MetalKit
import Vision

// ============================================================================
// 纪念相机（iPhone 原生，用户定的：能做原生就做原生）
// 网页点「纪念相机」→ MCNative.openCam(json) → 这里全屏打开。界面只有：左上返回 · 右上调整 · 下面 相册小图 · 快门 · 翻转 · 倍率。
// 方案（滤镜 + 卡片样式 + 字体，和网页 days.js 的 CAM_LOOKS 同一套数值）在取景框上左右滑着换；「调整」是系统透明液态玻璃面板：
// 美颜（磨皮 / 美白 / 红润 / 瘦脸 / 大眼）· 滤镜（强度 / 亮度 / 色温 / 颗粒）· 文字（卡片样式 / 字体）· 画幅。
// 滤镜用 Core Image：磨皮按肤色挑出皮肤（有脸时只在脸附近）、保留边缘；瘦脸 / 大眼按 Vision 的人脸关键点做局部变形；
// 「原生」是老 iPhone 那一套后期（微暖、反差柔和、黑位略浮、饱和度克制）。
// 拍照：按原始分辨率重新套一遍滤镜，放上卡片，和没放卡片的底图一起交给网页存进这个日子的相册（Days.addShot），
// 画面缩成小图飞进左下角的相册，马上能接着拍。横着拿（陀螺仪，绕过旋转锁定）时所有按钮和卡片转正，拍出横的照片。
// ============================================================================

struct CamLook: Decodable { let id: String; let name: String; let style: String; let font: String; let f: [String: Double] }
struct CamReq: Decodable {
    let id: String
    let head: String, num: String, unit: String, date: String
    let today: Bool
    let looks: [CamLook]
    let t: [String: String]
    let roll: String?   // 这个日子最新一张照片（data URL），左下角先显示它
}

/// 一组滤镜参数（和网页 camF 的键一样）
struct CamParams {
    var smooth = 0.0, white = 0.0, rosy = 0.0, slim = 0.0, eye = 0.0
    var bright = 0.0, warm = 0.0, con = 0.0, sat = 0.0, fade = 0.0, split = 0.0, vig = 0.0, grain = 0.0, mono = 0.0, glow = 0.0, mix = 1.0
    init() {}
    init(_ d: [String: Double]) {
        smooth = d["smooth"] ?? 0; white = d["white"] ?? 0; rosy = d["rosy"] ?? 0; slim = d["slim"] ?? 0; eye = d["eye"] ?? 0
        bright = d["bright"] ?? 0; warm = d["warm"] ?? 0; con = d["con"] ?? 0; sat = d["sat"] ?? 0; fade = d["fade"] ?? 0
        split = d["split"] ?? 0; vig = d["vig"] ?? 0; grain = d["grain"] ?? 0; mono = d["mono"] ?? 0; glow = d["glow"] ?? 0; mix = d["mix"] ?? 1
    }
    subscript(k: String) -> Double {
        get { switch k { case "smooth": smooth; case "white": white; case "rosy": rosy; case "slim": slim; case "eye": eye; case "bright": bright; case "warm": warm; case "grain": grain; case "mix": mix; default: 0 } }
        set { switch k { case "smooth": smooth = newValue; case "white": white = newValue; case "rosy": rosy = newValue; case "slim": slim = newValue; case "eye": eye = newValue; case "bright": bright = newValue; case "warm": warm = newValue; case "grain": grain = newValue; case "mix": mix = newValue; default: break } }
    }
}

// ---------------------------------------------------------------------------
// 滤镜
// ---------------------------------------------------------------------------
enum CamFX {
    /// 肤色查找表（32³）：按 YCbCr 判断像不像皮肤，输出灰度（越像越白），和网页 CAM_FS 的 skin() 同一个范围
    static let skinCube: Data = {
        let n = 32
        var d = [Float](repeating: 0, count: n * n * n * 4)
        func ss(_ a: Float, _ b: Float, _ x: Float) -> Float { let t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
        for b in 0..<n { for g in 0..<n { for r in 0..<n {
            let R = Float(r) / Float(n - 1), G = Float(g) / Float(n - 1), B = Float(b) / Float(n - 1)
            let y = 0.299 * R + 0.587 * G + 0.114 * B
            let cb = 0.5 - 0.168736 * R - 0.331264 * G + 0.5 * B
            let cr = 0.5 + 0.5 * R - 0.418688 * G - 0.081312 * B
            let s = ss(0.06, 0.16, y) * (1 - ss(0, 0.05, abs(cb - 0.43) - 0.06)) * (1 - ss(0, 0.05, abs(cr - 0.585) - 0.065))
            let i = ((b * n + g) * n + r) * 4
            d[i] = s; d[i + 1] = s; d[i + 2] = s; d[i + 3] = 1
        } } }
        return d.withUnsafeBufferPointer { Data(buffer: $0) }
    }()

    /// 一帧（或一张照片）套滤镜。faces：Vision 的人脸（坐标是 0–1，左下角为原点，和 CIImage 一样）
    static func apply(_ src: CIImage, _ p: CamParams, faces: [VNFaceObservation]) -> CIImage {
        let ext = src.extent
        guard ext.width > 1, ext.height > 1 else { return src }
        let side = min(ext.width, ext.height)
        var img = src
        // 瘦脸 / 大眼：按关键点局部变形
        for f in faces { img = reshape(img, f, ext, slim: p.slim, eye: p.eye) }
        // 皮肤遮罩：肤色查找表；有脸时只留脸附近（不磨到背景里肤色一样的东西）
        let cube = CIFilter.colorCube(); cube.inputImage = img; cube.cubeDimension = 32; cube.cubeData = skinCube
        var mask = cube.outputImage ?? CIImage(color: .white).cropped(to: ext)
        if !faces.isEmpty {
            var near = CIImage(color: .black).cropped(to: ext)
            for f in faces {
                let b = f.boundingBox, c = CGPoint(x: ext.minX + b.midX * ext.width, y: ext.minY + b.midY * ext.height), r = max(b.width * ext.width, b.height * ext.height)
                let rg = CIFilter.radialGradient(); rg.center = c; rg.radius0 = Float(r * 0.55); rg.radius1 = Float(r * 0.95)
                rg.color0 = .white; rg.color1 = .black
                if let g = rg.outputImage?.cropped(to: ext) { near = g.applyingFilter("CILightenBlendMode", parameters: [kCIInputBackgroundImageKey: near]) }
            }
            mask = mask.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: near])
        }
        func scaled(_ m: CIImage, _ k: Double) -> CIImage {
            m.applyingFilter("CIColorMatrix", parameters: ["inputRVector": CIVector(x: k, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: k, z: 0, w: 0),
                                                         "inputBVector": CIVector(x: 0, y: 0, z: k, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1)])
        }
        // 磨皮：保边的柔化（降噪 + 一点高斯）只铺在皮肤上
        if p.smooth > 0.01 {
            let soft = img.clampedToExtent().applyingFilter("CINoiseReduction", parameters: ["inputNoiseLevel": 0.02 + p.smooth * 0.06, "inputSharpness": 0.2])
                .applyingGaussianBlur(sigma: Double(side) * 0.0028 * (0.4 + p.smooth)).cropped(to: ext)
            img = soft.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: img, kCIInputMaskImageKey: scaled(mask, min(1, p.smooth * 1.1))])
        }
        // 美白：提亮中间调（皮肤上多一点，别处少一点）
        if p.white > 0.01 {
            let tc = CIFilter.toneCurve(); tc.inputImage = img
            let w = Float(p.white)
            tc.point0 = CGPoint(x: 0, y: 0); tc.point1 = CGPoint(x: 0.25, y: CGFloat(0.25 + 0.1 * w)); tc.point2 = CGPoint(x: 0.5, y: CGFloat(0.5 + 0.12 * w))
            tc.point3 = CGPoint(x: 0.75, y: CGFloat(0.75 + 0.07 * w)); tc.point4 = CGPoint(x: 1, y: 1)
            if let br = tc.outputImage {
                let m2 = scaled(mask, 0.75).applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: CIImage(color: CIColor(red: 0.25, green: 0.25, blue: 0.25)).cropped(to: ext)])
                img = br.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: img, kCIInputMaskImageKey: m2])
            }
        }
        // 红润：皮肤上带一点粉
        if p.rosy > 0.01 {
            let pink = img.applyingFilter("CIColorMatrix", parameters: ["inputBiasVector": CIVector(x: 0.05 * p.rosy * 1.4, y: -0.012 * p.rosy, z: 0, w: 0)])
            img = pink.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: img, kCIInputMaskImageKey: mask])
        }
        // 调色：色温、亮度、反差、饱和、黑位上浮
        let tt = CIFilter.temperatureAndTint(); tt.inputImage = img
        tt.neutral = CIVector(x: 6500, y: 0); tt.targetNeutral = CIVector(x: 6500 - p.warm * 2600, y: 0)
        img = tt.outputImage ?? img
        let cc = CIFilter.colorControls(); cc.inputImage = img
        cc.brightness = Float(p.bright * 0.35); cc.contrast = Float(1 + p.con); cc.saturation = Float((1 + p.sat) * (1 - p.mono))
        img = cc.outputImage ?? img
        if p.fade > 0.005 || p.split != 0 {
            let fc = CIFilter.toneCurve(); fc.inputImage = img
            let f = CGFloat(p.fade)
            fc.point0 = CGPoint(x: 0, y: 0.11 * f); fc.point1 = CGPoint(x: 0.25, y: 0.25 + 0.05 * f); fc.point2 = CGPoint(x: 0.5, y: 0.5)
            fc.point3 = CGPoint(x: 0.75, y: 0.75 - 0.02 * f); fc.point4 = CGPoint(x: 1, y: 1 - 0.05 * f)
            img = fc.outputImage ?? img
            if p.split != 0 {   // 分离色调：暗部偏青、亮部偏橙
                img = img.applyingFilter("CIColorMatrix", parameters: ["inputBiasVector": CIVector(x: 0.02 * p.split, y: 0.01 * p.split, z: -0.015 * p.split, w: 0)])
            }
        }
        if p.glow > 0.01 { img = img.applyingFilter("CIBloom", parameters: ["inputRadius": Double(side) * 0.012, "inputIntensity": p.glow * 0.7]).cropped(to: ext) }
        if p.vig > 0.01 { img = img.applyingFilter("CIVignette", parameters: ["inputIntensity": p.vig * 1.5, "inputRadius": 1.6]) }
        if p.grain > 0.01, let noise = CIFilter.randomGenerator().outputImage {
            let g = noise.cropped(to: ext).applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 0.07 * p.grain, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0.07 * p.grain, y: 0, z: 0, w: 0),
                "inputBVector": CIVector(x: 0.07 * p.grain, y: 0, z: 0, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
                "inputBiasVector": CIVector(x: -0.035 * p.grain, y: -0.035 * p.grain, z: -0.035 * p.grain, w: 0)])
            img = g.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: img])
        }
        img = img.cropped(to: ext)
        if p.mix < 0.999 { img = img.applyingFilter("CIDissolveTransition", parameters: [kCIInputTargetImageKey: img, kCIInputImageKey: src, "inputTime": p.mix]) }
        return img
    }

    /// 瘦脸：两颊往里收一点；大眼：眼睛那一块鼓起来一点
    static func reshape(_ img: CIImage, _ f: VNFaceObservation, _ ext: CGRect, slim: Double, eye: Double) -> CIImage {
        guard slim > 0.01 || eye > 0.01, let lm = f.landmarks else { return img }
        let b = f.boundingBox
        let pt = { (p: CGPoint) -> CGPoint in CGPoint(x: ext.minX + (b.minX + p.x * b.width) * ext.width, y: ext.minY + (b.minY + p.y * b.height) * ext.height) }
        let fw = b.width * ext.width
        var out = img
        if eye > 0.01 {
            for e in [lm.leftEye, lm.rightEye].compactMap({ $0 }) where e.pointCount > 0 {
                let ps = e.normalizedPoints.map(pt)
                let c = CGPoint(x: ps.map(\.x).reduce(0, +) / CGFloat(ps.count), y: ps.map(\.y).reduce(0, +) / CGFloat(ps.count))
                out = out.applyingFilter("CIBumpDistortion", parameters: [kCIInputCenterKey: CIVector(cgPoint: c), kCIInputRadiusKey: fw * 0.16, kCIInputScaleKey: eye * 0.32])
            }
        }
        if slim > 0.01, let jaw = lm.faceContour, jaw.pointCount > 6 {
            let ps = jaw.normalizedPoints.map(pt), n = ps.count
            for i in [n / 4, n - 1 - n / 4] {
                out = out.applyingFilter("CIBumpDistortion", parameters: [kCIInputCenterKey: CIVector(cgPoint: ps[i]), kCIInputRadiusKey: fw * 0.28, kCIInputScaleKey: -slim * 0.22])
            }
        }
        return out.cropped(to: ext)
    }
}

// ---------------------------------------------------------------------------
// 相机：取景（每一帧套滤镜画到 MTKView）、拍照
// ---------------------------------------------------------------------------
final class CamEngine: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private let q = DispatchQueue(label: "cadence.cam")
    private let video = AVCaptureVideoDataOutput()
    private let photo = AVCapturePhotoOutput()
    private var input: AVCaptureDeviceInput?
    private let lock = NSLock()
    private var _frame: CIImage?
    private var _params = CamParams()
    private var _faces: [VNFaceObservation] = []
    private var frameN = 0
    private let seq = VNSequenceRequestHandler()
    var front = true
    /// 后置镜头 1× 对应的 videoZoomFactor（三摄 / 双广角的虚拟镜头里 0.5× 才是 1.0）
    private(set) var baseZoom: CGFloat = 1
    private(set) var zooms: [Double] = [1]
    private var shotDone: ((CIImage?) -> Void)?

    var params: CamParams { get { lock.lock(); defer { lock.unlock() }; return _params } set { lock.lock(); _params = newValue; lock.unlock() } }
    var frame: CIImage? { lock.lock(); defer { lock.unlock() }; return _frame }
    var faces: [VNFaceObservation] { lock.lock(); defer { lock.unlock() }; return _faces }

    func start(front: Bool) {
        self.front = front
        q.async { [self] in
            session.beginConfiguration()
            session.sessionPreset = .high
            if let i = input { session.removeInput(i) }
            let dev: AVCaptureDevice? = front
                ? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
                : (AVCaptureDevice.default(.builtInTripleCamera, for: .video, position: .back) ?? AVCaptureDevice.default(.builtInDualWideCamera, for: .video, position: .back)
                   ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back))
            if let d = dev, let i = try? AVCaptureDeviceInput(device: d), session.canAddInput(i) { session.addInput(i); input = i }
            if !session.outputs.contains(video), session.canAddOutput(video) {
                video.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
                video.alwaysDiscardsLateVideoFrames = true
                video.setSampleBufferDelegate(self, queue: q)
                session.addOutput(video)
            }
            if !session.outputs.contains(photo), session.canAddOutput(photo) { session.addOutput(photo); photo.maxPhotoQualityPrioritization = .quality }
            if let c = video.connection(with: .video) {
                if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }   // 竖着的画面
                if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = front }
            }
            // 倍率：虚拟镜头的切换点（0.5× / 1× / 2× / 3×…）
            if let d = input?.device {
                let sw = d.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) }
                baseZoom = (d.deviceType == .builtInTripleCamera || d.deviceType == .builtInDualWideCamera) ? (sw.first ?? 2) : 1
                var z: [Double] = baseZoom > 1 ? [0.5, 1] : [1]
                z += [2, 3].filter { Double(baseZoom) * $0 <= Double(min(d.maxAvailableVideoZoomFactor, 15)) }
                if front { z = [1] }
                zooms = z
                try? d.lockForConfiguration(); d.videoZoomFactor = baseZoom; d.unlockForConfiguration()
            }
            session.commitConfiguration()
            if !session.isRunning { session.startRunning() }
        }
    }
    func stop() { q.async { [self] in session.stopRunning() } }
    func setZoom(_ z: Double) {
        q.async { [self] in
            guard let d = input?.device, (try? d.lockForConfiguration()) != nil else { return }
            d.ramp(toVideoZoomFactor: max(d.minAvailableVideoZoomFactor, min(d.maxAvailableVideoZoomFactor, CGFloat(z) * baseZoom)), withRate: 18)
            d.unlockForConfiguration()
        }
    }

    func captureOutput(_ o: AVCaptureOutput, didOutput sb: CMSampleBuffer, from c: AVCaptureConnection) {
        guard let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        let img = CIImage(cvPixelBuffer: pb)
        frameN += 1
        let p = params
        if (p.slim > 0.01 || p.eye > 0.01 || p.smooth > 0.01) && frameN % 3 == 0 {   // 人脸关键点：隔几帧找一次
            let r = VNDetectFaceLandmarksRequest()
            try? seq.perform([r], on: pb, orientation: .up)
            let fs = (r.results ?? []).filter { $0.confidence > 0.5 }
            lock.lock(); _faces = fs; lock.unlock()
        }
        lock.lock(); _frame = img; lock.unlock()
    }

    func shoot(rotation: Int, done: @escaping (CIImage?) -> Void) {
        q.async { [self] in
            shotDone = done
            let s = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            s.photoQualityPrioritization = .quality
            if let c = photo.connection(with: .video) {
                // 横着拿：照片按世界的方向出来（rotation 是界面要顺时针转几度才正）
                let a: CGFloat = rotation == 90 ? 0 : rotation == -90 ? 180 : 90
                if c.isVideoRotationAngleSupported(a) { c.videoRotationAngle = a }
                if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = front }
            }
            photo.capturePhoto(with: s, delegate: self)
        }
    }
    func photoOutput(_ o: AVCapturePhotoOutput, didFinishProcessingPhoto ph: AVCapturePhoto, error: Error?) {
        let img = ph.fileDataRepresentation().flatMap { CIImage(data: $0, options: [.applyOrientationProperty: true]) }
        let d = shotDone; shotDone = nil
        DispatchQueue.main.async { d?(img) }
    }

    /// 照片上找脸（拍照时按原图找一次，变形和磨皮都更准）
    static func faces(in img: CIImage) -> [VNFaceObservation] {
        let r = VNDetectFaceLandmarksRequest()
        try? VNImageRequestHandler(ciImage: img, options: [:]).perform([r])
        return (r.results ?? []).filter { $0.confidence > 0.5 }
    }
}

/// 取景：每一帧套滤镜，铺满（aspect fill）画到 Metal 视图上
struct CamPreview: UIViewRepresentable {
    let engine: CamEngine
    func makeCoordinator() -> Coord { Coord(engine) }
    func makeUIView(context: Context) -> MTKView {
        let v = MTKView(frame: .zero, device: context.coordinator.dev)
        v.framebufferOnly = false; v.preferredFramesPerSecond = 30; v.colorPixelFormat = .bgra8Unorm
        v.contentMode = .scaleAspectFill; v.delegate = context.coordinator; v.backgroundColor = .black
        return v
    }
    func updateUIView(_ v: MTKView, context: Context) {}
    final class Coord: NSObject, MTKViewDelegate {
        let engine: CamEngine, dev = MTLCreateSystemDefaultDevice()
        lazy var queue = dev?.makeCommandQueue()
        lazy var ctx: CIContext? = dev.map { CIContext(mtlDevice: $0, options: [.cacheIntermediates: false]) }
        init(_ e: CamEngine) { engine = e }
        func mtkView(_ v: MTKView, drawableSizeWillChange size: CGSize) {}
        func draw(in v: MTKView) {
            guard let f = engine.frame, let d = v.currentDrawable, let cb = queue?.makeCommandBuffer(), let ctx else { return }
            let out = CamFX.apply(f, engine.params, faces: engine.faces)
            let ds = v.drawableSize, e = out.extent, k = max(ds.width / e.width, ds.height / e.height)
            let img = out.transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY))
                .transformed(by: CGAffineTransform(scaleX: k, y: k))
                .transformed(by: CGAffineTransform(translationX: (ds.width - e.width * k) / 2, y: (ds.height - e.height * k) / 2))
            ctx.render(img, to: d.texture, commandBuffer: cb, bounds: CGRect(origin: .zero, size: ds), colorSpace: CGColorSpaceCreateDeviceRGB())
            cb.present(d); cb.commit()
        }
    }
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
@MainActor
final class NativeCamModel: ObservableObject {
    static let shared = NativeCamModel()
    @Published var req: CamReq?
    @Published var look = 1
    @Published var tune: [String: Double] = [:]
    @Published var style = "glass"
    @Published var font = "sans"
    @Published var ratio = "full"
    @Published var front = true
    @Published var zoom = 1.0
    @Published var rot = 0
    @Published var adj = false
    @Published var tab = "beauty"
    @Published var cardPos = CGPoint(x: 0.5, y: 0.62)
    @Published var cardScale: CGFloat = 1
    @Published var roll: UIImage?
    @Published var flash = false
    @Published var flying: UIImage?
    @Published var flyDone = false
    @Published var lookFlash = ""
    @Published var lookFlashID = 0
    @Published var busy = false
    let engine = CamEngine()
    private let motion = CMMotionManager()
    var eval: ((String) -> Void)?

    func t(_ s: String) -> String { req?.t[s] ?? s }
    var curLook: CamLook? { req.map { $0.looks[min(look, $0.looks.count - 1)] } }
    var params: CamParams {
        var p = CamParams(curLook?.f ?? [:])
        if (curLook?.id ?? "") == "portrait" || (curLook?.id ?? "") == "clear" { if curLook?.f["slim"] == nil { p.slim = 0.25 }; if curLook?.f["eye"] == nil { p.eye = 0.2 } }   // 人像方案：抖音里最常用的瘦脸 25、大眼 20
        for (k, v) in tune { p[k] = v }
        return p
    }
    func syncParams() { engine.params = params }

    func open(_ json: String) {
        guard let d = json.data(using: .utf8), let r = try? JSONDecoder().decode(CamReq.self, from: d) else { return }
        req = r; tune = [:]; adj = false; tab = "beauty"; ratio = "full"; cardPos = CGPoint(x: 0.5, y: 0.62); cardScale = 1; zoom = 1; front = true
        if let s = r.roll, let u = URL(string: s), let data = try? Data(contentsOf: u) { roll = UIImage(data: data) } else { roll = nil }
        setLook(r.looks.firstIndex { $0.id == "portrait" } ?? 0, quiet: true)
        AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { if ok { self.engine.start(front: true) } } }
        startMotion()
    }
    func close() {
        engine.stop(); motion.stopDeviceMotionUpdates()
        withAnimation(.easeOut(duration: 0.22)) { req = nil }
    }
    func setLook(_ i: Int, quiet: Bool = false) {
        guard let r = req, !r.looks.isEmpty else { return }
        look = (i + r.looks.count) % r.looks.count; tune = [:]
        style = r.looks[look].style; font = r.looks[look].font
        syncParams()
        if !quiet { lookFlash = r.looks[look].name; lookFlashID += 1; UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    }
    func flip() { front.toggle(); zoom = 1; engine.start(front: front) }
    func setZoom(_ z: Double) { zoom = z; engine.setZoom(z); UISelectionFeedbackGenerator().selectionChanged() }

    private func startMotion() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 0.1
        motion.startDeviceMotionUpdates(to: .main) { [weak self] m, _ in
            guard let self, let g = m?.gravity else { return }
            var r = self.rot
            if abs(g.x) > 0.65 && abs(g.x) > abs(g.y) * 1.3 { r = g.x < 0 ? 90 : -90 } else if g.y < -0.65 { r = 0 }
            if r != self.rot { withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { self.rot = r } }
        }
    }

    // ---- 拍照 ----
    /// frame：屏幕上取景框（点）；cardSize：卡片没缩放时的大小（点）
    func shoot(frame: CGRect, cardSize: CGSize) {
        guard !busy, let r = req else { return }
        busy = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        withAnimation(.easeOut(duration: 0.05)) { flash = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { withAnimation(.easeOut(duration: 0.25)) { self.flash = false } }
        let p = params, rot = self.rot, style = self.style, font = self.font, pos = cardPos, cs = cardScale, ratio = self.ratio
        let card = CardContent(head: r.head, num: r.num, unit: r.unit, date: r.date, today: r.today)
        engine.shoot(rotation: rot) { [weak self] raw in
            guard let self else { return }
            guard let raw else { self.busy = false; return }
            Task.detached(priority: .userInitiated) {
                let res = CamShot.make(raw: raw, p: p, rot: rot, frame: frame, ratio: ratio, card: card, style: style, font: font, pos: pos, scale: cs, cardSize: cardSize)
                await MainActor.run { self.deliver(res, id: r.id) }
            }
        }
    }
    private func deliver(_ res: CamShot.Result?, id: String) {
        busy = false
        guard let res else { return }
        flyDone = false
        withAnimation(nil) { flying = res.thumb }
        DispatchQueue.main.async { withAnimation(.timingCurve(0.32, 0.72, 0, 1, duration: 0.52)) { self.flyDone = true } }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) { self.roll = res.thumb; self.flying = nil }
        let meta = "{\"style\":\"\(res.style)\",\"font\":\"\(res.font)\",\"x\":\(res.x),\"y\":\(res.y),\"s\":\(res.s),\"cw\":\(res.w),\"ch\":\(res.h)}"
        eval?("MC.Days&&MC.Days.addShot&&MC.Days.addShot(\(Self.q(id)),'\(res.comp.base64EncodedString())','\(res.base.base64EncodedString())',\(meta))")
    }
    func openRoll() {
        guard let r = req else { return }
        let id = r.id; close()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            self.eval?("(function(){var x=MC.data.days.find(function(d){return d.id===\(Self.q(id))});if(x&&x.photos.length)MC.Days.openViewer(x,0);})()")
        }
    }
    static func q(_ s: String) -> String {
        let d = (try? JSONSerialization.data(withJSONObject: [s])) ?? Data("[\"\"]".utf8)
        return String(String(data: d, encoding: .utf8)!.dropFirst().dropLast())
    }
}

struct CardContent { let head, num, unit, date: String; let today: Bool }

/// 拍好的一张：按原图套滤镜、按画幅裁、放上卡片
enum CamShot {
    struct Result { let comp: Data, base: Data, thumb: UIImage, w: Int, h: Int, x: Double, y: Double, s: Double, style: String, font: String }
    static let ctx = CIContext(options: [.cacheIntermediates: false])

    static func make(raw: CIImage, p: CamParams, rot: Int, frame: CGRect, ratio: String, card: CardContent, style: String, font: String,
                     pos: CGPoint, scale: CGFloat, cardSize: CGSize) -> Result? {
        // 输出的画幅：竖着拿是取景框的比例；横着拿就是它转过来
        var ar = frame.width / frame.height
        if rot != 0 { ar = 1 / ar }
        var img = raw.transformed(by: CGAffineTransform(translationX: -raw.extent.minX, y: -raw.extent.minY))
        let e = img.extent
        var cw = e.width, ch = cw / ar
        if ch > e.height { ch = e.height; cw = ch * ar }
        img = img.cropped(to: CGRect(x: (e.width - cw) / 2, y: (e.height - ch) / 2, width: cw, height: ch))
            .transformed(by: CGAffineTransform(translationX: -(e.width - cw) / 2, y: -(e.height - ch) / 2))
        let maxSide: CGFloat = 2560, k0 = min(1, maxSide / max(cw, ch))
        if k0 < 1 { img = img.transformed(by: CGAffineTransform(scaleX: k0, y: k0)) }
        let faces = CamEngine.faces(in: img)
        let fx = CamFX.apply(img, p, faces: faces)
        guard let baseCG = ctx.createCGImage(fx, from: fx.extent) else { return nil }
        let W = baseCG.width, H = baseCG.height
        // 卡片：屏幕上取景框里的位置 → 输出图里的位置（横拍时跟着转）
        var cx = Double(pos.x), cy = Double(pos.y)
        if rot == 90 { (cx, cy) = (cy, 1 - cx) } else if rot == -90 { (cx, cy) = (1 - cy, cx) }
        let portraitW = Double(rot == 0 ? W : H), f = portraitW / Double(frame.width)
        let k = f * Double(scale)
        let cwPx = Double(cardSize.width) * k, chPx = Double(cardSize.height) * k
        let rect = CGRect(x: cx * Double(W) - cwPx / 2, y: cy * Double(H) - chPx / 2, width: cwPx, height: chPx)
        let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 1; fmt.opaque = true
        let base = UIImage(cgImage: baseCG)
        let comp = UIGraphicsImageRenderer(size: CGSize(width: W, height: H), format: fmt).image { gc in
            base.draw(at: .zero)
            let rad = 26 * k, path = UIBezierPath(roundedRect: rect, cornerRadius: rad)
            switch style {
            case "glass":   // 透明玻璃：画面原样透过来，靠一圈高光边、淡淡的光泽看出是一块玻璃
                gc.cgContext.saveGState(); path.addClip()
                if let sub = baseCG.cropping(to: rect.integral), let lifted = ctx.createCGImage(CIImage(cgImage: sub).applyingFilter("CIColorControls", parameters: ["inputSaturation": 1.15, "inputBrightness": 0.03]), from: CGRect(x: 0, y: 0, width: sub.width, height: sub.height)) {
                    UIImage(cgImage: lifted).draw(in: rect.integral)
                }
                UIColor.white.withAlphaComponent(0.08).setFill(); path.fill()
                gc.cgContext.restoreGState()
                UIColor.white.withAlphaComponent(0.55).setStroke(); path.lineWidth = max(1.5, 1.2 * k); path.stroke()
            case "light": UIColor.white.withAlphaComponent(0.88).setFill(); path.fill()
            case "dark": UIColor(white: 0.05, alpha: 0.58).setFill(); path.fill()
            default: break
            }
            // 文字：用和屏幕上同一个 SwiftUI 卡片画出来，按比例放大
            let txt = ImageRenderer(content: CardText(c: card, style: style, font: font).frame(width: cardSize.width, height: cardSize.height))
            txt.scale = CGFloat(k)
            if let ti = txt.uiImage { ti.draw(in: rect) }
        }
        guard let compData = comp.jpegData(compressionQuality: 0.9), let baseData = base.jpegData(compressionQuality: 0.9) else { return nil }
        let tw: CGFloat = 240, th = tw * CGFloat(H) / CGFloat(W)
        let thumb = UIGraphicsImageRenderer(size: CGSize(width: tw, height: th)).image { _ in comp.draw(in: CGRect(x: 0, y: 0, width: tw, height: th)) }
        return Result(comp: compData, base: baseData, thumb: thumb, w: W, h: H, x: rect.midX / Double(W), y: rect.midY / Double(H), s: k / Double(W), style: style, font: font)
    }
}

// ---------------------------------------------------------------------------
// 界面
// ---------------------------------------------------------------------------
/// 卡片上的字（屏幕上和拍出来的照片用同一份）
struct CardText: View {
    let c: CardContent, style: String, font: String
    var body: some View {
        let ink: Color = style == "light" ? Color(white: 0.09) : .white
        VStack(spacing: 2) {
            Text(c.head).font(f(14, .semibold)).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(c.num).font(f(c.today ? 52 : 66, font == "serif" ? .medium : .heavy)).monospacedDigit().tracking(-1.5)
                if !c.unit.isEmpty { Text(c.unit).font(f(18, .semibold)) }
            }
            Text(c.date).font(f(11.5, .medium)).opacity(0.85)
        }
        .foregroundStyle(ink)
        .shadow(color: style == "light" ? .clear : .black.opacity(style == "clear" ? 0.4 : 0.25), radius: style == "clear" ? 6 : 4, y: 1)
        .padding(.horizontal, 26).padding(.top, 16).padding(.bottom, 14)
        .frame(minWidth: 184)
    }
    private func f(_ s: CGFloat, _ w: Font.Weight) -> Font {
        switch font {
        case "serif": return .system(size: s, weight: w, design: .serif)
        case "round": return .system(size: s, weight: w, design: .rounded)
        case "mono": return .system(size: s, weight: w, design: .monospaced)
        default: return .system(size: s, weight: w)
        }
    }
}

@available(iOS 26.0, *)
struct NativeCamView: View {
    @ObservedObject var m: NativeCamModel
    @State private var frame: CGRect = .zero
    @State private var cardSize: CGSize = CGSize(width: 200, height: 120)
    @State private var drag0: CGPoint?
    @State private var pinch0: CGFloat?
    @State private var flashOn = false

    private static let ratios: [(String, String, CGFloat)] = [("full", "全屏", 0), ("34", "3:4", 3.0 / 4), ("45", "4:5", 4.0 / 5), ("916", "9:16", 9.0 / 16), ("11", "1:1", 1)]

    var body: some View {
        GeometryReader { g in
            let full = CGRect(origin: .zero, size: g.size)
            let fr = viewFrame(full)
            ZStack(alignment: .topLeading) {
                Color.black
                CamPreview(engine: m.engine)
                    .frame(width: fr.width, height: fr.height).clipped()
                    .position(x: fr.midX, y: fr.midY)
                    .gesture(DragGesture(minimumDistance: 30).onEnded { v in   // 左右滑：换方案
                        guard abs(v.translation.width) > 50, abs(v.translation.width) > abs(v.translation.height) * 1.5 else { return }
                        withAnimation(.easeOut(duration: 0.2)) { m.setLook(m.look + (v.translation.width < 0 ? 1 : -1)) }
                    })
                // 方案名：换的时候在中间闪一下
                Text(m.lookFlash).font(.system(size: 26, weight: .bold)).tracking(2).foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.35), radius: 12, y: 2)
                    .rotationEffect(.degrees(Double(m.rot)))
                    .opacity(flashOn ? 1 : 0).scaleEffect(flashOn ? 1 : 0.92)
                    .position(x: fr.midX, y: fr.minY + fr.height * 0.4)
                    .allowsHitTesting(false)
                    .onChange(of: m.lookFlashID) { _, _ in
                        withAnimation(.easeOut(duration: 0.16)) { flashOn = true }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { withAnimation(.easeIn(duration: 0.25)) { flashOn = false } }
                    }
                card(fr)
                if m.flash { Color.white.opacity(0.85).allowsHitTesting(false) }
                controls(g, fr)
                flyer(g, fr)
            }
            .onAppear { frame = fr }
            .onChange(of: fr) { _, v in frame = v }
        }
        .ignoresSafeArea()
        .statusBarHidden(true)
        .onChange(of: m.tune) { _, _ in m.syncParams() }
    }

    private func viewFrame(_ full: CGRect) -> CGRect {
        guard let r = Self.ratios.first(where: { $0.0 == m.ratio }), r.2 > 0 else { return full }
        var w = full.width, h = w / r.2
        if h > full.height { h = full.height; w = h * r.2 }
        return CGRect(x: (full.width - w) / 2, y: max(0, (full.height - h) * 0.4), width: w, height: h)
    }

    // ---- 卡片：拖动、双指缩放 ----
    @ViewBuilder private func card(_ fr: CGRect) -> some View {
        if let r = m.req {
            let c = CardContent(head: r.head, num: r.num, unit: r.unit, date: r.date, today: r.today)
            CardText(c: c, style: m.style, font: m.font)
                .background { cardBg }
                .background(GeometryReader { q in Color.clear.onAppear { cardSize = q.size }.onChange(of: q.size) { _, s in cardSize = s } })
                .scaleEffect(m.cardScale)
                .rotationEffect(.degrees(Double(m.rot)))
                .position(x: fr.minX + m.cardPos.x * fr.width, y: fr.minY + m.cardPos.y * fr.height)
                .gesture(DragGesture().onChanged { v in
                    if drag0 == nil { drag0 = m.cardPos }
                    let p = drag0!
                    m.cardPos = CGPoint(x: max(0.08, min(0.92, p.x + v.translation.width / fr.width)), y: max(0.08, min(0.92, p.y + v.translation.height / fr.height)))
                }.onEnded { _ in drag0 = nil })
                .simultaneousGesture(MagnifyGesture().onChanged { v in
                    if pinch0 == nil { pinch0 = m.cardScale }
                    m.cardScale = max(0.55, min(2.2, pinch0! * v.magnification))
                }.onEnded { _ in pinch0 = nil })
        }
    }
    @ViewBuilder private var cardBg: some View {
        let s = RoundedRectangle(cornerRadius: 26, style: .continuous)
        switch m.style {
        case "glass": Color.clear.glassEffect(.clear, in: s)
        case "light": s.fill(Color.white.opacity(0.88))
        case "dark": s.fill(Color(white: 0.05).opacity(0.58))
        default: Color.clear
        }
    }

    // ---- 按钮：返回 · 调整 · 相册小图 · 快门 · 翻转 · 倍率；横着拿时一起转正 ----
    @ViewBuilder private func controls(_ g: GeometryProxy, _ fr: CGRect) -> some View {
        let top = g.safeAreaInsets.top + 10, bottom = g.safeAreaInsets.bottom
        let rot = Angle.degrees(Double(m.rot))
        VStack(spacing: 0) {
            HStack {
                circle("chevron.left", label: m.t("返回")) { m.close() }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.top, top)
            Spacer()
            VStack(spacing: 12) {
                if m.adj { adjustPanel.transition(.move(edge: .bottom).combined(with: .opacity)) }
                else if let n = m.req?.looks.count, n > 1 {
                    HStack(spacing: 6) { ForEach(0..<n, id: \.self) { i in Capsule().fill(.white.opacity(i == m.look ? 1 : 0.38)).frame(width: i == m.look ? 16 : 5, height: 5) } }
                        .animation(.easeOut(duration: 0.25), value: m.look)
                }
                if m.engine.zooms.count > 1 {
                    HStack(spacing: 4) {
                        ForEach(m.engine.zooms, id: \.self) { z in
                            Button { m.setZoom(z) } label: {
                                Text(z == 0.5 ? ".5×" : "\(Int(z))×").font(.system(size: 12.5, weight: .semibold)).monospacedDigit()
                                    .foregroundStyle(m.zoom == z ? Color.yellow : .white)
                                    .frame(width: m.zoom == z ? 38 : 32, height: m.zoom == z ? 38 : 32)
                                    .glassEffect(.clear.interactive(), in: .circle)
                                    .rotationEffect(rot)
                            }.buttonStyle(.plain)
                        }
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: m.zoom)
                }
                HStack(alignment: .bottom) {
                    Button { m.openRoll() } label: {
                        ZStack {
                            if let r = m.roll { Image(uiImage: r).resizable().scaledToFill() } else { Color.white.opacity(0.08) }
                        }
                        .frame(width: 50, height: 50).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(m.roll == nil ? 0.35 : 0.85), lineWidth: 1.5))
                        .rotationEffect(rot)
                    }
                    .buttonStyle(.plain).accessibilityLabel(Text(m.t("相册")))
                    .background(GeometryReader { q in Color.clear.preference(key: RollKey.self, value: q.frame(in: .global)) })
                    Spacer()
                    Button { m.shoot(frame: fr, cardSize: cardSize) } label: {
                        ZStack {
                            Circle().strokeBorder(.white, lineWidth: 4).frame(width: 74, height: 74)
                            Circle().fill(.white).frame(width: 60, height: 60).scaleEffect(m.busy ? 0.86 : 1)
                        }
                        .animation(.easeOut(duration: 0.12), value: m.busy)
                    }
                    .buttonStyle(.plain).accessibilityLabel(Text(m.t("拍摄")))
                    Spacer()
                    VStack(spacing: 14) {   // 「调整」放在右下、翻转镜头上面（用户定的）
                        circle("slider.horizontal.3", label: m.t("调整"), on: m.adj) { withAnimation(.spring(response: 0.32, dampingFraction: 0.9)) { m.adj.toggle() } }
                        circle("arrow.triangle.2.circlepath", label: m.t("切换镜头"), big: true) { m.flip() }
                    }
                }
                .padding(.horizontal, 22)
            }
            .padding(.horizontal, 16).padding(.bottom, bottom + 14)
        }
        .onPreferenceChange(RollKey.self) { rollRect = $0 }
    }
    @State private var rollRect: CGRect = .zero

    private func circle(_ sf: String, label: String, on: Bool = false, big: Bool = false, act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: sf).font(.system(size: big ? 20 : 18, weight: .semibold))
                .foregroundStyle(on ? Color.black : .white)
                .frame(width: big ? 52 : 46, height: big ? 52 : 46)
                .background { if on { Circle().fill(.white.opacity(0.9)) } }
                .glassEffect(.clear.interactive(), in: .circle)
                .rotationEffect(.degrees(Double(m.rot)))
        }
        .buttonStyle(.plain).accessibilityLabel(Text(label))
    }

    // ---- 「调整」：系统透明液态玻璃 ----
    private var adjustPanel: some View {
        VStack(spacing: 10) {
            HStack(spacing: 4) {
                ForEach([("beauty", "美颜"), ("filter", "滤镜"), ("text", "文字"), ("frame", "画幅")], id: \.0) { k, l in
                    Button { withAnimation(.easeOut(duration: 0.18)) { m.tab = k } } label: {
                        Text(m.t(l)).font(.system(size: 13, weight: .semibold)).foregroundStyle(m.tab == k ? Color.black : .white)
                            .frame(maxWidth: .infinity).frame(height: 30)
                            .background { if m.tab == k { Capsule().fill(.white.opacity(0.9)) } }
                    }.buttonStyle(.plain)
                }
            }
            .padding(3).glassEffect(.clear, in: .capsule)
            Group {
                switch m.tab {
                case "beauty": sliders([("smooth", "磨皮", 0, 1), ("white", "美白", 0, 1), ("rosy", "红润", 0, 1), ("slim", "瘦脸", 0, 1), ("eye", "大眼", 0, 1)])
                case "filter": sliders([("mix", "滤镜强度", 0, 1), ("bright", "亮度", -0.3, 0.3), ("warm", "色温", -0.4, 0.4), ("grain", "颗粒", 0, 0.6)])
                case "text":
                    VStack(spacing: 8) {
                        seg([("glass", "玻璃"), ("clear", "透明"), ("light", "浅色"), ("dark", "深色")], sel: m.style) { m.style = $0 }
                        seg([("sans", "默认"), ("round", "圆体"), ("serif", "衬线"), ("mono", "等宽")], sel: m.font) { m.font = $0 }
                    }
                default: seg(Self.ratios.map { ($0.0, $0.1) }, sel: m.ratio) { v in withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { m.ratio = v } }
                }
            }
            if m.tab == "beauty" || m.tab == "filter" {
                Button(m.t("还原这个方案")) { m.tune = [:]; m.syncParams() }.font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.75))
            }
        }
        .padding(12)
        .glassEffect(.clear, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
    }
    private func sliders(_ rows: [(String, String, Double, Double)]) -> some View {
        VStack(spacing: 4) {
            ForEach(rows, id: \.0) { k, l, lo, hi in
                let v = Binding<Double>(get: { m.params[k] }, set: { m.tune[k] = $0 })
                HStack(spacing: 10) {
                    Text(m.t(l)).font(.system(size: 13)).frame(width: 64, alignment: .leading)
                    Slider(value: v, in: lo...hi).tint(.white)
                    Text("\(Int((lo < 0 ? v.wrappedValue / hi : (v.wrappedValue - lo) / (hi - lo)) * 100))").font(.system(size: 13, weight: .semibold)).monospacedDigit().frame(width: 32, alignment: .trailing)
                }
                .frame(height: 34)
            }
        }
    }
    private func seg(_ items: [(String, String)], sel: String, pick: @escaping (String) -> Void) -> some View {
        HStack(spacing: 4) {
            ForEach(items, id: \.0) { k, l in
                Button { pick(k); UISelectionFeedbackGenerator().selectionChanged() } label: {
                    Text(m.t(l)).font(.system(size: 13, weight: .semibold)).foregroundStyle(sel == k ? Color.black : .white)
                        .frame(maxWidth: .infinity).frame(height: 34)
                        .background { if sel == k { Capsule().fill(.white.opacity(0.9)) } }
                }.buttonStyle(.plain)
            }
        }
        .padding(3).glassEffect(.clear, in: .capsule)
    }

    // ---- 拍好的那一张：缩成小图飞进左下角的相册 ----
    @ViewBuilder private func flyer(_ g: GeometryProxy, _ fr: CGRect) -> some View {
        if let img = m.flying {
            let gfr = g.frame(in: .global)
            let target = CGRect(x: rollRect.minX - gfr.minX, y: rollRect.minY - gfr.minY, width: rollRect.width, height: rollRect.height)
            let r = m.flyDone ? target : fr
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: r.width, height: r.height)
                .clipShape(RoundedRectangle(cornerRadius: m.flyDone ? 12 : 0, style: .continuous))
                .shadow(color: .black.opacity(m.flyDone ? 0 : 0.4), radius: 24, y: 10)
                .position(x: r.midX, y: r.midY)
                .allowsHitTesting(false)
        }
    }
}

private struct RollKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { let n = nextValue(); if n.width > 0 { value = n } }
}
