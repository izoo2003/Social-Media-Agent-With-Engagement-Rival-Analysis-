'use client';

import ChatInterface from '@/components/creation/ChatInterface';

export default function CreationPage() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2 dark:text-slate-100">🎨 Prompt Studio</h1>
        <p className="text-gray-600 dark:text-slate-400">
          Generate polished <strong>Meta AI</strong> image and video prompts for Essence products —
          grounded in real packaging and catalog details. Copy a prompt, paste it into Meta AI, and
          create your visual.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-brand-600 dark:bg-slate-800">
          <div className="text-2xl mb-1">💬</div>
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">1. Describe the shot</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Name the product, packaging (glass jar, PET bottle), and use case (feed, reel, banner)
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-gold-500 dark:bg-slate-800">
          <div className="text-2xl mb-1">📋</div>
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">2. Copy the prompt</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            The AI returns a ready-to-paste Meta AI prompt with lighting, angle, and brand cues
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-emerald-500 dark:bg-slate-800">
          <div className="text-2xl mb-1">✨</div>
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">3. Generate in Meta AI</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Open Meta AI, paste the prompt, and generate your image or video
          </p>
        </div>
      </div>

      {/* Chatbot */}
      <ChatInterface />

      {/* Info Box */}
      <div className="mt-8 bg-brand-50 border border-brand-100 rounded-lg p-6 dark:bg-brand-950/40 dark:border-brand-800/60">
        <h3 className="font-semibold text-brand-900 dark:text-brand-200 mb-2">💡 Tips for better prompts</h3>
        <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
          <li>• Mention the <strong>packaging format</strong> (e.g. 330g glass jar vs 1kg PET bottle) — the bot knows your catalog</li>
          <li>• Say <strong>image</strong> or <strong>video</strong> and the platform (Instagram reel, Amazon listing, trade flyer)</li>
          <li>• Ask for <strong>2–3 variations</strong> if you want options (studio vs lifestyle, day vs night)</li>
          <li>• <strong>Copy</strong> the Meta AI prompt block, then click <strong>Open Meta AI</strong> to generate</li>
          <li>• Use <strong>Prompt Management → Open Google Gemini</strong> to paste and refine prompts in the Gemini web app</li>
          <li>• <strong>Add Voice-Over In ElevenLabs</strong> — open <a href="https://elevenlabs.io/app/speech-synthesis/text-to-speech" target="_blank" rel="noopener noreferrer" className="text-brand-700 dark:text-gold-300 underline">ElevenLabs TTS</a> for narration on your videos</li>
          <li>• Chat uses <code>CREATION_GEMINI_API_KEY</code> — separate from Content Posting</li>
        </ul>
      </div>
    </div>
  );
}
