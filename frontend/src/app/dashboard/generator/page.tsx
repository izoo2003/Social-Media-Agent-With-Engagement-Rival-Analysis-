'use client';

import ContentGenerationForm from '@/components/generator/ContentGenerationForm';

export default function GeneratorPage() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">📱 Social Post Creator</h1>
        <p className="text-gray-600">
          Create social media posts with AI-generated captions and media from your graphic designer.
          Upload an image/video, generate the perfect caption, and post to multiple platforms at once.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-brand-600">
          <div className="text-2xl mb-1">🎨</div>
          <h3 className="font-semibold text-sm text-slate-900">1. Upload Media</h3>
          <p className="text-xs text-gray-500 mt-1">
            Your graphic designer uploads their image/video here
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-gold-500">
          <div className="text-2xl mb-1">🤖</div>
          <h3 className="font-semibold text-sm text-slate-900">2. AI Generates Caption</h3>
          <p className="text-xs text-gray-500 mt-1">
            AI writes platform-optimized post text for your brand
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-emerald-500">
          <div className="text-2xl mb-1">🚀</div>
          <h3 className="font-semibold text-sm text-slate-900">3. Post to Socials</h3>
          <p className="text-xs text-gray-500 mt-1">
            Publish media + caption to LinkedIn, Facebook, Instagram
          </p>
        </div>
      </div>

      {/* Main Form */}
      <ContentGenerationForm />

      {/* Info Box */}
      <div className="mt-8 bg-brand-50 border border-brand-100 rounded-lg p-6 dark:bg-brand-950/40 dark:border-brand-800/60">
        <h3 className="font-semibold text-brand-900 dark:text-brand-200 mb-2">💡 How This Works</h3>
        <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
          <li>• <strong>Graphic designer</strong> creates the image/video in their design tools (Photoshop, Canva, etc.)</li>
          <li>• <strong>Upload the media file</strong> here — the system stores it locally</li>
          <li>• <strong>AI generates a caption</strong> optimized for each platform&apos;s audience and format</li>
          <li>• <strong>Preview and edit</strong> the caption before posting</li>
          <li>• <strong>Post to multiple platforms</strong> at once — media + caption published together</li>
          <li>• Currently in <strong>test/draft mode</strong> — configure social API keys in Settings for live posting</li>
        </ul>
      </div>
    </div>
  );
}
