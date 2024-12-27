import { NextRequest, NextResponse } from 'next/server';

// this is here to make dynamic urls case insensitive
export function middleware(req: NextRequest) {
    const url = req.nextUrl.clone();
    const pathname = url.pathname.toLowerCase();
    url.pathname = pathname;
    return NextResponse.redirect(url);
}