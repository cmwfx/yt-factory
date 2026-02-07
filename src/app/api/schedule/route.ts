import { NextRequest, NextResponse } from 'next/server';
import { getAllSchedules, createSchedule } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const schedules = await getAllSchedules();
  return NextResponse.json({ schedules });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { intervalHours, enabled, generateIdeas, enableReview } = body;

  if (!intervalHours || intervalHours < 1) {
    return NextResponse.json({ error: 'intervalHours must be >= 1' }, { status: 400 });
  }

  const schedule = await createSchedule({
    intervalHours,
    enabled: enabled ?? true,
    generateIdeas: generateIdeas ?? true,
    enableReview: enableReview ?? false,
  });

  return NextResponse.json({ schedule }, { status: 201 });
}
