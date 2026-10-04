import { FC, useId } from 'react';

interface SearchBarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    placeholder?: string;
    className?: string;
}

const SearchBar: FC<SearchBarProps> = ({ searchQuery, setSearchQuery, placeholder = 'Search players', className = 'w-full md:w-60' }) => {
    const id = useId();
    return (
        <label
            htmlFor={id}
            className={`flex h-12 items-center gap-2.5 rounded-2xl border border-line-strong bg-white px-4 text-ink-muted focus-within:border-rink-blue focus-within:shadow-[0_0_0_3px_rgba(31,111,194,.15)] ${className}`}
        >
            <svg className="h-[18px] w-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sr-only">{placeholder}</span>
            <input
                id={id}
                type="search"
                value={searchQuery}
                placeholder={placeholder}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            />
        </label>
    );
};

export default SearchBar;
