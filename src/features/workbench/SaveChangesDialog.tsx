/**
 * Review-and-commit dialog for staged grid edits. Opens with the staged
 * diff, checks eligibility (single-table SELECT, key columns present in the
 * result, real table columns), shows the row diff plus the exact SQL that
 * will run, and only executes on explicit confirm. Statements run
 * sequentially; the first failure stops the run and is shown (earlier
 * statements are already applied — no cross-statement transaction).
 */

import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Engine } from "@/lib/db-adapter/types";
import { type DmlPlan, generateDml } from "@/lib/dml/generateDml";
import { extractSourceTable } from "@/lib/dml/sourceTable";
import {
	parseTableColumns,
	tableColumnsQuery,
} from "@/lib/dml/tableColumns";
import type { ResultDiff, RowData } from "@/lib/resultDiff";
import { getTransport } from "@/lib/transport";
import { refreshResultItem } from "@/stores/workbenchStore";

export interface SaveContext {
	tabId: string;
	resultIndex: number;
	queryText: string;
	connectionId: string;
	engine: Engine;
}

interface Prepared {
	tableLabel: string;
	keyColumns: string[];
	plan: DmlPlan;
}

type Phase =
	| { kind: "loading" }
	| { kind: "blocked"; reasons: string[] }
	| { kind: "ready"; prepared: Prepared }
	| { kind: "executing"; prepared: Prepared; done: number }
	| { kind: "failed"; prepared: Prepared; done: number; error: string };

function fmt(v: unknown): string {
	if (v === null || v === undefined) return "null";
	if (typeof v === "object") {
		try {
			return JSON.stringify(v);
		} catch {
			return String(v);
		}
	}
	return String(v);
}

