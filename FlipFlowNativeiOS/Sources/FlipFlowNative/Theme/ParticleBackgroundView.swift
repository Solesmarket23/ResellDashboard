import SwiftUI

/// Subtle animated “bubble” background (Neon-style).
/// Uses Canvas + TimelineView for smooth, low-cost animation.
struct ParticleBackgroundView: View {
  struct Bubble: Identifiable {
    let id = UUID()
    let x: CGFloat        // 0...1
    let radius: CGFloat   // points
    let speed: CGFloat    // points/sec
    let phase: CGFloat
    let amplitude: CGFloat
    let alpha: CGFloat
    let offset: CGFloat
    let tint: Color
  }

  private let bubbles: [Bubble] = {
    // Deterministic-ish bubbles (no RNG dependency on runtime state).
    // We bias smaller bubbles and slow speeds for a calm, non-intrusive look.
    var out: [Bubble] = []
    let base: [(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)] = [
      // x, radius, speed, phase, amplitude, alpha
      (0.12, 10, 10, 0.3, 10, 0.06),
      (0.22, 14, 9,  1.1, 12, 0.05),
      (0.33, 12, 11, 2.0, 10, 0.05),
      (0.46, 16, 8,  0.7, 14, 0.045),
      (0.58, 12, 10, 1.8, 10, 0.05),
      (0.70, 18, 7,  2.6, 16, 0.04),
      (0.82, 12, 9,  0.5, 10, 0.05),
    ]

    for (i, b) in base.enumerated() {
      let tint: Color = (i % 3 == 0) ? NeonTheme.accentCyan : NeonTheme.accentEmerald
      out.append(
        Bubble(
          x: b.0,
          radius: b.1,
          speed: b.2,
          phase: b.3,
          amplitude: b.4,
          alpha: b.5,
          offset: CGFloat(i) * 90,
          tint: tint
        )
      )
    }

    // Add a few extra tiny bubbles for depth (keep count low).
    for j in 0..<6 {
      let x = CGFloat((j * 17) % 100) / 100.0
      let r = CGFloat(6 + (j % 3) * 2)
      let speed = CGFloat(12 - (j % 5)) // slower drift
      let amp = CGFloat(8 + (j % 4) * 2)
      let phase = CGFloat(j) * 0.8
      let alpha = CGFloat(0.035 + (j % 3 == 0 ? 0.01 : 0.0))
      // Slightly cooler/less saturated to avoid distraction.
      let tint: Color = (j % 2 == 0) ? NeonTheme.accentCyan.opacity(0.85) : NeonTheme.accentEmerald.opacity(0.75)
      out.append(
        Bubble(x: x, radius: r, speed: speed, phase: phase, amplitude: amp, alpha: alpha, offset: CGFloat(j) * 60, tint: tint)
      )
    }

    return out
  }()

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 45.0)) { timeline in
      Canvas { context, size in
        let t = timeline.date.timeIntervalSinceReferenceDate

        // Soft blur for “bubbles”
        // NOTE: alphaThreshold can cause shimmering/flicker on device; avoid it.
        context.addFilter(.blur(radius: 10))
        context.blendMode = .plusLighter

        for b in bubbles {
          let full = size.height + (b.radius * 2)
          let travel = (CGFloat(t) * b.speed) + b.offset
          let y = full - (travel.truncatingRemainder(dividingBy: full))
          let x = (b.x * size.width) + sin(CGFloat(t) * 0.65 + b.phase) * b.amplitude

          let rect = CGRect(x: x - b.radius, y: y - b.radius, width: b.radius * 2, height: b.radius * 2)

          var p = Path(ellipseIn: rect)
          let gradient = Gradient(colors: [
            b.tint.opacity(b.alpha),
            b.tint.opacity(0.0),
          ])
          context.fill(p, with: .radialGradient(gradient, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: b.radius * 1.35))
        }
      }
      .ignoresSafeArea()
      .accessibilityHidden(true)
    }
    .allowsHitTesting(false)
  }
}

