'use client';

import ChatInterface from '@/components/creation/ChatInterface';

export default function CreationPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-baseline gap-2 px-3 pt-2 pb-1.5 sm:px-4">
        <h1 className="text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">
          Prompt Studio
        </h1>
        <p className="hidden text-xs text-gray-500 dark:text-slate-400 sm:inline">
          Images, voice-overs, and prompts
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 sm:px-3 sm:pb-3">
        <ChatInterface />
      </div>
    </div>
  );
}
