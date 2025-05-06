'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaWindows, FaChevronDown, FaFileArchive, FaDownload, FaInfoCircle } from 'react-icons/fa';
import Image from 'next/image';

export default function LotteryPage() {
    const [isOpen, setIsOpen] = useState(false);

    const handleInstallerDownload = () => {
        window.location.href = '/yofhl-draft-lottery-installer.exe';
        setIsOpen(false);
    };

    const handleZipDownload = () => {
        window.location.href = '/yofhl-draft-lottery.zip';
        setIsOpen(false);
    };

    return (
        <main className="relative overflow-hidden z-10 flex flex-col gap-y-8 items-center text-center min-h-screen">
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
                className="text-[3rem] font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600"
            >
                YOFHL Draft Lottery App
            </motion.h1>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="relative"
            >
                <div className="relative w-60">
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: "0 10px 25px rgba(59, 130, 246, 0.5)" }}
                        whileTap={{ scale: 0.95 }}
                        className="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 mb-[4rem] px-8 rounded-lg flex items-center justify-between w-full shadow-xl"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        <div className="flex items-center gap-3">
                            <FaWindows className="text-[2rem]" />
                            <span>Download for Windows</span>
                        </div>
                        <FaChevronDown className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </motion.button>

                    <AnimatePresence>
                        {isOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl overflow-hidden z-20"
                            >
                                <button
                                    className="w-full text-left px-4 py-3 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                                    onClick={handleInstallerDownload}
                                >
                                    <FaDownload className="text-blue-600" />
                                    <span>Installer (.exe)</span>
                                </button>
                                <button
                                    className="w-full text-left px-4 py-3 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                                    onClick={handleZipDownload}
                                >
                                    <FaFileArchive className="text-blue-600" />
                                    <span>.zip</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
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

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="mt-6 max-w-md px-6 py-5 rounded-lg bg-gray-50 border border-gray-200"
            >
                <div className="flex items-center gap-2 mb-3 text-blue-700">
                    <FaInfoCircle />
                    <h3 className="font-medium">Installation Instructions</h3>
                </div>
                <div className="text-left text-[1rem] text-gray-700">
                    <p className="mb-3">
                        <strong>Installer (.exe):</strong> Simply download and follow the prompts in the installation wizard.
                    </p>
                    <p>
                        <strong>.zip file:</strong> Download, extract the zip folder, and run draftlottery.exe from the extracted folder.
                    </p>
                </div>
            </motion.div>
        </main>
    );
}