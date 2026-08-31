'use client';

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Send,
  Copy,
  Check,
  Loader2,
  Bot,
  User,
  Trash2,
  Mic,
  Sparkles,
  ImageIcon,
  MessageCircle,
  Paperclip,
  X,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import { API_ENDPOINTS, API_CONFIG, API_BASE_URL, apiFetch, fetchWithTimeout } from '@/lib/api-client';
import {
  FALLBACK_CREATION_LANGUAGES,
  readStoredCreationLanguage,
  speechLangForCode,
  storeCreationLanguage,
  type CreationLanguageOption,
} from '@/lib/creation-languages';
import {
  clearSavedCreationPrompt,
  previewSavedPrompt,
  readSavedCreationPrompt,
  saveCreationPrompt,
  type SavedCreationPrompt,
} from '@/lib/creation-saved-prompts';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import TextSuggestionBar from '@/components/ui/TextSuggestionBar';
import type {
  ChatMessage,
  ChatResponse,
  CreationIntent,
  CreationModelsResponse,
  ImageGenerateResponse,
  VoiceGenerateResponse,
} from '@/lib/types';

const CREATION_MODES: {
  id: CreationIntent;
  label: string;
  icon: typeof ImageIcon;
  description: string;
  placeholder: string;
}[] = [
  {
    id: 'create_image',
    label: 'Create image',
    icon: ImageIcon,
    description: 'Generate a product image in-app — no prompt text shown',
    placeholder:
      'Describe the shot — e.g. Essence mango pickle 330g glass jar, studio packshot, white background, Instagram feed…',
  },
  {
    id: 'create_voice',
    label: 'Create voice',
    icon: Mic,
    description: 'Write a voice-over script — click Generate voice when ready',
    placeholder:
      'Describe the voice-over — e.g. 20s promo for Himalayan pink salt. Pick character and tone in the toolbar.',
  },
  {
    id: 'general_chat',
    label: 'General Chatbot',
    icon: MessageCircle,
    description: 'Normal chatbot — ask anything; models auto-failover on rate limits',
    placeholder: 'Ask anything — questions, ideas, writing help, explanations…',
  },
  {
    id: 'prompt',
    label: 'Write prompt',
    icon: Sparkles,
    description: 'Copy-paste prompt for Meta AI or Google Flow — text only',
    placeholder:
      'Ask for a prompt — product, packaging, platform, mood, image or video…',
  },
];

const IMAGE_PROVIDER_PREF_KEY = 'creation_image_provider';
const VOICE_CHARACTER_PREF_KEY = 'creation_voice_character';
const VOICE_MOOD_PREF_KEY = 'creation_voice_mood';
type ImageProviderChoice = 'cloudflare' | 'gemini';
type VoiceOption = { id: string; label: string };

const FALLBACK_VOICE_CHARACTERS: VoiceOption[] = [
  { id: 'auto', label: 'Auto (from prompt)' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'kid', label: 'Kid / child' },
];

const FALLBACK_VOICE_MOODS: VoiceOption[] = [
  { id: 'auto', label: 'Auto (from prompt)' },
  { id: 'professional', label: 'Professional' },
  { id: 'calm', label: 'Calm & soothing' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'warm', label: 'Warm & friendly' },
  { id: 'promo', label: 'Promo / sales' },
];

function readStoredVoiceOption(key: string, allowed: string[], fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  return raw && allowed.includes(raw) ? raw : fallback;
}

type ChatModelChoice = 'gemini' | 'chatgpt' | 'deepseek' | 'claude';

const CHAT_MODEL_OPTIONS: {
  id: ChatModelChoice;
  label: string;
  /** When true until backend reports this provider as configured. */
  requiresKey: boolean;
}[] = [
  { id: 'gemini', label: 'Gemini', requiresKey: false },
  { id: 'chatgpt', label: 'DeepSeek', requiresKey: true },
  { id: 'deepseek', label: 'ChatGPT', requiresKey: true },
  { id: 'claude', label: 'Claude', requiresKey: true },
];

const LOCKED_CHAT_MODEL_MSG =
  'You need to buy an API key for this model to work.';

const PAID_CHATGPT_MSG =
  'ChatGPT requires a paid API key.';

const GEMINI_PAID_API_MSG =
  'Paid API not connected yet. Switch image provider to Cloudflare to generate images.';

function readStoredImageProvider(): ImageProviderChoice {
  if (typeof window === 'undefined') return 'cloudflare';
  const raw = window.localStorage.getItem(IMAGE_PROVIDER_PREF_KEY);
  return raw === 'gemini' ? 'gemini' : 'cloudflare';
}

const MAX_REFERENCE_IMAGE_BYTES = 25 * 1024 * 1024; // accept large camera photos
const MAX_REFERENCE_IMAGES = 5;
/** Downscale in-browser before upload so huge photos still send reliably. */
const CLIENT_UPLOAD_MAX_EDGE = 2048;
const ALLOWED_REFERENCE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

interface PendingAttachment {
  id: string;
  previewUrl: string;
  base64: string;
  mimeType: string;
  name: string;
}

function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function readImageFile(
  file: File
): Promise<{ base64: string; previewUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const result = reader.result as string;
          const prepared = await prepareReferenceImageForUpload(result, file.type || 'image/jpeg');
          resolve(prepared);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Could not read image'));
        }
      })();
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

