import { NextRequest, NextResponse } from 'next/server';
import { resumePipeline } from '@/workers/pipeline';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { renderNow } = await request.json();

  if (renderNow) {
    // Resume pipeline from review step (not render) to ensure review step gets completed
    const result = await resumePipeline(id, 'review');
    return NextResponse.json({ success: true, result });
  } else {
    // Just save - user will render later
    return NextResponse.json({ success: true, message: 'Adjustments saved' });
  }
}
