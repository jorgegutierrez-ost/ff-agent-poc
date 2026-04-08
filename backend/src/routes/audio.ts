import { Router } from 'express';
import multer from 'multer';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Lazy-init so env vars are available (dotenv runs before routes are hit, but after module load)
let _client: ElevenLabsClient | null = null;
function getClient(): ElevenLabsClient {
  if (!_client) {
    _client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return _client;
}

// ─── Speech-to-Text ──────────────────────────────────────────

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
      return;
    }

    const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype });

    const result = await getClient().speechToText.convert({
      file: audioBlob,
      modelId: 'scribe_v1',
      languageCode: 'en',
    });

    res.json({ text: result.text, language: result.languageCode });
  } catch (err) {
    console.error('[audio/transcribe] Error:', err);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

// ─── Text-to-Speech ──────────────────────────────────────────

router.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Missing text field' });
      return;
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('[audio/tts] ELEVENLABS_API_KEY not set');
      res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
      return;
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL';

    console.log(`[audio/tts] Generating speech for ${text.length} chars, voice=${voiceId}`);

    const audioStream = await getClient().textToSpeech.stream(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    if (audioStream instanceof Readable) {
      audioStream.pipe(res);
    } else {
      for await (const chunk of audioStream) {
        res.write(chunk);
      }
      res.end();
    }
  } catch (err) {
    // Log the full error so we can see what ElevenLabs returns
    console.error('[audio/tts] Error:', err);
    if (!res.headersSent) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'Text-to-speech failed', details: msg });
    }
  }
});

export default router;
