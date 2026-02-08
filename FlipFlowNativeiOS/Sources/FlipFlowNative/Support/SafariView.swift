import SwiftUI
import SafariServices

struct SafariView: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    let vc = SFSafariViewController(url: url)
    vc.dismissButtonStyle = .done
    vc.preferredControlTintColor = UIColor.white
    return vc
  }

  func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

