'use client';

import ChatInterface from '@/components/creation/ChatInterface';

export default function CreationPage() {
  return (
    <div className="flex h-[calc(100dvh-5rem)] max-md:h-[calc(100dvh-6.75rem)] w-full min-w-0 flex-col overflow-hidden">
      <div className="mb-2 shrink-0">
        <h1 className="text-lg font-bold text-slate-900 sm:text-xl dark:text-slate-100">
          Prompt Studio
        </h1>
        <p className="text-xs text-gray-600 dark:text-slate-400 sm:text-sm">
          Create images, voice-overs, and prompts in chat.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  );
}
