import React, { FC, useState } from 'react';

interface PaginationControlsProps {
    currentPage: number;
    setCurrentPage: (page: number) => void;
    maxPages: number;
}

const PaginationControls: FC<PaginationControlsProps> = ({ currentPage, setCurrentPage, maxPages }) => {
    const [inputValue, setInputValue] = useState<number | string>(currentPage);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value === '' ? '' : parseInt(value, 10));
    };

    // i disabled this but just in case it renders on some browsers
    const handleInputBlur = () => {
        let page = Number(inputValue);
        if (isNaN(page) || page < 1) page = 1;
        if (page > maxPages) page = maxPages;
        setInputValue(page);
        setCurrentPage(page);
    };

    const handlePrevClick = () => {
        const newPage = Math.max(currentPage - 1, 1);
        setCurrentPage(newPage);
        setInputValue(newPage);
    };

    const handleNextClick = () => {
        const newPage = Math.min(currentPage + 1, maxPages);
        setCurrentPage(newPage);
        setInputValue(newPage);
    };

    return (
        <div className="flex items-center gap-4">
            <button
                onClick={handlePrevClick}
                disabled={currentPage === 1}
                className="px-2 py-2 bg-sky-300 text-slate rounded disabled:opacity-50"
            >
                Prev
            </button>
            <div className="flex items-center gap-1">
                <span>Page:</span>
                <input
                    type="number"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    className="w-12 py-1 border border-gray-300 rounded text-center"
                    style={{
                        MozAppearance: 'textfield',
                    }}
                />
                <span>/ {maxPages}</span>
            </div>
            <button
                onClick={handleNextClick}
                disabled={currentPage === maxPages}
                className="px-2 py-2 bg-sky-300 text-slate rounded disabled:opacity-50"
            >
                Next
            </button>
        </div>
    );
};

export default PaginationControls;
