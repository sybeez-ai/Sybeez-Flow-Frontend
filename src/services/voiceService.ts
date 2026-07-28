/**
 * Voice Service for Sybeez Flow
 * Handles voice recording, streaming to backend, and playing responses
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export class VoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  /**
   * Check if browser supports voice features
   */
  static isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && MediaRecorder);
  }

  /**
   * Request microphone permission
   */
  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      return false;
    }
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    try {
      this.audioChunks = [];
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw new Error('Failed to access microphone');
    }
  }

  /**
   * Stop recording and return audio blob
   */
  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.onerror = (error) => {
        this.cleanup();
        reject(error);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Convert audio blob to WAV format (if needed)
   */
  private async convertToWav(blob: Blob): Promise<Blob> {
    // For now, return the blob as-is
    // Backend supports webm/opus format
    return blob;
  }

  /**
   * Send audio to backend and get response
   */
  async sendAudioToBackend(audioBlob: Blob): Promise<Blob> {
    try {
      console.log('📤 Sending audio to backend:', audioBlob.size, 'bytes');
      
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const response = await fetch(`${BACKEND_URL}/voice`, {
        method: 'POST',
        body: formData,
        mode: 'cors',
      });

      console.log('📥 Backend response status:', response.status, response.statusText);
      console.log('📥 Response headers:', {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Backend error response:', error);
        throw new Error(`Backend error (${response.status}): ${error}`);
      }

      const responseBlob = await response.blob();
      console.log('✅ Received audio response:', responseBlob.size, 'bytes, type:', responseBlob.type);
      
      // Ensure blob has correct type
      if (!responseBlob.type || responseBlob.type === 'application/octet-stream') {
        console.warn('⚠️ Blob type not set, forcing to audio/wav');
        return new Blob([responseBlob], { type: 'audio/wav' });
      }
      
      return responseBlob;
    } catch (error) {
      console.error('❌ Failed to send audio to backend:', error);
      throw error;
    }
  }

  /**
   * Play audio response
   */
  async playAudio(audioBlob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔊 Playing audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
      
      // Ensure blob has correct MIME type
      const correctBlob = audioBlob.type.includes('audio') 
        ? audioBlob 
        : new Blob([audioBlob], { type: 'audio/wav' });
      
      const audioUrl = URL.createObjectURL(correctBlob);
      const audio = new Audio(audioUrl);

      audio.onloadedmetadata = () => {
        console.log('✅ Audio loaded, duration:', audio.duration, 'seconds');
      };

      audio.onended = () => {
        console.log('✅ Audio playback finished');
        URL.revokeObjectURL(audioUrl);
        resolve();
      };

      audio.onerror = (error) => {
        console.error('❌ Audio playback error:', error);
        console.error('❌ Audio element error details:', {
          error: audio.error?.message,
          code: audio.error?.code,
          src: audio.src
        });
        URL.revokeObjectURL(audioUrl);
        reject(new Error(`Failed to play audio: ${audio.error?.message || 'Unknown error'}`));
      };

      console.log('🎯 Starting audio playback...');
      audio.play()
        .then(() => {
          console.log('▶️ Audio started playing successfully');
        })
        .catch((playError) => {
          console.error('❌ Audio play() promise rejected:', playError);
          URL.revokeObjectURL(audioUrl);
          reject(new Error(`Play failed: ${playError.message}`));
        });
    });
  }

  /**
   * Complete voice interaction: Record → Send → Play Response
   */
  async handleVoiceInteraction(
    onStart?: () => void,
    onProcessing?: () => void,
    onPlaying?: () => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      // Start recording
      if (onStart) onStart();
      await this.startRecording();

      // Wait for user to finish speaking (you can add voice activity detection here)
      // For now, we'll rely on manual stop

    } catch (error) {
      if (onError) onError(error as Error);
      throw error;
    }
  }

  /**
   * Process recorded audio
   */
  async processRecording(
    onProcessing?: () => void,
    onPlaying?: () => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      // Stop recording
      const audioBlob = await this.stopRecording();

      // Send to backend
      if (onProcessing) onProcessing();
      const responseBlob = await this.sendAudioToBackend(audioBlob);

      // Play response
      if (onPlaying) onPlaying();
      await this.playAudio(responseBlob);

      // Complete
      if (onComplete) onComplete();
    } catch (error) {
      if (onError) onError(error as Error);
      throw error;
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  /**
   * Get the current media stream (for silence detection)
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }

  /**
   * Cancel current recording
   */
  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
    this.audioChunks = [];
  }
}

// Create singleton instance
export const voiceService = new VoiceService();
