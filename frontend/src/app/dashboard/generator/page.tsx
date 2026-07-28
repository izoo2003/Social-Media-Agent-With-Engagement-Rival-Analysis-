'use client';

import ContentGenerationForm from '@/components/generator/ContentGenerationForm';

export default function GeneratorPage() {
  return (
    <div className="w-full">
      <div className="mb-3 sm:mb-4">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Social Post Creator</h1>
        <p className="mt-0.5 text-sm text-gray-600">
          Upload media, generate captions, and post to your platforms.
        </p>
      </div>

      <ContentGenerationForm />
    </div>
  );
}
