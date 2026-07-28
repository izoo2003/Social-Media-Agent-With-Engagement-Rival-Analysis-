'use client';

import ChatInterface from '@/components/creation/ChatInterface';

export default function CreationPage() {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <div className="mb-3 shrink-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-100">
          Prompt Studio
        </h1>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400">
          Create images, voice-overs, and creative prompts in chat.
        </p>
      </div>
      <ChatInterface />
    </div>
  );
}
