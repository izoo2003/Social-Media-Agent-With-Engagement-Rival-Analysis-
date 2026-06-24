'use client';

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Send,
  Video,
  Copy,
  Check,
  Loader2,
  Bot,
  User,
  Trash2,
  Package,
  Tag,
  Box,
  Mic,
  Users,
  Clapperboard,
} from 'lucide-react';
import { API_ENDPOINTS, apiFetch, fetchWithTimeout } from '@/lib/api-client';
import type {
  ChatMessage,
  ChatResponse,
  CreationModelsResponse,
  MatchedProduct,
} from '@/lib/types';

const META_AI_FALLBACK_URL = 'https://www.meta.ai/';
const ELEVENLABS_FALLBACK_URL = 'https://elevenlabs.io/app/speech-synthesis/text-to-speech';
const GOOGLE_FLOW_CHARACTERS_FALLBACK_URL =
  'https://labs.google/fx/tools/flow/project/cc16a3ce-33ec-4248-bb1a-3341c7817479/characters';
const GOOGLE_FLOW_FINAL_PRODUCT_FALLBACK_URL =
  'https://labs.google/fx/tools/flow/project/0b5aa7ed-bd40-490d-af9a-24208f855710';

// Category colour map for the product card badge
const CATEGORY_COLOURS: Record<string, string> = {
  'Pickles': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'Chutneys': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'Pastes': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'Sauces': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'Himalayan Salt': 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  'Salt': 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  'Specialty Salts': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  'Vermicelli & Sweets': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  'Fried Onion': 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
  'Moringa Products': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Moringa Beauty & Personal Care': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'Masalas & Spice Blends': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
};

function categoryColour(category: string): string {
  return CATEGORY_COLOURS[category] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
}

// ---------------------------------------------------------------------------
// Product Card component
// ---------------------------------------------------------------------------

