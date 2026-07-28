# 🎤 Voice Mode Integration Guide

## Overview

Your Fashion AI Assistant now has a fully functional voice mode that connects the frontend microphone button to the backend voice pipeline (Whisper STT → Mistral LLM → Coqui TTS).

## 🎯 What's Been Integrated

### Frontend Changes

1. **New Voice Service** ([src/services/voiceService.ts](src/services/voiceService.ts))
   - Handles microphone recording
   - Sends audio to backend `/voice` endpoint
   - Plays back AI audio responses
   - Full error handling and state management

2. **Updated FashionAIChatbot** ([src/components/FashionAIChatbot.tsx](src/components/FashionAIChatbot.tsx))
   - Real voice recording (replaces mock/simulation)
   - Visual feedback during recording/processing/playback
   - Auto-stop after 10 seconds
   - Permission handling

3. **Environment Configuration**
   - `.env.local` - Backend URL configuration
   - `.env.example` - Template for deployment

### Backend Integration

The voice button now connects to:
```
Frontend Mic → Backend /voice → Whisper (STT) → Mistral (LLM) → Coqui (TTS) → Frontend Speaker
```

## 🚀 Quick Start

### 1. Start Backend Server

```bash
cd fastapibackend

# Wait for dependencies to finish installing (check terminal)
# Once complete, start the server:
uvicorn app.main:app --reload --port 8000
```

**Expected Output**:
```
INFO:     Loading Whisper model: medium
INFO:     Whisper model loaded successfully
INFO:     Loading Coqui TTS model: tts_models/multilingual/multi-dataset/xtts_v2
INFO:     Coqui TTS model loaded successfully
INFO:     HuggingFace Mistral-7B client initialized
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 2. Configure HuggingFace API Key

Before starting the backend, add your API key:

```bash
cd fastapibackend
nano .env

# Add this line:
HF_API_KEY=hf_your_token_here

# Get token from: https://huggingface.co/settings/tokens
```

### 3. Start Frontend

```bash
cd frontend
npm run dev
```

The frontend will run on: http://localhost:5173

### 4. Test Voice Mode

1. Open the app: http://localhost:5173
2. Click the **microphone button** in the chat input
3. Grant microphone permission (if prompted)
4. Speak your question (e.g., "What should I wear today?")
5. Click the mic button again to stop recording
6. Wait for AI processing (~5-10 seconds)
7. Listen to the AI voice response

## 🎨 User Experience Flow

### Recording State
- **Before**: Gray microphone icon
- **Recording**: Red pulsing microphone + "🎤 Listening... Speak now!" toast
- **Processing**: "Processing your voice..." → "🤖 AI is thinking..." toasts
- **Playing**: "🔊 Playing response..." toast with audio playback
- **Complete**: "✅ Voice interaction complete!" toast

### Visual Feedback
```
1. Click Mic → Button turns RED + pulses
2. Speak → "🎤 Listening..." notification
3. Click Mic again → Recording stops
4. Processing → "🤖 AI is thinking..." notification
5. Response → "🔊 Playing response..." + audio plays
6. Done → "✅ Complete!" notification
```

## 🔧 Configuration

### Backend URL

Edit `frontend/.env.local`:
```env
VITE_BACKEND_URL=http://localhost:8000
```

For production:
```env
VITE_BACKEND_URL=https://your-backend.render.com
```

### Voice Settings

The voice service uses optimal settings:
- **Sample Rate**: 16kHz (matches Whisper requirements)
- **Channels**: Mono (1 channel)
- **Echo Cancellation**: Enabled
- **Noise Suppression**: Enabled
- **Auto-stop**: 10 seconds max recording

### Backend Settings

Edit `fastapibackend/.env`:
```env
# Faster STT (optional)
WHISPER_MODEL=base  # Default: medium

# Shorter responses (optional)
LLM_MAX_TOKENS=128  # Default: 256
```

## 🧪 Testing

### Test 1: Health Check

```bash
curl http://localhost:8000/health
```

**Expected**:
```json
{
  "status": "healthy",
  "llm_available": true,
  "stt_available": true,
  "tts_available": true
}
```

### Test 2: Voice Endpoint (Command Line)

```bash
# Record audio
rec -r 16000 -c 1 test.wav
# Press Ctrl+C after speaking

