'use server';

import { revalidatePath } from 'next/cache';
import * as planState from '@/lib/plan-state';
import { requirePlanUser } from '@/lib/auth';

/**
 * Server Actions for the /plan route. First-party mutations go through these
 * rather than /api/*: those routes are the browser extension's CORS-open
 * contract and must not be widened for the UI.
 *
 * Each action is a thin wrapper — validation and SQL live in lib/plan-state.ts.
 * Errors are intentionally left to propagate so the client sees the failure.
 */

const PLAN_PATH = '/plan';

export async function setCheckAction(checkId: string, done: boolean): Promise<void> {
  await planState.setCheck(await requirePlanUser(), checkId, done);
  revalidatePath(PLAN_PATH);
}

export async function setFloorAction(
  date: string,
  which: 'dsa' | 'cpp' | 'log',
  value: boolean,
): Promise<void> {
  await planState.setFloor(await requirePlanUser(), date, which, value);
  revalidatePath(PLAN_PATH);
}

export async function setTripAction(date: string, value: boolean): Promise<void> {
  await planState.setTrip(await requirePlanUser(), date, value);
  revalidatePath(PLAN_PATH);
}

export async function saveLogAction(date: string, text: string): Promise<void> {
  await planState.saveLog(await requirePlanUser(), date, text);
  revalidatePath(PLAN_PATH);
}

export async function setNoteAction(date: string, text: string): Promise<void> {
  await planState.setNote(await requirePlanUser(), date, text);
  revalidatePath(PLAN_PATH);
}

export async function addDsaAction(n: number): Promise<void> {
  await planState.addDsa(await requirePlanUser(), n);
  revalidatePath(PLAN_PATH);
}

export async function undoDsaAction(): Promise<void> {
  await planState.undoDsa(await requirePlanUser());
  revalidatePath(PLAN_PATH);
}

export async function addDsaExtraAction(n: number): Promise<void> {
  await planState.addDsaExtra(await requirePlanUser(), n);
  revalidatePath(PLAN_PATH);
}

export async function undoDsaExtraAction(): Promise<void> {
  await planState.undoDsaExtra(await requirePlanUser());
  revalidatePath(PLAN_PATH);
}