/** Accept any pixel size — shrink only for upload; Flux.2 fit happens on the server. */
async function prepareReferenceImageForUpload(
  dataUrl: string,
  mimeType: string
): Promise<{ base64: string; previewUrl: string; mimeType: string }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { base64: stripDataUrlPrefix(dataUrl), previewUrl: dataUrl, mimeType };
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image'));
    el.src = dataUrl;
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) {
    return { base64: stripDataUrlPrefix(dataUrl), previewUrl: dataUrl, mimeType };
  }

  const scale = Math.min(1, CLIENT_UPLOAD_MAX_EDGE / Math.max(w, h));
  if (scale >= 1) {
    return { base64: stripDataUrlPrefix(dataUrl), previewUrl: dataUrl, mimeType };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { base64: stripDataUrlPrefix(dataUrl), previewUrl: dataUrl, mimeType };
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const outMime = mimeType === 'image/png' || mimeType === 'image/webp' ? mimeType : 'image/jpeg';
  const outUrl =
    outMime === 'image/jpeg'
      ? canvas.toDataURL('image/jpeg', 0.92)
      : canvas.toDataURL(outMime);
  return {
    base64: stripDataUrlPrefix(outUrl),
    previewUrl: outUrl,
    mimeType: outMime,
  };
}

