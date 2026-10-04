import { FC } from 'react';

// blue line / red faceoff dot section divider
const RinkDivider: FC<{ className?: string }> = ({ className = 'my-7 md:my-10' }) => (
    <div className={`flex items-center gap-3.5 ${className}`} aria-hidden="true">
        <span className="h-1 flex-1 rounded-full bg-rink-line/85" />
        <span className="h-3.5 w-3.5 rounded-full bg-rink-red" />
        <span className="h-1 flex-1 rounded-full bg-rink-line/85" />
    </div>
);

export default RinkDivider;
