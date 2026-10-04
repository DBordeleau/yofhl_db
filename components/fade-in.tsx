'use client';

import { FC, ReactNode } from 'react';
import { motion } from 'framer-motion';

// entrance animation for server-rendered sections
const FadeIn: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        className={className}
    >
        {children}
    </motion.div>
);

export default FadeIn;
