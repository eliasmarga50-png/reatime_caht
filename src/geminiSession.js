
import { GoogleGenAI, Type } from '@google/genai';

import { env } from './config/env.js';
import { SYSTEM_INSTRUCTION } from './prompts/systemInstruction.js';
import { SERVER_EVENTS } from './constants/events.js';
import { logger } from './utils/logger.js';

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

/* =========================================
   1. TOOL DEFINITIONS
========================================= */

const visualCaptionTool = {
  name: 'emit_visual_caption',

  description:
    'Send a silent, concise visual description to the frontend when a meaningful scene change or relevant visual detail is observed.',

  parameters: {
    type: Type.OBJECT,

    properties: {
      caption: {
        type: Type.STRING,
        description:
          'A short, objective description of the visible scene.',
      },
    },

    required: ['caption'],
  },
};

const detectedEmojiTool = {
  name: 'emit_detected_emoji',

  description:
    'Send a silent emoji event to the frontend when a clear facial expression or gesture is detected.',

  parameters: {
    type: Type.OBJECT,

    properties: {
      emoji: {
        type: Type.STRING,
        description: 'A single emoji representing the expression or gesture.',
      },

      emotion_label: {
        type: Type.STRING,
        description:
          'A short label describing the detected expression or gesture.',
      },

      confidence: {
        type: Type.NUMBER,
        description: 'Confidence value between 0 and 1.',
      },
    },

    required: ['emoji', 'emotion_label', 'confidence'],
  },
};

const tools = [
  {
    functionDeclarations: [
      visualCaptionTool,
      detectedEmojiTool,
    ],
  },
];

/* =========================================
   2. FRONTEND EVENT HELPER
========================================= */

