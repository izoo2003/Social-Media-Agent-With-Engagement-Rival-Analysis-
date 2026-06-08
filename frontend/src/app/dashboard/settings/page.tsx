'use client';

import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '@/lib/api-client';
import { LinkedInAccountInfo } from '@/lib/types';

interface PlatformConfig {
  platforms: Record<string, boolean>;
  linkedin_accounts: LinkedInAccountInfo[];
  linkedin_account_count: number;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(API_ENDPOINTS.PLATFORM_CONFIG)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load platform config');
        return res.json() as Promise<PlatformConfig>;
      })
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Settings</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Connected Platforms</h2>

        {loading && <p className="text-gray-500 text-sm">Loading configuration...</p>}
        {error && (
          <p className="text-red-600 text-sm">
            {error}. Make sure the backend is running on port 8000.
          </p>
        )}

        {config && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(config.platforms).map(([platform, ready]) => (
                <div
                  key={platform}
                  className={`p-3 rounded-lg border text-center ${
                    ready ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-medium capitalize text-gray-800">{platform}</p>
                  <p className={`text-xs mt-1 font-semibold ${ready ? 'text-green-700' : 'text-gray-500'}`}>
                    {ready ? 'Configured' : 'Not configured'}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                LinkedIn Accounts ({config.linkedin_account_count})
              </h3>
              {config.linkedin_accounts.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No LinkedIn accounts configured. Add credentials in backend <code>.env</code>.
                </p>
              ) : (
                <ul className="space-y-2">
                  {config.linkedin_accounts.map((account) => (
                    <li
                      key={account.label}
                      className="flex items-center justify-between text-sm bg-blue-50 border border-blue-100 rounded-lg px-4 py-2"
                    >
                      <span className="font-medium text-gray-800">{account.label}</span>
                      <span className="text-xs text-green-700 font-semibold">Account {account.index} · Ready</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-gray-500 mt-3">
                Credentials are stored in backend <code>.env</code> (access token + person ID per account).
                Use the Content Generator to pick which accounts to post from.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
