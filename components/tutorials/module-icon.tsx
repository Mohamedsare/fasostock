import type { ComponentType } from "react";
import {
  MdAccountBalanceWallet,
  MdAutoAwesome,
  MdBadge,
  MdBarChart,
  MdCreditCard,
  MdDescription,
  MdEventBusy,
  MdInventory2,
  MdOndemandVideo,
  MdPeople,
  MdPointOfSale,
  MdPrint,
  MdQrCode2,
  MdSettings,
  MdStorefront,
  MdSwapHoriz,
  MdWarehouse,
} from "react-icons/md";

const MODULE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  products: MdInventory2,
  barcodes: MdQrCode2,
  sales: MdPointOfSale,
  invoice_a4: MdDescription,
  stock: MdWarehouse,
  expiry: MdEventBusy,
  expenses: MdAccountBalanceWallet,
  warehouse: MdStorefront,
  customers: MdPeople,
  credit: MdCreditCard,
  reports: MdBarChart,
  employees: MdBadge,
  printers: MdPrint,
  settings: MdSettings,
  ai: MdAutoAwesome,
  transfers: MdSwapHoriz,
};

export function ModuleIcon({
  moduleKey,
  className,
}: {
  moduleKey: string;
  className?: string;
}) {
  const Icon = MODULE_ICON[moduleKey] ?? MdOndemandVideo;
  return <Icon className={className} />;
}
