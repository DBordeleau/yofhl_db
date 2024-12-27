// components/SearchBar.tsx
import { FC } from 'react';
import { motion } from 'framer-motion'

interface SearchBarProps {
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

const SearchBar: FC<SearchBarProps> = ({ searchQuery, setSearchQuery }) => {
    return (
        <motion.div className="mb-4 w-full max-w-xs"
            initial={{ opacity: 0, }}
            whileInView={{ opacity: 1, }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
        >
            <input
                type="text"
                value={searchQuery}
                placeholder="Search by player name..."
                onChange={(e) => setSearchQuery(e.target.value)} //this is currently sending a request to database with every character typed -- should probably add a debounce
                className="mt-2 p-2 border rounded-md w-full"
            />
        </motion.div>
    );
};

export default SearchBar;