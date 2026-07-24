import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const { jobId } = await req.json();

  const job = await prisma.job.update({
    where: { id: jobId },
    data: { status: 'COMPLETED' },
  });

  return NextResponse.json(job);
}