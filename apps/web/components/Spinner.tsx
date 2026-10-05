import { LoaderCircle } from "lucide-react";

/** A small spinning indicator for buttons that are waiting on the server. */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return <LoaderCircle aria-hidden className={`${className} animate-spin`} />;
}
