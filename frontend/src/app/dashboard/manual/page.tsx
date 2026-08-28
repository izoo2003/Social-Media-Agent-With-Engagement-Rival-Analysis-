'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface ManualSection {
  id: string;
  number: string;
  title: string;
  href?: string;
  intro: string;
  steps: string[];
  tips?: string[];
  subsections?: {
    number: string;
    title: string;
    steps: string[];
    tips?: string[];
  }[];
}

const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'getting-started',
    number: '0',
    title: 'Getting started',
    intro:
      'The Kafi Social Media Agent is an all-in-one dashboard for creating content, posting to social platforms, scheduling, analytics, quality review, and competitor tracking. Start here before using any feature.',
    steps: [
      'Open the app in your browser and go to the login page. Enter the username and password provided by your administrator.',
      'After signing in, you land on Dashboard (senior accounts) or Content Creation (junior accounts). Use the sidebar to move between sections.',
      'On mobile, tap the menu icon (☰) in the top-left to open the navigation drawer. On desktop, you can collapse the sidebar with the panel icon for a wider workspace.',
      'Use the theme toggle at the bottom of the sidebar to switch between Light and Night mode. Your choice is saved on this device.',
      'Open Index for a quick feature map, or stay on this User Manual for step-by-step guidance.',
    ],
    tips: [
      'Senior Developer accounts have full access to every section.',
      'Junior Developer accounts can use Content Creation, Content Posting, Index, and this Manual. Other sections appear locked in the sidebar.',
      'When approval is required, junior posts are sent to the QA Checker instead of publishing immediately.',
    ],
  },
  {
    id: 'dashboard',
    number: '—',
    title: 'Dashboard overview',
    href: '/dashboard',
    intro:
      'The home screen gives a snapshot of your content pipeline and QA performance. Senior accounts only.',
    steps: [
      'Review the four stat cards: Total Content, Drafts, Posted, and QA Pass Rate.',
      'Scroll to Recent Content & Drafts to see every generated or posted item. Click a row to expand the caption.',
      'For published items, use View post to open the live link on Facebook, Instagram, LinkedIn, or YouTube.',
      'For drafts, use the inline Post from Draft panel to publish without returning to Content Posting.',
      'Use Refresh to reload the list. Clear All removes all content records; Clear Stats resets dashboard counters but keeps calendar schedules.',
    ],
  },
  {
    id: 'content-creation',
    number: '1',
    title: 'Content Creation (Prompt Studio)',
    href: '/dashboard/creation',
    intro:
      'Prompt Studio is your creative workspace. Generate product images, voice-over scripts, general AI answers, and copy-paste prompts for external tools like Meta AI and Google Flow.',
    steps: [],
    subsections: [
      {
        number: '1.1',
        title: 'Create image',
        steps: [
          'Go to Content Creation and select the Create image mode at the bottom of the chat.',
          'Describe the shot in detail — product name, packaging size, background, lighting, and platform (e.g. Instagram feed, Amazon listing).',
          'Optional: attach up to 5 reference photos (JPEG, PNG, WebP, GIF; max 4 MB each) using the paperclip icon.',
          'Pick a language in the toolbar if you want the assistant to reply in Urdu, Arabic, English, etc.',
          'Choose an image provider: Cloudflare (default) or Gemini if a paid API key is configured.',
          'Send your message. The image appears in the chat when generation completes. Right-click or long-press to save it.',
        ],
        tips: [
          'The chat remembers product context until you click New chat.',
          'Use quick-start suggestion chips on an empty chat to see example prompts.',
        ],
      },
      {
        number: '1.2',
        title: 'Create voice',
        steps: [
          'Select Create voice mode.',
          'Describe the voice-over — length, product, tone (e.g. warm, energetic, trustworthy).',
          'Choose a Voice mood from the toolbar dropdown when available.',
          'Send your message. The AI writes a script in the chat.',
          'When satisfied, click Generate voice to produce audio using free text-to-speech.',
          'Play or download the audio from the message bubble.',
        ],
        tips: ['You can edit the script in chat before generating voice.'],
      },
      {
        number: '1.3',
        title: 'General Chatbot',
        steps: [
          'Select General Chatbot mode.',
          'Ask any question — brainstorming, writing help, explanations, or general research.',
          'The system uses Gemini with automatic model failover if one model hits rate limits.',
          'Replies appear as normal chat messages. Use Copy on any assistant message if needed.',
        ],
      },
      {
        number: '1.4',
        title: 'Line script / Write prompt',
        steps: [
          'Select Write prompt mode.',
          'Ask for a copy-paste prompt tailored to Meta AI, ads, reels, or product photography.',
          'Copy the reply and paste it into Meta AI, Midjourney, or another external tool.',
          'Click Save prompt on an assistant reply to store one text prompt in your browser for reuse.',
          'Use Use saved prompt from the green banner to inject it into Create image or Create voice.',
        ],
        tips: ['Saved prompts are text only — images and audio files are not stored.'],
      },
      {
        number: '1.5',
        title: 'Link to Flow (AI video)',
        steps: [
          'Click Flow AI Video Creation in the toolbar (top of Prompt Studio).',
          'Google Flow opens in a new tab for AI video creation.',
          'Use Write prompt mode first if you need a detailed video prompt to paste into Flow.',
        ],
      },
      {
        number: '1.6',
        title: 'Link to Gemini (image creation)',
        steps: [
          'Click Gemini Image Creation in the toolbar.',
          'Gemini opens in a new tab for advanced image work outside the in-app generator.',
          'Alternatively, switch the image provider dropdown to Gemini for in-app generation when the paid API is connected.',
        ],
      },
    ],
  },
  {
    id: 'content-posting',
    number: '2',
    title: 'Content Posting (Social Post Creator)',
    href: '/dashboard/generator',
    intro:
      'Upload media, let AI write platform-specific captions, then publish or submit for approval.',
    steps: [],
    subsections: [
      {
        number: '2.1',
        title: 'Create caption, description & hashtags',
        steps: [
          'Open Content Posting from the sidebar.',
          'Select one or more platforms: LinkedIn, Facebook, Instagram, YouTube, and others for caption-only generation.',
          'Enter a Topic (required) — what the post is about.',
          'Set Brand context (default: Kafi Commodities), Tone, Target audience, optional Call to action, and Additional instructions.',
          'Optional: upload an image or video. Supported formats are validated on upload.',
          'Click Generate captions. Review platform-specific titles and bodies on the preview screen.',
          'Edit any caption inline. Use Regenerate on a single platform if you want a fresh version.',
        ],
      },
      {
        number: '2.2',
        title: 'Post to social media',
        steps: [
          'On the preview screen, confirm LinkedIn account checkboxes if posting to LinkedIn (when multiple accounts are configured).',
          'Click Post Now to publish immediately, or Schedule to open the calendar scheduler.',
          'If approval is required: junior users submit automatically; senior users see a designer gate — enter the designer PIN to post directly, or send for approval.',
          'Watch per-platform status indicators (posting, done, error). Fix errors shown in red and retry if needed.',
          'After success, find the item on Dashboard with a View post link.',
        ],
        tips: [
          'Draft mode (configured on the server) simulates posts without hitting live APIs — check Settings for status.',
          'YouTube posts require video media. Instagram and Facebook work with images or video.',
        ],
      },
    ],
  },
  {
    id: 'calendar',
    number: '3',
    title: 'Calendar',
    href: '/dashboard/calendar',
    intro:
      'Plan posts ahead. Scheduled items publish automatically when their date and time arrive.',
    steps: [],
    subsections: [
      {
        number: '3.1',
        title: 'Schedule a post to upload',
        steps: [
          'Open Calendar from the sidebar (senior accounts).',
          'Click Schedule post or click a day on the month grid to pre-fill the date.',
          'Select content from your library or create scheduling details in the modal: platform, caption, media, date, and time.',
          'Save. The event appears on the calendar with a status dot (pending = amber, published = green, failed = red).',
          'Click an event to view details, edit, reschedule, cancel, or publish now.',
          'Check the Upcoming sidebar for the next posts waiting to go live.',
        ],
        tips: [
          'You can also schedule from Content Posting preview using the Schedule button.',
          'The background worker checks for due posts roughly every 30 seconds.',
        ],
      },
    ],
  },
  {
    id: 'analytics',
    number: '4',
    title: 'Analytics',
    href: '/dashboard/analytics',
    intro:
      'Monitor live metrics across Facebook, Instagram, YouTube, and LinkedIn.',
    steps: [],
    subsections: [
      {
        number: '4.1',
        title: 'View status',
        steps: [
          'Open Analytics and pick a platform tab (Facebook, Instagram, YouTube, LinkedIn).',
          'Read the status badge: Connected, Not configured, Permission needed, or Error.',
          'If Permission needed appears for Facebook or Instagram, reconnect Meta in Settings or ask your admin to refresh OAuth tokens.',
        ],
      },
      {
        number: '4.2',
        title: 'View followers / subscribers',
        steps: [
          'On each platform tab, find follower, subscriber, or page fan counts in the summary cards.',
          'Compare LinkedIn profile viewers and search appearances when available.',
        ],
      },
      {
        number: '4.3',
        title: 'View impressions / growth',
        steps: [
          'Switch the date range (7, 30, or 90 days) using the range selector.',
          'Review trend charts for impressions, reach, views, or watch time.',
          'Scroll engagement breakdowns: likes, comments, shares, saves, and reposts where shown.',
        ],
        tips: ['Some platforms need API permissions enabled in the Meta or Google developer consoles.'],
      },
    ],
  },
  {
    id: 'qa',
    number: '5',
    title: 'Process of approval / reject (QA Checker)',
    href: '/dashboard/qa',
    intro:
      'When APPROVAL_REQUIRED is enabled, designers review team posts before they go live. Senior / designer workflow.',
    steps: [],
    subsections: [
      {
        number: '5.1',
        title: 'Approve or reject posts',
        steps: [
          'Open QA Checker from the sidebar.',
          'Enter the designer PIN in the verification box and click Verify.',
          'Review the Pending tab — each card shows platform, caption, media preview, and who submitted it.',
          'Click Approve to publish immediately to the selected platform(s).',
          'Click Reject, add an optional note explaining what to fix, and confirm.',
          'Switch to Approved or Rejected tabs to review history.',
        ],
        tips: [
          'Junior team members submit from Content Posting; they cannot access QA Checker.',
          'Dashboard QA Pass Rate reflects approved vs rejected submissions.',
        ],
      },
    ],
  },
  {
    id: 'rivals',
    number: '6',
    title: 'Rival Review',
    href: '/dashboard/rivals',
    intro:
      'Track competitors on YouTube, Instagram, and the web. Get AI suggestions to stay ahead.',
    steps: [],
    subsections: [
      {
        number: '6.1',
        title: 'View rival status',
        steps: [
          'Open Rival Review from the sidebar.',
          'Browse the rival cards — each shows YouTube, Instagram, and website signal status (ok, unavailable, error).',
          'Click Refresh on one rival or Refresh all to pull the latest public stats.',
          'Use Add rival to enter name, category, YouTube handle, Instagram username, website, and notes.',
          'Click a rival to see trend charts over time when snapshot history exists.',
        ],
        tips: [
          'Instagram rival data requires a connected Meta business account with business_discovery permissions.',
          'If you see a reconnect banner, go to Settings and re-authorize Meta.',
        ],
      },
      {
        number: '6.2',
        title: 'Generate AI suggestions',
        steps: [
          'Click Generate AI suggestions (or similar insights action) on the Rival Review page.',
          'Wait for the AI to compare rival snapshots against your brand context.',
          'Read prioritized recommendations — what rivals do better and how Kafi can improve.',
          'Use insights to plan Content Creation topics and Content Posting campaigns.',
        ],
      },
    ],
  },
  {
    id: 'kpis',
    number: '7',
    title: 'KPIs',
    href: '/dashboard/kpis',
    intro:
      'Designer work report. Auto cards count activity in this agent. Manual entries cover work done in other tools. Guidelines uses Gemini to judge whether a 9-hour shift looks filled. Senior accounts only. Days use Asia/Karachi.',
    steps: [],
    subsections: [
      {
        number: '7.1',
        title: 'Auto catalog',
        steps: [
          'Open KPIs from the sidebar (senior accounts).',
          'The page defaults to today. Use Today, This week, This month, or pick a From–To date range.',
          'Read the auto catalog cards: posts published, scheduled posts, images, voiceovers, scripts, campaigns, and rivals.',
          'Each card shows Auto (from the agent), Manual (what you typed), and Total (Auto + Manual).',
          'Posts published also splits images vs reels/video when media type is known.',
        ],
        tips: [
          'Image, voiceover, and script auto-counts start from when this feature was added — older Prompt Studio work is not backfilled.',
          'Junior work in the agent is included in the workspace totals.',
        ],
      },
      {
        number: '7.2',
        title: 'Manual entries and custom KPIs',
        steps: [
          'In Manual entry, pick a catalog KPI or a custom card, enter quantity and date, add an optional note, then Add entry.',
          'Use this for work done outside the agent (Canva, Photoshop, other software).',
          'Create a Custom KPI with a name (for example “Canva graphics”) when the catalog does not cover it. Fill that card with manual entries.',
          'Edit or delete a manual row from the Manual log. Archive a custom card if you no longer need it — old entries stay in history.',
          'The daily report table shows Auto + Manual totals for every day in the selected range.',
        ],
      },
      {
        number: '7.3',
        title: 'KPI Guidelines',
        steps: [
          'Open KPI Guidelines from the sidebar (nested under KPIs). Senior accounts only.',
          'Keep or change the date range (Today, This week, This month, or From–To).',
          'Click Review KPIs. Gemini reads Auto + Manual totals and recent published posts in that range.',
          'Up to three published images are sent for visual review. Reels and videos are judged from captions and media type, not the video file.',
          'Read the verdict: enough, partial, or not enough for that many 9-hour shifts. Use Still needed for leftover tasks and Improvements for what to change.',
          'Notes on published posts call out specific captions or images. Posts included in this review lists what Gemini actually saw.',
        ],
        tips: [
          'Add manual Canva/Photoshop counts in KPI Creation first so Guidelines can count that work.',
          'Guidelines uses the same Gemini posting API keys as Content Posting. If keys are missing, the page will say AI is unavailable.',
        ],
      },
    ],
  },
  {
    id: 'settings',
    number: '—',
    title: 'Settings',
    href: '/dashboard/settings',
    intro: 'Check platform connections, draft mode, and appearance. Senior accounts only.',
    steps: [
      'Open Settings from the sidebar footer.',
      'Under Appearance, switch Light or Night mode (same as the sidebar toggle).',
      'Review Connected Platforms — green means configured, gray means missing credentials.',
      'Read whether Draft mode or Live posting is active.',
      'Confirm Live posting targets show the correct Facebook page, Instagram @handle, and YouTube channel.',
      'If an ID mismatch warning appears, re-authorize OAuth and update backend environment variables with your admin.',
      'LinkedIn accounts listed here are selected per-post in Content Posting.',
    ],
  },
  {
    id: 'workflows',
    number: '★',
    title: 'End-to-end workflows',
    intro: 'Common paths from blank slate to published post.',
    steps: [
      'Creative only: Content Creation → Create image → download → use in Content Posting or external tools.',
      'Full post today: Content Posting → upload media → Generate captions → Post Now → verify on Dashboard.',
      'Team with approval: Junior uses Content Posting → Submit for approval → Designer opens QA Checker → Approve or Reject.',
      'Plan ahead: Content Posting → Generate → Schedule → confirm on Calendar → auto-publish at chosen time.',
      'Competitive planning: Rival Review → Refresh all → Generate AI suggestions → Content Creation for new angles → Content Posting.',
    ],
  },
  {
    id: 'troubleshooting',
    number: '!',
    title: 'Troubleshooting',
    intro: 'Quick fixes for common issues.',
    steps: [
      'Login failed: verify username/password with your admin. Too many attempts may trigger a 15-minute lockout.',
      'Could not reach the server: check that the backend is running and NEXT_PUBLIC_API_URL points to the correct Railway URL.',
      'Post failed on Facebook/Instagram: reconnect Meta OAuth; confirm redirect URI matches production backend /api/v1/auth/meta/callback.',
      'Instagram rival errors: reconnect Meta and ensure the business Instagram account ID in settings matches OAuth.',
      'Image generation unavailable: switch provider to Cloudflare or ask admin to configure API keys.',
      'General Chatbot slow or failing: admin should verify GENERAL_CHAT_GEMINI_API_KEY on Railway.',
      'Locked sidebar items: you are on a junior account — request senior access for Calendar, Analytics, QA, and Rival Review.',
    ],
  },
];

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="mt-3 list-none space-y-2.5">
      {items.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800 dark:bg-brand-900/60 dark:text-gold-300">
            {i + 1}
          </span>
          <span className="leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function TipList({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/20">
      {items.map((tip, i) => (
        <li
          key={i}
          className="text-sm text-amber-900 dark:text-amber-100/90"
        >
          <span className="font-semibold">Tip: </span>
          {tip}
        </li>
      ))}
    </ul>
  );
}

