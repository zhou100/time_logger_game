Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synthesizer.SetOutputToWaveFile("test_recording.wav")
$synthesizer.Speak("I need to create a task to review the documentation by tomorrow at 2pm. Also, I had a great idea about implementing a new feature for user notifications.")
$synthesizer.Dispose()

# Convert wav to mp3 using ffmpeg if available
if (Get-Command "ffmpeg" -ErrorAction SilentlyContinue) {
    ffmpeg -i test_recording.wav test_recording.mp3
    Remove-Item test_recording.wav
} else {
    Write-Host "ffmpeg not found. Keeping WAV file. Please convert to MP3 manually."
}
