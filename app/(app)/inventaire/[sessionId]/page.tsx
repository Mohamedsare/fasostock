"use client";

import { use } from "react";

import { InventoryCountScreen } from "@/components/inventory/inventory-count-screen";

export default function InventaireSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  return <InventoryCountScreen sessionId={sessionId} />;
}
