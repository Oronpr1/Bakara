"use client";

import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

const EVENT = "room-toast";

/** Shows a short confirmation at the bottom of the screen ("נשלח לבדיקה"). */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 3500);
    };
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener(EVENT, on);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 bottom-28 z-50 flex justify-center lg:bottom-6">
      {message && (
        <p className="flex max-w-md items-center gap-2 rounded-xl bg-fg px-4 py-3 text-sm font-semibold text-bg shadow-pop">
          <CircleCheck aria-hidden className="size-4" />
          {message}
        </p>
      )}
    </div>
  );
}
