import pyttsx3
import time

def create_test_audio(text, filename='test_audio.wav'):
    # Initialize the text-to-speech engine
    engine = pyttsx3.init()
    
    # Set properties
    engine.setProperty('rate', 150)    # Speed of speech
    engine.setProperty('volume', 1.0)  # Volume (0.0 to 1.0)
    
    # Save to WAV file
    engine.save_to_file(text, filename)
    
    # Wait for the file to be generated
    engine.runAndWait()
    time.sleep(1)  # Give it a moment to finish writing

if __name__ == '__main__':
    # Create end task audio
    end_text = "I'm done with my physics homework for now."
    create_test_audio(end_text, 'end_task_audio.wav')
    print("Test audio file created: end_task_audio.wav")
