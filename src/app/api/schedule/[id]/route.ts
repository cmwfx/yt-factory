import { NextRequest, NextResponse } from 'next/server';
import { updateSchedule, deleteSchedule } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();

  const schedule = await updateSchedule(id, {
    intervalHours: body.intervalHours,
    enabled: body.enabled,
    generateIdeas: body.generateIdeas,
    enableReview: body.enableReview,
  });

  return NextResponse.json({ schedule });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  await deleteSchedule(id);
  return NextResponse.json({ success: true });
}
