import { NextResponse } from 'next/server';
import { matchProviderToJob } from '@/lib/matching';

export async function POST(req: Request) {
  const { jobId } = await req.json();

  const provider = await matchProviderToJob(jobId);

  return NextResponse.json({ provider });
}