'use client';

/**
 * Listing editor — the creation wizard as a single long-scroll page with
 * auto-saving sections. The order of sections is identical across
 * categories; category-specific controls switch inside the relevant block.
 *
 * Submission runs the backend's `ready-for-submission` validator and, during
 * the test phase, publishes as `live_unverified`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import {
  FileText,
  Home,
  DollarSign,
  Sparkles,
  Image as ImageIcon,
  FileCheck,
  CheckCircle2,
  ArrowLeft,
  LayoutGrid,
  Check,
  ChevronRight
} from 'lucide-react';

import { RouteGuard } from '@/components/route-guard';
import { Button } from '@/components/ui/button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { AmenitiesChecklist } from '@/components/listing/amenities-checklist';
import { DocumentUpload } from '@/components/listing/document-upload';
import { ListingBaseForm } from '@/components/listing/base-form';
import { PhotoUpload } from '@/components/listing/photo-upload';
import { ShortLetPricing } from '@/components/listing/short-let-pricing';
import { StudentInventory } from '@/components/listing/student-inventory';
import { TypeDataForm } from '@/components/listing/type-data-form';
import { ApiError } from '@/lib/api';
import { getListing, submitListing, type ListingView } from '@/lib/listings';

export default function EditListingPage({
  params,
}: {
  // Next.js 15 — `params` is a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RouteGuard roles={['landlord', 'agent']}>
      <EditingShell id={id} />
    </RouteGuard>
  );
}

function EditingShell({ id }: { id: string }) {
  const router = useRouter();
  const [listing, setListing] = useState<ListingView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getListing(id)
      .then((l) => {
        if (!cancelled) setListing(l);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Listing not found.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit() {
    if (!listing) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const next = await submitListing(listing.id);
      setListing(next);
      router.replace('/dashboard/landlord');
    } catch (err) {
      if (err instanceof ApiError && typeof err.message === 'string') {
        setSubmitError(err.message);
      } else {
        setSubmitError('Submission failed. Check the fields above and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <div className="p-8 text-sm text-red-600 font-medium">{loadError}</div>;
  if (!listing) {
    return <LoadingScreen message="Loading listing details…" />;
  }

  const isDraft = listing.status === 'draft';
  const patch = (partial: Partial<ListingView>) =>
    setListing((prev) => (prev ? { ...prev, ...partial } : prev));

  // Determine section completeness for checklist. These conditions must mirror
  // the backend's `_validate_ready_for_submission` (listings/service.py) — a
  // green checkmark here must mean submission will pass, otherwise the user
  // hits an opaque 422 with every section showing "Done".
  const isBaseComplete = Boolean(
    listing.title &&
    listing.description &&
    listing.description.length >= 200 &&
    listing.address_line &&
    listing.district &&
    listing.gps_lat != null &&
    listing.gps_lng != null &&
    // Off-campus prices per unit type (Room Inventory), not on the listing —
    // mirrors the backend, which exempts off-campus from the base-price check.
    (listing.category === 'off_campus' || listing.price)
  );
  
  const isCategoryComplete = (() => {
    if (listing.category === 'short_let') {
      const td = listing.type_data as Record<string, unknown>;
      return Boolean(td?.base_rate);
    }
    const td = listing.type_data as Record<string, unknown>;
    return Boolean(td?.property_type);
  })();

  const isAmenitiesComplete = Boolean(
    listing.amenities && 
    Object.values(listing.amenities).some(
      (group) => group && Object.values(group).some((meta) => meta?.present)
    )
  );

  const isPhotosComplete = Boolean(listing.photos && listing.photos.length > 0);
  const isDocsComplete = Boolean(listing.documents && listing.documents.length > 0);

  const steps = [
    { id: 'section-base', label: 'Basic Details', desc: 'Title, price & location', icon: FileText, complete: isBaseComplete },
    { id: 'section-category', label: 'Property Details', desc: 'Bedrooms, type & structure', icon: Home, complete: isCategoryComplete },
    ...(listing.category === 'short_let' ? [{ id: 'section-pricing', label: 'Pricing Rules', desc: 'Weekend & stay rules', icon: DollarSign, complete: isCategoryComplete }] : []),
    { id: 'section-amenities', label: 'Amenities', desc: 'Borehole, generator, etc.', icon: Sparkles, complete: isAmenitiesComplete },
    { id: 'section-photos', label: 'Photos Upload', desc: 'Showcase your property', icon: ImageIcon, complete: isPhotosComplete },
    ...(listing.category !== 'off_campus' ? [{ id: 'section-documents', label: 'Title Documents', desc: 'Verification evidence', icon: FileCheck, complete: isDocsComplete }] : []),
    ...(listing.category === 'off_campus' ? [{ id: 'section-inventory', label: 'Room Inventory', desc: 'Unit types & beds', icon: LayoutGrid, complete: isPhotosComplete }] : []),
    ...(isDraft ? [{ id: 'section-submit', label: 'Submit Review', desc: 'Publish your listing', icon: CheckCircle2, complete: false }] : []),
  ];

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans">
      {/* Banner Header with Warm Gradient matching landlord portal theme */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-brand py-8 px-4 text-white shadow-md sm:px-6 lg:px-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-36 w-36 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 h-36 w-36 rounded-full bg-white/5 blur-2xl" />

        <div className="mx-auto max-w-6xl relative z-10">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/landlord"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-all group"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back to dashboard
            </Link>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-brand/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-brand border border-brand/30 uppercase">
                {listing.category.replace('_', ' ')}
              </span>
              <StatusPill status={listing.status} />
            </div>
          </div>

          <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                {listing.title || 'New Property Listing'}
              </h1>
              <p className="mt-1 text-xs text-slate-300">
                Provide details to list your property and get it verified for the Abuja marketplace.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/dashboard/landlord">
                <Button className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-semibold text-xs py-2.5 px-4 shadow-sm">
                  Save & Exit
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Responsive Grid Layout */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* Step Progress Tracker — Sticky on Desktop, Horizontal Scroll on Mobile */}
          <div className="lg:col-span-4 lg:sticky lg:top-8 h-fit space-y-4">
            
            {/* Desktop progress tracker card */}
            <div className="hidden lg:block rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">Listing Checklist</h3>
              <p className="text-xs text-slate-500 mt-1">Complete all required sections to submit.</p>
              
              <ul className="mt-6 space-y-4">
                {steps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => scrollToSection(step.id)}
                        className="w-full text-left flex items-start gap-3.5 group rounded-xl p-2 -mx-2 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all ${
                          step.complete 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                            : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:border-slate-300'
                        }`}>
                          {step.complete ? (
                            <Check className="h-4 w-4 stroke-[3]" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold flex items-center gap-1 ${
                            step.complete ? 'text-slate-800' : 'text-slate-500 group-hover:text-slate-800'
                          }`}>
                            {step.label}
                            {step.complete && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded">Done</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{step.desc}</div>
                        </div>
                        <ChevronRight className="ml-auto h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-all self-center" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Mobile horizontal scroll list */}
            <div className="lg:hidden -mx-4 px-4 overflow-x-auto scrollbar-hide py-2 flex gap-3 border-b border-slate-200 bg-slate-50/50 sticky top-0 z-20 backdrop-blur-md">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <button
                    key={step.id}
                    onClick={() => scrollToSection(step.id)}
                    className={`flex items-center gap-2 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border shadow-sm transition-all ${
                      step.complete
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {step.complete ? (
                      <Check className="h-3 w-3 stroke-[3]" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                    {step.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form cards column */}
          <div className="space-y-8 lg:col-span-8">
            <div id="section-base">
              <ListingBaseForm listing={listing} onSaved={setListing} />
            </div>
            
            <div id="section-category">
              <TypeDataForm listing={listing} onSaved={setListing} />
            </div>

            {listing.category === 'short_let' && (
              <div id="section-pricing">
                <ShortLetPricing listing={listing} onSaved={setListing} />
              </div>
            )}

            <div id="section-amenities">
              <AmenitiesChecklist listing={listing} onSaved={setListing} />
            </div>

            <div id="section-photos">
              <PhotoUpload listing={listing} onSaved={patch} />
            </div>

            {listing.category !== 'off_campus' && (
              <div id="section-documents">
                <DocumentUpload listing={listing} onSaved={patch} />
              </div>
            )}

            {listing.category === 'off_campus' && (
              <div id="section-inventory">
                <StudentInventory listingId={listing.id} />
              </div>
            )}

            {isDraft && (
              <div id="section-submit" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="rounded-xl bg-brand-50 p-2.5 text-brand">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Submit for Review</h2>
                    <p className="text-xs text-slate-500">Review validation rules and publish your property</p>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Listings go live as <strong className="text-slate-800">unverified</strong> immediately. You can submit physical or document evidence to request verification badges afterwards on your dashboard.
                  </p>
                  {submitError && (
                    <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-xs font-semibold text-red-700">
                      {submitError}
                    </div>
                  )}
                  <div className="mt-6 flex flex-wrap gap-4">
                    <Button 
                      onClick={() => void onSubmit()} 
                      disabled={submitting}
                      className="bg-brand hover:bg-brand/90 text-slate-900 font-bold px-6 py-5 rounded-xl transition-all shadow-md shadow-brand/10 disabled:opacity-60"
                    >
                      {submitting ? 'Submitting details…' : 'Submit listing'}
                    </Button>
                    <Link href="/dashboard/landlord">
                      <Button variant="secondary" className="py-5 px-6 rounded-xl border-slate-200 font-semibold">
                        Done
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {!isDraft && (
              <div className="flex justify-end pt-4">
                <Link href="/dashboard/landlord">
                  <Button className="bg-brand hover:bg-brand/90 text-slate-900 font-bold px-8 py-5 rounded-xl shadow-md transition-all">
                    Done
                  </Button>
                </Link>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: ListingView['status'] }) {
  const label = status.replaceAll('_', ' ');
  const color =
    status === 'draft'
      ? 'bg-slate-100/10 text-slate-200 border-slate-500/20'
      : status === 'under_doc_review'
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        : status === 'live_unverified'
          ? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
          : status === 'doc_verified'
            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            : status === 'fully_verified'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-slate-500/10 text-slate-200 border-slate-500/20';
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize tracking-wide ${color}`}>
      {label}
    </span>
  );
}
