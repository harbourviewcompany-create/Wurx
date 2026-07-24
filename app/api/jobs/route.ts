import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  const body = await req.json();

  const job = await prisma.job.create({
    data: {
      title: body.title,
      description: body.description,
      userId: body.userId,
    },
  });

  return NextResponse.json(job);
}
