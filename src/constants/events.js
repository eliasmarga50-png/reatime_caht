
export const CLIENT_EVENTS = Object.freeze({
  AUDIO: 'audio',
  VIDEO: 'video',
  USER_TEXT: 'user_text',
  USER_EMOJI: 'user_emoji',
  SESSION_START: 'session_start',
  SESSION_STOP: 'session_stop',
  PING: 'ping',
});

export const SERVER_EVENTS = Object.freeze({
  CONNECTED: 'connected',
  SESSION_READY: 'session_ready',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',

  AUDIO: 'audio',

  INPUT_TRANSCRIPTION: 'input_transcription',
  OUTPUT_TRANSCRIPTION: 'output_transcription',

  VISUAL_CAPTION: 'visual_caption',
  EMOJI_EVENT: 'emoji_event',

  INTERRUPTED: 'interrupted',
  TURN_COMPLETE: 'turn_complete',

  PONG: 'pong',
  ERROR: 'error',
});
