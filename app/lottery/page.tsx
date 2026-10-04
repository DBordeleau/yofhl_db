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
        <main className="relative z-10 mx-auto flex min-h-screen max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl flex-col items-center gap-y-8 px-4 pt-10 text-center md:pt-14">
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
                    className="mx-auto rounded-full shadow-card"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />
            </motion.div>

            <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="font-wide mb-3 text-[30px] font-extrabold uppercase leading-none tracking-tight md:text-[50px]"
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
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.95 }}
                        className="mb-[4rem] flex w-full items-center justify-between rounded-2xl bg-ink px-8 py-4 font-bold text-white shadow-card"
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
                                className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_48px_-24px_rgba(31,39,69,.45)]"
                            >
                                <button
                                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold transition-colors hover:bg-rink-wash"
                                    onClick={handleInstallerDownload}
                                >
                                    <FaDownload className="text-rink-blue" />
                                    <span>Installer (.exe)</span>
                                </button>
                                <button
                                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold transition-colors hover:bg-rink-wash"
                                    onClick={handleZipDownload}
                                >
                                    <FaFileArchive className="text-rink-blue" />
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
                className="mt-[1rem] text-sm text-ink-muted"
            >
                <p className="font-medium">Version 1.0.0</p>
                <p className="mt-2 text-ink-faint">Compatible with Windows 10/11 64-bit systems</p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="mt-6 max-w-md rounded-3xl border border-line bg-white px-6 py-5 shadow-card"
            >
                <div className="mb-3 flex items-center gap-2 text-rink-blue">
                    <FaInfoCircle />
                    <h3 className="font-bold">Installation Instructions</h3>
                </div>
                <div className="text-left text-[1rem] text-ink-soft">
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