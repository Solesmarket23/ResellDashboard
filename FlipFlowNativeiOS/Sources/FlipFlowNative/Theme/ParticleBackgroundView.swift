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
    // We bias smaller bubbles and slow speeds for a calm look.
    var out: [Bubble] = []
    let base: [(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)] = [
      (0.10, 10, 22, 0.3, 14, 0.10),
      (0.18, 16, 18, 1.1, 18, 0.10),
      (0.28, 12, 26, 2.0, 16, 0.09),
      (0.34, 22, 14, 0.7, 20, 0.08),
      (0.42, 14, 20, 1.8, 12, 0.10),
      (0.52, 18, 16, 2.6, 16, 0.09),
      (0.60, 28, 12, 0.9, 22, 0.08),
      (0.68, 12, 24, 1.4, 16, 0.10),
      (0.76, 20, 15, 2.2, 18, 0.09),
      (0.84, 14, 21, 0.5, 14, 0.10),
      (0.92, 24, 13, 1.7, 20, 0.08),
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

    // Add a few extra tiny bubbles for depth
    for j in 0..<12 {
      let x = CGFloat((j * 17) % 100) / 100.0
      let r = CGFloat(7 + (j % 4) * 2)
      let speed = CGFloat(30 - (j % 7) * 2)
      let amp = CGFloat(10 + (j % 5) * 3)
      let phase = CGFloat(j) * 0.8
      let alpha = CGFloat(0.06 + (j % 4 == 0 ? 0.03 : 0.0))
      let tint: Color = (j % 2 == 0) ? NeonTheme.accentCyan : NeonTheme.accentEmerald
      out.append(
        Bubble(x: x, radius: r, speed: speed, phase: phase, amplitude: amp, alpha: alpha, offset: CGFloat(j) * 60, tint: tint)
      )
    }

    return out
  }()

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
      Canvas { context, size in
        let t = timeline.date.timeIntervalSinceReferenceDate

        // Soft blur for “bubbles”
        context.addFilter(.blur(radius: 8))
        context.addFilter(.alphaThreshold(min: 0.02, color: .white))

        for b in bubbles {
          let full = size.height + (b.radius * 2)
          let travel = (CGFloat(t) * b.speed) + b.offset
          let y = full - (travel.truncatingRemainder(dividingBy: full))
          let x = (b.x * size.width) + sin(CGFloat(t) * 0.65 + b.phase) * b.amplitude

          let rect = CGRect(x: x - b.radius, y: y - b.radius, width: b.radius * 2, height: b.radius * 2)

          var p = Path(ellipseIn: rect)
          let gradient = Gradient(colors: [
            b.tint.opacity(b.alpha * 0.95),
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

