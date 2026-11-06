export type Rol = "admin" | "vendedor" | "cobrador" | "almacenista";

export interface User {
  id: number;
  email: string;
  nombre: string;
  telefono: string;
  rol: Rol;
  is_active: boolean;
  must_change_password: boolean;
  date_joined: string;
}

export interface LoginResponse {
  access: string;
  user: User;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}
