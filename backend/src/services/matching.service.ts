import { prisma } from "@/lib/db";
import { getDistance } from "../utils/distance";

export async function findBestProvider(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const providers = await prisma.provider.findMany({
    where: { isAvailable: true },
  });

  const scored = providers.map((p) => {
    let score = 0;

    // Skill
    if (p.skills?.includes(job.category)) score += 50;

    // Distance
    const d = getDistance(job.latitude, job.longitude, p.latitude, p.longitude);
    if (d < 5) score += 30;
    else if (d < 15) score += 15;

    // Rating
    score += (p.rating || 0) * 4;

    // Budget fit
    if (p.hourlyRate <= job.budget) score += 10;

    return { providerId: p.id, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.providerId || null;
}