# Send to backend
curl -X POST http://localhost:8000/voice \
  -F "file=@test.wav" \
  --output response.wav

# Play response
afplay response.wav  # macOS
# or
aplay response.wav   # Linux
```

### Test 3: Frontend Voice Button

1. Open browser console (F12)
2. Click microphone button
3. Check for console logs:
   ```
   ✓ Microphone access granted
   ✓ Recording started
   ✓ Audio sent to backend
   ✓ Response received
   ✓ Playing audio
   ```

## 🐛 Troubleshooting

### Issue: "Voice recording is not supported in your browser"

**Solution**: Use a modern browser (Chrome, Edge, Safari, Firefox)

---

### Issue: "Failed to access microphone"

**Solutions**:
1. Grant microphone permission in browser settings
2. Check if another app is using the microphone
3. Try HTTPS (some browsers require secure context)

---

### Issue: "Backend error" or no response

**Check**:
1. Backend server is running: `curl http://localhost:8000/ping`
2. CORS is configured: Check `ALLOWED_ORIGINS` in `.env`
3. HF_API_KEY is set in backend `.env`

```bash
# Check backend logs
cd fastapibackend
uvicorn app.main:app --reload --port 8000
# Watch for errors in terminal
```

---

### Issue: Audio plays but no sound

**Solutions**:
1. Check browser volume
2. Check system volume
3. Try headphones
4. Check browser audio permissions

---

### Issue: Long processing time (>30 seconds)

**Causes**:
- First request (models loading): 15-20 seconds
- Slow internet (HuggingFace API)
- Large audio file

**Solutions**:
1. Wait for first request to complete (models cache after)
2. Use smaller Whisper model: `WHISPER_MODEL=base`
3. Reduce max tokens: `LLM_MAX_TOKENS=128`

---

### Issue: "Network error" in console

**Check Backend URL**:
```bash
# Verify frontend .env.local
cat frontend/.env.local

# Should show:
VITE_BACKEND_URL=http://localhost:8000

# Test connection
curl http://localhost:8000/ping
```

## 📊 Performance

### Expected Response Times

| Phase | Time | Note |
|-------|------|------|
| Recording | 0-10s | User speaks |
| Upload | <1s | Send audio to backend |
| STT (Whisper) | 1-3s | Transcribe speech |
| LLM (Mistral) | 2-5s | Generate response |
| TTS (Coqui) | 1-2s | Synthesize speech |
| Download | <1s | Receive audio |
| **Total** | **5-12s** | End-to-end |

### First Request (Cold Start)
- Model loading: +10-15s
- Total: 15-30s
- **Subsequent requests**: 5-12s

## 🎛️ Advanced Features

### Custom Recording Duration

Edit `voiceService.ts`:
```typescript
// Change auto-stop timeout (default: 10000ms = 10s)
setTimeout(() => {
  if (voiceService.isRecording()) {
    handleVoiceStop();
  }
}, 5000);  // 5 seconds
```

### Voice Activity Detection

Add silence detection to auto-stop when user stops speaking (future enhancement).

### Multi-language Support

Backend supports multiple languages. Whisper auto-detects language.

## 🔐 Security Considerations

### Production Checklist

- [ ] Use HTTPS (required for microphone access)
- [ ] Set proper CORS origins in backend `.env`:
  ```env
  ALLOWED_ORIGINS=https://your-frontend-domain.com
  ```
- [ ] Add rate limiting to backend
- [ ] Validate audio file size/duration
- [ ] Implement authentication (optional)

## 📚 Additional Resources

- **Backend Documentation**: [fastapibackend/README_VOICE.md](../fastapibackend/README_VOICE.md)
- **Migration Summary**: [fastapibackend/MIGRATION_SUMMARY.md](../fastapibackend/MIGRATION_SUMMARY.md)
- **API Docs** (after starting backend): http://localhost:8000/docs

## 🎉 Success Indicators

Your voice mode is working correctly when:

1. ✅ Microphone button turns red when clicked
2. ✅ "🎤 Listening..." notification appears
3. ✅ Recording stops when clicking mic again
4. ✅ "Processing..." and "AI is thinking..." notifications show
5. ✅ Audio response plays automatically
6. ✅ "Complete!" notification appears after playback

---

**Questions?** Check the backend [README_VOICE.md](../fastapibackend/README_VOICE.md) or open an issue!
