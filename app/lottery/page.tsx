'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FaWindows } from 'react-icons/fa';
import Image from 'next/image';

export default function LotteryPage() {
    const handleDownload = () => {
        window.location.href = '/yofhl-draft-lottery-installer.exe';
    };

    return (
        <main className="relative overflow-hidden z-10 flex flex-col gap-y-8 items-center pt-20 text-center min-h-screen">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
                className="mb-2"
            >
                <Image
                    src="/yofhl-logo.png"
                    alt="YOFHL Logo"
                    width={180}
                    height={180}
                    className="mx-auto rounded-full shadow-lg shadow-blue-500/20"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />
            </motion.div>

            <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600"
            >
                YOFHL Draft Lottery App
            </motion.h1>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="relative"
            >
                <motion.button
                    whileHover={{ scale: 1.05, boxShadow: "0 10px 25px rgba(59, 130, 246, 0.5)" }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center gap-3 mx-auto shadow-xl"
                    onClick={handleDownload}
                >
                    <FaWindows className="text-2xl" />
                    Download for Windows
                </motion.button>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="mt-[1rem] text-sm text-gray-600"
            >
                <p className="font-medium">Version 1.0.0</p>
                <p className="mt-2 text-gray-500">Compatible with Windows 10/11 64-bit systems</p>
            </motion.div>
        </main>
    );
}