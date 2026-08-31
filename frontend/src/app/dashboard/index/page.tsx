'use client';

import Link from 'next/link';
import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  ClipboardCheck,
  Globe,
  ImageIcon,
  Lightbulb,
  Link2,
  MessageCircle,
  Mic,
  PenLine,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';

interface IndexFeature {
  number: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  href?: string;
}

interface IndexSection {
  number: string;
  title: string;
  href: string;
  summary: string;
  features: IndexFeature[];
}

const INDEX_SECTIONS: IndexSection[] = [
  {
    number: '1',
    title: 'Content Creation',
    href: '/dashboard/creation',
    summary: 'Prompt Studio — images, voice, general chat, scripts, and creative tool links.',
    features: [
      {
        number: '1.1',
        title: 'Create image',
        description: 'Generate product visuals in-app from chat prompts.',
        icon: ImageIcon,
      },
      {
        number: '1.2',
        title: 'Create voice',
        description: 'Write scripts and generate voice-overs with free TTS.',
        icon: Mic,
      },
      {
        number: '1.3',
        title: 'General Chatbot',
        description: 'Ask anything — answers with automatic Gemini model failover.',
        icon: MessageCircle,
      },
      {
        number: '1.4',
        title: 'Line script / write prompt',
        description: 'Get copy-paste prompts for Meta AI, ads, and reels.',
        icon: PenLine,
      },
      {
        number: '1.5',
        title: 'Link to Flow',
        description: 'Open Google Flow for AI video creation.',
        icon: Clapperboard,
      },
      {
        number: '1.6',
        title: 'Link to Gemini',
        description: 'Open Gemini Image Creation in a new tab.',
        icon: Link2,
      },
    ],
  },
  {
    number: '2',
    title: 'Content Posting',
    href: '/dashboard/generator',
    summary: 'Upload media, generate captions, and publish to social platforms.',
    features: [
      {
        number: '2.1',
        title: 'Create caption, description & hashtags',
        description: 'AI writes platform-ready post text for your brand.',
        icon: Sparkles,
      },
      {
        number: '2.2',
        title: 'Post to social media',
        description: 'Publish media + caption to LinkedIn, Facebook, Instagram, YouTube.',
        icon: Send,
      },
    ],
  },
  {
    number: '3',
    title: 'Calendar',
    href: '/dashboard/calendar',
    summary: 'Plan and schedule posts to go live automatically.',
    features: [
      {
        number: '3.1',
        title: 'Schedule a post to upload',
        description: 'Pick a date and time — posts publish when due.',
        icon: CalendarDays,
      },
    ],
  },
  {
    number: '4',
    title: 'Analytics',
    href: '/dashboard/analytics',
    summary: 'Live account metrics across Facebook, Instagram, YouTube, and LinkedIn.',
    features: [
      {
        number: '4.1',
        title: 'View status',
        description: 'See connection health and platform status at a glance.',
        icon: BarChart3,
      },
      {
        number: '4.2',
        title: 'View followers / subscribers',
        description: 'Track audience size per platform.',
        icon: Users,
      },
      {
        number: '4.3',
        title: 'View impressions / growth',
        description: 'Views, reach, and engagement trends over time.',
        icon: TrendingUp,
      },
    ],
  },
  {
    number: '5',
    title: 'Process of approval / reject of post by S. Admin',
    href: '/dashboard/qa',
    summary: 'QA Checker — designer/admin reviews team posts before they go live.',
    features: [
      {
        number: '5.1',
        title: 'Approve or reject posts',
        description: 'Verify designer PIN, then approve to publish or reject to block.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    number: '6',
    title: 'Rival Review',
    href: '/dashboard/rivals',
    summary: 'Track competitors and get AI tips to stay ahead.',
    features: [
      {
        number: '6.1',
        title: 'View rival status',
        description: 'YouTube, Instagram, and website signals for each rival.',
        icon: Users,
      },
      {
        number: '6.2',
        title: 'Generate AI suggestions',
        description: 'See what rivals do better and how Kafi can improve.',
        icon: Lightbulb,
      },
    ],
  },
  {
    number: '7',
    title: 'KPIs',
    href: '/dashboard/kpis',
    summary: 'Track designer work from this agent plus third-party tools, then ask Gemini if a 9-hour shift looks complete.',
    features: [
      {
        number: '7.1',
        title: 'Auto catalog',
        description: 'Posts, images, voiceovers, scripts, schedules, campaigns, and rivals counted from the agent.',
        icon: Target,
      },
      {
        number: '7.2',
        title: 'Manual + custom KPIs',
        description: 'Add extra counts for Canva/Photoshop work, or create named KPI cards.',
        icon: PenLine,
      },
      {
        number: '7.3',
        title: 'Website Maintenance',
        description: 'Named cards for site work such as plugin updates and backup checks. Manual entries only, same flow as custom KPIs.',
        icon: Globe,
      },
      {
        number: '7.4',
        title: 'KPI Guidelines',
        href: '/dashboard/kpis/guidelines',
        description: 'Open from the sidebar under KPIs. Gemini judges logged KPIs and recent posts against a 9-hour shift.',
        icon: ClipboardCheck,
      },
      {
        number: '7.5',
        title: 'KPI Reports',
        href: '/dashboard/kpis/reports',
        description: 'Daily, weekly, and monthly tracking per KPI, with a generated summary for the selected range.',
        icon: BarChart3,
      },
    ],
  },
];

export default function IndexPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 sm:mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-gold-300">
          Social Media Agent
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
          Index
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base dark:text-slate-400">
          Feature map of everything implemented in the agent — open a section to jump in. For
          step-by-step guidance from scratch, see the{' '}
          <Link
            href="/dashboard/manual"
            className="font-semibold text-brand-700 hover:underline dark:text-gold-300"
          >
            User Manual
          </Link>
          .
        </p>
      </header>

      <ol className="space-y-5 sm:space-y-6">
        {INDEX_SECTIONS.map((section) => (
          <li key={section.number}>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-700">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    <span className="mr-2 text-brand-700 dark:text-gold-300">
                      {section.number}.
                    </span>
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {section.summary}
                  </p>
                </div>
                <Link
                  href={section.href}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Open section
                </Link>
              </div>

              <ol className="divide-y divide-slate-100 dark:divide-slate-700">
                {section.features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <li
                      key={feature.number}
                      className="flex gap-3 px-4 py-3.5 sm:px-5 sm:py-4"
                    >
                      <span className="mt-0.5 w-10 shrink-0 text-sm font-bold tabular-nums text-brand-700 dark:text-gold-300">
                        {feature.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          {Icon ? (
                            <Icon
                              className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                              aria-hidden
                            />
                          ) : null}
                          {feature.href ? (
                            <Link
                              href={feature.href}
                              className="font-semibold text-slate-900 hover:underline dark:text-slate-100"
                            >
                              {feature.title}
                            </Link>
                          ) : (
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {feature.title}
                            </p>
                          )}
                        </div>
                        {feature.description ? (
                          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                            {feature.description}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </li>
        ))}
      </ol>
    </div>
  );
}
