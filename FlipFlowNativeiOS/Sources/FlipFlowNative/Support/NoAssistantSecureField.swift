import SwiftUI
import UIKit

/// A UIKit-backed secure text field that disables the input assistant / autofill UI,
/// which can cause multi-second stalls on some iOS 18 builds when focusing SwiftUI `SecureField`.
struct NoAssistantSecureField: UIViewRepresentable {
  final class Coordinator: NSObject, UITextFieldDelegate {
    var parent: NoAssistantSecureField
    var didRequestFirstResponder: Bool = false

    init(parent: NoAssistantSecureField) {
      self.parent = parent
    }

    @objc func editingChanged(_ textField: UITextField) {
      parent.text = textField.text ?? ""
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

    return tf
  }

  func updateUIView(_ uiView: UITextField, context: Context) {
    if uiView.text != text {
      uiView.text = text
    }

    if isFirstResponder {
      if !context.coordinator.didRequestFirstResponder, !uiView.isFirstResponder {
        context.coordinator.didRequestFirstResponder = true
        DispatchQueue.main.async {
          uiView.becomeFirstResponder()
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

