import { DEFAULT_PREVIEW_IMAGE } from '@/lib/site-metadata';
import { renderSitePreview } from '@/lib/share/site-preview';

// The preview image behind every YOFHL link without one of its own. It reads no league data, so Next renders it once
// at build time and an unfurler's visit never reaches a database.

export const alt = DEFAULT_PREVIEW_IMAGE.alt;
export const size = { width: DEFAULT_PREVIEW_IMAGE.width, height: DEFAULT_PREVIEW_IMAGE.height };
export const contentType = 'image/png';

export default function Image() {
    return renderSitePreview();
}
