/** Types du module R. Humaine + Paie. */

export type ContractType = "cdi" | "cdd" | "stage" | "interim";

export type HrEmployee = {
  id: string;
  matricule: string | null;
  firstName: string;
  lastName: string;
  gender: "M" | "F" | null;
  birthDate: string | null;
  hireDate: string;
  jobTitle: string | null;
  category: string | null;
  contractType: ContractType;
  baseSalary: number;
  cnssNumber: string | null;
  maritalStatus: string | null;
  dependents: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentMethod: string;
  bankAccount: string | null;
  isActive: boolean;
};

export type LeaveType = "paid" | "sick" | "maternity" | "unpaid" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected";

export type HrLeave = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  reason: string | null;
};

export type PayrollSettingsRow = {
  cnssEmployeeRate: number;
  cnssEmployerRate: number;
  cnssCeiling: number;
  iutsChargeReductionRate: number;
  iutsChargeReductionMax: number;
  transportNontaxableCap: number;
};

export type IutsBracketRow = {
  id: string;
  lowerBound: number;
  upperBound: number | null;
  rate: number;
  position: number;
};

export type PayslipStatus = "draft" | "validated" | "paid";

export type Payslip = {
  id: string;
  employeeId: string;
  employeeName: string;
  periodYear: number;
  periodMonth: number;
  baseSalary: number;
  gross: number;
  taxableBase: number;
  cnssEmployee: number;
  cnssEmployer: number;
  iuts: number;
  otherDeductions: number;
  netPay: number;
  status: PayslipStatus;
};
