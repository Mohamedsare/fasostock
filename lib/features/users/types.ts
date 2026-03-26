export type CompanyUser = {
  roleRowId: string;
  userId: string;
  fullName: string | null;
  roleId: string;
  roleSlug: string;
  roleName: string;
  isActive: boolean;
  createdAt: string;
};

export type RoleOption = {
  id: string;
  slug: string;
  name: string;
};

