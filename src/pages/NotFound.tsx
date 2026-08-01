import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center px-6">
        <h1 className="mb-3 text-4xl font-bold">404</h1>
        <p className="mb-5 text-muted-foreground">This page doesn’t exist in Sybeez Flow.</p>
        <Link
          to="/"
          className="inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
