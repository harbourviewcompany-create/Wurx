import { prisma } from './db';

export async function matchProviderToJob(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  const providers = await prisma.provider.findMany({
    where: { available: true },
    orderBy: { rating: 'desc' },
  });

  const match = providers.find((p) =>
    p.skills.some((skill) => job.title.toLowerCase().includes(skill.toLowerCase()))
  );

  if (!match) return null;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      providerId: match.id,
      status: 'ASSIGNED',
    },
  });

  return match;
}