function emit(ws, type, payload = {}) {
  if (ws.readyState !== 1) {
    return;
  }

  try {
    ws.send(
      JSON.stringify({
        type,
        ...payload,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    logger.warn('Failed to emit frontend event:', error.message);
  }
}

/* =========================================
   3. MESSAGE HELPERS
========================================= */

function getAudioPart(part) {
  const data = part?.inlineData?.data;

  if (!data) {
    return null;
  }

  return {
    data,
    mimeType:
      part.inlineData.mimeType ||
      'audio/pcm;rate=24000',
  };
}

function normalizeArgs(args) {
  if (args && typeof args === 'object') {
    return args;
  }

  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }

  return {};
}

function clampConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.max(0, Math.min(1, number));
}

/* =========================================
   4. SESSION CREATION
========================================= */

export async function createGeminiSession(frontendWs) {
  let session = null;
  let closed = false;

  const config = {
    responseModalities: ['AUDIO'],

    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Aoede',
        },
      },
    },

    inputAudioTranscription: {},
    outputAudioTranscription: {},

    systemInstruction: {
      parts: [
        {
          text: SYSTEM_INSTRUCTION,
        },
      ],
    },

    tools,
  };

  session = await ai.live.connect({
    model: env.GEMINI_LIVE_MODEL,
    config,

    callbacks: {
      onopen() {
        logger.info('Gemini Live connected');
      },

      onmessage(message) {
        if (closed) {
          return;
        }

        try {
          processMessage(message);
        } catch (error) {
          logger.error('Failed to process Gemini message:', error);
        }
      },

      onerror(error) {
        logger.error('Gemini Live error:', error);

        emit(frontendWs, SERVER_EVENTS.ERROR, {
          code: 'GEMINI_ERROR',
          message: 'Gemini encountered a session error.',
        });
      },

      onclose(event) {
        logger.warn('Gemini Live connection closed:', event?.reason);

        if (!closed) {
          emit(frontendWs, SERVER_EVENTS.ERROR, {
            code: 'GEMINI_DISCONNECTED',
            message: 'Gemini Live connection closed.',
          });
        }
      },
    },
  });

  emit(frontendWs, SERVER_EVENTS.SESSION_READY, {
    model: env.GEMINI_LIVE_MODEL,
  });

  /* =========================================
     5. PROCESS GEMINI MESSAGES
  ========================================= */

  function processMessage(message) {
    const content = message.serverContent;

    if (content) {
      processServerContent(content);
    }

    if (message.toolCall?.functionCalls?.length) {
      handleToolCalls(message.toolCall);
    }

    if (message.toolCallCancellation?.ids?.length) {
      emit(frontendWs, 'tool_call_cancelled', {
        ids: message.toolCallCancellation.ids,
      });
    }
  }

  /* =========================================
     6. PROCESS SERVER CONTENT
  ========================================= */

  function processServerContent(content) {
    // AI response interrupted
    if (content.interrupted === true) {
      emit(frontendWs, SERVER_EVENTS.INTERRUPTED);
    }

    // Process all parts of the AI model response
    for (const part of content.modelTurn?.parts ?? []) {
      // Generated audio
      const audio = getAudioPart(part);

      if (audio) {
        emit(frontendWs, SERVER_EVENTS.AUDIO, audio);
      }

      // Text parts, if the model emits them
      if (typeof part.text === 'string' && part.text.length > 0) {
        emit(frontendWs, 'text', {
          text: part.text,
        });
      }
    }

    // User audio transcription
    if (content.inputTranscription?.text) {
      emit(frontendWs, SERVER_EVENTS.INPUT_TRANSCRIPTION, {
        text: content.inputTranscription.text,
      });
    }

    // AI audio transcription
    if (content.outputTranscription?.text) {
      emit(frontendWs, SERVER_EVENTS.OUTPUT_TRANSCRIPTION, {
        text: content.outputTranscription.text,
      });
    }

    // AI turn completed
    if (content.turnComplete === true) {
      emit(frontendWs, SERVER_EVENTS.TURN_COMPLETE);
    }
  }

  /* =========================================
     7. FUNCTION CALL HANDLING
  ========================================= */

  function handleToolCalls(toolCall) {
    const functionResponses = [];

    for (const call of toolCall.functionCalls ?? []) {
      const result = executeTool(call);

      functionResponses.push({
        id: call.id,
        name: call.name,
        response: {
          result,
        },
      });
    }

    if (functionResponses.length > 0 && !closed) {
      try {
        session.sendToolResponse({
          functionResponses,
        });
      } catch (error) {
        logger.error('Failed to send tool response:', error);
      }
    }
  }

  /* =========================================
     8. TOOL EXECUTION
  ========================================= */

  function executeTool(call) {
    const args = normalizeArgs(call.args);

    switch (call.name) {
      case 'emit_visual_caption':
        return handleVisualCaption(args);

      case 'emit_detected_emoji':
        return handleDetectedEmoji(args);

      default:
        logger.warn('Unknown Gemini tool:', call.name);

        return {
          success: false,
          error: 'Unknown tool',
        };
    }
  }

  /* =========================================
     9. VISUAL CAPTION
  ========================================= */

  function handleVisualCaption(args) {
    const caption = String(args.caption ?? '').trim();

    if (!caption) {
      return {
        success: false,
        error: 'Caption is empty',
      };
    }

    // Prevent oversized captions
    const safeCaption = caption.slice(0, 500);

    emit(frontendWs, SERVER_EVENTS.VISUAL_CAPTION, {
      caption: safeCaption,
    });

    return {
      success: true,
    };
  }

  /* =========================================
     10. EMOJI / EXPRESSION DETECTION
  ========================================= */

  function handleDetectedEmoji(args) {
    const emoji = String(args.emoji ?? '').trim();
    const emotionLabel = String(args.emotion_label ?? '').trim();
    const confidence = clampConfidence(args.confidence);

    if (!emoji || !emotionLabel || confidence === null) {
      return {
        success: false,
        error: 'Invalid emoji detection arguments',
      };
    }

    emit(frontendWs, SERVER_EVENTS.EMOJI_EVENT, {
      emoji,
      emotion_label: emotionLabel.slice(0, 100),
      confidence,
    });

    return {
      success: true,
    };
  }

  /* =========================================
     11. SESSION METHODS EXPOSED TO SERVER
  ========================================= */

  function assertActive() {
    if (closed || !session) {
      throw new Error('Gemini session is no longer active');
    }
  }

  return {
    // Send microphone audio
    sendAudio(base64Audio) {
      assertActive();

      session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    },

    // Send webcam frame
    sendVideo(base64Jpeg) {
      assertActive();

      session.sendRealtimeInput({
        video: {
          data: base64Jpeg,
          mimeType: 'image/jpeg',
        },
      });
    },

    // Send text
    sendText(text) {
      assertActive();

      session.sendRealtimeInput({
        text,
      });
    },

    // Inject emoji into the ongoing AI conversation
    sendEmoji(emoji) {
      assertActive();

      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: `The user sent the emoji ${emoji}. Interpret its meaning and respond naturally if appropriate.`,
              },
            ],
          },
        ],
        turnComplete: true,
      });
    },

    // Close the Gemini session
    close() {
      if (closed) {
        return;
      }

      closed = true;

      try {
        session?.close();
      } catch (error) {
        logger.warn('Error closing Gemini session:', error.message);
      }

      session = null;
    },
  };
}
