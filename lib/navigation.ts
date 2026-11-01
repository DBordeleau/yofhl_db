export const isPrivateRoute = (pathname: string) => /^\/(admin|owner)(\/|$)/.test(pathname);
