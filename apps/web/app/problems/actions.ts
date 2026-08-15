'use server';

import { revalidatePath } from 'next/cache';
import * as tracks from '@/lib/tracks';
import { requireUser } from '@/lib/auth';

/**
 * Server Actions for the /problems track panel. Same conventions as
 * app/plan/actions.ts: first-party mutations go through these rather than
 * /api/* (that surface is the extension's contract), each action is a thin
 * wrapper over the lib module, and errors are left to propagate.
 */

export async function saveTrackAction(name: string, text: string): Promise<tracks.SaveTrackResult> {
  const result = await tracks.saveTrack(await requireUser(), name, text);
  if (result.ok) revalidatePath('/problems');
  return result;
}
