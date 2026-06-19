/**
 * Per-amenity icon + label helpers, shared by the listing detail tiles and
 * anywhere else that renders a single amenity. Keys mirror the backend
 * vocabulary (AMENITY_GROUPS in listings/schemas.py); unknown keys fall back
 * to a group icon, then a neutral check.
 */

import {
  ArrowUpDown,
  BatteryCharging,
  BookOpen,
  Building2,
  Car,
  Cctv,
  CircleCheck,
  Droplets,
  Dumbbell,
  Fence,
  Flame,
  Gauge,
  Microwave,
  PawPrint,
  Refrigerator,
  ShieldCheck,
  Smartphone,
  Snowflake,
  SquareParking,
  Sun,
  Trees,
  Utensils,
  WashingMachine,
  Waves,
  Wifi,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const BY_KEY: Record<string, LucideIcon> = {
  // features
  swimming_pool: Waves,
  gym: Dumbbell,
  air_conditioning: Snowflake,
  balcony: Sun,
  garden: Trees,
  elevator: ArrowUpDown,
  study_lounge: BookOpen,
  pet_friendly: PawPrint,
  rooftop_access: Building2,
  smart_home: Smartphone,
  // power
  generator: Zap,
  solar: Sun,
  inverter: BatteryCharging,
  estate_grid: Zap,
  prepaid_meter: Gauge,
  // water
  borehole: Droplets,
  running_water: Droplets,
  water_treatment: Droplets,
  tank: Droplets,
  // security
  gated_estate: ShieldCheck,
  cctv: Cctv,
  perimeter_fence: Fence,
  security_guards: ShieldCheck,
  // internet
  fibre_available: Wifi,
  wifi_included: Wifi,
  // parking
  private_parking: Car,
  shared_parking: Car,
  gated_parking: SquareParking,
  // kitchen
  fitted_cabinets: Utensils,
  gas_cooker: Flame,
  fridge: Refrigerator,
  microwave: Microwave,
  // laundry
  washing_machine: WashingMachine,
  dryer: WashingMachine,
  external_line: Wind,
};

const BY_GROUP: Record<string, LucideIcon> = {
  features: CircleCheck,
  power: Zap,
  water: Droplets,
  security: ShieldCheck,
  internet: Wifi,
  parking: Car,
  kitchen: Utensils,
  laundry: WashingMachine,
};

export function iconForAmenity(group: string, key: string): LucideIcon {
  return BY_KEY[key] ?? BY_GROUP[group] ?? CircleCheck;
}

/** "swimming_pool" → "Swimming Pool". */
export function amenityLabel(key: string): string {
  return key
    .replaceAll('_', ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
