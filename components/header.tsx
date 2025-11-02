"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Header: React.FC = () => {
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false); // mobile menu state
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const navItems = [
        { name: "Player Stats", href: "/stats/all-time/all", isActive: pathname.startsWith("/stats/all-time/") || pathname.startsWith("/stats/single-season/") },
        { name: "Compare Players", href: "/compare", isActive: pathname.startsWith("/compare") },
        { name: "Team Stats", href: "/teams/stats", isActive: pathname === "/teams/stats" },
        { name: "Champions", href: "/champions", isActive: pathname === "/champions" },
        { name: "Awards", href: "/awards", isActive: pathname.startsWith("/awards") },
    ];

    // award dropdown links
    const awardItems = [
        { name: "Wayne Gretzky Award (Top Player)", href: "/awards/Wayne_Gretzky_Award" },
        { name: "Le Magnifique (MVP)", href: "/awards/Le_Magnifique" },
        { name: "Bobby Orr Award (Top Defenseman)", href: "/awards/Bobby_Orr_Award" },
        { name: "Hasek Trophy (Top Goaltender)", href: "/awards/Hasek_Trophy" },
        { name: "Teemu Selanne Trophy (Top Rookie)", href: "/awards/Teemu_Trophy" },
        { name: "Danny Briere Award (Playoff MVP)", href: "/awards/Danny_Briere_Award" },
    ];

    useEffect(() => {
        setIsDropdownOpen(false);
        setIsMenuOpen(false);
    }, [pathname]);

    return (
        <div className="bg-transparent relative z-50">
            <nav className="relative px-4 py-4 flex justify-between items-center bg-white/10 mx-auto max-w-7xl w-full">
                <div className="flex items-center">
                    <Link href="/">
                        <Image // logo made by Nick Kavanagh
                            src="/yofhldblogo.png"
                            alt="YOFHLDB Logo"
                            title="Logo by Nick Kavanagh"
                            width={60}
                            height={60}
                            className="w-16 h-16 object-contain md:w-16 md:h-16 lg:w-16 lg:h-16"
                        />
                    </Link>
                </div>
                <div className="lg:hidden">
                    <button // hamburger button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="navbar-burger flex items-center text-sky-600 p-3"
                    >
                        <svg
                            className="block h-6 w-6 fill-current"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <title>Mobile menu</title>
                            <path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z"></path>
                        </svg>
                    </button>
                </div>

                {/* desktop/large display nav */}
                <ul className="hidden lg:flex lg:items-center lg:space-x-6 mx-auto bg-transparent">
                    {navItems.map((item) =>
                        item.name === "Awards" ? (
                            <li key={item.name} className="relative group">
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className={`text-sm font-bold flex items-center ${item.isActive
                                        ? "text-sky-500"
                                        : "text-gray-400 hover:text-gray-500"
                                        }`}
                                >
                                    {item.name}
                                    <svg
                                        className={`ml-2 h-4 w-4 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : "rotate-0"}`}
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {isDropdownOpen && (
                                    <ul className="absolute mt-2 w-40 bg-white border border-gray-200 shadow-lg rounded-md z-50">
                                        {awardItems.map((award) => (
                                            <li key={award.name}>
                                                <Link
                                                    href={award.href}
                                                    className="block px-4 py-2 text-xs text-gray-700 hover:bg-sky-100"
                                                >
                                                    {award.name}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ) : (
                            <li key={item.name}>
                                <Link
                                    href={item.href}
                                    className={`text-sm font-bold ${item.isActive
                                        ? "text-sky-500"
                                        : "text-gray-400 hover:text-gray-500"
                                        }`}
                                >
                                    {item.name}
                                </Link>
                            </li>
                        )
                    )}
                </ul>

                {/* mobile/small display nav */}
                <div
                    className={`lg:hidden fixed -mt-24 inset-0 bg-white flex flex-col items-center justify-center overflow-y-auto space-y-6 z-50 transition-transform ${isMenuOpen ? "transform-none" : "transform -translate-x-full"
                        }`}
                >
                    <div className="mb-4">
                        <Image //logo made by Nick Kavanagh
                            src="/yofhldblogo.png"
                            alt="YO FHLDB Logo"
                            title="Logo by Nick Kavanagh"
                            width={100}
                            height={100}
                            className="w-32 h-32 object-contain"
                        />
                    </div>

                    <ul className="list-none space-y-4">
                        {navItems.map((item) =>
                            item.name === "Awards" ? (
                                <li key={item.name} className="relative">
                                    <button
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className={`text-[1rem] font-bold flex items-center ${item.isActive ? "text-sky-600" : "text-gray-400 hover:text-gray-500"}`}
                                    >
                                        {item.name}
                                        <svg
                                            className={`ml-2 h-4 w-4 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : "rotate-0"}`}
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {isDropdownOpen && (
                                        <ul className="absolute mt-2 w-60 bg-white border border-gray-200 shadow-lg rounded-md z-50">
                                            {awardItems.map((award) => (
                                                <li key={award.name}>
                                                    <Link
                                                        href={award.href}
                                                        className="block px-4 py-2 text-xs text-gray-700 hover:bg-sky-100"
                                                    >
                                                        {award.name}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ) : (
                                <li key={item.name}>
                                    <Link
                                        href={item.href}
                                        className={`text-[1rem] font-bold ${item.isActive ? "text-sky-600" : "text-gray-400 hover:text-gray-500"}`}
                                        onClick={() => setIsMenuOpen(false)}
                                    >
                                        {item.name}
                                    </Link>
                                </li>
                            )
                        )}
                    </ul>
                </div>
            </nav>
        </div>
    );
};

export default Header;