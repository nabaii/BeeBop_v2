'use client';

/**
 * Premium Landlord Overview Dashboard.
 *
 * Implements mobile responsive layout, interactive SVG charting (monthly income
 * bar chart & category donut chart), KPI metrics, searchable list table (collapsible
 * to cards on mobile), and an interactive Demo Mode toggle with mock portfolio data.
 */

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  Percent,
  Home,
  Eye,
  Plus,
  Search,
  SlidersHorizontal,
  ChevronRight,
  TrendingDown,
  Sparkles,
  HelpCircle,
  Bell,
  CheckCircle2,
} from 'lucide-react';

import { LandlordAccessGate } from '@/components/landlord-access-gate';
import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { NotificationsInbox } from '@/components/dashboard/notifications-inbox';
import { AgreementsPanel } from '@/components/agreements/agreements-panel';
import { OffersPanel } from '@/components/offers/offers-panel';
import { Button } from '@/components/ui/button';
import {
  dashboards,
  type LandlordOverview,
  type ListingRevenueStats,
} from '@/lib/dashboards';
import { listMyListings, type ListingView } from '@/lib/listings';

// Pre-seeded high fidelity mock data for Demo Mode
const MOCK_OVERVIEW: LandlordOverview = {
  listings_total: 4,
  listings_by_status: [
    { status: 'doc_verified', count: 2 },
    { status: 'let_agreed', count: 1 },
    { status: 'draft', count: 1 },
  ],
  pending_offers_count: 3,
  unread_notifications: 3,
  total_income: 3875000,
  occupancy_rate: 76.5,
  monthly_income: [
    { month: 'Jan', amount: 450000 },
    { month: 'Feb', amount: 580000 },
    { month: 'Mar', amount: 720000 },
    { month: 'Apr', amount: 640000 },
    { month: 'May', amount: 800000 },
    { month: 'Jun', amount: 685000 },
  ],
  listing_stats: [
    {
      listing_id: 'mock-1',
      title: 'Luxury 3BR Penthouse Lekki',
      category: 'short_let',
      status: 'doc_verified',
      price: 120000,
      total_income: 1840000,
      occupancy_rate: 85.0,
      view_count: 342,
      save_count: 85,
      enquiry_count: 28,
      cover_photo_url: null,
    },
    {
      listing_id: 'mock-2',
      title: '2BR Serviced Apartment Ikeja',
      category: 'rent',
      status: 'let_agreed',
      price: 3200000,
      total_income: 3200000,
      occupancy_rate: 100.0,
      view_count: 185,
      save_count: 42,
      enquiry_count: 14,
      cover_photo_url: null,
    },
    {
      listing_id: 'mock-3',
      title: 'Emerald Student Hostel Unilag',
      category: 'off_campus',
      status: 'doc_verified',
      price: null,
      total_income: 480000,
      occupancy_rate: 70.0,
      view_count: 512,
      save_count: 135,
      enquiry_count: 45,
      cover_photo_url: null,
    },
    {
      listing_id: 'mock-4',
      title: '4BR Semi-Detached Duplex Ikoyi',
      category: 'sales',
      status: 'draft',
      price: 150000000,
      total_income: 0,
      occupancy_rate: 0.0,
      view_count: 45,
      save_count: 12,
      enquiry_count: 3,
      cover_photo_url: null,
    },
  ],
};

const MOCK_LISTINGS: ListingView[] = [
  {
    id: 'mock-1',
    title: 'Luxury 3BR Penthouse Lekki',
    category: 'short_let',
    status: 'doc_verified',
    price: 120000,
    district: 'Lekki Phase 1',
    photos: [],
    owner_id: 'owner-id',
    view_count: 342,
    save_count: 85,
    enquiry_count: 28,
  },
  {
    id: 'mock-2',
    title: '2BR Serviced Apartment Ikeja',
    category: 'rent',
    status: 'let_agreed',
    price: 3200000,
    district: 'Ikeja GRA',
    photos: [],
    owner_id: 'owner-id',
    view_count: 185,
    save_count: 42,
    enquiry_count: 14,
  },
  {
    id: 'mock-3',
    title: 'Emerald Student Hostel Unilag',
    category: 'off_campus',
    status: 'doc_verified',
    price: 350000,
    district: 'Yaba',
    photos: [],
    owner_id: 'owner-id',
    view_count: 512,
    save_count: 135,
    enquiry_count: 45,
  },
] as any;

