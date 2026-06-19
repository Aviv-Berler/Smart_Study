"use client";

import { useLanguage } from "@/components/providers/language-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GUIDE_STEPS = ["guideStep1", "guideStep2", "guideStep3"] as const;

interface GuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GuideModal({ open, onOpenChange }: GuideModalProps) {
  const { translate } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" dir="auto">
        <DialogHeader>
          <DialogTitle>{translate("guideTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {translate("guideTitle")}
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-3 ps-5 text-sm leading-relaxed">
          {GUIDE_STEPS.map((key) => (
            <li key={key}>{translate(key)}</li>
          ))}
        </ol>

        <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed text-foreground">
          {translate("guideFooter")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
