/**
 * Avatar Generation Service
 * Connects to FastAPI backend for photorealistic 3D human generation
 */

import { getApiBase } from "@/services/apiBase";

const AVATAR_API_BASE =
  (import.meta.env.VITE_AVATAR_API_URL as string | undefined)?.replace(/\/$/, "") ||
  `${getApiBase()}/api/v1/avatar`;

/**
 * If a GLB URL is external (e.g. Tripo CDN), route it through the backend proxy
 * to avoid CORS issues when loading in Three.js GLTFLoader.
 */
function toProxiedGlbUrl(url: string): string {
  if (!url.startsWith("http://localhost") && !url.startsWith("https://localhost") && !url.startsWith("/")) {
    return `${AVATAR_API_BASE}/proxy-glb?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export interface AvatarUploadResponse {
  job_id: string;
  user_id: string;
  status: 'queued';
  message: string;
  estimated_time_minutes: number;
}

export interface AvatarStatus {
  job_id: string;
  user_id: string;
  status: 'queued' | 'processing' | 'preprocessing' | 'pose' | 'face' | 'body' | 'texture' | 'blender' | 'uploading' | 'complete' | 'failed';
  progress_percent: number;
  current_stage: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  result?: {
    glb_url: string;
    thumbnail_url?: string;
    file_size_mb: number;
    created_at: string;
  };
}

export interface AvatarResult {
  glb_url: string;
  thumbnail_url?: string;
  created_at: string;
  file_size_mb: number;
  model_quality: string;
  has_rigging: boolean;
  draco_compressed: boolean;
}

/**
 * Upload 1 photo (Tripo flow) or 4 photos (legacy flow)
 * @param photos Array of File objects (either 1 or 4)
 * @returns Job ID for tracking progress
 */
export async function uploadAvatarPhotos(photos: File[]): Promise<string> {
  if (photos.length !== 1 && photos.length !== 4) {
    throw new Error('Please upload either 1 human photo or exactly 4 photos (front, left, right, back)');
  }

  console.log('📤 Uploading avatar photos to backend...', {
    photoCount: photos.length,
    apiBase: AVATAR_API_BASE,
    sizes: photos.map(p => `${(p.size / 1024 / 1024).toFixed(2)} MB`)
  });

  const formData = new FormData();

  if (photos.length === 1) {
    formData.append('photo', photos[0]);
  } else {
    const labels = ['front', 'left', 'right', 'back'];
    photos.forEach((photo, index) => {
      formData.append(labels[index], photo);
    });
  }

  console.log('🌐 Sending POST request to:', `${AVATAR_API_BASE}/upload`);
  
  const response = await fetch(`${AVATAR_API_BASE}/upload`, {
    method: 'POST',
    body: formData,
    // Note: Don't set Content-Type header - browser will set it with boundary
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
      errorMsg = error.detail || error.message || errorMsg;
    } catch (e) {
      errorMsg = `HTTP ${response.status}: ${response.statusText}`;
    }
    console.error('❌ Upload failed:', errorMsg);
    throw new Error(errorMsg);
  }

  const result: AvatarUploadResponse = await response.json();
  console.log('✅ Upload successful:', result);
  
  return result.job_id;
}

/**
 * Check avatar generation status
 * @param jobId Job ID from upload
 * @returns Current status with progress percentage
 */
export async function checkAvatarStatus(jobId: string): Promise<AvatarStatus> {
  console.log(`🔍 Checking status for job: ${jobId}`);
  
  const response = await fetch(`${AVATAR_API_BASE}/status/${jobId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Status check failed');
  }

  const status: AvatarStatus = await response.json();
  console.log('📊 Status:', {
    stage: status.status,
    progress: `${status.progress_percent}%`,
    message: status.current_stage
  });

  return status;
}

/**
 * Get completed avatar GLB file URL
 * @param userId User ID (for now using job_id)
 * @returns Avatar result with download URLs
 */
export async function getAvatarResult(userId: string): Promise<AvatarResult> {
  console.log(`📦 Fetching avatar result for user: ${userId}`);
  
  const response = await fetch(`${AVATAR_API_BASE}/result/${userId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get avatar');
  }

  const result: AvatarResult = await response.json();
  console.log('🎉 Avatar ready:', {
    size: `${result.file_size_mb} MB`,
    quality: result.model_quality,
    hasRigging: result.has_rigging
  });

  return result;
}

/**
 * Generate 3D avatar - All-in-one function
 * Uploads photos and polls for completion with progress updates
 * @param photos Array of 4 File objects
 * @param onProgress Callback for progress updates (0-100)
 * @param onStatusUpdate Callback for status text updates
 * @returns GLB file URL
 */
export async function generateAvatar(
  photos: File[],
  onProgress?: (percent: number) => void,
  onStatusUpdate?: (message: string) => void
): Promise<string> {
  try {
    // Step 1: Upload photos
    onStatusUpdate?.('📤 Uploading photo(s)...');
    onProgress?.(5);
    
    const jobId = await uploadAvatarPhotos(photos);
    
    onStatusUpdate?.(`✅ Photos uploaded! Job ID: ${jobId.substring(0, 8)}...`);
    onProgress?.(10);
    
    // Step 2: Poll for completion with status updates
    return await pollAvatarCompletion(jobId, onProgress, onStatusUpdate);
    
  } catch (error: any) {
    console.error('❌ Avatar generation failed:', error);
    throw new Error(error.message || 'Avatar generation failed');
  }
}

/**
 * Poll for avatar completion with real-time progress
 */
async function pollAvatarCompletion(
  jobId: string,
  onProgress?: (percent: number) => void,
  onStatusUpdate?: (message: string) => void
): Promise<string> {
  const maxAttempts = 180; // 15 minutes max (poll every 5 seconds)
  let attempts = 0;
  
  const stageEmojis: Record<string, string> = {
    queued: '⏳',
    processing: '⚙️',
    preprocessing: '🖼️',
    pose: '🧍',
    face: '😊',
    body: '💪',
    texture: '🎨',
    blender: '🔧',
    uploading: '☁️',
    complete: '✨',
    failed: '❌'
  };

  while (attempts < maxAttempts) {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const status = await checkAvatarStatus(jobId);
      
      // Update progress
      onProgress?.(status.progress_percent);
      
      // Update status message
      const emoji = stageEmojis[status.status] || '🔄';
      onStatusUpdate?.(`${emoji} ${status.current_stage} (${status.progress_percent}%)`);
      
      if (status.status === 'complete') {
        onStatusUpdate?.('🎉 Avatar generation complete!');
        
        // Get the GLB URL directly from status response
        if (status.result && status.result.glb_url) {
          onStatusUpdate?.(`✨ Success! Avatar ready (${status.result.file_size_mb.toFixed(2)} MB)`);
          onProgress?.(100);
          
          // If glb_url is already an absolute URL (e.g. from Tripo CDN), use it directly.
          // Otherwise prepend the API base (local /data/avatars/... path).
          const rawUrl = status.result.glb_url;
          const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${AVATAR_API_BASE.replace('/api/v1/avatar', '')}${rawUrl}`;
          return toProxiedGlbUrl(fullUrl);
        } else {
          // Fallback to separate result endpoint if needed
          const result = await getAvatarResult(jobId);
          onStatusUpdate?.(`✨ Success! Avatar ready (${result.file_size_mb.toFixed(2)} MB)`);
          onProgress?.(100);
          return toProxiedGlbUrl(result.glb_url);
        }
      }
      
      if (status.status === 'failed') {
        const errorMsg = status.error_message || 'Unknown error occurred';
        throw new Error(`Avatar generation failed: ${errorMsg}`);
      }
      
      attempts++;
      
    } catch (error: any) {
      console.error('❌ Poll error:', error);
      throw error;
    }
  }
  
  throw new Error('⏱️ Timeout: Avatar generation took longer than 15 minutes');
}

/**
 * Delete avatar assets for user
 * @param userId User ID
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const response = await fetch(`${AVATAR_API_BASE}/${userId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete avatar');
  }

  console.log('🗑️ Avatar deleted successfully');
}

/**
 * Health check for avatar service
 */
export async function checkAvatarHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${AVATAR_API_BASE}/health`);
    const data = await response.json();
    return data.status === 'healthy';
  } catch (error) {
    console.error('Avatar service health check failed:', error);
    return false;
  }
}
