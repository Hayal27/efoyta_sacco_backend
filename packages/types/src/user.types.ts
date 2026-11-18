export interface Role {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
}

export interface UserHrEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  status: string;
  profilePictureUrl?: string | null;
  hireDate?: string | Date;
  department?: { id: string; name: string; code: string } | null;
  position?: { id: string; title: string; code: string } | null;
  branchId?: string | null;
  departmentId?: string | null;
  branch?: { id: string; name: string; code: string } | null;
}

export interface UserBranchAssignment {
  id?: string;
  branchId?: string;
  isPrimary: boolean;
  branch: {
    id: string;
    name: string;
    code: string;
  };
}

export interface User {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  telegram?: string | null;
  gender?: 'm' | 'f' | null;
  address?: string | null;
  profilePictureUrl?: string | null;
  roleId: string;
  role?: Role; // Populated when joined
  isActive: boolean;
  menuPermissions?: string[] | null;
  mustChangePassword?: boolean;
  branches?: UserBranchAssignment[];
  hrEmployee?: UserHrEmployee | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AuthTokenPayload {
  sub: string; // user id
  userId?: string; // alias for sub
  id?: string; // alias for sub
  email: string;
  role: string; // slug
  menuPermissions?: string[] | null;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number; // seconds
}

export interface CreateUserDto {
  email: string;
  password?: string;
  fullName?: string;
  phone?: string;
  telegram?: string;
  gender?: 'm' | 'f';
  address?: string;
  profilePictureUrl?: string | null;
  roleId: string;
  branchId?: string;
  hrEmployeeId?: string;
  menuPermissions?: string[];
}

export interface UpdateUserDto {
  roleId?: string;
  fullName?: string;
  phone?: string;
  telegram?: string;
  gender?: 'm' | 'f';
  address?: string;
  profilePictureUrl?: string | null;
  isActive?: boolean;
  branchId?: string;
  hrEmployeeId?: string | null;
  menuPermissions?: string[] | null;
}


