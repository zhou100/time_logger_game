Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synthesizer.GetInstalledVoices() | ForEach-Object {
    $voice = $_.VoiceInfo
    Write-Host "Name: $($voice.Name)"
    Write-Host "Culture: $($voice.Culture)"
    Write-Host "Gender: $($voice.Gender)"
    Write-Host "Age: $($voice.Age)"
    Write-Host "------------------"
}
