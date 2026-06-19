"use client";

import { Toaster } from "sonner";
import { useLanguage } from "@/components/providers/language-provider";

export function BiDiToaster() {
  const { locale } = useLanguage();
  const isRtl = locale === "he";

  return (
    <Toaster
      richColors
      position={isRtl ? "bottom-left" : "bottom-right"}
      dir={isRtl ? "rtl" : "ltr"}
      toastOptions={{
        className: isRtl ? "text-right" : "text-left",
      }}
    />
  );
}
