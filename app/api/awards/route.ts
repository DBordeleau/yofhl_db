import { publicJson } from '@/lib/public-json';
import { listed } from '@/lib/data/award-archive';

// GET /api/awards — the listed awards, in catalogue order: team awards and individual awards alike
export async function GET() {
    return publicJson((await listed()).map(award => ({
        id: award.id, name: award.name, label: award.label, honor: award.honor, description: award.description, scope: award.scope, image: award.image,
    })));
}
