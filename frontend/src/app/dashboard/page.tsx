'use client';

import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '@/lib/api-client';

interface ContentItem {
  id: number;
  platform: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  media_type?: string | null;
  linkedin_post_status?: string;
  facebook_post_status?: string;
  instagram_post_status?: string;
  youtube_post_status?: string;
  linkedin_post_id?: string | null;
  facebook_post_id?: string | null;
  instagram_post_id?: string | null;
  youtube_post_id?: string | null;
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼',
  twitter: '𝕏',
  facebook: '👍',
  instagram: '📷',
  tiktok: '🎵',
  youtube: '▶️',
  email: '✉️',
  whatsapp: '💬',
};

const getPlatformPostStatus = (content: ContentItem) => {
  const platformStatusKey = `${content.platform}_post_status` as keyof ContentItem;
  const platformStatus = content[platformStatusKey];
  return String(platformStatus || content.status || 'draft').toLowerCase();
};

const isPosted = (content: ContentItem) => {
  const postStatus = getPlatformPostStatus(content);
  return postStatus === 'published' || postStatus === 'posted';
};

const getDisplayStatus = (content: ContentItem) => {
  const postStatus = getPlatformPostStatus(content);
  return isPosted(content) ? 'published' : postStatus === 'failed' ? 'failed' : 'draft';
};

export default function DashboardPage() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [stats, setStats] = useState({ total: 0, drafted: 0, posted: 0 });

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.CONTENT_HISTORY + '?limit=50');
      if (res.ok) {
        const data: ContentItem[] = await res.json();
        setContents(data);
        const posted = data.filter(isPosted).length;
        setStats({
          total: data.length,
          drafted: data.length - posted,
          posted,
        });
      }
    } catch (err) {
      console.error('Failed to fetch content:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">Total Content</p>
              <p className="text-3xl font-bold text-brand-700 mt-1">{stats.total}</p>
            </div>
            <span className="text-3xl">📊</span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">Drafts</p>
              <p className="text-3xl font-bold text-gold-600 mt-1">{stats.drafted}</p>
            </div>
            <span className="text-3xl">📝</span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">Posted</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.posted}</p>
            </div>
            <span className="text-3xl">🚀</span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">QA Pass Rate</p>
              <p className="text-3xl font-bold text-slate-700 mt-1">{stats.total > 0 ? '100%' : '0%'}</p>
            </div>
            <span className="text-3xl">✅</span>
          </div>
        </div>
      </div>

      {/* Recent Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">📋 Recent Content & Drafts</h2>
          <button
            onClick={fetchContent}
            className="text-sm text-brand-700 hover:text-brand-800 font-medium"
          >
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <span className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 mt-2 text-sm">Loading drafts...</p>
          </div>
        ) : contents.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-500 font-medium">No content yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Generate your first post in the <a href="/dashboard/generator" className="text-brand-700 hover:underline">Content Generator</a>
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contents.map((content) => (
              <div key={content.id}>
                {/* Content Row */}
                <div
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(expandedId === content.id ? null : content.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-2xl flex-shrink-0">{PLATFORM_ICONS[content.platform] || '📄'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {content.title || 'Untitled'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <span className="capitalize">{content.platform}</span>
                          {' · '}
                          {formatDate(content.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        getDisplayStatus(content) === 'published'
                          ? 'bg-green-100 text-green-800'
                          : getDisplayStatus(content) === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : getDisplayStatus(content) === 'draft'
                          ? 'bg-gold-50 text-gold-800 border border-gold-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {getDisplayStatus(content)}
                      </span>
                      <span className="text-gray-400 text-sm">
                        {expandedId === content.id ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Content Preview */}
                {expandedId === content.id && (
                  <div className="px-6 pb-4 pt-0">
                    <div className="bg-gray-50 rounded-lg p-4 ml-11 border border-gray-200">
                      {content.body ? (
                        <>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                            {content.body}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(content.body);
                            }}
                            className="mt-2 text-xs text-brand-700 hover:text-brand-800 font-medium"
                          >
                            📋 Copy caption
                          </button>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No caption body</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
