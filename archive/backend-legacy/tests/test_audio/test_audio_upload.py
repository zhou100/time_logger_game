import os
import wave
import logging
import requests

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_wav_info(filename):
    """Get WAV file information"""
    with wave.open(filename, 'rb') as wav:
        return {
            'channels': wav.getnchannels(),
            'sample_width': wav.getsampwidth(),
            'frame_rate': wav.getframerate(),
            'n_frames': wav.getnframes(),
            'comp_type': wav.getcomptype(),
            'comp_name': wav.getcompname()
        }

def main():
    # File to upload
    file_path = os.path.join('tests', 'fixtures', 'audio', 'test.wav')
    
    # Get file size
    file_size = os.path.getsize(file_path)
    logger.info(f"Uploading file: {file_path}")
    logger.info(f"File size: {file_size} bytes")
    
    # Get file content type
    content_type = 'audio/wav'
    logger.info(f"Content type: {content_type}")
    
    # Get WAV file info
    wav_info = get_wav_info(file_path)
    logger.info("WAV file details:")
    logger.info(f"Number of channels: {wav_info['channels']}")
    logger.info(f"Sample width: {wav_info['sample_width']} bytes")
    logger.info(f"Frame rate: {wav_info['frame_rate']} Hz")
    logger.info(f"Number of frames: {wav_info['n_frames']}")
    logger.info(f"Compression type: {wav_info['comp_type']}")
    logger.info(f"Compression name: {wav_info['comp_name']}")
    
    # Open file and send POST request
    with open(file_path, 'rb') as f:
        logger.info("Sending POST request...")
        files = {'file': (os.path.basename(file_path), f, content_type)}
        response = requests.post('http://localhost:8000/api/audio/upload', files=files)
        
        # Log response details
        logger.info(f"Response status code: {response.status_code}")
        logger.info(f"Response content: {response.text}")
        
        if response.status_code == 200:
            logger.info("Upload successful!")
        else:
            logger.error("Upload failed!")

if __name__ == '__main__':
    main()
