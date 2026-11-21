
# Gemini Live Relay

A lightweight Node.js WebSocket backend connecting a browser frontend
to Google's Gemini Live API.

## Features

- Realtime bidirectional voice streaming
- 16 kHz PCM microphone input
- 24 kHz PCM generated audio output
- Input and output speech transcription
- Realtime JPEG webcam streaming
- Visual scene captions
- Facial expression and gesture emoji detection
- Frontend emoji injection
- Gemini function calling
- WebSocket session cleanup
- Video frame throttling
- HTTP health check

## Requirements

- Node.js >= 20.6
- npm
- Google AI Studio API key with access to a compatible Live model

## Installation

Clone the project and enter the directory:

```bash
cd gemini-live-relay
```

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and provide your Gemini API key.

## Run

```bash
npm start
```

Development mode:

```bash
npm run dev
```

## Health Check

Open:

http://localhost:4000/health

Expected response:

```json
{
  "status": "ok",
  "service": "gemini-live-relay",
  "timestamp": "2026-11-21T00:00:00.000Z"
}
```

## WebSocket

Connect the frontend to:

```text
ws://localhost:4000
```

Each frontend WebSocket connection receives its own Gemini Live session.

## Client Message Examples

### Audio

```json
{
  "type": "audio",
  "data": "BASE64_PCM_AUDIO"
}
```

Format:

- PCM 16-bit little-endian
- 16,000 Hz
- Mono
- Base64 encoded

### Video

```json
{
  "type": "video",
  "data": "BASE64_JPEG_FRAME"
}
```

Format:

- JPEG
- Base64 encoded
- Maximum 1 frame per second by default

### Text

```json
{
  "type": "user_text",
  "text": "What do you think about this?"
}
```

### Emoji

```json
{
  "type": "user_emoji",
  "emoji": "🔥"
}
```

### Ping

```json
{
  "type": "ping"
}
```

## Server Events

| Event | Description |
|---|---|
| connected | Frontend connected |
| session_ready | Gemini session is ready |
| session_started | Session initialized |
| audio | AI audio output chunk |
| input_transcription | User speech transcription |
| output_transcription | AI speech transcription |
| visual_caption | Gemini visual caption |
| emoji_event | Detected facial expression or gesture |
| interrupted | AI output interrupted |
| turn_complete | Gemini finished its turn |
| pong | Ping response |
| error | Error event |

## Audio Playback

Gemini output audio is PCM.

The frontend should:

1. Decode base64.
2. Convert PCM data to an audio buffer.
3. Queue chunks in order.
4. Play chunks continuously.
5. Clear the queue when `interrupted` arrives.

## Video

Capture webcam frames as JPEG and convert them to Base64.

The backend forwards frames to Gemini, subject to frame throttling.

## Security

- Keep the Gemini API key in `.env`.
- Never expose the API key in frontend code.
- Do not commit `.env`.
- Do not log raw audio or video.
- Validate incoming payloads.
- Limit message sizes.
- Restrict allowed origins before deployment.

## Important

This backend is designed for development and hackathon testing.
Before public deployment, implement:

- User authentication
- Per-user connection limits
- Abuse prevention
- Production origin restrictions
- API quota protection
- Better session lifecycle monitoring
- Reverse proxy and secure WebSocket support (WSS)

## License

Private hackathon project.
