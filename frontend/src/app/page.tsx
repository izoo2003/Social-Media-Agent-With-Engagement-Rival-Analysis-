import React from 'react';
import Image from 'next/image';

export default function Home() {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-brand-50 via-white to-gold-50">
      <div className="text-center max-w-lg px-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 inline-block">
          <Image
            src="/kafi-logo.png"
            alt="Kafi Commodities"
            width={280}
            height={90}
            className="object-contain mx-auto"
            priority
          />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">
          Social Media Agent
        </h1>
        <p className="text-lg text-slate-600 mb-8">
          AI-Powered Social Media Strategy & Content Generation
        </p>
        <a
          href="/login"
          className="inline-block px-8 py-3 bg-brand-700 text-white rounded-lg hover:bg-brand-800 transition font-semibold shadow-md"
        >
          Sign in to Dashboard
        </a>
      </div>
    </main>
  );
}
