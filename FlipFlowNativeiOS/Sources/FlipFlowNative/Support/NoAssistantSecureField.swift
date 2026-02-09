import SwiftUI
import UIKit

// #region agent log helper (runs off main thread to avoid login lag)
private func agentPostLog(_ location: String, _ message: String, runId: String, hypothesisId: String, data: [String: String] = [:]) {
  let dataCopy = data
  DispatchQueue.global(qos: .utility).async {
    guard let url = URL(string: "http://127.0.0.1:7242/ingest/80c2e612-47e3-4f28-8d98-15f80c4fae0e") else { return }
    let payload: [String: Any] = [
      "location": location,
      "message": message,
      "runId": runId,
      "hypothesisId": hypothesisId,
      "data": dataCopy,
      "timestamp": Int(Date().timeIntervalSince1970 * 1000),
    ]
    if let line = try? String(data: JSONSerialization.data(withJSONObject: payload), encoding: .utf8) {
      print("AGENTLOG \(line)")
    }
    #if targetEnvironment(simulator)
      guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
      var req = URLRequest(url: url)
      req.httpMethod = "POST"
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.httpBody = body
      URLSession.shared.dataTask(with: req).resume()
    #endif
  }
}
// #endregion

/// A UIKit-backed secure text field that disables the input assistant / autofill UI,
/// which can cause multi-second stalls on some iOS 18 builds when focusing SwiftUI `SecureField`.
struct NoAssistantSecureField: UIViewRepresentable {
  final class Coordinator: NSObject, UITextFieldDelegate {
    var parent: NoAssistantSecureField
    var didRequestFirstResponder: Bool = false
    var requestedFirstResponderAtUptime: TimeInterval = 0

    init(parent: NoAssistantSecureField) {
      self.parent = parent
    }

    @objc func editingChanged(_ textField: UITextField) {
      parent.text = textField.text ?? ""
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
      // Keep the SwiftUI binding in sync with user-initiated focus so we don't immediately resign.
      if !parent.isFirstResponder {
        parent.isFirstResponder = true
      }
      // #region agent log B3
      agentPostLog(
        "Support/NoAssistantSecureField.swift:Coordinator.textFieldDidBeginEditing",
        "did begin editing",
        runId: "login-inline-pre",
        hypothesisId: "H3",
        data: [
          "len": String((textField.text ?? "").count),
        ]
      )
      // #endregion
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
      if parent.isFirstResponder {
        parent.isFirstResponder = false
      }
      // #region agent log B4
      agentPostLog(
        "Support/NoAssistantSecureField.swift:Coordinator.textFieldDidEndEditing",
        "did end editing",
        runId: "login-inline-pre",
        hypothesisId: "H3",
        data: [
          "len": String((textField.text ?? "").count),
        ]
      )
      // #endregion
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
      parent.onSubmit?()
      return true
    }
  }

  let placeholder: String
  @Binding var text: String
  @Binding var isFirstResponder: Bool
  var onSubmit: (() -> Void)? = nil

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  func makeUIView(context: Context) -> UITextField {
    let tf = UITextField(frame: .zero)
    tf.placeholder = placeholder
    tf.isSecureTextEntry = true
    tf.autocorrectionType = .no
    tf.spellCheckingType = .no
    tf.autocapitalizationType = .none
    tf.keyboardType = .asciiCapable
    tf.returnKeyType = .go
    tf.enablesReturnKeyAutomatically = true

    // Disable password/autofill UI.
    tf.textContentType = nil

    // Hide the system input assistant bar (QuickType buttons).
    tf.inputAssistantItem.leadingBarButtonGroups = []
    tf.inputAssistantItem.trailingBarButtonGroups = []

    tf.delegate = context.coordinator
    tf.addTarget(context.coordinator, action: #selector(Coordinator.editingChanged(_:)), for: .editingChanged)
    tf.text = text
    tf.setContentHuggingPriority(.required, for: .vertical)
    tf.setContentCompressionResistancePriority(.required, for: .vertical)

    // #region agent log B0
    agentPostLog(
      "Support/NoAssistantSecureField.swift:makeUIView",
      "makeUIView created UITextField",
      runId: "login-lag-pre",
      hypothesisId: "H1",
      data: [
        "ptr": String(format: "%p", unsafeBitCast(tf, to: Int.self)),
      ]
    )
    // #endregion

    return tf
  }

  func updateUIView(_ uiView: UITextField, context: Context) {
    if uiView.text != text {
      uiView.text = text
    }

    if isFirstResponder {
      if !context.coordinator.didRequestFirstResponder, !uiView.isFirstResponder {
        context.coordinator.didRequestFirstResponder = true
        context.coordinator.requestedFirstResponderAtUptime = ProcessInfo.processInfo.systemUptime
        // #region agent log B1
        agentPostLog(
          "Support/NoAssistantSecureField.swift:updateUIView",
          "request becomeFirstResponder",
          runId: "login-lag-pre",
          hypothesisId: "H1",
          data: [
            "ptr": String(format: "%p", unsafeBitCast(uiView, to: Int.self)),
            "isFirstResponder_binding": String(isFirstResponder),
            "isFirstResponder_actual": String(uiView.isFirstResponder),
            "hasWindow": String(uiView.window != nil),
          ]
        )
        // #endregion
        // Prefer immediate focus once the field is in a window. Falling back to async if needed.
        if uiView.window != nil {
          uiView.becomeFirstResponder()
          // #region agent log B2
          let deltaMs = Int((ProcessInfo.processInfo.systemUptime - context.coordinator.requestedFirstResponderAtUptime) * 1000)
          agentPostLog(
            "Support/NoAssistantSecureField.swift:updateUIView.immediate(becomeFirstResponder)",
            "did call becomeFirstResponder",
            runId: "login-lag-pre",
            hypothesisId: "H3",
            data: [
              "ptr": String(format: "%p", unsafeBitCast(uiView, to: Int.self)),
              "deltaMsFromRequest": String(deltaMs),
              "isFirstResponder_actual_after": String(uiView.isFirstResponder),
            ]
          )
          // #endregion
        } else {
          DispatchQueue.main.async {
            uiView.becomeFirstResponder()
            // #region agent log B2
            let deltaMs = Int((ProcessInfo.processInfo.systemUptime - context.coordinator.requestedFirstResponderAtUptime) * 1000)
            agentPostLog(
              "Support/NoAssistantSecureField.swift:updateUIView.async(becomeFirstResponder)",
              "did call becomeFirstResponder",
              runId: "login-lag-pre",
              hypothesisId: "H3",
              data: [
                "ptr": String(format: "%p", unsafeBitCast(uiView, to: Int.self)),
                "deltaMsFromRequest": String(deltaMs),
                "isFirstResponder_actual_after": String(uiView.isFirstResponder),
              ]
            )
            // #endregion
          }
        }
      }
    } else {
      context.coordinator.didRequestFirstResponder = false
      if uiView.isFirstResponder {
        uiView.resignFirstResponder()
      }
    }
  }
}

