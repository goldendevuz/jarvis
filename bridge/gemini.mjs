/**
 * Free speech through the official Gemini API (key from aistudio.google.com/apikey).
 *
 * Hearing: audio goes to Gemini with an explicit "transcribe, in this language"
 * instruction plus a vocabulary hint — far better at Uzbek than the browser's
 * recogniser. Speaking: Gemini's neural voices (Kore is female). Both sit behind
 * the same /stt and /tts endpoints the ElevenLabs path already uses.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiKey = () => process.env.GEMINI_API_KEY?.trim() || ''

const STT_MODELS = (process.env.JARVIS_GEMINI_STT_MODELS ?? 'gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest')
  .split(',').map((s) => s.trim()).filter(Boolean)
const TTS_MODELS = (
  process.env.JARVIS_GEMINI_TTS_MODELS ?? 'gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts'
).split(',').map((s) => s.trim()).filter(Boolean)
const VOICE = process.env.JARVIS_GEMINI_VOICE?.trim() || 'Kore'

const cool = new Map() // model -> don't retry before this time (limit hit / not found)

async function call(model, body, timeoutMs) {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': geminiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const code = res.status
    if (code === 429 || code === 404 || code === 503) cool.set(model, Date.now() + (code === 404 ? 86400e3 : code === 503 ? 60e3 : 15 * 60e3))
    throw new Error(`gemini ${model} HTTP ${code}`)
  }
  return res.json()
}

async function firstOf(models, body, timeoutMs) {
  let last
  for (const m of models) {
    if ((cool.get(m) ?? 0) > Date.now()) continue
    try {
      return await call(m, body, timeoutMs)
    } catch (e) {
      last = e
    }
  }
  throw last ?? new Error('gemini models busy')
}

/** @returns {Promise<string>} the words, or '' for silence */
export async function transcribe(audio, mime, language, vocab) {
  const prompt =
    `Bu audio yozuvni so'zma-so'z matnga aylantir. Asosiy til: ${language}. ` +
    `Faqat eshitilgan so'zlarni qaytar: izoh, tarjima yoki qo'shtirnoq qo'shma. ` +
    `Nutq bo'lmasa — hech narsa yozma. Eshitilmagan so'zni to'qima. ` +
    `Sonlarni raqam bilan yoz. Bu ovozli yordamchiga buyruq yoki savol; yordamchining ismi «Jarvis». ` +
    `Uchrashi mumkin bo'lgan so'zlar: Jarvis, ${vocab}.`
  const data = await firstOf(STT_MODELS, {
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inline_data: { mime_type: mime, data: audio.toString('base64') } },
    ] }],
    generationConfig: { temperature: 0 },
  }, 15000)
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(' ').replace(/\s+/g, ' ')
    .trim().replace(/^["«»“”]+|["«»“”]+$/g, '')
}

/** @returns {Promise<Buffer>} a WAV file */
export async function speak(text) {
  const data = await firstOf(TTS_MODELS, {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  }, 15000)
  const part = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData ?? p.inline_data)
  const inline = part?.inlineData ?? part?.inline_data
  if (!inline?.data) throw new Error('gemini returned no audio')
  const pcm = Buffer.from(inline.data, 'base64')
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? inline.mime_type ?? '')?.[1] ?? 24000)
  // Wrap raw 16-bit mono PCM in a WAV header so any browser can play it.
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
