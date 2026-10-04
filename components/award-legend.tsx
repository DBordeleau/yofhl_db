import { FC } from 'react';
import { JagrCupIcon } from '@/components/trophy-icons';

interface AwardLegendProps {
    award?: boolean;
    multipleAwards?: boolean;
    cup?: boolean;
    cupDot?: boolean; // chart legend: Jagr Cup seasons are red dots
    className?: string;
}

// legend for the award row highlights and Jagr Cup markers; only the items that apply are shown
const AwardLegend: FC<AwardLegendProps> = ({ award, multipleAwards, cup, cupDot, className = '' }) => {
    if (!award && !multipleAwards && !cup && !cupDot) return null;
    return (
        <ul className={`flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft ${className}`}>
            {award && (
                <li className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded border border-ink/15 bg-award-single" />Individual award</li>
            )}
            {multipleAwards && (
                <li className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded border border-ink/15 bg-award-multi" />Multiple awards</li>
            )}
            {cup && (
                <li className="inline-flex items-center gap-2"><JagrCupIcon className="h-[19px] w-[14px]" />Jagr Cup champion</li>
            )}
            {cupDot && (
                <li className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-rink-red shadow-[0_0_0_1px_rgba(18,24,46,.12)]" />Jagr Cup champion</li>
            )}
        </ul>
    );
};

export default AwardLegend;
