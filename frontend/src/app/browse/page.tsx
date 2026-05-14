'use client';

import type { Route } from 'next';
import {
  ArrowRight,
  Building2,
  GraduationCap,
  House,
  Menu,
  type LucideIcon,
  Waves,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { BottomNav } from '@/components/bottom-nav';
import { FeaturedCarousel } from '@/components/featured-carousel';
import { MainSidebar } from '@/components/main-sidebar';
import { cn } from '@/lib/cn';

type ExploreCategory = {
  href: Route;
  label: string;
  eyebrow: string;
  description: string;
  chips: string[];
  icon: LucideIcon;
  tones: {
    card: string;
    iconWrap: string;
    icon: string;
    chip: string;
  };
};

const CATEGORIES: ExploreCategory[] = [
  {
    href: '/browse/off-campus',
    label: 'Off-campus',
    eyebrow: 'Student living',
    description: 'Hostels, self-contains, shared apartments, and roommate-friendly spaces near campus.',
    chips: ['Near campus', 'Budget beds', 'Roommate vibe'],
    icon: GraduationCap,
    tones: {
      card: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-100',
      iconWrap: 'bg-amber-100',
      icon: 'text-amber-700',
      chip: 'bg-white/80 text-amber-900',
    },
  },
  {
    href: '/browse/short-let',
    label: 'Short-let',
    eyebrow: 'Flexible stays',
    description: 'Nightly and weekly stays for trips, work runs, and furnished weekend bookings.',
    chips: ['Furnished', 'Quick stay', 'Guest-ready'],
    icon: Waves,
    tones: {
      card: 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-100',
      iconWrap: 'bg-sky-100',
      icon: 'text-sky-700',
      chip: 'bg-white/80 text-sky-900',
    },
  },
  {
    href: '/browse/rent',
    label: 'Rent',
    eyebrow: 'Long-term homes',
    description: 'Flats, duplexes, and family homes built for annual or multi-year tenancy.',
    chips: ['1-4 beds', 'Family homes', 'Move-in ready'],
    icon: House,
    tones: {
      card: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-lime-100',
      iconWrap: 'bg-emerald-100',
      icon: 'text-emerald-700',
      chip: 'bg-white/80 text-emerald-900',
    },
  },
  {
    href: '/browse/sales',
    label: 'For sale',
    eyebrow: 'Property to buy',
    description: 'Homes and investment properties listed for outright purchase and title review.',
    chips: ['Buy now', 'Title review', 'Investment picks'],
    icon: Building2,
    tones: {
      card: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-100',
      iconWrap: 'bg-rose-100',
      icon: 'text-rose-700',
      chip: 'bg-white/80 text-rose-900',
    },
  },
];

export default function BrowseHubPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <MainSidebar mobileOpen={drawerOpen} onMobileClose={() => setDrawerOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col bg-slate-50">
        <main className="flex-1 p-4 pb-24 sm:p-6 lg:mx-auto lg:max-w-6xl lg:p-8 lg:pb-8">
          <header className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
                Explore
              </p>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                Browse by listing type
              </h1>
            </div>
          </header>

          <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="absolute right-0 top-0 h-36 w-36 translate-x-8 -translate-y-8 rounded-full bg-brand-100/70 blur-2xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-6 translate-y-8 rounded-full bg-sky-100/70 blur-2xl" />
            <div className="relative">
              <p className="text-sm font-medium text-brand-700">Each category is its own listing type.</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Start with the kind of property you want to explore, then we will take you into the
                matching results and filters for that lane.
              </p>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <Link
                  key={category.href}
                  href={category.href}
                  className={cn(
                    'group relative overflow-hidden rounded-[28px] border p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md',
                    category.tones.card,
                  )}
                >
                  <div className="absolute right-0 top-0 h-28 w-28 translate-x-6 -translate-y-6 rounded-full bg-white/40" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          {category.eyebrow}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                          {category.label}
                        </h2>
                      </div>
                      <div
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm',
                          category.tones.iconWrap,
                        )}
                      >
                        <Icon className={cn('h-6 w-6', category.tones.icon)} aria-hidden />
                      </div>
                    </div>

                    <p className="mt-4 max-w-sm text-sm leading-6 text-slate-700">
                      {category.description}
                    </p>

                    <ul className="mt-5 flex flex-wrap gap-2">
                      {category.chips.map((chip) => (
                        <li
                          key={chip}
                          className={cn(
                            'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-sm',
                            category.tones.chip,
                          )}
                        >
                          {chip}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6 flex items-center justify-between text-sm font-semibold text-slate-900">
                      <span>Browse {category.label.toLowerCase()} listings</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>

          <section className="mt-8">
            <FeaturedCarousel showBrowseLink={false} />
          </section>
        </main>

        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
