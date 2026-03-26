export type CustomerType = "individual" | "company";

export type Customer = {
  id: string;
  company_id: string;
  name: string;
  type: CustomerType;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerFormInput = {
  name: string;
  type: CustomerType;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