export default function SaveChangesDialog({
	open,
	onOpenChange,
	diff,
	meta,
	context,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	diff: ResultDiff | null;
	meta: Array<{ name?: string; type?: string }>;
	context: SaveContext;
}) {
	const [phase, setPhase] = useState<Phase>({ kind: "loading" });

	// Eligibility + plan, computed when the dialog opens.
	useEffect(() => {
		if (!open || !diff) return;
		let cancelled = false;
		setPhase({ kind: "loading" });
		(async (): Promise<Phase> => {
			const src = extractSourceTable(context.queryText);
			if (!src.ok) return { kind: "blocked", reasons: [src.error] };
			const { database, table } = src.ok;
			const tableLabel = database ? `${database}.${table}` : table;
			let data: Record<string, unknown>[];
			try {
				const res = await getTransport(context.connectionId).query(
					tableColumnsQuery(context.engine, database, table),
				);
				if (res.error) return { kind: "blocked", reasons: [res.error] };
				data = res.data;
			} catch (e) {
				return { kind: "blocked", reasons: [String(e)] };
			}
			const { columns, keyColumns } = parseTableColumns(context.engine, data);
			if (!columns.length) {
				return {
					kind: "blocked",
					reasons: [`Table ${tableLabel} was not found on this connection.`],
				};
			}
			if (!keyColumns.length) {
				return {
					kind: "blocked",
					reasons: [
						`Table ${tableLabel} has no primary/sorting key — strict save requires one to identify rows.`,
					],
				};
			}
			const resultCols = meta
				.map((m) => m.name)
				.filter((n): n is string => typeof n === "string");
			const missingKeys = keyColumns.filter((k) => !resultCols.includes(k));
			if (missingKeys.length) {
				return {
					kind: "blocked",
					reasons: [
						`The result is missing key column(s) ${missingKeys.join(", ")} — select them to enable saving.`,
					],
				};
			}
			const touched = new Set<string>(
				diff.updates.flatMap((u) => u.changedCols),
			);
			if (diff.inserts.length) for (const c of resultCols) touched.add(c);
			const unknown = [...touched].filter((c) => !columns.includes(c));
			if (unknown.length) {
				return {
					kind: "blocked",
					reasons: [
						`Column(s) ${unknown.join(", ")} do not exist in ${tableLabel} (computed/aliased columns cannot be saved).`,
					],
				};
			}
			const plan = generateDml({
				engine: context.engine,
				database,
				table,
				diff,
				keyColumns,
				columns: resultCols,
				columnTypes: Object.fromEntries(
					meta.flatMap((m) => (m.name && m.type ? [[m.name, m.type]] : [])),
				),
			});
			if (plan.errors.length) return { kind: "blocked", reasons: plan.errors };
			if (!plan.statements.length) {
				return { kind: "blocked", reasons: ["Nothing to save."] };
			}
			return { kind: "ready", prepared: { tableLabel, keyColumns, plan } };
		})().then((next) => {
			if (!cancelled) setPhase(next);
		});
		return () => {
			cancelled = true;
		};
	}, [open, diff, meta, context]);

	const confirm = useCallback(async () => {
		if (phase.kind !== "ready" && phase.kind !== "failed") return;
		const { prepared } = phase;
		const transport = getTransport(context.connectionId);
		// Retry resumes AT the failed statement — earlier ones already ran and
		// must not run twice (INSERTs would duplicate rows).
		const start = phase.kind === "failed" ? phase.done : 0;
		for (let i = start; i < prepared.plan.statements.length; i++) {
			setPhase({ kind: "executing", prepared, done: i });
			try {
				await transport.command(prepared.plan.statements[i]);
			} catch (e) {
				setPhase({ kind: "failed", prepared, done: i, error: String(e) });
				return;
			}
		}
		toast.success(`Saved changes to ${prepared.tableLabel}`);
		onOpenChange(false);
		void refreshResultItem(context.tabId, context.resultIndex);
	}, [phase, context, onOpenChange]);

	const close = useCallback(
		(o: boolean) => {
			if (o) return;
			// Escape / overlay-click / corner-X must not abandon an in-flight
			// run — the explicit buttons are disabled for the same reason.
			if (phase.kind === "executing") return;
			// A failed run already applied its earlier statements — refresh so
			// the grid shows what the database now contains.
			if (phase.kind === "failed" && phase.done > 0) {
				void refreshResultItem(context.tabId, context.resultIndex);
			}
			onOpenChange(false);
		},
		[phase, context, onOpenChange],
	);

	const executing = phase.kind === "executing";
	const keyLabel = (row: RowData, keyColumns: string[]) =>
		keyColumns.map((k) => `${k}=${fmt(row[k])}`).join(", ");

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{phase.kind === "ready" ||
						phase.kind === "executing" ||
						phase.kind === "failed"
							? `Save changes to ${phase.prepared.tableLabel}`
							: "Save changes"}
					</DialogTitle>
					<DialogDescription>
						Review the staged changes and the SQL that will run on this
						connection. Nothing is written until you confirm.
					</DialogDescription>
				</DialogHeader>

				{phase.kind === "loading" && (
					<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						Checking whether this result can be saved…
					</div>
				)}

				{phase.kind === "blocked" && (
					<div className="space-y-2 py-2">
						{phase.reasons.map((r) => (
							<div
								key={r}
								className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
							>
								<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
								<span>{r}</span>
							</div>
						))}
					</div>
				)}

				{(phase.kind === "ready" ||
					phase.kind === "executing" ||
					phase.kind === "failed") &&
					diff && (
						<div className="space-y-3">
							<div className="max-h-48 space-y-1 overflow-auto rounded-md border border-border p-2 font-mono text-xs">
								{diff.updates.map((u) => (
									<div key={`u${u.baseIndex}`} className="text-amber-500">
										~ {keyLabel(u.base, phase.prepared.keyColumns)}{" "}
										{u.changedCols
											.map((c) => `${c}: ${fmt(u.base[c])} → ${fmt(u.row[c])}`)
											.join(", ")}
									</div>
								))}
								{diff.inserts.map((row, i) => (
									<div key={`i${i}`} className="text-emerald-500">
										+ ({meta.map((m) => fmt(row[m.name ?? ""])).join(", ")})
									</div>
								))}
								{diff.deletes.map((d) => (
									<div key={`d${d.baseIndex}`} className="text-destructive">
										− {keyLabel(d.base, phase.prepared.keyColumns)}
									</div>
								))}
							</div>
							<pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
								{phase.prepared.plan.statements.join(";\n\n")}
							</pre>
							{phase.prepared.plan.warnings.map((w) => (
								<div
									key={w}
									className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
								>
									<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
									<span>{w}</span>
								</div>
							))}
							{phase.kind === "failed" && (
								<div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
									<div className="font-medium">
										Statement {phase.done + 1} failed — {phase.error}
									</div>
									{phase.done > 0 && (
										<div className="mt-1">
											The {phase.done} earlier statement
											{phase.done !== 1 ? "s were" : " was"} already applied;
											closing will refresh the grid.
										</div>
									)}
								</div>
							)}
						</div>
					)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => close(false)}
						disabled={executing}
					>
						Cancel
					</Button>
					{(phase.kind === "ready" ||
						phase.kind === "executing" ||
						phase.kind === "failed") && (
						<Button onClick={confirm} disabled={executing}>
							{executing ? (
								<>
									<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
									Running {phase.done + 1}/
									{phase.prepared.plan.statements.length}…
								</>
							) : phase.kind === "failed" ? (
								"Retry from failed statement"
							) : (
								"Confirm & Run"
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
