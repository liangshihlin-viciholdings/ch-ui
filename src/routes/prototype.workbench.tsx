// PROTOTYPE — throwaway route. Multi-DB workbench shell exploration.
// Winner: A2 (split navigator) + tweaks — see ../features/_prototype/workbench/NOTES.md.
// Delete this file + src/features/_prototype/ once folded into the real implementation.
import { createFileRoute } from "@tanstack/react-router";
import VariantA2 from "@/features/_prototype/workbench/VariantA2";

export const Route = createFileRoute("/prototype/workbench")({
  component: WorkbenchPrototype,
});

function WorkbenchPrototype() {
  return (
    <div className="h-screen flex-1 overflow-hidden">
      <VariantA2 />
    </div>
  );
}
