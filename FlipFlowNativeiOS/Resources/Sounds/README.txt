Scan success sound
==================

1. Add your 2-second scan-success audio file here.

   Name the file exactly:   scan_success.wav   (or  scan_success.m4a  or  scan_success.mp3)

2. Include it in the app:
   • Open the project in Xcode.
   • Drag scan_success.wav from this folder into the Xcode project navigator (under Resources or Sounds).
   • In the dialog, check "Copy items if needed" and the FlipFlowNative target, then Finish.

   Or from the project root run:  xcodegen  (so the project picks up new files under Resources).

3. The app plays this when a scan succeeds (e.g. Verify item). If the file is missing, it uses the system sound.