export default function LandlordDashboardPage() {
  return (
    <LandlordAccessGate next="/dashboard/landlord">
      <LandlordDashboardContent />
    </LandlordAccessGate>
  );
}

function LandlordDashboardContent() {
  const [demoMode, setDemoMode] = useState(true);
  const [dbOverview, setDbOverview] = useState<LandlordOverview | null>(null);
  const [dbListings, setDbListings] = useState<ListingView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([dashboards.landlord(), listMyListings()])
      .then(([o, l]) => {
        if (cancelled) return;
        setDbOverview(o);
        setDbListings(l);
        // If the landlord has real properties, default Demo Mode to false
        if (l && l.length > 0) {
          setDemoMode(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError('Could not load your live dashboard data.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute active overview data based on toggle
  const overview = useMemo(() => {
    return demoMode ? MOCK_OVERVIEW : dbOverview;
  }, [demoMode, dbOverview]);

  // Compute listings array
  const listings = useMemo(() => {
    return demoMode ? MOCK_LISTINGS : dbListings;
  }, [demoMode, dbListings]);

  // Filtered stats list for the analytics breakdown table
  const filteredStats = useMemo(() => {
    if (!overview?.listing_stats) return [];
    return overview.listing_stats.filter((stat) => {
      const matchesSearch = stat.title
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' || stat.status === statusFilter;
      const matchesCategory =
        categoryFilter === 'all' || stat.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [overview, searchQuery, statusFilter, categoryFilter]);

  // Format currency in Naira
  const formatNaira = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // SVG Chart Computations
  const maxMonthlyAmount = useMemo(() => {
    if (!overview?.monthly_income || overview.monthly_income.length === 0)
      return 1;
    return Math.max(...overview.monthly_income.map((d) => d.amount), 1);
  }, [overview]);

  // Donut chart computations
  const donutData = useMemo(() => {
    if (!overview?.listing_stats) return [];
    const totals: Record<string, number> = {
      short_let: 0,
      rent: 0,
      off_campus: 0,
      sales: 0,
    };
    overview.listing_stats.forEach((s) => {
      totals[s.category] = (totals[s.category] || 0) + s.total_income;
    });

    const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    const colors: Record<string, string> = {
      short_let: '#6366f1', // Indigo
      rent: '#f59e0b', // Amber
      off_campus: '#f43f5e', // Rose
      sales: '#10b981', // Emerald
    };
    const labels: Record<string, string> = {
      short_let: 'Short-let',
      rent: 'Rentals',
      off_campus: 'Student',
      sales: 'Sales',
    };

    return Object.keys(totals).map((key) => ({
      key,
      label: labels[key],
      value: totals[key],
      percentage: (totals[key] / sum) * 100,
      color: colors[key],
    }));
  }, [overview]);

  const donutTotal = useMemo(() => {
    return donutData.reduce((sum, d) => sum + d.value, 0);
  }, [donutData]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      {/* Premium Header Banner with Demo Mode Toggle */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-brand p-6 text-white shadow-xl sm:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-3 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-500/30">
                <Sparkles className="h-3 w-3" /> Landlord Portal
              </span>
              {demoMode && (
                <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
                  Demo Mode
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Property Dashboard
            </h1>
            <p className="mt-1 text-slate-300 text-sm">
              Professional management tools, financial metrics, and listing performance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Demo Mode Toggle Widget */}
            <div className="flex items-center gap-2 rounded-xl bg-white/10 p-1.5 border border-white/10 backdrop-blur-sm">
              <span className="pl-2.5 pr-1 text-xs font-medium text-slate-200">
                Demo Mode
              </span>
              <button
                onClick={() => setDemoMode(!demoMode)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  demoMode ? 'bg-indigo-500' : 'bg-slate-700'
                }`}
                aria-label="Toggle demo mode"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    demoMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <Link href="/listings/new">
              <Button className="bg-white text-slate-900 hover:bg-slate-100 border-none shadow-md font-semibold gap-2 py-5 px-5">
                <Plus className="h-4 w-4" /> Create listing
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {loading && !overview && (
        <div className="flex h-32 items-center justify-center rounded-xl bg-white shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span>Loading your dashboard overview...</span>
          </div>
        </div>
      )}

      {error && !demoMode && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {overview && (
        <>
          {/* KPI Statistics Section */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI Card: Total Income */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Total Income</span>
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {formatNaira(overview.total_income)}
                </h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <span>+12.4% vs last quarter</span>
                </p>
              </div>
            </div>

            {/* KPI Card: Occupancy Rate */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Occupancy Rate</span>
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                  <Percent className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {overview.occupancy_rate.toFixed(1)}%
                  </h3>
                  <p className="mt-1 text-xs text-indigo-600 font-medium">
                    Healthy portfolio state
                  </p>
                </div>
                {/* Micro circular progress */}
                <svg className="h-12 w-12 transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    className="stroke-slate-100 fill-none"
                    strokeWidth="4"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    className="stroke-indigo-500 fill-none transition-all duration-500"
                    strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 18}
                    strokeDashoffset={
                      2 * Math.PI * 18 * (1 - overview.occupancy_rate / 100)
                    }
                  />
                </svg>
              </div>
            </div>

            {/* KPI Card: Active Listings */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Active Listings</span>
                <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
                  <Home className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {overview.listings_total}
                </h3>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {overview.listings_by_status.slice(0, 2).map((s) => (
                    <span
                      key={s.status}
                      className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 capitalize"
                    >
                      {s.status.replace('_', ' ')}: {s.count}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* KPI Card: Total Views */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Views & Enquiries</span>
                <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                  <Eye className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {overview.listing_stats.reduce((sum, a) => sum + a.view_count, 0)}
                </h3>
                <p className="mt-1 text-xs text-blue-600 font-medium">
                  {overview.listing_stats.reduce((sum, a) => sum + a.enquiry_count, 0)} total enquiries received
                </p>
              </div>
            </div>
          </div>

          {/* Interactive SVG Visualizations */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Monthly Income Chart */}
            <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Revenue Stream</h2>
                  <p className="text-xs text-slate-500">Monthly earnings trend breakdown</p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Past 6 Months
                </div>
              </div>

              {overview.monthly_income.length > 0 ? (
                <div className="h-56 w-full">
                  <svg
                    viewBox="0 0 500 200"
                    className="h-full w-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    {/* SVG Definitions for linear gradient */}
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity="0.3" />
                      </linearGradient>
                    </defs>

                    {/* Chart Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                      const y = 20 + 130 * (1 - ratio);
                      return (
                        <g key={index}>
                          <line
                            x1="30"
                            y1={y}
                            x2="490"
                            y2={y}
                            className="stroke-slate-100"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x="25"
                            y={y + 3}
                            className="fill-slate-400 text-[8px] font-medium"
                            textAnchor="end"
                          >
                            {formatNaira(maxMonthlyAmount * ratio).replace('NGN', '')}
                          </text>
                        </g>
                      );
                    })}

                    {/* Drawing the Bars */}
                    {overview.monthly_income.map((item, idx) => {
                      const barWidth = 40;
                      const xSpace = 460 / overview.monthly_income.length;
                      const x = 40 + idx * xSpace + (xSpace - barWidth) / 2;
                      const barHeight = (item.amount / maxMonthlyAmount) * 130;
                      const y = 150 - barHeight;

                      return (
                        <g key={idx} className="group cursor-pointer">
                          {/* Animated bar rect */}
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx="4"
                            className="fill-[url(#barGradient)] hover:fill-indigo-600 transition-colors duration-200"
                          />
                          {/* Popover amount label on hover */}
                          <text
                            x={x + barWidth / 2}
                            y={y - 6}
                            className="opacity-0 group-hover:opacity-100 fill-slate-900 text-[8px] font-bold text-center transition-opacity duration-200"
                            textAnchor="middle"
                          >
                            {formatNaira(item.amount)}
                          </text>
                          {/* X-axis Label */}
                          <text
                            x={x + barWidth / 2}
                            y="170"
                            className="fill-slate-500 text-[9px] font-semibold"
                            textAnchor="middle"
                          >
                            {item.month}
                          </text>
                        </g>
                      );
                    })}

                    {/* X-axis line */}
                    <line x1="30" y1="150" x2="490" y2="150" className="stroke-slate-200" strokeWidth="1" />
                  </svg>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-slate-400 text-sm">
                  No income history available
                </div>
              )}
            </section>

            {/* Donut Chart Segment */}
            <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-slate-900">Portfolio Distribution</h2>
                <p className="text-xs text-slate-500">Revenue share by property type</p>
              </div>

              {donutTotal > 0 ? (
                <div className="mt-4 flex flex-col items-center justify-center">
                  <div className="relative h-36 w-36">
                    <svg viewBox="0 0 120 120" className="h-full w-full">
                      {/* Empty back circle */}
                      <circle cx="60" cy="60" r="45" className="stroke-slate-100 fill-none" strokeWidth="12" />

                      {/* Render Donut arcs */}
                      {(() => {
                        let accumulatedPercent = 0;
                        const radius = 45;
                        const circ = 2 * Math.PI * radius; // 282.74

                        return donutData.map((d) => {
                          if (d.value === 0) return null;
                          const strokeLength = (d.percentage / 100) * circ;
                          const offset = -(accumulatedPercent / 100) * circ;
                          accumulatedPercent += d.percentage;

                          return (
                            <circle
                              key={d.key}
                              cx="60"
                              cy="60"
                              r={radius}
                              className="fill-none transition-all duration-300"
                              stroke={d.color}
                              strokeWidth="12"
                              strokeDasharray={`${strokeLength} ${circ}`}
                              strokeDashoffset={offset}
                              strokeLinecap="round"
                              transform="rotate(-90 60 60)"
                            />
                          );
                        });
                      })()}
                    </svg>

                    {/* Donut inner center summary */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                        Total Value
                      </span>
                      <span className="mt-1 text-sm font-extrabold text-slate-900 leading-none">
                        {donutTotal > 1000000
                          ? `${(donutTotal / 1000000).toFixed(1)}M`
                          : formatNaira(donutTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Portfolio Legend indicators */}
                  <ul className="mt-6 w-full space-y-2 text-xs">
                    {donutData.map((d) => (
                      <li key={d.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: d.color }}
                          />
                          <span className="font-semibold text-slate-700">
                            {d.label}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">
                            {d.percentage.toFixed(1)}%
                          </span>
                          <span className="ml-2 text-slate-400 font-medium">
                            ({formatNaira(d.value)})
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-slate-400 text-sm">
                  No active distribution records
                </div>
              )}
            </section>
          </div>

          <NotificationsInbox />

          {/* Interactive Listings Management Table & Cards */}
          <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-900">Listing Analytics & Performance</h2>
                <p className="text-xs text-slate-500">Search and monitor conversions across active properties</p>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by listing title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Property Category Filter */}
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">All Categories</option>
                  <option value="rent">Rentals</option>
                  <option value="short_let">Short-lets</option>
                  <option value="off_campus">Student</option>
                  <option value="sales">Sales</option>
                </select>

                {/* Listing Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="under_doc_review">Under Review</option>
                  <option value="doc_verified">Verified</option>
                  <option value="let_agreed">Let Agreed</option>
                  <option value="sale_agreed">Sale Agreed</option>
                </select>
              </div>
            </div>

            {filteredStats.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                <p className="text-sm text-slate-500 font-medium">
                  No listings found matching your search filter.
                </p>
              </div>
            ) : (
              <>
                {/* DESKTOP TABLE VIEW (visible on md screens and up) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-slate-800 text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-left font-bold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 pl-2">Listing Property</th>
                        <th className="pb-3 text-center">Category</th>
                        <th className="pb-3 text-center">Status</th>
                        <th className="pb-3 text-right">Occupancy</th>
                        <th className="pb-3 text-right">Views</th>
                        <th className="pb-3 text-right">Saves</th>
                        <th className="pb-3 text-right">Enquiries</th>
                        <th className="pb-3 text-right pr-2">Total Income</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredStats.map((stat) => (
                        <tr
                          key={stat.listing_id}
                          className="hover:bg-slate-50/50 transition-colors duration-150"
                        >
                          <td className="py-3.5 pl-2 font-semibold text-slate-900 max-w-[220px] truncate">
                            {stat.title ?? 'Untitled Listing'}
                          </td>
                          <td className="py-3.5 text-center">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                stat.category === 'short_let'
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  : stat.category === 'rent'
                                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                                    : stat.category === 'off_campus'
                                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              }`}
                            >
                              {stat.category === 'short_let'
                                ? 'Short-let'
                                : stat.category === 'rent'
                                  ? 'Rental'
                                  : stat.category === 'off_campus'
                                    ? 'Student'
                                    : 'Sale'}
                            </span>
                          </td>
                          <td className="py-3.5 text-center">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                stat.status === 'let_agreed' || stat.status === 'sale_agreed'
                                  ? 'bg-slate-100 text-slate-800'
                                  : stat.status === 'draft'
                                    ? 'bg-slate-100 text-slate-500'
                                    : stat.status === 'under_doc_review'
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-brand-50 text-brand-700'
                              }`}
                            >
                              {stat.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3.5 text-right font-bold text-slate-900">
                            {stat.occupancy_rate.toFixed(0)}%
                          </td>
                          <td className="py-3.5 text-right text-slate-500">
                            {stat.view_count}
                          </td>
                          <td className="py-3.5 text-right text-slate-500">
                            {stat.save_count}
                          </td>
                          <td className="py-3.5 text-right text-slate-500">
                            {stat.enquiry_count}
                          </td>
                          <td className="py-3.5 text-right font-bold text-slate-900 pr-2">
                            {formatNaira(stat.total_income)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE CARDS VIEW (visible on screens < md) */}
                <div className="grid grid-cols-1 gap-4 md:hidden">
                  {filteredStats.map((stat) => (
                    <div
                      key={stat.listing_id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="max-w-[80%]">
                          <h4 className="text-sm font-bold text-slate-900 truncate">
                            {stat.title ?? 'Untitled'}
                          </h4>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold border mt-1 ${
                              stat.category === 'short_let'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : stat.category === 'rent'
                                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                                  : stat.category === 'off_campus'
                                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}
                          >
                            {stat.category.toUpperCase().replace('_', ' ')}
                          </span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold capitalize ${
                            stat.status === 'let_agreed' || stat.status === 'sale_agreed'
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {stat.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 border-y border-slate-100 py-2.5 text-center text-[10px]">
                        <div>
                          <span className="block text-slate-400 font-semibold uppercase">
                            Occupancy
                          </span>
                          <span className="mt-0.5 block font-bold text-slate-900">
                            {stat.occupancy_rate.toFixed(0)}%
                          </span>
                        </div>
                        <div>
                          <span className="block text-slate-400 font-semibold uppercase">
                            Views (Saves)
                          </span>
                          <span className="mt-0.5 block font-bold text-slate-900">
                            {stat.view_count} ({stat.save_count})
                          </span>
                        </div>
                        <div>
                          <span className="block text-slate-400 font-semibold uppercase">
                            Enquiries
                          </span>
                          <span className="mt-0.5 block font-bold text-slate-900">
                            {stat.enquiry_count}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">
                          Total Income
                        </span>
                        <span className="text-sm font-extrabold text-slate-900">
                          {formatNaira(stat.total_income)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {/* Listings details view card items */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Your Property Cards</h2>
          <span className="text-xs text-slate-400 font-medium">
            {listings?.length ?? 0} listings listed
          </span>
        </div>
        {listings === null ? (
          <p className="text-sm text-slate-500">Loading your listings...</p>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center shadow-sm">
            <p className="text-sm text-slate-600 font-semibold">
              You haven&apos;t created a listing yet.
            </p>
            <Link href="/listings/new" className="mt-4 inline-block">
              <Button>Create your first listing</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <div
                key={l.id}
                className="group overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                {/* Listing Cover Photo */}
                <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                  {l.photos && l.photos.length > 0 ? (
                    <img
                      src={l.photos.find((p) => p.is_cover)?.url ?? l.photos[0].url}
                      alt={l.title ?? 'Property image'}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400 bg-slate-100">
                      <Home className="h-10 w-10 stroke-1" />
                    </div>
                  )}
                  {/* Category Badge overlay */}
                  <span className="absolute left-3.5 top-3.5 rounded-full bg-slate-900/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                    {l.category.replace('_', ' ')}
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      {l.district ?? 'Unknown Location'}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-brand transition-colors max-w-full truncate">
                      {l.title}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs font-extrabold text-slate-900">
                      {l.price ? `${formatNaira(l.price)}` : 'Contact for Price'}
                      {l.category === 'short_let' && <span className="text-[10px] font-normal text-slate-500"> / night</span>}
                      {l.category === 'rent' && <span className="text-[10px] font-normal text-slate-500"> / year</span>}
                    </span>
                    <Link
                      href={`/listings/edit/${l.id}`}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-brand uppercase"
                    >
                      {l.status === 'draft' ? 'Draft' : 'Manage'} <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transaction & Empty Stubs panels */}
      <OffersPanel viewerRole="landlord" />
      <AgreementsPanel viewerRole="landlord" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EmptyPanel
          title="Visits"
          hint="Read-only visit confirmations and post-visit reports."
          comingIn="Sprint 9"
        />
        <EmptyPanel
          title="Fees & billing"
          hint="Facilitation fees itemised by transaction. No listing fees ever."
          comingIn="Sprint 10"
        />
      </div>
    </main>
  );
}
