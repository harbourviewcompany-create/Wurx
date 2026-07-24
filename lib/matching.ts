import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Job, Profile, ProviderProfile } from './supabase/types';

export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export interface ScoredProvider {
  providerId: string;
  score: number;
  distanceKm: number | null;
}

type CandidateRow = ProviderProfile & { profiles: Pick<Profile, 'lat' | 'lng'> | null };

/**
 * Scores available providers for a job on skill match, distance, and rating,
 * then filters out anyone outside their own service radius. Returns
 * candidates sorted best-first so the caller can assign the top match.
 */
export async function scoreProvidersForJob(
  supabase: SupabaseClient<Database>,
  job: Job
): Promise<ScoredProvider[]> {
  const { data: providers, error } = await supabase
    .from('provider_profiles')
    .select('*, profiles!inner(lat, lng)')
    .eq('is_available', true)
    .contains('skills', [job.service_type]);

  if (error) throw error;
  if (!providers || providers.length === 0) return [];

  const scored = (providers as unknown as CandidateRow[])
    .map((p) => {
      let score = 50; // skill match precondition of the query above

      let distanceKm: number | null = null;
      if (job.lat != null && job.lng != null && p.profiles?.lat != null && p.profiles?.lng != null) {
        distanceKm = getDistanceKm(job.lat, job.lng, p.profiles.lat, p.profiles.lng);
      }

      if (distanceKm != null) {
        if (distanceKm > p.service_radius_km) return null; // out of range, exclude
        if (distanceKm < 5) score += 30;
        else if (distanceKm < 15) score += 15;
      }

      score += p.rating * 4; // 0-5 -> up to 20 points
      score += Math.min(p.rating_count, 50) / 5; // experience proxy, capped

      return { providerId: p.id, score, distanceKm };
    })
    .filter((x): x is ScoredProvider => x !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