function ProductCard({ product }: { product: MatchedProduct }) {
  return (
    <div className="mb-3 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white shadow-sm overflow-hidden dark:from-brand-950/40 dark:to-slate-800 dark:border-brand-700">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 dark:bg-brand-800">
        <Package className="w-4 h-4 text-white flex-shrink-0" />
        <span className="text-sm font-semibold text-white truncate">{product.name}</span>
        <span className="ml-auto text-xs text-brand-200 flex-shrink-0">{product.brand}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Category badge */}
        <div className="flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColour(product.category)}`}>
            {product.category}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {product.description}
        </p>

        {/* Packaging */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Box className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
              Available Packaging
            </span>
          </div>
          <ul className="space-y-1">
            {product.packaging.map((pkg, i) => (
              <li
                key={i}
                className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5"
              >
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                {pkg}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extended message type (includes optional matched product)
// ---------------------------------------------------------------------------

interface ExtendedChatMessage extends ChatMessage {
  matchedProduct?: MatchedProduct | null;
}

// ---------------------------------------------------------------------------
// Main ChatInterface
// ---------------------------------------------------------------------------

export default function ChatInterface() {
  const [modelLabel, setModelLabel] = useState<string>('Loading…');
  const [metaAiUrl, setMetaAiUrl] = useState<string>(META_AI_FALLBACK_URL);
  const [elevenLabsUrl, setElevenLabsUrl] = useState<string>(ELEVENLABS_FALLBACK_URL);
  const [googleFlowCharactersUrl, setGoogleFlowCharactersUrl] = useState<string>(
    GOOGLE_FLOW_CHARACTERS_FALLBACK_URL
  );
  const [googleFlowFinalProductUrl, setGoogleFlowFinalProductUrl] = useState<string>(
    GOOGLE_FLOW_FINAL_PRODUCT_FALLBACK_URL
  );
  const [chatReady, setChatReady] = useState<boolean>(true);

  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetchWithTimeout(API_ENDPOINTS.CREATION_MODELS);
        if (!res.ok) throw new Error('Failed to load models');
        const data: CreationModelsResponse = await res.json();
        setModelLabel(data.models[0]?.label ?? 'AI Assistant');
        setMetaAiUrl(data.meta_ai_web_url || data.gemini_web_url || META_AI_FALLBACK_URL);
        setElevenLabsUrl(data.elevenlabs_web_url || ELEVENLABS_FALLBACK_URL);
        setGoogleFlowCharactersUrl(
          data.google_flow_characters_url || GOOGLE_FLOW_CHARACTERS_FALLBACK_URL
        );
        setGoogleFlowFinalProductUrl(
          data.google_flow_final_product_url || GOOGLE_FLOW_FINAL_PRODUCT_FALLBACK_URL
        );
        setChatReady(data.chat_ready);
      } catch {
        toast.error('Could not load AI models. Is the backend running?');
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    if (!chatReady) {
      toast.error(
        'Chat is not configured. Add CREATION_GEMINI_API_KEY in the backend .env (2nd free key from aistudio.google.com/apikey).'
      );
      return;
    }

    const userMsg: ExtendedChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const res = await apiFetch(API_ENDPOINTS.CREATION_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: '',
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Chat request failed');
      }
      const data: ChatResponse = await res.json();
      const assistantMsg: ExtendedChatMessage = {
        role: 'assistant',
        content: data.reply,
        matchedProduct: data.matched_product ?? null,
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

  const openMetaAi = () => {
    window.open(metaAiUrl, '_blank', 'noopener,noreferrer');
  };

  const openElevenLabs = () => {
    window.open(elevenLabsUrl, '_blank', 'noopener,noreferrer');
  };

  const openGoogleFlowCharacters = () => {
    window.open(googleFlowCharactersUrl, '_blank', 'noopener,noreferrer');
  };

  const openGoogleFlowFinalProduct = () => {
    window.open(googleFlowFinalProductUrl, '_blank', 'noopener,noreferrer');
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[70vh] dark:bg-slate-800 dark:border-slate-600">
      {/* Toolbar */}
      <div className="flex flex-nowrap items-center gap-2 p-4 border-b border-slate-200 overflow-x-auto dark:border-slate-600">
        <span className="text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5 shrink-0 dark:bg-slate-700 dark:text-slate-200">
          {modelLabel}
        </span>

        <div className="flex-1 min-w-2" />

        <button
          onClick={openMetaAi}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 border border-brand-200 hover:bg-brand-50 rounded-lg px-3 py-1.5 transition-colors dark:text-gold-300 dark:hover:text-gold-200 dark:border-slate-500 dark:hover:bg-slate-700"
          title="Open Meta AI to generate a video"
        >
          <Video className="w-4 h-4" />
          Video in Meta AI
        </button>
        <button
          onClick={openElevenLabs}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 border border-brand-200 hover:bg-brand-50 rounded-lg px-3 py-1.5 transition-colors dark:text-gold-300 dark:hover:text-gold-200 dark:border-slate-500 dark:hover:bg-slate-700"
          title="Add voice-over with ElevenLabs text-to-speech"
        >
          <Mic className="w-4 h-4" />
          Add Voice-Over In ElevenLabs
        </button>
        <button
          onClick={openGoogleFlowCharacters}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 border border-brand-200 hover:bg-brand-50 rounded-lg px-3 py-1.5 transition-colors dark:text-gold-300 dark:hover:text-gold-200 dark:border-slate-500 dark:hover:bg-slate-700"
          title="Create characters in Google Flow"
        >
          <Users className="w-4 h-4" />
          Create Characters in Google Flow
        </button>
        <button
          onClick={openGoogleFlowFinalProduct}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 border border-brand-200 hover:bg-brand-50 rounded-lg px-3 py-1.5 transition-colors dark:text-gold-300 dark:hover:text-gold-200 dark:border-slate-500 dark:hover:bg-slate-700"
          title="Create final product video in Google Flow"
        >
          <Clapperboard className="w-4 h-4" />
          Create Final Product on Flow AI
        </button>

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
            <Bot className="w-12 h-12 mb-3 text-slate-300" />
            <p className="text-sm max-w-md mb-4">
              Your <strong>Essence</strong> prompt engineer — ask for Meta AI image or video prompts
              for any product. Packaging and catalog details are built in; you get copy-paste-ready
              prompts for generation.
            </p>
            {/* Quick-start suggestions */}
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {[
                'Image prompt: mango pickle 330g glass jar — studio packshot for Instagram',
                'Video prompt: Himalayan pink salt — 15s lifestyle reel',
                'Amazon listing image: garlic paste 1kg PET bottle, white background',
                '3 banner options for fried onions pouch — export catalog',
                'Hero shot: mint chutney glass jar with fresh herbs',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
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
          return (
            <div key={index} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center dark:bg-brand-900/60">
                  <Bot className="w-4 h-4 text-brand-700 dark:text-gold-300" />
                </div>
              )}

              <div className={`max-w-[75%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Product card — shown only on assistant messages with a matched product */}
                {!isUser && msg.matchedProduct && (
                  <ProductCard product={msg.matchedProduct} />
                )}

                {/* Chat bubble */}
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
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 dark:border-slate-600 p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Image prompt for Essence mango pickle glass jar — bright studio packshot for Instagram feed…"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100 dark:placeholder-slate-400"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-4 py-2.5 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Press Enter to send. Requests image/video prompts for Meta AI — product catalog is used automatically.
        </p>
      </div>
    </div>
  );
}
