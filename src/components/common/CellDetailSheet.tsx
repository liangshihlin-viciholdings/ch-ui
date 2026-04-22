import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CellDetailViewer } from "./CellDetailViewer";
import type { ColumnTypeAst } from "./clickhouseTypes";

export interface DetailCell {
  columnId: string;
  rawType: string;
  typeAst: ColumnTypeAst;
  value: unknown;
}

interface CellDetailSheetProps {
  cell: DetailCell | null;
  onClose: () => void;
}

export function CellDetailSheet({ cell, onClose }: CellDetailSheetProps) {
  return (
    <Sheet open={!!cell} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-4">
        {cell && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono text-base">{cell.columnId}</SheetTitle>
              <SheetDescription className="font-mono text-xs text-muted-foreground">
                {cell.rawType}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 min-h-0">
              <CellDetailViewer value={cell.value} typeAst={cell.typeAst} mode="sheet" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
