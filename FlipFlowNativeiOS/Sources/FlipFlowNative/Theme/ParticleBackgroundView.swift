import SwiftUI

/// Subtle animated “bubble” background (Neon-style).
/// Uses Canvas + TimelineView for smooth, low-cost animation.
struct ParticleBackgroundView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let animated: Bool

  init(animated: Bool = true) {
    self.animated = animated
  }

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
      (0.14, 8,  7.0, 0.3, 7,  0.030),
      (0.26, 10, 6.5, 1.1, 8,  0.028),
      (0.38, 9,  7.2, 2.0, 7,  0.028),
      (0.52, 11, 6.0, 0.7, 9,  0.024),
      (0.66, 9,  6.8, 1.8, 7,  0.028),
      (0.78, 12, 5.5, 2.6, 10, 0.022),
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

    // Add a few extra tiny bubbles for depth (very subtle).
    for j in 0..<4 {
      let x = CGFloat((j * 17) % 100) / 100.0
      let r = CGFloat(5 + (j % 2) * 2)
      let speed = CGFloat(7 - (j % 3)) // slow drift
      let amp = CGFloat(6 + (j % 3) * 2)
      let phase = CGFloat(j) * 0.8
      let alpha = CGFloat(0.020 + (j % 3 == 0 ? 0.006 : 0.0))
      // Slightly cooler/less saturated to avoid distraction.
      let tint: Color = (j % 2 == 0) ? NeonTheme.accentCyan.opacity(0.85) : NeonTheme.accentEmerald.opacity(0.75)
      out.append(
        Bubble(x: x, radius: r, speed: speed, phase: phase, amplitude: amp, alpha: alpha, offset: CGFloat(j) * 60, tint: tint)
      )
    }

    return out
  }()

  var body: some View {
    Group {
      if animated && !reduceMotion {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0)) { timeline in
          bubbleCanvas(t: timeline.date.timeIntervalSinceReferenceDate)
        }
      } else {
        // Static frame (login screen): keeps the look without the 20fps Canvas updates.
        bubbleCanvas(t: 0)
      }
    }
    .allowsHitTesting(false)
  }

  @ViewBuilder
  private func bubbleCanvas(t: TimeInterval) -> some View {
    Canvas { context, size in
      // Keep this extremely light: no heavy filters/blend-modes to avoid UI jank.
      for b in bubbles {
        let full = size.height + (b.radius * 2)
        let travel = (CGFloat(t) * b.speed) + b.offset
        let y = full - (travel.truncatingRemainder(dividingBy: full))
        let x = (b.x * size.width) + sin(CGFloat(t) * 0.55 + b.phase) * b.amplitude

        let rect = CGRect(x: x - b.radius, y: y - b.radius, width: b.radius * 2, height: b.radius * 2)
        let p = Path(ellipseIn: rect)

        // Soft “bubble” edge via radial gradient (no blur filter).
        let gradient = Gradient(colors: [
          b.tint.opacity(b.alpha),
          b.tint.opacity(0.0),
        ])
        context.fill(p, with: .radialGradient(gradient, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: b.radius * 1.8))
      }
    }
    .ignoresSafeArea()
    .accessibilityHidden(true)
  }
}

