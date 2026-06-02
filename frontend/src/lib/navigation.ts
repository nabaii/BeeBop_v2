import type { Route } from 'next';

import type { UserRole } from '@/stores/session';

export function accountRoute(role: UserRole | undefined): Route {
  switch (role) {
    case 'admin':
      return '/internal/admin';
    case 'trusted_agent':
      return '/internal/agent';
    case 'landlord':
    case 'agent':
      return '/dashboard/landlord';
    case 'seeker':
      return '/profile';
    case 'inspector':
    case undefined:
      return '/login';
  }
}

export function accountLabel(role: UserRole | undefined): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'landlord':
    case 'agent':
      return 'Listings';
    case 'trusted_agent':
      return 'Visits';
    default:
      return 'Profile';
  }
}

export function landlordOnboardingRoute(next: string): string {
  return `/onboarding/landlord?next=${encodeURIComponent(next)}`;
}
