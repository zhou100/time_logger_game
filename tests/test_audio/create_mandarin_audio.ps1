[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synthesizer.SelectVoice("Microsoft Huihui Desktop")

# Configure audio output format for better quality
$synthesizer.Rate = -5  # Much slower
$synthesizer.Volume = 100  # Maximum volume

$synthesizer.SetOutputToWaveFile("test_recording_mandarin.wav")

# Add some silence at the start
$synthesizer.Speak("<silence msec='1000'/>")

# Chinese text: "I need to create a task to check the documentation at 2pm tomorrow. Also, I have a new idea about user notification features."
$chineseText = @"
我需要创建一个任务，明天下午两点检查文档。另外，我有一个关于用户通知功能的新想法。
"@

$synthesizer.Speak($chineseText)

# Add some silence at the end
$synthesizer.Speak("<silence msec='1000'/>")

$synthesizer.Dispose()

# Move the file to the correct location
Move-Item -Force test_recording_mandarin.wav $PSScriptRoot -ErrorAction SilentlyContinue
