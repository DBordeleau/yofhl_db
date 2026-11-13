'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/auth';
import * as lottery from '@/lib/lottery/admin';
import type { LotteryInput } from '@/lib/lottery/model';

const revalidateLotteryPages = () => {
    revalidatePath('/admin/lottery');
    revalidatePath('/lottery');
};

export async function saveLottery(input: LotteryInput) {
    await requireAdmin();
    const result = await lottery.saveLottery(input);
    if (result.lottery) revalidateLotteryPages();
    return result;
}

export async function cancelLottery(id: string, version: number) {
    await requireAdmin();
    const result = await lottery.cancelLottery(id, version);
    if (result.success) revalidateLotteryPages();
    return result;
}
