#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

// 菜单栏拖动气泡下面的「水滴透镜」：胶囊形区域里，中间放大，越靠近边缘折射越强（边缘扭曲），
// 红、绿、蓝三色分开采样，边缘出现一点彩色的色散。系统的液态玻璃不能透过另一块玻璃折射内容，所以图标的折射在这里做。
// center / size：气泡的中心和大小（视图坐标）；strength：0 = 没有效果，1 = 完全
[[ stitchable ]] half4 glassLens(float2 pos, SwiftUI::Layer layer, float2 center, float2 size, float strength) {
    if (strength <= 0.001) return layer.sample(pos);
    float2 hs = size * 0.5;
    float r = max(1.0, hs.y);                                   // 胶囊两头的半径
    float2 d = pos - center;
    float2 q = abs(d) - float2(max(0.0, hs.x - r), 0.0);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; // 到胶囊边的距离（里面是负的）
    if (sd > 0.0) return layer.sample(pos);
    float t = clamp(1.0 + sd / r, 0.0, 1.0);                     // 0 = 中间，1 = 边上
    // 只在靠外的一圈起作用：中间几乎不变（轻微放大），越靠边往里收得越多，像水滴边缘那样扭曲
    float edge = smoothstep(0.5, 1.0, t);
    float k = 1.0 / (1.0 + 0.1 * strength) - edge * edge * 0.24 * strength;
    float2 base = center + d * k;
    // 色散：中间只有一点点（不是完全没有），越靠边三色错开得越多
    float2 n = normalize(d + float2(0.0001, 0.0001));
    float disp = (0.15 + 1.9 * edge * edge) * strength;
    half4 cr = layer.sample(base + n * disp);
    half4 cg = layer.sample(base);
    half4 cb = layer.sample(base - n * disp);
    return half4(cr.r, cg.g, cb.b, max(cg.a, max(cr.a, cb.a)));
}
