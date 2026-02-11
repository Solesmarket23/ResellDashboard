import Foundation
import AVFoundation
import AudioToolbox

enum ScanSounds {
  private static let successSystemSoundId: SystemSoundID = 1057
  private static var successPlayer: AVAudioPlayer?

  /// Play the scan-success sound. Uses custom scan_success.wav (or .m4a/.mp3) from the app bundle if present; otherwise system sound 1057.
  static func playSuccess() {
    for ext in ["wav", "m4a", "mp3"] {
      guard let url = Bundle.main.url(forResource: "scan_success", withExtension: ext) else { continue }
      guard let player = try? AVAudioPlayer(contentsOf: url) else { continue }
      successPlayer = player
      player.prepareToPlay()
      if player.play() { return }
    }
    successPlayer = nil
    AudioServicesPlaySystemSound(successSystemSoundId)
  }
}
