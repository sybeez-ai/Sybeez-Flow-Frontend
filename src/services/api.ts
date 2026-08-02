import { getApiBase } from "@/services/apiBase";

const API_BASE = getApiBase();

export interface JobStatus {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  modelKey?: string;
  errorMessage?: string;
}

export interface ModelResponse {
  jobId: string;
  modelUrl: string;
  format: string;
  expiresIn: number;
}

/**
 * Upload 4 photos and start 3D generation
 */
export async function upload3DPhotos(photos: File[]): Promise<string> {
  if (photos.length !== 4) {
    throw new Error('Please provide exactly 4 photos (front, back, left, right)');
  }

  console.log('📤 Starting photo upload...', {
    photoCount: photos.length,
    apiBase: API_BASE
  });

  // Convert photos to base64
  const images = await Promise.all(
    photos.map(photo => convertToBase64(photo))
  );

  console.log('✅ Photos converted to base64', {
    imageSizes: images.map(img => img.length)
  });

  // Upload to backend
  console.log('🌐 Sending POST request to:', `${API_BASE}/upload-photos`);
  
  const response = await fetch(`${API_BASE}/upload-photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      images,
      userId: 'user-' + Date.now() // Replace with actual user ID
    })
  });

  console.log('📥 Response received:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok
  });

  if (!response.ok) {
    let errorMsg = 'Upload failed';
    try {
      const error = await response.json();
      errorMsg = error.error || error.message || errorMsg;
    } catch (e) {
      errorMsg = `HTTP ${response.status}: ${response.statusText}`;
    }
    console.error('❌ Upload failed:', errorMsg);
    throw new Error(errorMsg);
  }

  const result = await response.json();
  console.log('✅ Upload successful:', result);
  return result.jobId;
}

/**
 * Check job status
 */
export async function checkJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${API_BASE}/status/${jobId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Status check failed');
  }

  return response.json();
}

/**
 * Get 3D model download URL
 */
export async function get3DModel(jobId: string): Promise<ModelResponse> {
  const response = await fetch(`${API_BASE}/model/${jobId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get model');
  }

  return response.json();
}

/**
 * Generate 3D avatar (all-in-one function)
 */
export async function generate3DAvatar(photos: File[]): Promise<string> {
  // 1. Upload photos
  const jobId = await upload3DPhotos(photos);

  // 2. Poll for completion
  return pollForCompletion(jobId);
}

/**
 * Poll for job completion
 */
async function pollForCompletion(jobId: string): Promise<string> {
  const maxAttempts = 60; // 2 minutes max
  let attempts = 0;

  console.log('⏳ Starting to poll for job completion:', jobId);

  while (attempts < maxAttempts) {
    try {
      console.log(`🔄 Poll attempt ${attempts + 1}/${maxAttempts}...`);
      const status = await checkJobStatus(jobId);
      console.log('📊 Job status:', status);

      if (status.status === 'completed') {
        console.log('✅ Job completed! Fetching model URL...');
        // Get model URL
        const model = await get3DModel(jobId);
        console.log('🎉 Model URL retrieved:', model.modelUrl);
        return model.modelUrl;
      } else if (status.status === 'failed') {
        console.error('❌ Job failed:', status.errorMessage);
        throw new Error(status.errorMessage || '3D generation failed');
      }

      console.log(`⏸️ Still processing... waiting 2 seconds (attempt ${attempts + 1})`);
      // Still processing, wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;

    } catch (error) {
      console.error('❌ Poll error:', error);
      throw error;
    }
  }

  console.error('⏱️ Timeout: Max polling attempts reached');

  throw new Error('Timeout: 3D generation took too long');
}

/**
 * Convert File to base64
 */
function convertToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Load 3D model in Three.js viewer
 * Returns the model URL for use with GLTFLoader
 */
export async function load3DModelInViewer(modelUrl: string): Promise<string> {
  // Simply return the URL - the Model3DViewer component will handle loading
  return modelUrl;
}