function toApiMessages(messages: ExtendedChatMessage[]): ChatMessage[] {
  // Keep full text history for session memory, but only re-send image bytes
  // for the latest attachment turn (keeps payload small while preserving product context).
  let lastImageIndex = -1;
  messages.forEach((m, i) => {
    if ((m.images && m.images.length > 0) || m.image_base64) {
      lastImageIndex = i;
    }
  });

  return messages.map((m, i) => {
    const entry: ChatMessage = { role: m.role, content: m.content };
    const imageCount = m.images?.length
      ? m.images.length
      : m.image_base64
        ? 1
        : 0;

    if (imageCount > 0 && i === lastImageIndex) {
      if (m.images?.length) {
        entry.images = m.images.map((img) => ({
          image_base64: img.image_base64,
          image_mime_type: img.image_mime_type ?? 'image/jpeg',
        }));
      } else if (m.image_base64) {
        entry.image_base64 = m.image_base64;
        entry.image_mime_type = m.image_mime_type ?? 'image/jpeg';
      }
    } else if (imageCount > 0) {
      entry.content = [
        m.content.trim(),
        `[Earlier in this chat the user attached ${imageCount} reference image${
          imageCount === 1 ? '' : 's'
        }. Keep using that product/visual context for follow-ups.]`,
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    return entry;
  });
}

function findLastGeneratedImage(
  messages: ExtendedChatMessage[],
  beforeIndex = messages.length
): { url: string; path: string; prompt: string } | null {
  for (let i = beforeIndex - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const path = msg.generatedImagePath?.trim();
    const url = msg.generatedImageUrl?.trim();
    if (path && url) {
      return { url, path, prompt: msg.content.trim() };
    }
  }
  return null;
}

function buildEditPrompt(userText: string, priorPrompt: string): string {
  const change = userText.trim() || 'Apply a subtle improvement.';
  const prior = priorPrompt.trim();
  const priorLine = prior
    ? `Prior scene: ${prior.slice(0, 500)}${prior.length > 500 ? '…' : ''}`
    : '';
  return [
    'Modify the previous generated image. Keep the same product, branding, packaging, and overall composition unless explicitly asked to change them.',
    priorLine,
    `Requested change: ${change}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Extended message type
// ---------------------------------------------------------------------------

interface ExtendedChatMessage extends ChatMessage {
  generatedImageUrl?: string | null;
  generatedImagePath?: string | null;
  generatedImageProvider?: string | null;
  generatedImageModel?: string | null;
  generatedImageFallbackReason?: string | null;
  generatedAudioUrl?: string | null;
  imageGenerationError?: string | null;
  intent?: CreationIntent;
}

// ---------------------------------------------------------------------------
// Main ChatInterface
// ---------------------------------------------------------------------------

export default function ChatInterface() {
  const [modelLabel, setModelLabel] = useState<string>('Gemini');
  const [chatModel, setChatModel] = useState<ChatModelChoice>('gemini');
  const [openrouterConfigured, setOpenrouterConfigured] = useState(false);
  const [openrouterModelLabel, setOpenrouterModelLabel] = useState('Claude');
  const [chatgptConfigured, setChatgptConfigured] = useState(false);
  const [chatgptModelLabel, setChatgptModelLabel] = useState('DeepSeek');
  const [deepseekConfigured, setDeepseekConfigured] = useState(false);
  const [chatReady, setChatReady] = useState<boolean>(true);
  const [imageReady, setImageReady] = useState<boolean>(false);
  const [imageModelLabel, setImageModelLabel] = useState<string>('');
  const [cloudflareConfigured, setCloudflareConfigured] = useState<boolean>(false);
  const [geminiImageConfigured, setGeminiImageConfigured] = useState<boolean>(false);
  const [imageProvider, setImageProvider] = useState<ImageProviderChoice>(() =>
    readStoredImageProvider()
  );
  const [voiceProviders, setVoiceProviders] = useState<{ id: string; label: string }[]>([
    { id: 'edge', label: 'Gemini' },
    { id: 'fish', label: 'Fish Audio' },
  ]);
  const [voiceProvider, setVoiceProvider] = useState<string>('edge');
  const [voiceCharacters, setVoiceCharacters] = useState<VoiceOption[]>(FALLBACK_VOICE_CHARACTERS);
  const [voiceMoods, setVoiceMoods] = useState<VoiceOption[]>(FALLBACK_VOICE_MOODS);
  const [voiceCharacter, setVoiceCharacter] = useState<string>(() =>
    readStoredVoiceOption(
      VOICE_CHARACTER_PREF_KEY,
      FALLBACK_VOICE_CHARACTERS.map((c) => c.id),
      'female'
    )
  );
  const [voiceMood, setVoiceMood] = useState<string>(() =>
    readStoredVoiceOption(
      VOICE_MOOD_PREF_KEY,
      FALLBACK_VOICE_MOODS.map((m) => m.id),
      'professional'
    )
  );
  const [fishVoiceConfigured, setFishVoiceConfigured] = useState(false);
  const [creationLanguage, setCreationLanguage] = useState<string>(() => readStoredCreationLanguage());
  const [languageOptions, setLanguageOptions] = useState<CreationLanguageOption[]>(
    FALLBACK_CREATION_LANGUAGES
  );
  const [creationIntent, setCreationIntent] = useState<CreationIntent>('create_image');

  const activeMode =
    CREATION_MODES.find((m) => m.id === creationIntent) ?? CREATION_MODES[0];

  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null);
  const [generatingVoiceIndex, setGeneratingVoiceIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [savedPrompt, setSavedPrompt] = useState<SavedCreationPrompt | null>(() =>
    typeof window !== 'undefined' ? readSavedCreationPrompt() : null
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const speechLang = speechLangForCode(languageOptions, creationLanguage);

  const appendFinalTranscript = React.useCallback((text: string) => {
    setInput((prev) => {
      const base = prev.trimEnd();
      const addition = text.trim();
      if (!addition) return prev;
      return base ? `${base} ${addition}` : addition;
    });
  }, []);

  const {
    isListening,
    isSupported: speechSupported,
    toggleListening,
    stopListening: stopSpeechListening,
  } = useSpeechToText({
    lang: speechLang,
    onFinalTranscript: appendFinalTranscript,
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    if (sending && isListening) {
      stopSpeechListening();
    }
  }, [sending, isListening, stopSpeechListening]);

  const refreshCreationCapabilities = React.useCallback(async (): Promise<{
    imageReady: boolean;
    imageModel: string;
    cloudflareConfigured: boolean;
    geminiImageConfigured: boolean;
  }> => {
    try {
      const res = await fetchWithTimeout(API_ENDPOINTS.CREATION_MODELS);
      if (!res.ok) throw new Error('Failed to load models');
      const data: CreationModelsResponse = await res.json();
      setModelLabel(data.models[0]?.label ?? 'Gemini');
      setChatReady(data.chat_ready);
      setOpenrouterConfigured(Boolean(data.openrouter_configured));
      setOpenrouterModelLabel(data.openrouter_model_label || 'Claude');
      setChatgptConfigured(Boolean(data.chatgpt_configured));
      setChatgptModelLabel(data.chatgpt_model_label || 'DeepSeek');
      setDeepseekConfigured(Boolean(data.deepseek_configured));
      const cfReady = Boolean(data.cloudflare_configured);
      const geminiReady = Boolean(data.gemini_image_configured);
      const imageModel = data.image_model ?? '';
      setCloudflareConfigured(cfReady);
      setGeminiImageConfigured(geminiReady);
      const ready = imageProvider === 'cloudflare' ? cfReady : true;
      setImageReady(ready);
      setImageModelLabel(
        imageProvider === 'cloudflare'
          ? cfReady
            ? 'Cloudflare Flux.2'
            : 'Cloudflare (not configured)'
          : geminiReady
            ? imageModel || 'Gemini'
            : 'Gemini (paid API not connected)'
      );
      if (data.voice_providers?.length) {
        setVoiceProviders(data.voice_providers);
      }
      if (data.voice_characters?.length) {
        setVoiceCharacters(data.voice_characters);
      }
      if (data.voice_moods?.length) {
        setVoiceMoods(data.voice_moods);
      }
      setFishVoiceConfigured(Boolean(data.fish_voice_configured));
      if (data.languages?.length) {
        setLanguageOptions(data.languages);
      }
      return {
        imageReady: ready,
        imageModel,
        cloudflareConfigured: cfReady,
        geminiImageConfigured: geminiReady,
      };
    } catch {
      return {
        imageReady: false,
        imageModel: '',
        cloudflareConfigured: false,
        geminiImageConfigured: false,
      };
    }
  }, [imageProvider]);

  const imageNotReadyMessage = (imageModel: string) => {
    const backend = API_CONFIG.baseURL;
    if (imageModel) {
      return `Image API not ready (${imageModel}). Backend: ${backend}`;
    }
    return (
      `Image API not ready on ${backend}. ` +
      'Hard-refresh (Ctrl+Shift+R), confirm Vercel NEXT_PUBLIC_API_URL is ' +
      'https://kafi-social-media-agent-production.up.railway.app, then redeploy Vercel.'
    );
  };

  useEffect(() => {
    void refreshCreationCapabilities().catch(() => {
      toast.error('Could not load AI models. Is the backend running?');
    });
  }, [refreshCreationCapabilities]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async () => {
    const text = input.trim();
    const hasAttachment = pendingAttachments.length > 0;
    if ((!text && !hasAttachment) || sending) return;

    // Create image → Cloudflare only (skip Gemini chat/image). Attachments are
    // sent as Flux.2 reference images with the user's typed prompt.
    if (creationIntent === 'create_image') {
      const caps = await refreshCreationCapabilities();
      if (!caps.cloudflareConfigured) {
        toast.error(
          'Create image needs Cloudflare. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.'
        );
        return;
      }

      const attachmentPayload = pendingAttachments.map((a) => ({
        image_base64: a.base64,
        image_mime_type: a.mimeType,
        image_preview_url: a.previewUrl,
      }));
      const userMsg: ExtendedChatMessage = {
        role: 'user',
        content:
          text ||
          (attachmentPayload.length
            ? 'Generate a commercial product image matching my attached reference photo(s).'
            : 'Generate a commercial product image.'),
        ...(attachmentPayload.length ? { images: attachmentPayload } : {}),
      };
      const assistantMsg: ExtendedChatMessage = {
        role: 'assistant',
        content: userMsg.content,
        intent: 'create_image',
      };
      const nextMessages = [...messages, userMsg, assistantMsg];
      const assistantIndex = nextMessages.length - 1;
      setMessages(nextMessages);
      setInput('');
      setPendingAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImageProvider('cloudflare');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(IMAGE_PROVIDER_PREF_KEY, 'cloudflare');
      }
      const prior = !attachmentPayload.length ? findLastGeneratedImage(messages) : null;
      const promptForGen = prior
        ? buildEditPrompt(userMsg.content, prior.prompt)
        : userMsg.content;
      void runGenerateImage(
        assistantIndex,
        promptForGen,
        userMsg.images,
        prior ? { editMode: true, sourceMediaPath: prior.path } : undefined
      );
      return;
    }

    if (!chatReady) {
      toast.error(
        'Chat is not configured. Add CREATION_GEMINI_API_KEY or OPENROUTER_API_KEY in the backend .env.'
      );
      return;
    }

    if (chatModel === 'deepseek') {
      toast.error(PAID_CHATGPT_MSG);
      return;
    }
    if (chatModel === 'chatgpt' && !chatgptConfigured) {
      toast.error(LOCKED_CHAT_MODEL_MSG);
      return;
    }
    if (chatModel === 'claude' && !openrouterConfigured) {
      toast.error(LOCKED_CHAT_MODEL_MSG);
      return;
    }

    const userMsg: ExtendedChatMessage = {
      role: 'user',
      content:
        text ||
        (pendingAttachments.length > 1
          ? `Analyze all ${pendingAttachments.length} attached reference images carefully. Keep the product packaging, logo, label text, colors, shape, and proportions exactly as shown. Write a detailed marketing prompt that places that same product into the scene I request.`
          : 'Analyze the attached reference image carefully. Keep the product packaging, logo, label text, colors, shape, and proportions exactly as shown. Write a detailed marketing prompt that places that same product into the scene I request.'),
      ...(pendingAttachments.length
        ? {
            images: pendingAttachments.map((a) => ({
              image_base64: a.base64,
              image_mime_type: a.mimeType,
              image_preview_url: a.previewUrl,
            })),
          }
        : {}),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setPendingAttachments([]);
    setSending(true);

    try {
      const res = await apiFetch(API_ENDPOINTS.CREATION_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: '',
          provider: chatModel,
          intent: creationIntent,
          language: creationLanguage,
          messages: toApiMessages(nextMessages),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        const message =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join(' ')
              : 'Chat request failed';
        throw new Error(message || 'Chat request failed');
      }
      const data: ChatResponse = await res.json();
      const assistantMsg: ExtendedChatMessage = {
        role: 'assistant',
        content: data.reply,
        intent: creationIntent,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chat request failed';
      toast.error(msg);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, something went wrong: ${msg}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const startNewChat = () => {
    if (sending) return;
    setMessages([]);
    setPendingAttachments([]);
    setInput('');
    setCopiedIndex(null);
    setGeneratingImageIndex(null);
    setGeneratingVoiceIndex(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.success('Started a new chat — previous memory cleared.');
  };

  useEffect(() => {
    setSavedPrompt(readSavedCreationPrompt());
  }, []);

  const handleSavePrompt = (text: string) => {
    try {
      const entry = saveCreationPrompt(text);
      setSavedPrompt(entry);
      toast.success('Prompt saved (text only) — reuse in Create image or Create voice');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save prompt');
    }
  };

  const handleUseSavedPrompt = () => {
    if (!savedPrompt?.text?.trim()) {
      toast.error('No saved prompt yet — save prompt text from an assistant reply first');
      return;
    }
    setInput(savedPrompt.text);
    toast.success('Loaded saved prompt into the box — send when ready');
  };

  const handleClearSavedPrompt = () => {
    clearSavedCreationPrompt();
    setSavedPrompt(null);
    toast.success('Cleared saved prompt');
  };

  const runGenerateImage = async (
    index: number,
    promptText: string,
    referenceImages?: ChatMessage['images'],
    options?: { editMode?: boolean; sourceMediaPath?: string }
  ) => {
    const refs = (referenceImages || [])
      .filter((img) => Boolean(img?.image_base64?.trim()))
      .slice(0, MAX_REFERENCE_IMAGES)
      .map((img) => ({
        image_base64: img.image_base64,
        image_mime_type: img.image_mime_type || 'image/jpeg',
      }));
    const editMode = Boolean(options?.editMode && options?.sourceMediaPath?.trim());
    const sourceMediaPath = options?.sourceMediaPath?.trim();
    const hasRefs = refs.length > 0 || editMode;

    const caps = await refreshCreationCapabilities();

    // Attachments use Cloudflare Flux.2 (prompt + image bytes). Free Gemini image
    // models often cannot generate — do not block when only Gemini image keys exist.
    if (hasRefs && !caps.cloudflareConfigured) {
      const refMsg =
        'Attached product/logo images need Cloudflare. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then select Images: Cloudflare.';
      toast.error(refMsg);
      setMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, imageGenerationError: refMsg } : m))
      );
      return;
    }

    // Gemini image is a paid path — keep the UI switchable, but block until
    // STUDIO_IMAGE_GEMINI_API_KEY is configured on the backend.
    if (!hasRefs && imageProvider === 'gemini' && !caps.geminiImageConfigured) {
      toast.error(GEMINI_PAID_API_MSG);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index ? { ...m, imageGenerationError: GEMINI_PAID_API_MSG } : m
        )
      );
      return;
    }

    if (!hasRefs && imageProvider === 'cloudflare' && !caps.cloudflareConfigured) {
      const configMsg = imageNotReadyMessage(caps.imageModel || 'Cloudflare Flux.2');
      toast.error(configMsg);
      setMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, imageGenerationError: configMsg } : m))
      );
      return;
    }

    // Always Cloudflare for image generation (Gemini image quota is not used).
    const effectiveProvider = 'cloudflare';

    if (hasRefs) {
      toast(
        editMode
          ? 'Editing your previous image with Cloudflare Flux.2…'
          : 'Generating with Cloudflare from your prompt + attached reference image(s)…'
      );
    }

    setGeneratingImageIndex(index);
    try {
      // Attachments are large base64 payloads — allow a longer timeout.
      const timeoutMs = hasRefs
        ? Math.max(API_CONFIG.timeout, 180_000)
        : API_CONFIG.timeout;
      const res = await apiFetch(API_ENDPOINTS.CREATION_GENERATE_IMAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          provider: effectiveProvider,
          ...(editMode && sourceMediaPath
            ? { edit_mode: true, source_media_path: sourceMediaPath }
            : {}),
          ...(refs.length ? { images: refs } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let detail =
          typeof err.detail === 'string' ? err.detail : 'Image generation failed';
        // Stale backends still return Gemini quota text — make the cause obvious.
        if (/STUDIO_IMAGE_GEMINI|Gemini image quota/i.test(detail)) {
          detail =
            `${detail} — This response is from an OLD API that still uses Gemini for attachments. ` +
            `Your UI is calling: ${API_BASE_URL}. Use localhost:8000 with the latest backend, ` +
            `or wait for Railway to finish deploying, then hard-refresh.`;
        }
        throw new Error(detail);
      }
      const data: ImageGenerateResponse = await res.json();
      if (!data.media_url) {
        throw new Error('Image API returned no media URL');
      }
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index
            ? {
                ...m,
                generatedImageUrl: data.media_url,
                generatedImagePath: data.media_path,
                generatedImageProvider: data.provider || imageProvider,
                generatedImageModel: data.model || null,
                generatedImageFallbackReason: data.fallback_reason || null,
                imageGenerationError: null,
              }
            : m
        )
      );
      if (data.provider === 'gemini') {
        toast.success(
          hasRefs
            ? 'Image generated with product reference (Gemini)'
            : 'Image generated by Gemini'
        );
      } else if (data.provider === 'cloudflare') {
        toast.success(
          editMode
            ? 'Previous image updated (Cloudflare Flux.2)'
            : hasRefs
              ? 'Image generated from your prompt + attachments (Cloudflare Flux.2)'
              : data.fallback_reason
                ? 'Gemini unavailable — image generated by Cloudflare Flux.2'
                : 'Image generated by Cloudflare Flux.2'
        );
      } else if (data.provider === 'modelslab') {
        toast.success('Image generated by ModelsLab');
      } else {
        toast.success('Image generated in-app');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Image generation failed';
      setMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, imageGenerationError: message } : m))
      );
      toast.error(message);
    } finally {
      setGeneratingImageIndex(null);
    }
  };

  const runGenerateVoice = async (index: number, scriptText: string) => {
    if (voiceProvider === 'fish' && !fishVoiceConfigured) {
      toast.error('Fish Audio needs an API key in the backend .env.');
      return;
    }
    setGeneratingVoiceIndex(index);
    try {
      const res = await apiFetch(API_ENDPOINTS.CREATION_GENERATE_VOICE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: scriptText,
          provider: voiceProvider,
          language: creationLanguage,
          character: voiceCharacter,
          mood: voiceMood,
        }),
        signal: AbortSignal.timeout(API_CONFIG.timeout),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : 'Voice generation failed');
      }
      const data: VoiceGenerateResponse = await res.json();
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index ? { ...m, generatedAudioUrl: data.media_url } : m
        )
      );
      const speaker = data.character && data.character !== 'auto' ? data.character : voiceCharacter;
      toast.success(
        `Voice-over generated (${data.provider || voiceProvider}${
          speaker ? `, ${speaker}` : ''
        }${data.mood ? `, ${data.mood}` : ''})`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Voice generation failed');
    } finally {
      setGeneratingVoiceIndex(null);
    }
  };

  const generateImage = async (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== 'assistant') return;
    let refs: ChatMessage['images'] | undefined;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = messages[i];
      if (prev.role === 'user' && prev.images?.length) {
        refs = prev.images;
        break;
      }
      if (prev.role === 'user') break;
    }
    let editOptions: { editMode?: boolean; sourceMediaPath?: string } | undefined;
    if (!refs?.length) {
      const prior = findLastGeneratedImage(messages, index);
      if (prior) {
        editOptions = { editMode: true, sourceMediaPath: prior.path };
      }
    }
    await runGenerateImage(index, msg.content, refs, editOptions);
  };

  const generateVoice = async (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== 'assistant') return;
    let userHint = '';
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = messages[i];
      if (prev.role === 'user') {
        userHint = prev.content || '';
        break;
      }
    }
    const text = userHint ? `User request: ${userHint}\n\n${msg.content}` : msg.content;
    await runGenerateVoice(index, text);
  };

  const copyMessage = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearPendingAttachments = () => {
    setPendingAttachments([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const remainingSlots = MAX_REFERENCE_IMAGES - pendingAttachments.length;
    if (remainingSlots <= 0) {
      toast.error(`You can attach up to ${MAX_REFERENCE_IMAGES} images.`);
      e.target.value = '';
      return;
    }

    const selected = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.error(`Only ${MAX_REFERENCE_IMAGES} images allowed — added the first ${remainingSlots}.`);
    }

    const accepted: PendingAttachment[] = [];
    for (const file of selected) {
      if (!ALLOWED_REFERENCE_IMAGE_TYPES.has(file.type)) {
        toast.error(`${file.name}: use JPEG, PNG, WebP, or GIF.`);
        continue;
      }
      if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
        toast.error(`${file.name}: must be under 25 MB.`);
        continue;
      }
      try {
        const { base64, previewUrl, mimeType } = await readImageFile(file);
        accepted.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          base64,
          previewUrl,
          mimeType,
          name: file.name,
        });
      } catch {
        toast.error(`Could not read ${file.name}.`);
      }
    }

    if (accepted.length) {
      setPendingAttachments((prev) => [...prev, ...accepted].slice(0, MAX_REFERENCE_IMAGES));
    }
    e.target.value = '';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full min-h-0 overflow-hidden dark:bg-slate-800 dark:border-slate-600">
      {/* Toolbar — scrolls horizontally on narrow screens */}
      <div className="flex flex-nowrap items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 border-b border-slate-200 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] shrink-0 dark:border-slate-600">
        <select
          value={chatModel}
          onChange={(e) => {
            const next = e.target.value as ChatModelChoice;
            const unlocked =
              next === 'gemini' ||
              (next === 'claude' && openrouterConfigured) ||
              (next === 'chatgpt' && chatgptConfigured) ||
              (next === 'deepseek' && deepseekConfigured);
            if (!unlocked) {
              toast.error(
                next === 'deepseek' ? PAID_CHATGPT_MSG : LOCKED_CHAT_MODEL_MSG
              );
              e.target.value = chatModel;
              return;
            }
            setChatModel(next);
          }}
          className="shrink-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-brand-800 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
          title="Chat AI model"
        >
          {CHAT_MODEL_OPTIONS.map((m) => {
            const unlocked =
              m.id === 'gemini' ||
              (m.id === 'claude' && openrouterConfigured) ||
              (m.id === 'chatgpt' && chatgptConfigured) ||
              (m.id === 'deepseek' && deepseekConfigured);
            const label =
              m.id === 'gemini'
                ? modelLabel
                : m.id === 'claude'
                  ? openrouterConfigured
                    ? openrouterModelLabel
                    : m.label
                  : m.id === 'chatgpt'
                    ? chatgptConfigured
                      ? chatgptModelLabel
                      : m.label
                    : m.label;
            return (
              <option key={m.id} value={m.id}>
                {label}
                {!unlocked
                  ? m.id === 'deepseek'
                    ? ' (Require Paid Api Key)'
                    : ' (API key required)'
                  : ''}
              </option>
            );
          })}
        </select>
        <select
          value={creationLanguage}
          onChange={(e) => {
            const next = e.target.value;
            setCreationLanguage(next);
            storeCreationLanguage(next);
          }}
          className="shrink-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-brand-800 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
          title="Language for chat replies and voice-over"
        >
          {languageOptions.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <select
          value={imageProvider}
          onChange={(e) => {
            const next = e.target.value === 'gemini' ? 'gemini' : 'cloudflare';
            setImageProvider(next);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(IMAGE_PROVIDER_PREF_KEY, next);
            }
          }}
          className="shrink-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-brand-800 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
          title="Image generation provider"
        >
          <option value="cloudflare">
            Images: Cloudflare{cloudflareConfigured ? '' : ' (setup needed)'}
          </option>
          <option value="gemini">
            Images: Gemini{geminiImageConfigured ? '' : ' (paid API)'}
          </option>
        </select>
        {imageModelLabel ? (
          <span className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1 shrink-0 dark:bg-slate-700/60 dark:text-slate-300">
            {imageProvider === 'gemini' && !geminiImageConfigured
              ? 'Paid API not connected'
              : imageModelLabel}
          </span>
        ) : null}

        <div className="flex-1 min-w-2" />

        {voiceProviders.length > 0 && (
          <select
            value={voiceProvider}
            onChange={(e) => {
              const next = e.target.value;
              if (next === 'fish' && !fishVoiceConfigured) {
                toast.error('Fish Audio needs an API key in the backend .env.');
                e.target.value = voiceProvider;
                return;
              }
              setVoiceProvider(next);
            }}
            className="shrink-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-brand-800 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
            title="Voice-over engine"
          >
            {voiceProviders.map((p) => (
              <option key={p.id} value={p.id}>
                Voice: {p.label}
              </option>
            ))}
          </select>
        )}
        <select
          value={voiceCharacter}
          onChange={(e) => {
            const next = e.target.value;
            setVoiceCharacter(next);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(VOICE_CHARACTER_PREF_KEY, next);
            }
          }}
          className="shrink-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-brand-800 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
          title="Speaker for Generate voice — male, female, or kid"
        >
          {voiceCharacters.map((c) => (
            <option key={c.id} value={c.id}>
              Character: {c.label}
            </option>
          ))}
        </select>
        <select
          value={voiceMood}
          onChange={(e) => {
            const next = e.target.value;
            setVoiceMood(next);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(VOICE_MOOD_PREF_KEY, next);
            }
          }}
          className="shrink-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-brand-800 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
          title="Delivery tone for Generate voice"
        >
          {voiceMoods.map((m) => (
            <option key={m.id} value={m.id}>
              Tone: {m.label}
            </option>
          ))}
        </select>
        {messages.length > 0 && (
          <button
            onClick={startNewChat}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 transition-colors"
            title="End this chat and start fresh (clears conversation memory)"
          >
            <Trash2 className="w-4 h-4" />
            New chat
          </button>
        )}
      </div>

      {savedPrompt ? (
        <div className="mx-3 sm:mx-4 mt-2 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-800/60 dark:bg-emerald-950/30">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <BookmarkCheck className="w-3.5 h-3.5" />
                Saved prompt (text only)
              </p>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-100/70 mt-0.5">
                Reuse in Create image, Create voice, or Write prompt — not images or audio files.
              </p>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-100/80 mt-1 line-clamp-2">
                {previewSavedPrompt(savedPrompt.text)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <button
                type="button"
                onClick={handleUseSavedPrompt}
                className="text-xs font-medium rounded-md px-2.5 py-1 border border-emerald-300 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
              >
                Use saved prompt
              </button>
              <button
                type="button"
                onClick={handleClearSavedPrompt}
                className="text-xs text-emerald-800/80 hover:text-red-700 dark:text-emerald-200/80 dark:hover:text-red-300 px-2 py-1"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Messages — min-h-0 so this flex child can shrink and scroll */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 px-1">
            <Bot className="w-9 h-9 mb-2 text-slate-300" />
            <p className="text-xs sm:text-sm max-w-sm mb-3">
              Pick a mode below, then describe what you need. Chat history stays until you click{' '}
              <strong>New chat</strong>.
            </p>
            {/* Quick-start suggestions */}
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {[
                'Essence mango pickle — studio packshot',
                'Himalayan pink salt — kitchen lifestyle',
                'Garlic paste bottle — white background',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setCreationIntent('create_image');
                    setInput(q);
                  }}
                  className="px-3 py-1.5 rounded-full border border-slate-200 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors dark:border-slate-600 dark:hover:border-brand-500 dark:hover:text-gold-300"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const msgIntent = msg.intent ?? 'prompt';
          const showTextBubble = isUser || msgIntent !== 'create_image';
          return (
            <div key={index} className={`flex gap-2 sm:gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-100 flex items-center justify-center dark:bg-brand-900/60">
                  <Bot className="w-4 h-4 text-brand-700 dark:text-gold-300" />
                </div>
              )}

              <div className={`max-w-[88%] sm:max-w-[75%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                {!isUser && generatingImageIndex === index && (
                  <div className="text-xs text-brand-700 dark:text-gold-300 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating image in-app…
                  </div>
                )}
                {!isUser && generatingVoiceIndex === index && (
                  <div className="text-xs text-brand-700 dark:text-gold-300 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating voice-over…
                  </div>
                )}

                {/* Generated media previews */}
                {!isUser && msg.imageGenerationError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 max-w-sm dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    {msg.imageGenerationError}
                  </div>
                )}
                {!isUser && msg.generatedImageUrl && (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 max-w-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.generatedImageUrl}
                      alt="Generated product visual"
                      className="w-full h-auto object-contain bg-white dark:bg-slate-900"
                      onError={() => {
                        setMessages((prev) =>
                          prev.map((m, i) =>
                            i === index
                              ? {
                                  ...m,
                                  imageGenerationError:
                                    'Image was generated but could not load in the browser. Check Supabase bucket is public or use HTTPS media URLs.',
                                }
                              : m
                          )
                        );
                      }}
                    />
                    <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 dark:bg-slate-900/70 dark:border-slate-600 space-y-1">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        Generated by{' '}
                        {msg.generatedImageProvider === 'cloudflare'
                          ? 'Cloudflare Flux.2'
                          : msg.generatedImageProvider === 'gemini'
                            ? 'Gemini'
                            : msg.generatedImageProvider === 'modelslab'
                              ? 'ModelsLab'
                              : 'AI'}
                      </p>
                      {msg.generatedImageModel ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={msg.generatedImageModel}>
                          Model: {msg.generatedImageModel}
                        </p>
                      ) : null}
                      {msg.generatedImageFallbackReason ? (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          {msg.generatedImageFallbackReason}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
                {!isUser && msg.generatedAudioUrl && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 bg-white dark:bg-slate-900 max-w-sm">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5" />
                      Voice-over
                    </p>
                    <audio controls src={msg.generatedAudioUrl} className="w-full" />
                  </div>
                )}

                {/* Chat bubble */}
                {isUser && (msg.images?.length || msg.image_preview_url) && (
                  <div className="flex flex-wrap gap-2 max-w-md">
                    {(msg.images?.length
                      ? msg.images.map((img, imgIndex) => ({
                          key: `${index}-img-${imgIndex}`,
                          src: img.image_preview_url,
                        }))
                      : [{ key: `${index}-img-0`, src: msg.image_preview_url }]
                    )
                      .filter((item) => Boolean(item.src))
                      .map((item) => (
                        <div
                          key={item.key}
                          className="rounded-xl overflow-hidden border border-brand-200 dark:border-slate-500 w-28"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.src!}
                            alt="Reference attachment"
                            className="w-full h-auto max-h-28 object-cover bg-white dark:bg-slate-900"
                          />
                        </div>
                      ))}
                  </div>
                )}
                {showTextBubble && (
                <div
                  className={`group relative rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? 'bg-brand-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-800 rounded-bl-sm dark:bg-slate-700 dark:text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                  <button
                    onClick={() => copyMessage(msg.content, index)}
                    className={`absolute -bottom-2 ${
                      isUser ? '-left-2' : '-right-2'
                    } opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-slate-200 rounded-full p-1.5 shadow-sm hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-500 dark:hover:bg-slate-600`}
                    title="Copy text"
                  >
                    {copiedIndex === index ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </button>
                </div>
                )}

                {!isUser && msgIntent === 'create_image' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => generateImage(index)}
                      disabled={generatingImageIndex === index || !imageReady}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-slate-500 dark:text-gold-300 dark:hover:bg-slate-700"
                    >
                      {generatingImageIndex === index ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5" />
                      )}
                      {msg.generatedImageUrl ? 'Regenerate image' : 'Generate image'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePrompt(msg.content)}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
                      title="Save this prompt text for reuse (not the image file)"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      Save prompt
                    </button>
                  </div>
                )}
                {!isUser && msgIntent === 'create_voice' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => generateVoice(index)}
                      disabled={generatingVoiceIndex === index}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-slate-500 dark:text-gold-300 dark:hover:bg-slate-700"
                    >
                      {generatingVoiceIndex === index ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Mic className="w-3.5 h-3.5" />
                      )}
                      Generate voice
                    </button>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {voiceCharacters.find((c) => c.id === voiceCharacter)?.label ?? voiceCharacter}
                      {' · '}
                      {voiceMoods.find((m) => m.id === voiceMood)?.label ?? voiceMood}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSavePrompt(msg.content)}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
                      title="Save this script text for reuse (not the audio file)"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      Save prompt
                    </button>
                  </div>
                )}
                {!isUser && msgIntent === 'prompt' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSavePrompt(msg.content)}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
                      title="Save this prompt text for reuse in Create image or Create voice"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      Save prompt
                    </button>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center dark:bg-slate-600">
                  <User className="w-4 h-4 text-slate-600 dark:text-slate-200" />
                </div>
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center dark:bg-brand-900/60">
              <Bot className="w-4 h-4 text-brand-700 dark:text-gold-300" />
            </div>
            <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm inline-flex items-center gap-2 dark:bg-slate-700 dark:text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              {creationIntent === 'create_image'
                ? 'Preparing your image…'
                : creationIntent === 'general_chat'
                  ? 'Replying…'
                  : 'Thinking…'}
            </div>
          </div>
        )}
      </div>

      {/* Composer — kept fully visible so Fix spelling / Improve wording stay clickable */}
      <div className="relative z-10 border-t border-slate-200 dark:border-slate-600 px-3 pt-2 pb-3 sm:px-4 sm:pt-2.5 sm:pb-3 space-y-2 shrink-0 bg-white dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-0.5">
            Mode:
          </span>
          {CREATION_MODES.map((mode) => {
            const Icon = mode.icon;
            const selected = creationIntent === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setCreationIntent(mode.id)}
                title={mode.description}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] sm:text-xs font-medium transition-colors ${
                  selected
                    ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-500/20 dark:border-gold-400 dark:bg-brand-900/50 dark:text-gold-200'
                    : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3 h-3" />
                {mode.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-end gap-1.5 sm:gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={handleImageFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || isListening || pendingAttachments.length >= MAX_REFERENCE_IMAGES}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 hover:text-brand-700 disabled:opacity-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-700"
            title={`Attach up to ${MAX_REFERENCE_IMAGES} reference images — any size up to 25 MB (${pendingAttachments.length}/${MAX_REFERENCE_IMAGES})`}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!speechSupported) {
                toast.error(
                  'Voice typing needs Chrome or Edge. Type your prompt or use another browser.'
                );
                return;
              }
              toggleListening();
            }}
            disabled={sending}
            className={`inline-flex shrink-0 items-center justify-center rounded-lg border p-2 transition-colors disabled:opacity-50 ${
              isListening
                ? 'border-red-400 bg-red-50 text-red-600 animate-pulse dark:border-red-500 dark:bg-red-950/40 dark:text-red-400'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-brand-700 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
            title={
              isListening
                ? 'Stop voice typing'
                : 'Speak your prompt — text appears in the box (Chrome / Edge)'
            }
          >
            <Mic className="w-4 h-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? 'Listening… speak your prompt, then click the mic to stop.'
                : pendingAttachments.length
                  ? 'Add optional details about what to create from these references…'
                  : activeMode.placeholder
            }
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm max-h-28 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100 dark:placeholder-slate-400"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={sending || (!input.trim() && !pendingAttachments.length)}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium rounded-lg px-3 sm:px-4 py-2 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            {creationIntent === 'create_image' && !pendingAttachments.length ? 'Create' : 'Send'}
          </button>
        </div>

        <TextSuggestionBar
          value={input}
          onApply={setInput}
          context="chat"
          language={creationLanguage}
          disabled={sending || isListening}
          className="pointer-events-auto"
        />

        {pendingAttachments.length > 0 && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/80 px-3 py-2 dark:border-slate-500 dark:bg-slate-700/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Reference images ({pendingAttachments.length}/{MAX_REFERENCE_IMAGES})
              </p>
              <button
                type="button"
                onClick={clearPendingAttachments}
                className="text-xs text-slate-500 hover:text-red-600 dark:text-slate-400"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative group rounded-md overflow-hidden border border-slate-200 dark:border-slate-500"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="h-14 w-14 object-cover bg-white dark:bg-slate-900"
                    title={attachment.name}
                  />
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(attachment.id)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-90 hover:bg-red-600"
                    title={`Remove ${attachment.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {isListening && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Voice typing active — click the mic again to stop.
          </p>
        )}
      </div>
    </div>
  );
}
