"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onFinish: () => void;
}

export function TourFinishModal({ open, onFinish }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onFinish(); }}>
      <DialogContent className="max-w-md text-center sm:text-center" dir="rtl">
        <DialogHeader className="items-center">
          <DialogTitle className="text-xl">איחולי בהצלחה! 🎉</DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-foreground/90 pt-2">
            זכור: המערכת לומדת אותך. אתה תמיד מוזמן לחזור להגדרות ולשנות דברים ככל שתלמד מה
            עובד לך יותר טוב. ככל שתשתמש יותר, נדע להציע לך טיובים ושיפורים אוטומטיים.
            בוא נתחיל ללמוד חכם!
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button size="lg" onClick={onFinish} className="min-w-[8rem]">
            סיום
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
