import Foundation

/// Minimal NDJSON logger for Cursor debug mode.
/// Writes to `.cursor/debug.log` inside the repo on the Mac.
enum DebugLog {
  static func write(hypothesisId: String, runId: String, location: String, message: String, data: [String: Any]) {
#if DEBUG
    let payload: [String: Any] = [
      "id": "log_\(Int(Date().timeIntervalSince1970 * 1000))_\(UUID().uuidString.prefix(8))",
      "timestamp": Int(Date().timeIntervalSince1970 * 1000),
      "hypothesisId": hypothesisId,
      "runId": runId,
      "location": location,
      "message": message,
      "data": data,
    ]

    guard JSONSerialization.isValidJSONObject(payload),
          let bytes = try? JSONSerialization.data(withJSONObject: payload, options: []),
          let line = String(data: bytes, encoding: .utf8) else {
      return
    }

    let path = "/Users/mikemilburn/ResellDashboard/.cursor/debug.log"
    if let fh = FileHandle(forWritingAtPath: path) {
      fh.seekToEndOfFile()
      if let data = (line + "\n").data(using: .utf8) { fh.write(data) }
      try? fh.close()
    } else {
      // Create then append.
      try? (line + "\n").write(toFile: path, atomically: true, encoding: .utf8)
    }
#endif
  }
}