export default function ManualPage() {
  return (
    <div className="mx-auto w-full max-w-4xl pb-12">
      <header className="mb-6 sm:mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-gold-300">
          Social Media Agent
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <BookOpen className="h-8 w-8 text-brand-700 dark:text-gold-300" aria-hidden />
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
            User Manual
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base dark:text-slate-400">
          Complete guide from first login through content creation, posting, scheduling,
          analytics, QA approval, and rival review. Matches the{' '}
          <Link href="/dashboard/index" className="font-medium text-brand-700 hover:underline dark:text-gold-300">
            Index
          </Link>{' '}
          feature map.
        </p>
      </header>

      {/* Table of contents */}
      <nav
        aria-label="Manual contents"
        className="mb-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800"
      >
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Contents
        </h2>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {MANUAL_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-sm font-medium text-brand-700 hover:underline dark:text-gold-300"
              >
                {section.number !== '—' && section.number !== '★' && section.number !== '!'
                  ? `${section.number}. `
                  : ''}
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Sections */}
      <div className="space-y-8 sm:space-y-10">
        {MANUAL_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <div className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5 dark:border-slate-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {section.number !== '—' &&
                    section.number !== '★' &&
                    section.number !== '!'
                      ? (
                          <span className="mr-2 text-brand-700 dark:text-gold-300">
                            {section.number}.
                          </span>
                        )
                      : null}
                    {section.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {section.intro}
                  </p>
                </div>
                {section.href ? (
                  <Link
                    href={section.href}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                  >
                    Open in app
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="px-4 py-4 sm:px-6 sm:py-5">
              {section.steps.length > 0 ? <StepList items={section.steps} /> : null}
              {section.tips && section.tips.length > 0 ? (
                <TipList items={section.tips} />
              ) : null}

              {section.subsections?.map((sub) => (
                <div
                  key={sub.number}
                  className="mt-6 border-t border-slate-100 pt-6 first:mt-0 first:border-0 first:pt-0 dark:border-slate-700"
                >
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    <span className="mr-2 text-brand-700 dark:text-gold-300">
                      {sub.number}
                    </span>
                    {sub.title}
                  </h3>
                  <StepList items={sub.steps} />
                  {sub.tips && sub.tips.length > 0 ? <TipList items={sub.tips} /> : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="mt-10 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-5 sm:px-6 dark:border-brand-800/40 dark:bg-brand-950/20">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-700 dark:text-gold-300" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              Ready to start?
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              New users should sign in, skim Getting started above, then open Content Creation
              or Content Posting. Senior users can explore the full Index for quick links.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/dashboard/creation"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-gold-300"
              >
                Content Creation
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/dashboard/generator"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-gold-300"
              >
                Content Posting
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/dashboard/index"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-gold-300"
              >
                Feature Index
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
