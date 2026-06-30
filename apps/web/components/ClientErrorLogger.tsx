"use client";

import { useEffect } from "react";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (typeof error === "object" && error !== null) {
    return error;
  }

  return { message: String(error) };
}

export function ClientErrorLogger() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[Control3D ClientError]", {
        colno: event.colno,
        error: serializeError(event.error),
        filename: event.filename,
        href: window.location.href,
        lineno: event.lineno,
        message: event.message,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[Control3D UnhandledRejection]", {
        href: window.location.href,
        reason: serializeError(event.reason),
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
