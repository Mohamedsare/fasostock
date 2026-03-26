import type {
  WarehouseDashboardSummary,
  WarehouseMovement,
  WarehouseStockLine,
} from "./types";

function effectiveThreshold(line: WarehouseStockLine): number {
  return line.stockMinWarehouse > 0 ? line.stockMinWarehouse : line.stockMin;
}

function isLowStock(line: WarehouseStockLine): boolean {
  return line.quantity <= effectiveThreshold(line);
}

/**
 * Même logique que `WarehouseRepository._dashboardFromData` (Flutter).
 */
export function computeDashboardFromLists(
  inv: WarehouseStockLine[],
  movements: WarehouseMovement[],
): WarehouseDashboardSummary {
  let valueCost = 0;
  let valueSale = 0;
  let lowCount = 0;
  for (const l of inv) {
    const cost = l.avgUnitCost ?? l.purchasePrice;
    valueCost += l.quantity * cost;
    valueSale += l.quantity * l.salePrice;
    if (isLowStock(l)) lowCount++;
  }

  const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let entries30 = 0;
  let exits30 = 0;
  const byDay = new Map<string, { inQ: number; outQ: number }>();

  for (const m of movements) {
    if (!m.createdAt) continue;
    const dt = new Date(m.createdAt);
    if (Number.isNaN(dt.getTime()) || dt < from30) continue;
    const isEntry = m.movementKind === "entry";
    if (isEntry) entries30++;
    else exits30++;

    const dayKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const cur = byDay.get(dayKey) ?? { inQ: 0, outQ: 0 };
    if (isEntry) {
      byDay.set(dayKey, { inQ: cur.inQ + m.quantity, outQ: cur.outQ });
    } else {
      byDay.set(dayKey, { inQ: cur.inQ, outQ: cur.outQ + m.quantity });
    }
  }

  const sortedDays = [...byDay.keys()].sort();
  const last7 =
    sortedDays.length > 7 ? sortedDays.slice(sortedDays.length - 7) : sortedDays;
  const chartIn: number[] = [];
  const chartOut: number[] = [];
  const chartLabels: string[] = [];
  for (const d of last7) {
    const v = byDay.get(d)!;
    chartLabels.push(d.slice(8));
    chartIn.push(v.inQ);
    chartOut.push(v.outQ);
  }

  return {
    valueAtPurchasePrice: valueCost,
    valueAtSalePrice: valueSale,
    skuCount: inv.length,
    lowStockCount: lowCount,
    movementsEntries30d: entries30,
    movementsExits30d: exits30,
    chartDayLabels: chartLabels,
    chartEntriesQty: chartIn,
    chartExitsQty: chartOut,
  };
}
